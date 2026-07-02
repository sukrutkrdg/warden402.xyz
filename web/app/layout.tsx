import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { getBaseAppId, getSiteUrl } from "./lib/site";
import FarcasterReady from "./components/FarcasterReady";

const SITE_URL = getSiteUrl();
const baseAppId = getBaseAppId();

// Farcaster / Base App Mini App embed — renders the URL as a launchable card.
const miniappEmbed = {
  version: "1",
  imageUrl: `${SITE_URL}/brand/embed`,
  button: {
    title: "Open Warden",
    action: {
      type: "launch_miniapp",
      url: SITE_URL,
      name: "Warden",
      splashImageUrl: `${SITE_URL}/brand/splash`,
      splashBackgroundColor: "#0a0e14",
    },
  },
};
const frameEmbed = {
  ...miniappEmbed,
  button: { ...miniappEmbed.button, action: { ...miniappEmbed.button.action, type: "launch_frame" } },
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Warden — pre-execution security for agents on Base",
  description:
    "Give a token, transaction or address → block / review / clear. The pre-execution security and trust layer for agents transacting on Base.",
  applicationName: "Warden",
  alternates: { canonical: SITE_URL },
  openGraph: {
    type: "website",
    siteName: "Warden",
    url: SITE_URL,
    title: "Warden — pre-execution security for agents on Base",
    description: "block / review / clear before your agent signs. Token, transaction and address safety on Base.",
    images: [{ url: `${SITE_URL}/brand/embed`, width: 1200, height: 800 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Warden — pre-execution security for agents on Base",
    description: "block / review / clear before your agent signs.",
    images: [`${SITE_URL}/brand/embed`],
  },
  other: {
    // Base App verification / discovery tag (distinct from any Builder Code).
    ...(baseAppId ? { "base:app_id": baseAppId } : {}),
    // Farcaster Mini App embed (fc:frame kept for backward compatibility).
    "fc:miniapp": JSON.stringify(miniappEmbed),
    "fc:frame": JSON.stringify(frameEmbed),
  },
};

export const viewport = { themeColor: "#0a0e14" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-mono antialiased">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              name: "Warden",
              applicationCategory: "SecurityApplication",
              operatingSystem: "Web, API, MCP",
              description: "Pre-execution security & trust layer for agents transacting on Base. block / review / clear before your agent signs.",
              url: SITE_URL,
              offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
              author: { "@type": "Person", name: "sukrutkrdg", url: "https://x.com/sukrutkrdg" },
            }),
          }}
        />
        <FarcasterReady />
        <header className="border-b border-edge/60">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
            <Link href="/" className="flex items-center gap-2 font-semibold">
              <span className="inline-block h-3 w-3 rounded-sm bg-warden shadow-[0_0_12px] shadow-warden" />
              <span>warden<span className="text-warden">402</span></span>
            </Link>
            <nav className="flex items-center gap-5 text-sm text-slate-400">
              <Link href="/" className="hover:text-white">Guard</Link>
              <Link href="/firewall" className="hover:text-white">Firewall</Link>
              <Link href="/pricing" className="hover:text-white">Pricing</Link>
              <Link href="/account" className="hover:text-white">Account</Link>
              <Link href="/team" className="hover:text-white">Team</Link>
              <Link href="/track-record" className="hover:text-white">Track Record</Link>
              <a href="https://github.com/sukrutkrdg/warden402.xyz" className="hover:text-white" target="_blank" rel="noreferrer">GitHub</a>
              <a href="https://x.com/sukrutkrdg" target="_blank" rel="noreferrer" aria-label="X (Twitter)"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-edge bg-panel text-white transition hover:border-warden hover:text-warden">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-5 py-10">{children}</main>
        <footer className="border-t border-edge/60 py-8 text-center text-xs text-slate-500">
          <div className="flex items-center justify-center gap-5">
            <a href="https://x.com/sukrutkrdg" target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:text-warden">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              @sukrutkrdg
            </a>
            <a href="mailto:sukrutkrdg@gmail.com" className="hover:text-warden">sukrutkrdg@gmail.com</a>
            <a href="https://github.com/sukrutkrdg/warden402.xyz" target="_blank" rel="noreferrer" className="hover:text-warden">GitHub</a>
          </div>
          <div className="mt-3">Warden · pre-execution security layer for the agent economy on Base</div>
        </footer>
      </body>
    </html>
  );
}
