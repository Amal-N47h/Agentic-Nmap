import { writeFileSync } from "node:fs";
import { z } from "zod";
import { SAFE_SCRIPTS } from "./config.js";
import { scan } from "./nmap.js";

export type ToolDef = { name: string; description: string; input_schema: Record<string, unknown> };

export const state = { reportWritten: false };

// No leading "-" so a target can never be parsed as an nmap flag.
const Target = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9.\-]*$/).max(253);
const Ports = z.string().regex(/^[0-9,\-]+$/).max(100);

const portsSchema = {
  type: "object",
  properties: { target: { type: "string" }, ports: { type: "string" } },
  required: ["target", "ports"],
};

export const tools: ToolDef[] = [
  {
    name: "host_discovery",
    description: "Check if a host is up (nmap -sn).",
    input_schema: {
      type: "object",
      properties: { target: { type: "string" } },
      required: ["target"],
    },
  },
  {
    name: "port_scan",
    description: "TCP connect scan on given ports, e.g. '1-1024' or '22,80,443'.",
    input_schema: portsSchema,
  },
  {
    name: "service_scan",
    description: "Detect service names and versions on given ports (nmap -sV).",
    input_schema: portsSchema,
  },
  {
    name: "script_scan",
    description: `Run one allowlisted NSE script: ${SAFE_SCRIPTS.join(", ")}.`,
    input_schema: {
      type: "object",
      properties: {
        target: { type: "string" },
        ports: { type: "string" },
        script: { type: "string", enum: [...SAFE_SCRIPTS] },
      },
      required: ["target", "ports", "script"],
    },
  },
  {
    name: "write_report",
    description: "Save the final Markdown report. Call once at the end.",
    input_schema: {
      type: "object",
      properties: { markdown: { type: "string" } },
      required: ["markdown"],
    },
  },
];

export async function execTool(name: string, input: unknown): Promise<unknown> {
  switch (name) {
    case "host_discovery": {
      const { target } = z.object({ target: Target }).parse(input);
      return scan(target, ["-sn"]);
    }
    case "port_scan": {
      const { target, ports } = z.object({ target: Target, ports: Ports }).parse(input);
      return scan(target, ["-sT", "-Pn", "-T3", "-p", ports]);
    }
    case "service_scan": {
      const { target, ports } = z.object({ target: Target, ports: Ports }).parse(input);
      return scan(target, ["-sV", "-Pn", "-T3", "-p", ports]);
    }
    case "script_scan": {
      const { target, ports, script } = z
        .object({ target: Target, ports: Ports, script: z.enum(SAFE_SCRIPTS) })
        .parse(input);
      return scan(target, ["-Pn", "-T3", "-p", ports, "--script", script]);
    }
    case "write_report": {
      const { markdown } = z.object({ markdown: z.string() }).parse(input);
      writeFileSync("report.md", markdown);
      state.reportWritten = true;
      return "report.md saved";
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
