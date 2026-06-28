/**
 * Düz-dil 'summary' üretimi. ÖNEMLİ: Claude yalnızca açıklar; decision/score'a
 * ASLA dokunmaz. API anahtarı yoksa veya kapalıysa deterministik fallback kullanılır.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { Decided } from "../engine/decide.js";
import type { SignalResult, Target } from "../schema/verdict.js";

const ENABLED = (process.env.WARDEN_SUMMARY_ENABLED ?? "true") !== "false";
const MODEL = process.env.WARDEN_SUMMARY_MODEL ?? "claude-haiku-4-5-20251001";
const API_KEY = process.env.ANTHROPIC_API_KEY;

export async function buildSummary(
  target: Target,
  decided: Decided,
  signals: SignalResult[],
): Promise<string> {
  const fallback = deterministicSummary(decided, signals);
  if (!ENABLED || !API_KEY) return fallback;

  try {
    const client = new Anthropic({ apiKey: API_KEY });
    const facts = signals
      .filter((s) => s.status !== "unknown")
      .map((s) => `- ${s.source}: ${s.status} (${s.detail ?? ""})`)
      .join("\n");
    const unknowns = signals.filter((s) => s.status === "unknown").map((s) => s.source);

    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 160,
      system:
        "You are an on-chain security explainer. Justify the GIVEN decision and signals " +
        "in 1-2 plain-language sentences. Do NOT change the decision, do NOT invent new " +
        "risks, rely only on the provided signals. Write in English.",
      messages: [
        {
          role: "user",
          content:
            `Decision: ${decided.decision.toUpperCase()} (risk ${decided.riskScore}/100, confidence ${decided.confidence}).\n` +
            `Signals:\n${facts}\n` +
            (unknowns.length ? `Unavailable signals: ${unknowns.join(", ")}\n` : "") +
            `Summarize this with a short, clear rationale.`,
        },
      ],
    });
    const text = msg.content.find((c) => c.type === "text");
    return text && "text" in text ? text.text.trim() : fallback;
  } catch {
    return fallback; // LLM düşse bile karar/şema bozulmaz
  }
}

/** LLM olmadan da anlamlı bir cümle. */
export function deterministicSummary(decided: Decided, signals: SignalResult[]): string {
  const fired = signals.filter((s) => s.status === "fail" || s.status === "warn");
  const head =
    decided.decision === "block"
      ? "Blocked"
      : decided.decision === "review"
      ? "Review recommended"
      : "No known risk found";
  if (fired.length === 0) {
    return decided.degraded
      ? `${head}: some security signals couldn't be fetched — proceed with caution.`
      : `${head}: all core security signals are clean (risk ${decided.riskScore}/100).`;
  }
  const why = fired.map((s) => s.detail ?? s.source).slice(0, 3).join("; ");
  return `${head} (risk ${decided.riskScore}/100). Highlights: ${why}.`;
}
