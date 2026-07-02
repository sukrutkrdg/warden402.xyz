import { TeamPanel } from "../components/TeamPanel";

export const metadata = { title: "Team — Warden", description: "Manage your organization, members and agents." };

export default function TeamPage() {
  return (
    <main className="mx-auto max-w-4xl px-5 py-12">
      <h1 className="text-2xl font-bold">Team</h1>
      <p className="mt-1 text-sm text-slate-400">Sign in with your wallet to manage your organization, members and agents.</p>
      <div className="mt-8"><TeamPanel /></div>
    </main>
  );
}
