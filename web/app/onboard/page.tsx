import { OnboardForm } from "../components/OnboardForm";

export const metadata = {
  title: "Warden — Get an agent key",
  description: "Create a firewall agent, get a key, and gate every agent action with allow / hold / deny in one call.",
};

export default function Onboard() {
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="inline-flex items-center gap-2 rounded-full border border-edge bg-panel px-3 py-1 text-xs text-slate-400">
          <span className="h-1.5 w-1.5 rounded-full bg-warden" /> free · early access
        </div>
        <h1 className="text-3xl font-bold text-white sm:text-4xl">Protect an agent in one call</h1>
        <p className="max-w-2xl text-slate-400">
          Create an agent, get a key, and call the Firewall before every payment or signature.
          Spend caps, drain protection and a kill switch — persistent per agent, every decision audited.
        </p>
      </section>

      <OnboardForm />

      <section className="rounded-xl border border-edge bg-panel/60 p-5 text-sm text-slate-400">
        <h3 className="mb-2 font-semibold text-white">How it works</h3>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Create an agent → receive a secret key (shown once).</li>
          <li>Before your agent sends a tx or x402 payment, POST it to <code className="text-slate-300">/api/v1/check</code> with your key.</li>
          <li>Warden runs the Guard verdict + your policy + live budget → returns <span className="text-clear">allow</span> / <span className="text-review">hold</span> / <span className="text-block">deny</span>.</li>
          <li>Your agent proceeds only on <span className="text-clear">allow</span>. Everything is logged.</li>
        </ol>
      </section>
    </div>
  );
}
