/**
 * Warden — Verdict Schema (v0)
 * Tüm Warden endpoint'lerinin (token / tx / address) döndüğü ORTAK karar kontratı.
 * Bu şema değişmez-omurgadır: SDK, firewall ve track-record hepsi buna bağlanır.
 */

// ── Üst düzey karar ───────────────────────────────────────────────
export type Decision = "block" | "review" | "clear";
//  block  = ajan İŞLEMİ YAPMAMALI (yüksek/kesin risk)
//  review = insan/ek kontrol gerekli (belirsizlik VEYA sinyal eksik)
//  clear  = bilinen risk yok, devam edebilir
//  KURAL: Bir sinyal alınamazsa verdict asla 'clear' olamaz → en kötü 'review'.

export type RiskScore = number; // 0..100  (0 = temiz, 100 = kesin kötü)

// ── Sinyal kategorileri (her biri Bazaar'dan beslenir) ────────────
export type SignalCategory =
  | "honeypot"
  | "liquidity"
  | "holder_concentration"
  | "contract_risk"
  | "approvals"
  | "sanctions"
  | "age_activity"
  | "metadata";

export type SignalStatus = "ok" | "warn" | "fail" | "unknown";

export interface SignalResult {
  category: SignalCategory;
  status: SignalStatus;        // unknown = veri alınamadı (degrade tetikler)
  weight: number;              // skora katkı ağırlığı (0..1)
  score: number;               // bu sinyalin ham risk katkısı (0..100)
  source: string;              // hangi Bazaar endpoint'i (örn "rug-score")
  detail?: string;             // insan-okur kısa açıklama
  evidence?: Record<string, unknown>; // ham kanıt (track-record snapshot için)
}

// ── Reason kodları (stabil enum — pazarlanabilir, i18n'lenebilir) ─
export type ReasonCode =
  | "HONEYPOT_DETECTED"
  | "SELL_TAX_EXCESSIVE"
  | "LIQUIDITY_LOW"
  | "LIQUIDITY_UNLOCKED"
  | "OWNER_CAN_MINT"
  | "OWNER_CAN_BLACKLIST"
  | "PROXY_UPGRADEABLE"
  | "HOLDER_CONCENTRATION_HIGH"
  | "DANGEROUS_APPROVAL"
  | "SANCTIONED_ADDRESS"
  | "CONTRACT_TOO_NEW"
  | "SOURCE_UNVERIFIED"
  | "SIGNAL_UNAVAILABLE"; // degrade → review

// ── Hedef (neyi sorguladık) ───────────────────────────────────────
export type Target =
  | { type: "token"; chainId: number; address: string }
  | { type: "tx"; chainId: number; from: string; to: string; calldata: string; value?: string }
  | { type: "address"; chainId: number; address: string };

// ── ANA VERDICT NESNESİ ───────────────────────────────────────────
export interface Verdict {
  // kimlik & izlenebilirlik
  verdictId: string;       // ulid — track-record ledger anahtarı
  schemaVersion: "0";
  issuedAt: string;        // ISO8601
  target: Target;

  // karar
  decision: Decision;
  riskScore: RiskScore;
  confidence: number;      // 0..1 — kaç sinyal alınabildi + tutarlılık
  reasons: ReasonCode[];   // decision'ı SÜRÜKLEYEN kodlar (en önemli ilk)

  // şeffaflık
  signals: SignalResult[]; // tüm sinyal kırılımı (unknown'lar dahil)
  summary: string;         // Claude'un düz-dil gerekçesi (deterministik skor ÜSTÜNE)

  // operasyonel
  degraded: boolean;       // en az bir sinyal 'unknown' → true ise 'clear' yasak
  latencyMs: number;
}

export const SCHEMA_VERSION = "0" as const;
