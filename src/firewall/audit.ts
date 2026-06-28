/**
 * Firewall audit log — every decision is recorded. JSONL for v1.
 */
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { FirewallAction, FirewallResult } from "./types.js";

const AUDIT_PATH = process.env.FIREWALL_AUDIT_PATH ?? "data/firewall-audit.jsonl";

export interface AuditEntry {
  auditId: string;
  agentId: string;
  issuedAt: string;
  decision: string;
  reasons: string[];
  action: FirewallAction;
  amountUsd?: number;
  riskScore?: number;
}

export async function recordAudit(result: FirewallResult, action: FirewallAction): Promise<void> {
  const entry: AuditEntry = {
    auditId: result.auditId,
    agentId: result.agentId,
    issuedAt: result.issuedAt,
    decision: result.decision,
    reasons: result.reasons,
    action,
    amountUsd: action.amountUsd,
    riskScore: result.verdict?.riskScore,
  };
  try {
    await mkdir(dirname(AUDIT_PATH), { recursive: true });
    await appendFile(AUDIT_PATH, JSON.stringify(entry) + "\n", "utf8");
  } catch (err) {
    console.error("[firewall-audit] write failed:", err);
  }
}

export async function readAudit(agentId: string, limit = 50): Promise<AuditEntry[]> {
  try {
    const txt = await readFile(AUDIT_PATH, "utf8");
    const all = txt.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l) as AuditEntry);
    return all.filter((e) => e.agentId === agentId).slice(-limit).reverse();
  } catch {
    return [];
  }
}
