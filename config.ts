import "dotenv/config";

export const MAX_STEPS = Number(process.env.MAX_STEPS ?? 10);
export const NMAP_TIMEOUT_MS = 120_000;
export const MAX_OUTPUT_CHARS = 8_000;

// Scope: IPs, CIDRs or hostnames you OWN or have written permission to test.
export const ALLOWED = (process.env.ALLOWED_TARGETS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Only these NSE scripts can be run. Safe, non-intrusive only.
export const SAFE_SCRIPTS = [
  "banner",
  "http-title",
  "http-headers",
  "ssl-cert",
  "ssh-hostkey",
  "ssh2-enum-algos",
] as const;

export const SYSTEM = `You are a network reconnaissance agent for authorized security assessments.
Plan: host discovery -> port scan -> service/version scan -> targeted safe scripts.
Only scan the target given by the user. Be efficient; never repeat the same scan.
When done, call write_report with findings: open ports, services/versions, and risks.`;
