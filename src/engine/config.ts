import type { SignalCategory } from "../schema/verdict.js";

/** Karar eşikleri (env ile override edilebilir; gerçek tokenlarla kalibre edilecek). */
export const BLOCK_THRESHOLD = Number(process.env.WARDEN_BLOCK_THRESHOLD ?? 70);
export const REVIEW_THRESHOLD = Number(process.env.WARDEN_REVIEW_THRESHOLD ?? 35);

/**
 * Sinyal ağırlıkları — ağırlıklı ortalama risk skoru için.
 * Toplamları 1 olmak ZORUNDA değil; normalizasyonu motor yapar (yalnızca
 * gerçekten alınabilen sinyaller üzerinden), böylece eksik sinyal skoru bozmaz.
 */
export const SIGNAL_WEIGHTS: Record<SignalCategory, number> = {
  honeypot: 0.30,
  contract_risk: 0.20,
  liquidity: 0.20,
  holder_concentration: 0.15,
  sanctions: 0.05, // düşük ağırlık çünkü sert-kural; eşleşirse skordan bağımsız block
  approvals: 0.05,
  age_activity: 0.03,
  metadata: 0.02,
};

/**
 * SERT KURALLAR: skordan bağımsız anında 'block'.
 * Bir sinyal bu durumdaysa riskScore ne olursa olsun karar 'block'.
 */
export const HARD_BLOCK_CATEGORIES: SignalCategory[] = ["honeypot", "sanctions"];

/** Degrade politikası: en az bir kritik sinyal 'unknown' ise 'clear' yasak → 'review'. */
export const CRITICAL_FOR_DEGRADE: SignalCategory[] = [
  "honeypot",
  "contract_risk",
  "liquidity",
  "sanctions",
];
