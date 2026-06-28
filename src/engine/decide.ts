import type {
  Decision,
  ReasonCode,
  SignalResult,
} from "../schema/verdict.js";
import {
  BLOCK_THRESHOLD,
  CRITICAL_FOR_DEGRADE,
  HARD_BLOCK_CATEGORIES,
  REVIEW_THRESHOLD,
} from "./config.js";

export interface Decided {
  decision: Decision;
  riskScore: number;     // 0..100
  confidence: number;    // 0..1
  reasons: ReasonCode[];
  degraded: boolean;
}

/**
 * Sinyallerden DETERMİNİSTİK karar üret. Claude burada YOK.
 * Sıra (config.ts'teki kurala birebir):
 *   1) Herhangi bir HARD_BLOCK kategorisi 'fail' → block
 *   2) degraded → en iyi ihtimalle 'review' (asla 'clear' değil)
 *   3) riskScore >= BLOCK_THRESHOLD → block
 *   4) riskScore >= REVIEW_THRESHOLD → review
 *   5) aksi → clear
 */
export function decide(signals: SignalResult[]): Decided {
  // Reason kodlarını topla: önce 'fail', sonra 'warn'; önem sırasında.
  const reasons: ReasonCode[] = collectReasons(signals);

  // Ağırlıklı risk skoru — yalnızca alınabilen (status !== 'unknown') sinyaller üzerinden normalize.
  const usable = signals.filter((s) => s.status !== "unknown");
  const weightSum = usable.reduce((a, s) => a + s.weight, 0);
  const riskScore =
    weightSum > 0
      ? Math.round(usable.reduce((a, s) => a + s.score * s.weight, 0) / weightSum)
      : 0;

  // Degrade: kritik bir sinyal alınamadıysa.
  const degraded = signals.some(
    (s) => s.status === "unknown" && CRITICAL_FOR_DEGRADE.includes(s.category),
  );

  // Confidence: alınabilen kritik sinyal oranı.
  const criticalTotal = signals.filter((s) =>
    CRITICAL_FOR_DEGRADE.includes(s.category),
  ).length;
  const criticalOk = signals.filter(
    (s) => CRITICAL_FOR_DEGRADE.includes(s.category) && s.status !== "unknown",
  ).length;
  const confidence =
    criticalTotal > 0 ? Number((criticalOk / criticalTotal).toFixed(2)) : 0;

  // Escalation girdileri — tek bir ciddi sinyal ortalamada kaybolmasın.
  const anyFail = signals.some((s) => s.status === "fail"); // sert olmayan fail dahil
  const warnCount = signals.filter((s) => s.status === "warn").length;

  // 1) Sert kural: honeypot/sanctions fail → skordan bağımsız block
  const hardFail = signals.some(
    (s) => s.status === "fail" && HARD_BLOCK_CATEGORIES.includes(s.category),
  );
  if (hardFail) {
    return { decision: "block", riskScore: Math.max(riskScore, BLOCK_THRESHOLD), confidence, reasons, degraded };
  }

  // 2) Skor eşiği block
  if (riskScore >= BLOCK_THRESHOLD) {
    return { decision: "block", riskScore, confidence, reasons, degraded };
  }

  // 3) Degrade → en iyi ihtimalle review
  if (degraded) {
    const reasonsWithDegrade = reasons.includes("SIGNAL_UNAVAILABLE")
      ? reasons
      : [...reasons, "SIGNAL_UNAVAILABLE" as ReasonCode];
    return { decision: "review", riskScore, confidence, reasons: reasonsWithDegrade, degraded };
  }

  // 4) ESCALATION: herhangi bir 'fail' sinyali (likidite çöküşü, vb.) tek başına
  //    en az 'review' gerektirir — ağırlıklı ortalama düşük olsa bile.
  if (anyFail) {
    return { decision: "review", riskScore, confidence, reasons, degraded };
  }

  // 5) review eşiği
  if (riskScore >= REVIEW_THRESHOLD) {
    return { decision: "review", riskScore, confidence, reasons, degraded };
  }

  // 6) Birden çok uyarı birikmişse (tek başına eşiği geçmese de) → review.
  if (warnCount >= 2) {
    return { decision: "review", riskScore, confidence, reasons, degraded };
  }

  // 7) clear
  return { decision: "clear", riskScore, confidence, reasons, degraded };
}

/** 'fail' önce, 'warn' sonra; her sinyalin taşıdığı reason kodları (varsa). */
function collectReasons(signals: SignalResult[]): ReasonCode[] {
  const fails: ReasonCode[] = [];
  const warns: ReasonCode[] = [];
  for (const s of signals) {
    const codes = (s.evidence?.reasonCodes as ReasonCode[] | undefined) ?? [];
    if (s.status === "fail") fails.push(...codes);
    else if (s.status === "warn") warns.push(...codes);
  }
  // tekilleştir, sırayı koru
  return [...new Set([...fails, ...warns])];
}
