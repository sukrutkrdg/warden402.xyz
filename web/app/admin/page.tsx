import { AdminPanel } from "../components/AdminPanel";

export const metadata = { title: "Warden — Admin", robots: { index: false, follow: false } };

export default function Admin() {
  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h1 className="text-3xl font-bold text-white">Admin</h1>
        <p className="text-slate-400">Subscriptions, payments, manual actions and system jobs. Protected by ADMIN_TOKEN.</p>
      </section>
      <AdminPanel />
    </div>
  );
}
