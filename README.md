# nmap-agent

An agentic AI that plans, runs and interprets [nmap](https://nmap.org) scans. Instead of chaining commands by hand, the LLM picks the next scan from the previous results and finishes with a Markdown report.

Works with **Claude**, **Groq**, **Gemini**, or a fully local **Ollama** model. It uses whichever API key you provide.

> ⚠️ **Authorized use only.** Scan only systems you own or have explicit written permission to test. You are responsible for how you use this tool.

## How it works

```
target ──► LLM ──► tool call (host_discovery / port_scan / service_scan / script_scan)
            ▲                         │
            └──── parsed nmap XML ◄───┘      ... repeat ...      ──► write_report ──► report.md
```

## Quick start

Requirements: Node.js 20+, [nmap](https://nmap.org/download) installed.

```bash
git clone https://github.com/<your-username>/nmap-agent.git
cd nmap-agent
npm install
cp .env.example .env      # then edit: set ALLOWED_TARGETS and one API key
npm start -- scanme.nmap.org
```

`scanme.nmap.org` is Nmap's public test host. Output: `report.md` (findings) and `agent.log` (every command run).

## Providers

The provider is picked from whichever key is set (priority top to bottom). Force one with `PROVIDER=...`.

| Provider | Env var | Default model | Cost |
|---|---|---|---|
| Anthropic | `ANTHROPIC_API_KEY` | `claude-sonnet-5-5` | Paid |
| Groq | `GROQ_API_KEY` | `llama-3.3-70b-versatile` | Free tier |
| Gemini | `GEMINI_API_KEY` | `gemini-2.5-flash` | Free tier |
| Ollama | none | `qwen3:8b` | Free, local |

Override the model with `MODEL=...`. For Ollama: `ollama pull qwen3:8b` first.

## Configuration

| Variable | Purpose |
|---|---|
| `ALLOWED_TARGETS` | **Required.** Comma-separated IPs, CIDRs, hostnames the agent may scan |
| `PROVIDER` | Force `anthropic`, `groq`, `gemini` or `ollama` |
| `MODEL` | Override the default model |
| `MAX_STEPS` | Max agent iterations (default 10) |

## Guardrails

- **Scope allowlist** enforced in the tool layer, so the model cannot bypass it
- `spawn` with an argument array and no shell, so no command injection
- Strict input validation (zod) on targets and ports; targets can't start with `-`
- Only allowlisted, non-intrusive NSE scripts
- Step cap and per-scan timeout
- Every command is logged to `agent.log`

Hostnames are matched by name, not by resolved IP. Prefer IPs/CIDRs in `ALLOWED_TARGETS` for strict scope.

## Project layout

```
src/
  index.ts       entry point and agent loop
  providers.ts   Anthropic + OpenAI-compatible adapters, provider selection
  tools.ts       tool schemas and dispatcher
  nmap.ts        safe nmap runner and XML summarizer
  scope.ts       target allowlist check
  config.ts      settings, system prompt
```

## Roadmap

- [ ] CVE lookup for detected service versions (NVD API)
- [ ] Diff against previous scans
- [ ] Human approval before running scripts
- [ ] Docker image
- [ ] JSON report output

## License

MIT
