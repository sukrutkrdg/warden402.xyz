# Warden — Deploy

## ✅ En kolay yol — TEK Vercel projesi (önerilen)

Site, guard mantığını **kendi içinde** çalıştırır; ayrı API host'una gerek YOK.

1. Vercel'de yeni proje → bu repo'yu seç
2. **Root Directory = `web`**  ← KRİTİK (site bu alt klasörde)
3. Framework otomatik **Next.js** algılanır
4. Environment Variables (Production):
   ```
   BAZAAR_BASE_URL = https://402.com.tr
   BAZAAR_INTERNAL_SECRET = <Bazaar'daki WARDEN_INTERNAL_SECRET ile AYNI>
   ```
5. Domain `warden402.xyz` → bu projeye bağla → **Deploy**

Bu kadar. Landing + canlı demo (`/api/guard` in-process) çalışır.

### ⚠️ "Site görünmüyor" — en yaygın sebep
Repo'yu import edince Vercel **kökü** build etmeye çalışır; ama site `web/` altında.
**Çözüm:** Settings → Build & Deployment → **Root Directory → `web`** → Redeploy.

> Tek-proje modunda track-record kalıcı ledger'a bağlı değildir (Vercel serverless
> diski geçici). Kanıtlanabilir isabet geçmişi istiyorsan aşağıdaki ayrı API'yi de
> kur ve web'e `WARDEN_API_URL` ver.

---

## (Opsiyonel) Ayrı Guard API — kalıcı ledger + ajan/SDK/MCP host'u

Repo kökü ayrıca bağımsız bir Hono API'dir (aynı mantık). SDK/MCP'nin işaret ettiği
kamuya açık API ya da kalıcı track-record için bunu da deploy edebilirsin.

| # | Ne | Klasör | Vercel "Root Directory" |
|---|-----|--------|--------------------------|
| 1 | Web sitesi | `web/` | `web` |
| 2 | Guard API (Hono) | repo kökü | `.` (kök) |

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
