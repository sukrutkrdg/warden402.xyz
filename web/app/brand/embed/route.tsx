import { ImageResponse } from "next/og";

export const runtime = "edge";

// 3:2 launchable card shown in Farcaster / Base App feeds.
export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "#0a0e14",
          fontFamily: "monospace",
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: "#3ddc97", marginRight: 18 }} />
          <div style={{ display: "flex", color: "white", fontSize: 52, fontWeight: 700 }}>warden</div>
          <div style={{ display: "flex", color: "#3ddc97", fontSize: 52, fontWeight: 700 }}>402</div>
        </div>
        <div style={{ display: "flex", color: "#3ddc97", fontSize: 64, fontWeight: 800, marginTop: 40 }}>
          block / review / clear
        </div>
        <div style={{ display: "flex", color: "#9fb0c0", fontSize: 40, marginTop: 10 }}>before your agent signs.</div>
        <div style={{ display: "flex", color: "#5b6b7b", fontSize: 28, marginTop: 44 }}>Base · x402 · agent security</div>
      </div>
    ),
    { width: 1200, height: 800 },
  );
}
