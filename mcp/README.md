# warden402-mcp

Warden'ın pre-execution güvenlik kontrollerini **MCP araçları** olarak sunan bir stdio
sunucusu. Ajan, herhangi bir on-chain aksiyondan önce çağırır; `block` dönerse yapmaz.

## Araçlar

| Araç | Ne zaman |
|------|----------|
| `guard_token` | Bir token'ı AL-SAT'tan önce (honeypot, vergi, likidite, holder, OFAC) |
| `guard_tx`    | Bekleyen bir işlemi İMZALAMADAN önce (sınırsız approve, sanctioned counterparty) |
| `guard_address` | Bir karşı tarafla etkileşim öncesi (OFAC, kontrat riski, yaş) |

## MCP istemci yapılandırması

```json
{
  "mcpServers": {
    "warden402": {
      "command": "npx",
      "args": ["-y", "warden402-mcp"],
      "env": { "WARDEN_API_URL": "https://warden402.xyz/api" }
    }
  }
}
```

`WARDEN_API_URL` opsiyoneldir (varsayılan `https://warden402.xyz/api`). Lokal geliştirme
için Hono API'yi doğrudan da gösterebilirsin (ör. `http://localhost:8787`, ama bu durumda
yol `/guard/token` olur — varsayılan Next proxy `/api/guard` bekler).

## Çalıştırma

```bash
cd mcp && npm install && WARDEN_API_URL=https://warden402.xyz/api node src/index.mjs
```
