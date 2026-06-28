/**
 * smoke — motoru AĞ OLMADAN kanıtla. Sentetik sinyallerle decide()'ı sürer,
 * tüm karar kurallarının (block/review/clear/degrade/hard-rule) doğru çalıştığını gösterir.
 *
 *   npx tsx scripts/smoke.ts
 */
import { decide } from "../src/engine/decide.js";
import { deterministicSummary } from "../src/llm/summary.js";
import type { SignalResult } from "../src/schema/verdict.js";

function sig(p: Partial<SignalResult> & Pick<SignalResult, "category" | "status" | "weight" | "score">): SignalResult {
  return { source: "test", ...p };
}

const cases: Record<string, SignalResult[]> = {
  "CLEAR — hepsi temiz": [
    sig({ category: "honeypot", status: "ok", weight: 0.3, score: 5 }),
    sig({ category: "contract_risk", status: "ok", weight: 0.2, score: 10 }),
    sig({ category: "liquidity", status: "ok", weight: 0.2, score: 10 }),
    sig({ category: "holder_concentration", status: "ok", weight: 0.15, score: 15 }),
    sig({ category: "sanctions", status: "ok", weight: 0.05, score: 0 }),
  ],
  "BLOCK — sert kural (honeypot fail)": [
    sig({ category: "honeypot", status: "fail", weight: 0.3, score: 90, evidence: { reasonCodes: ["HONEYPOT_DETECTED"] } }),
    sig({ category: "liquidity", status: "ok", weight: 0.2, score: 10 }),
  ],
  "BLOCK — sanctions (sert kural)": [
    sig({ category: "sanctions", status: "fail", weight: 0.05, score: 100, evidence: { reasonCodes: ["SANCTIONED_ADDRESS"] } }),
    sig({ category: "honeypot", status: "ok", weight: 0.3, score: 10 }),
  ],
  "REVIEW — orta risk": [
    sig({ category: "honeypot", status: "warn", weight: 0.3, score: 40 }),
    sig({ category: "liquidity", status: "warn", weight: 0.2, score: 45, evidence: { reasonCodes: ["LIQUIDITY_LOW"] } }),
    sig({ category: "contract_risk", status: "ok", weight: 0.2, score: 20 }),
  ],
  "REVIEW — degrade (kritik sinyal unknown)": [
    sig({ category: "honeypot", status: "unknown", weight: 0, score: 0 }),
    sig({ category: "liquidity", status: "ok", weight: 0.2, score: 10 }),
  ],
};

let fail = 0;
for (const [name, signals] of Object.entries(cases)) {
  const d = decide(signals);
  const expected = name.split(" ")[0]!.toLowerCase();
  const pass = d.decision === expected;
  if (!pass) fail++;
  console.log(
    `${pass ? "✓" : "✗"} ${name}\n    → ${d.decision} risk=${d.riskScore} conf=${d.confidence} degraded=${d.degraded} reasons=[${d.reasons.join(",")}]\n    ${deterministicSummary(d, signals)}`,
  );
}
console.log(fail === 0 ? "\nTüm karar kuralları geçti ✓" : `\n${fail} vaka BAŞARISIZ ✗`);
process.exit(fail === 0 ? 0 : 1);
