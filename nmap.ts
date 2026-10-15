import { spawn } from "node:child_process";
import { appendFileSync } from "node:fs";
import { XMLParser } from "fast-xml-parser";
import { NMAP_TIMEOUT_MS } from "./config.js";
import { isAllowed } from "./scope.js";

export function log(line: string) {
  appendFileSync("agent.log", `${new Date().toISOString()} ${line}\n`);
}

function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    // spawn with an args array and no shell -> no command injection
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("nmap timed out"));
    }, NMAP_TIMEOUT_MS);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      reject(
        e.code === "ENOENT"
          ? new Error("nmap is not installed. Install it: sudo apt install nmap | brew install nmap")
          : e
      );
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      code === 0 ? resolve(out) : reject(new Error(`nmap exited ${code}: ${err.slice(0, 500)}`));
    });
  });
}

export async function checkNmap() {
  await run("nmap", ["--version"]);
}

const arr = (x: any): any[] => (x == null ? [] : Array.isArray(x) ? x : [x]);

function summarize(xml: string) {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
  const doc = parser.parse(xml);
  return arr(doc.nmaprun?.host).map((h: any) => ({
    address: arr(h.address)[0]?.addr,
    status: h.status?.state,
    ports: arr(h.ports?.port).map((p: any) => ({
      port: p.portid,
      proto: p.protocol,
      state: p.state?.state,
      service: p.service?.name,
      product: p.service?.product,
      version: p.service?.version,
      scripts: arr(p.script).map((s: any) => ({ id: s.id, output: s.output })),
    })),
  }));
}

export async function scan(target: string, args: string[]) {
  if (!isAllowed(target)) throw new Error(`Target "${target}" is out of scope`);
  const full = [...args, "-oX", "-", target];
  log(`nmap ${full.join(" ")}`);
  return summarize(await run("nmap", full));
}
