# Warden — Deploy

Bu repo **iki ayrı deploy** içerir. Tek bir Vercel projesi ikisini birden çalıştıramaz:

| # | Ne | Klasör | Vercel "Root Directory" |
|---|-----|--------|--------------------------|
| 1 | **Web sitesi** (landing + demo + track-record) | `web/` | `web` |
| 2 | **Guard API** (Hono) | repo kökü | `.` (kök) |

## ⚠️ "Site görünmüyor" — en yaygın sebep

Repo'yu Vercel'e olduğu gibi import edersen Vercel **kökü** build etmeye çalışır — ama
kök bir Next sitesi değil, Hono API'dir. **Site `web/` altında.**

**Çözüm:** Vercel → proje → Settings → **Build & Deployment → Root Directory → `web`** yap,
sonra **Redeploy** et. Site artık landing'i gösterir.

## 1) Web sitesi (warden402.xyz)

1. Vercel'de yeni proje → bu repo'yu seç
2. **Root Directory = `web`** (KRİTİK)
3. Framework otomatik **Next.js** algılanır
4. Environment Variables:
   ```
   WARDEN_API_URL = https://<guard-api-deployin>   # aşağıdaki 2. adımdan
   ```
5. Domain: `warden402.xyz` → bu projeye bağla
6. Deploy

## 2) Guard API (api.warden402.xyz)

İki seçenek:

### Seçenek A — Vercel serverless (kolay)
1. Vercel'de **ikinci** proje → aynı repo
2. **Root Directory = `.`** (kök)
3. `vercel.json` tüm yolları `api/index.ts`'e (Hono) yönlendirir
4. Subdomain: `api.warden402.xyz` → bu projeye bağla
5. Env: `ANTHROPIC_API_KEY` (opsiyonel, summary için), `BAZAAR_BASE_URL`, `BAZAAR_INTERNAL_SECRET`
6. Web projesindeki `WARDEN_API_URL` = `https://api.warden402.xyz`

> ⚠️ **Ledger kalıcılığı:** Vercel serverless dosya sistemi geçicidir; JSONL ledger
> kalıcı OLMAZ → `/track-record` boş görünür. Üretimde ledger'ı KV/Postgres'e taşı
> (`src/store/ledger.ts` arayüzü sabit, yalnızca gövdeyi değiştir). Geçici çözüm:
> API'yi kalıcı diskli bir Node host'ta çalıştır (Seçenek B).

### Seçenek B — Node host (Render / Railway / Fly) — ledger kalıcı
- Build: `npm install`
- Start: `npm run build && npm start`  (ya da `npx tsx src/index.ts`)
- Port: `PORT` env (varsayılan 8787)
- Disk kalıcı olduğundan JSONL ledger ve track-record çalışır.

## Lokal (ikisi birlikte)

```bash
# API
npm install && node --env-file=.env --import tsx src/index.ts   # :8787
# Web (ayrı terminal)
cd web && npm install && WARDEN_API_URL=http://localhost:8787 npm run dev   # :3000
```

## Bazaar internal-auth

API'nin gerçek veriyi ÖDEMEDEN alması için Bazaar'da `WARDEN_INTERNAL_SECRET` set olmalı
ve API'nin `.env`'indeki `BAZAAR_INTERNAL_SECRET` ile eşleşmeli. (Zaten yapıldı.)
