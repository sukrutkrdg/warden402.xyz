import { AccountPanel } from "../components/AccountPanel";

export const metadata = {
  title: "Account",
  description: "Sign in with your agent key to see your plan, remaining checks and recent decisions.",
  alternates: { canonical: "/account" },
  // Signed-in surface: nothing to index, but the links still count.
  robots: { index: false, follow: true },
};

export default function Account() {
  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h1 className="text-3xl font-bold text-white">Account</h1>
        <p className="text-slate-400">Your plan, remaining checks and recent firewall decisions — signed in with your agent key.</p>
      </section>
      <AccountPanel />
    </div>
  );
}
