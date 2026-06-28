import { GuardDemo } from "./components/GuardDemo";

export default function Home() {
  return (
    <div className="space-y-14">
      <section className="space-y-5 pt-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-edge bg-panel px-3 py-1 text-xs text-slate-400">
          <span className="h-1.5 w-1.5 rounded-full bg-warden" /> Base · x402 · ajan güvenliği
        </div>
        <h1 className="text-4xl font-bold leading-tight text-white sm:text-5xl">
          Ajan imzalamadan önce <span className="text-warden">block / review / clear</span>.
        </h1>
        <p className="max-w-2xl text-slate-400">
          Warden, Base'de işlem yapan ajanlar için pre-execution güvenlik katmanıdır. Bir token,
          bekleyen bir işlem ya da bir adres ver — honeypot, sınırsız allowance, yaptırım,
          likidite ve holder yoğunluğunu tek bir kararda topla. Kararlar deterministik; LLM yalnızca
          açıklar.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm uppercase tracking-widest text-slate-500">Canlı demo — token guard</h2>
        <GuardDemo />
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          { t: "Deterministik karar", d: "decision ve risk skoru sabit kurallardan çıkar. LLM karara dokunmaz — sadece düz-dil gerekçe yazar. Denetlenebilir." },
          { t: "Sinyal düşerse durur", d: "Bir güvenlik sinyali alınamazsa asla sahte 'clear' vermez; en kötü ihtimalle 'review'a düşer." },
          { t: "Kanıtlanabilir track record", d: "Her verdict snapshot'lanır; sonuçlar yeniden ölçülür. Rug'ları rug olmadan önce yakaladığımızı sayılarla gösteririz." },
        ].map((c) => (
          <div key={c.t} className="rounded-xl border border-edge bg-panel/60 p-5">
            <h3 className="font-semibold text-white">{c.t}</h3>
            <p className="mt-2 text-sm text-slate-400">{c.d}</p>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm uppercase tracking-widest text-slate-500">Ajanlar için — API & MCP</h2>
        <div className="rounded-xl border border-edge bg-panel/60 p-5 text-sm">
          <pre className="overflow-x-auto text-slate-300">
{`# token guard
curl "https://warden402.xyz/api/guard?type=token&address=0x..."

# pre-sign (bekleyen işlem)
curl -X POST https://warden402.xyz/api/guard \\
  -H "content-type: application/json" \\
  -d '{"type":"tx","from":"0x..","to":"0x..","calldata":"0x095ea7b3..."}'`}
          </pre>
        </div>
      </section>
    </div>
  );
}
