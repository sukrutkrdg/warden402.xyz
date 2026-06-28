import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Warden — pre-execution security for agents on Base",
  description:
    "Give a token, transaction or address → block / review / clear. The pre-execution security and trust layer for agents transacting on Base.",
  metadataBase: new URL("https://warden402.xyz"),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-mono antialiased">
        <header className="border-b border-edge/60">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
            <Link href="/" className="flex items-center gap-2 font-semibold">
              <span className="inline-block h-3 w-3 rounded-sm bg-warden shadow-[0_0_12px] shadow-warden" />
              <span>warden<span className="text-warden">402</span></span>
            </Link>
            <nav className="flex items-center gap-5 text-sm text-slate-400">
              <Link href="/" className="hover:text-white">Demo</Link>
              <Link href="/track-record" className="hover:text-white">Track Record</Link>
              <a href="https://github.com/sukrutkrdg/warden402.xyz" className="hover:text-white" target="_blank" rel="noreferrer">GitHub</a>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-5 py-10">{children}</main>
        <footer className="border-t border-edge/60 py-8 text-center text-xs text-slate-500">
          Warden · pre-execution security layer for the agent economy on Base
        </footer>
      </body>
    </html>
  );
}
