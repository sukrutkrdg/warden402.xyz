export type Decision = "block" | "review" | "clear";

export interface SignalResult {
  category: string;
  status: "ok" | "warn" | "fail" | "unknown";
  score: number;
  source: string;
  detail?: string;
}

export interface Verdict {
  verdictId: string;
  decision: Decision;
  riskScore: number;
  confidence: number;
  reasons: string[];
  signals: SignalResult[];
  summary: string;
  degraded: boolean;
  latencyMs: number;
  decoded?: { kind: string; selector: string; unlimited: boolean; approvedAll: boolean };
  counterparty?: string;
  error?: string;
  details?: unknown;
}

export const DECISION_META: Record<Decision, { label: string; color: string; ring: string; emoji: string }> = {
  block: { label: "BLOCK", color: "text-block", ring: "ring-block/40 bg-block/10", emoji: "⛔" },
  review: { label: "REVIEW", color: "text-review", ring: "ring-review/40 bg-review/10", emoji: "⚠️" },
  clear: { label: "CLEAR", color: "text-clear", ring: "ring-clear/40 bg-clear/10", emoji: "✅" },
};
