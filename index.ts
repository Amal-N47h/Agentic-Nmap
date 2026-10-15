import { writeFileSync } from "node:fs";
import { ALLOWED, MAX_OUTPUT_CHARS, MAX_STEPS, SYSTEM } from "./config.js";
import { checkNmap } from "./nmap.js";
import { pickProvider, type ToolResult } from "./providers.js";
import { isAllowed } from "./scope.js";
import { execTool, state } from "./tools.js";

async function main() {
  const target = process.argv[2];
  if (!target) throw new Error("Usage: npm start -- <target>");
  if (ALLOWED.length === 0)
    throw new Error("Set ALLOWED_TARGETS (in .env or env) to the IPs/CIDRs/hostnames you may scan.");
  if (!isAllowed(target)) throw new Error(`"${target}" is not in ALLOWED_TARGETS.`);

  await checkNmap();
  const provider = pickProvider(SYSTEM, `Assess target: ${target}`);
  console.log(`Using ${provider.label}\n`);

  let lastText = "";
  for (let step = 0; step < MAX_STEPS; step++) {
    const turn = await provider.step();
    if (turn.text) {
      console.log(turn.text);
      lastText = turn.text;
    }
    if (turn.calls.length === 0) break;

    const results: ToolResult[] = [];
    for (const call of turn.calls) {
      console.log(`> ${call.name} ${JSON.stringify(call.args)}`);
      try {
        const out = await execTool(call.name, call.args);
        const text = (typeof out === "string" ? out : JSON.stringify(out)).slice(0, MAX_OUTPUT_CHARS);
        results.push({ id: call.id, text, isError: false });
      } catch (e) {
        const msg = (e as Error).message;
        console.log(`  ! ${msg.split("\n")[0]}`);
        results.push({ id: call.id, text: `Error: ${msg}`, isError: true });
      }
    }
    provider.addResults(results);
  }

  // Small models sometimes answer in chat instead of calling write_report.
  if (!state.reportWritten && lastText) {
    writeFileSync("report.md", lastText);
    console.log("\n(model did not call write_report; saved its final answer instead)");
  }
  console.log(state.reportWritten || lastText ? "\nReport: report.md   Log: agent.log" : "\nNo report produced.");
}

main().catch((e) => {
  console.error(`\nError: ${e?.message ?? e}`);
  process.exit(1);
});
