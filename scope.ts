import net from "node:net";
import { ALLOWED } from "./config.js";

function ipToInt(ip: string): number {
  return ip.split(".").reduce((acc, o) => (acc << 8) + Number(o), 0) >>> 0;
}

function inCidr(ip: string, cidr: string): boolean {
  const [base, bitsStr = "32"] = cidr.split("/");
  const bits = Number(bitsStr);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipToInt(ip) & mask) === (ipToInt(base) & mask);
}

export function isAllowed(target: string): boolean {
  return ALLOWED.some((entry) => {
    const base = entry.split("/")[0];
    if (net.isIPv4(base)) return net.isIPv4(target) && inCidr(target, entry);
    return entry.toLowerCase() === target.toLowerCase(); // hostname: exact match
  });
}
