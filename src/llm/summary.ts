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
        "Sen bir on-chain güvenlik açıklayıcısısın. Sana verilen KARARI ve sinyalleri " +
        "1-2 cümlede sade dille gerekçelendir. Kararı DEĞİŞTİRME, yeni risk UYDURMA, " +
        "yalnızca verilen sinyallere dayan. Türkçe yaz.",
      messages: [
        {
          role: "user",
          content:
            `Karar: ${decided.decision.toUpperCase()} (risk ${decided.riskScore}/100, güven ${decided.confidence}).\n` +
            `Sinyaller:\n${facts}\n` +
            (unknowns.length ? `Alınamayan sinyaller: ${unknowns.join(", ")}\n` : "") +
            `Bunu kısa, net bir gerekçeyle özetle.`,
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
      ? "İşlem engellendi"
      : decided.decision === "review"
      ? "Manuel inceleme öneriliyor"
      : "Bilinen risk bulunamadı";
  if (fired.length === 0) {
    return decided.degraded
      ? `${head}: bazı güvenlik sinyalleri alınamadı, temkinli ol.`
      : `${head}: tüm temel güvenlik sinyalleri temiz (risk ${decided.riskScore}/100).`;
  }
  const why = fired.map((s) => s.detail ?? s.source).slice(0, 3).join("; ");
  return `${head} (risk ${decided.riskScore}/100). Öne çıkanlar: ${why}.`;
}
