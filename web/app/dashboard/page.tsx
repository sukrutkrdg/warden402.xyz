import { FleetDashboard } from "../components/FleetDashboard";

export const metadata = {
  title: "Warden — Fleet dashboard",
  description: "Watch every agent's spend, approve or reject held actions, and enforce policy across a fleet — the real product behind the Firewall.",
};

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="inline-flex items-center gap-2 rounded-full border border-edge bg-panel px-3 py-1 text-xs text-slate-400">
          <span className="h-1.5 w-1.5 rounded-full bg-warden" /> fleet dashboard · sample data
        </div>
        <h1 className="text-3xl font-bold text-white sm:text-4xl">Your agent fleet, under control</h1>
        <p className="max-w-2xl text-slate-400">
          Every agent&apos;s live spend, the actions waiting on your approval, and policy enforced
          across the fleet. This is the real product behind the Firewall — here with sample agents.
        </p>
      </section>

      <FleetDashboard />

      <p className="text-[11px] text-slate-600">
        Sample fleet for illustration. In production each agent is isolated with its own key, policy,
        budget and audit, backed by a persistent store.
      </p>
    </div>
  );
}
