import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { tools } from "./tools.js";

export type Turn = { text: string; calls: { id: string; name: string; args: unknown }[] };
export type ToolResult = { id: string; text: string; isError: boolean };
export interface Provider {
  label: string;
  step(): Promise<Turn>;
  addResults(results: ToolResult[]): void;
}

const stripThink = (s: string) => s.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

// ---------- Anthropic (native SDK) ----------
class AnthropicProvider implements Provider {
  label: string;
  private client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  private model = process.env.MODEL || "claude-sonnet-5-5";
  private messages: Anthropic.MessageParam[];
  constructor(private system: string, user: string) {
    this.label = `anthropic/${this.model}`;
    this.messages = [{ role: "user", content: user }];
  }
  async step(): Promise<Turn> {
    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: 2000,
      system: this.system,
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema as Anthropic.Tool["input_schema"],
      })),
      messages: this.messages,
    });
    this.messages.push({ role: "assistant", content: res.content });
    return {
      text: res.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n"),
      calls: res.content
        .filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
        .map((b) => ({ id: b.id, name: b.name, args: b.input })),
    };
  }
  addResults(results: ToolResult[]) {
    this.messages.push({
      role: "user",
      content: results.map((r) => ({
        type: "tool_result" as const,
        tool_use_id: r.id,
        content: r.text,
        is_error: r.isError,
      })),
    });
  }
}

// ---------- OpenAI-compatible (Groq, Gemini, Ollama, OpenRouter...) ----------
class OpenAICompatProvider implements Provider {
  label: string;
  private client: OpenAI;
  private messages: OpenAI.Chat.ChatCompletionMessageParam[];
  private toolDefs: OpenAI.Chat.ChatCompletionTool[] = tools.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.input_schema },
  }));
  private n = 0;

  constructor(
    name: string,
    baseURL: string,
    apiKey: string,
    private model: string,
    system: string,
    user: string
  ) {
    this.label = `${name}/${model}`;
    this.client = new OpenAI({ baseURL, apiKey, maxRetries: 4 });
    this.messages = [
      { role: "system", content: system },
      { role: "user", content: user },
    ];
  }

  async step(): Promise<Turn> {
    const res = await this.client.chat.completions.create({
      model: this.model,
      messages: this.messages,
      tools: this.toolDefs,
    });
    const msg = res.choices?.[0]?.message;
    if (!msg) throw new Error("Provider returned no message");

    const calls: Turn["calls"] = [];
    for (const c of msg.tool_calls ?? []) {
      if (c.type !== "function") continue;
      let args: unknown = {};
      try {
        args = JSON.parse(c.function.arguments || "{}");
      } catch {
        /* model produced bad JSON; zod will reject and the model sees the error */
      }
      // Some providers return empty ids -> generate one so results can be matched.
      calls.push({ id: c.id || `call_${Date.now()}_${this.n++}`, name: c.function.name, args });
    }

    const text = stripThink(msg.content ?? "");
    // Rebuild a clean message: pushing the raw one includes extra fields
    // (refusal, annotations, reasoning...) that Groq/Gemini reject with HTTP 400.
    this.messages.push({
      role: "assistant",
      content: text || null,
      ...(calls.length
        ? {
            tool_calls: calls.map((c) => ({
              id: c.id,
              type: "function" as const,
              function: { name: c.name, arguments: JSON.stringify(c.args) },
            })),
          }
        : {}),
    });
    return { text, calls };
  }

  addResults(results: ToolResult[]) {
    for (const r of results)
      this.messages.push({ role: "tool", tool_call_id: r.id, content: r.text });
  }
}

// Picks the provider from whichever API key is set.
// Force one with PROVIDER=anthropic|groq|gemini|ollama.
export function pickProvider(system: string, user: string): Provider {
  const env = process.env;
  const gemini = env.GEMINI_API_KEY || env.GOOGLE_API_KEY;
  const choice =
    env.PROVIDER ||
    (env.ANTHROPIC_API_KEY ? "anthropic" : env.GROQ_API_KEY ? "groq" : gemini ? "gemini" : "ollama");

  switch (choice) {
    case "anthropic":
      if (!env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not set");
      return new AnthropicProvider(system, user);
    case "groq":
      if (!env.GROQ_API_KEY) throw new Error("GROQ_API_KEY not set");
      return new OpenAICompatProvider("groq", "https://api.groq.com/openai/v1", env.GROQ_API_KEY,
        env.MODEL || "llama-3.3-70b-versatile", system, user);
    case "gemini":
      if (!gemini) throw new Error("GEMINI_API_KEY not set");
      return new OpenAICompatProvider("gemini", "https://generativelanguage.googleapis.com/v1beta/openai/", gemini,
        env.MODEL || "gemini-2.5-flash", system, user);
    case "ollama":
      return new OpenAICompatProvider("ollama", "http://localhost:11434/v1", "ollama",
        env.MODEL || "qwen3:8b", system, user);
    default:
      throw new Error(`Unknown PROVIDER "${choice}" (use anthropic | groq | gemini | ollama)`);
  }
}
