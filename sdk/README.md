# @warden402/sdk

Ajanlar için **pre-execution güvenlik**. Base'de herhangi bir on-chain aksiyondan önce
bir token / işlem / adresi `block · review · clear` ile sarmala.

```ts
import { Warden, WardenBlockedError } from "@warden402/sdk";

const warden = new Warden(); // varsayılan: https://warden402.xyz/api

// 1) Token guard (al-sat öncesi)
const v = await warden.token("0xTOKEN");
if (v.decision === "block") throw new Error(v.summary);

// 2) Tek satır kapı — block ise fırlatır
await warden.assertSafe(() => warden.token("0xTOKEN"));

// 3) Pre-sign (bekleyen işlem)
const tv = await warden.tx({ from, to, calldata });
if (tv.decoded?.unlimited) console.warn("sınırsız allowance!");
```

## Seçenekler

```ts
new Warden({
  baseUrl: "http://localhost:8787", // lokal Hono API
  blockOn: ["block", "review"],     // review'i de fırlatma say
  timeoutMs: 8000,
});
```

## LangChain

```ts
import { wardenTools } from "@warden402/sdk/langchain";
const tools = await wardenTools();   // [guard_token, guard_address, guard_tx]
// agent executor'a ekle — ajan trade/sign'dan önce çağırır
```

`@langchain/core` opsiyonel bir peer dependency'dir.

## Verdict şekli

`{ decision, riskScore, confidence, reasons[], signals[], summary, degraded, ... }`
Kararlar deterministiktir; LLM yalnızca `summary`'yi üretir.
