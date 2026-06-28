# Warden — `warden402.xyz`

**Base üzerinde işlem yapan ajanlar ve onları çalıştıranlar için pre-execution güvenlik ve güven katmanı.**

Bir token / işlem / adres ver → `block` · `review` · `clear` kararı + gerekçe + güven skoru dön.
Veri beyni olarak [x402 Bazaar](https://402.com.tr)'ı kullanır; Warden bunun üstüne **yargı**, **track-record** ve (ileride) **firewall** kurar.

## Neden

x402 altyapısı talebin önünde; eksik olan katman **güven**. Marketplace tarafı kalabalık (Coinbase + onlarca klon), ama *pre-execution güvenlik* dikeyi boş. Warden o dikeye odaklanır.

## Mimari (katmanlar)

| Katman | Durum | Ne |
|--------|-------|-----|
| 0 — İstihbarat | ✅ Bazaar (canlı) | rug-score, token-risk, holders, token-pools, sanctions … |
| 1 — **Guard** | 🟢 MVP iskelet | `/guard/token` deterministik karar motoru + Claude açıklaması |
| 2 — Track record | 🟡 ledger hazır | her verdict snapshot'lanır; re-checker isabet oranını yayınlayacak |
| 3 — SDK / MCP | ⏳ | ajan framework'lerine drop-in guard |
| 4 — Firewall | ⏳ | x402+onchain çağrıların önünde policy gateway (Cloudflare Worker) |

## Karar kontratı (değişmez omurga)

Tüm endpoint'ler `Verdict` döner (`src/schema/verdict.ts`). İlkeler:

1. **Claude karara dokunmaz.** `decision` ve `riskScore` %100 deterministik kurallardan çıkar; Claude yalnızca `summary`'yi yazar (denetlenebilirlik).
2. **Sinyal düşerse sahte `clear` yok.** Bir Bazaar çağrısı timeout/402/hata alırsa o sinyal `unknown` → `degraded:true` → karar en iyi ihtimalle `review`.
3. **Her verdict snapshot'lanır** (`verdictId` + sinyal kanıtı) → track-record/moat.

## Çalıştırma

```bash
cp .env.example .env      # BAZAAR_INTERNAL_SECRET ve (ops.) ANTHROPIC_API_KEY doldur
npm install
npm run smoke             # motoru ağ olmadan kanıtla (karar kuralları)
npm run dev               # http://localhost:8787
```

```bash
curl "http://localhost:8787/guard/token?address=0x...&chainId=8453"
```

## Bazaar internal-auth (önemli)

Warden, Bazaar'ı **ödeme yapmadan** çağırmalı (kendi kendine fatura kesmemek için).
`bazaarClient`, `X-Warden-Internal: <secret>` header'ı gönderir. Bazaar tarafında bu
header'ı tanıyıp x402 duvarını atlayan bir bypass kurulmalı. Kurulana kadar tüm
sinyaller `unknown` döner ve verdict güvenli tarafta `review` olur.

Gerçek yanıt şekillerini görüp `src/bazaar/signals.ts`'teki alan adlarını kalibre etmek için:
```bash
npx tsx scripts/probe.ts 0xTokenAddress
```

## Yapı

```
src/
  schema/verdict.ts     # karar kontratı (omurga)
  engine/config.ts      # eşikler, ağırlıklar, sert kurallar
  engine/decide.ts      # DETERMİNİSTİK karar motoru
  bazaar/client.ts      # tek Bazaar erişim noktası (cache/timeout/internal-auth/degrade)
  bazaar/signals.ts     # Bazaar yanıtı → SignalResult adaptörleri
  llm/summary.ts        # Claude düz-dil gerekçe (karara dokunmaz)
  store/ledger.ts       # verdict ledger (track-record)
  routes/guardToken.ts  # flagship endpoint
  index.ts              # Hono app
scripts/
  smoke.ts              # offline karar-kuralı testi
  probe.ts              # gerçek Bazaar yanıtlarını kalibre et
```
