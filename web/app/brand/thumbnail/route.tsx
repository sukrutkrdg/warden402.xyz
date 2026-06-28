import { ImageResponse } from "next/og";

export const runtime = "edge";

// 1.91:1 app thumbnail (1200x628) for Base App / OG.
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
          padding: "70px",
          background: "#0a0e14",
          fontFamily: "monospace",
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: "#3ddc97", marginRight: 16 }} />
          <div style={{ display: "flex", color: "white", fontSize: 46, fontWeight: 700 }}>warden</div>
          <div style={{ display: "flex", color: "#3ddc97", fontSize: 46, fontWeight: 700 }}>402</div>
        </div>
        <div style={{ display: "flex", color: "#3ddc97", fontSize: 60, fontWeight: 800, marginTop: 34 }}>
          block · review · clear
        </div>
        <div style={{ display: "flex", color: "#9fb0c0", fontSize: 36, marginTop: 8 }}>before your agent signs.</div>
        <div style={{ display: "flex", color: "#5b6b7b", fontSize: 26, marginTop: 34 }}>
          Pre-execution security for agents on Base
        </div>
      </div>
    ),
    { width: 1200, height: 628 },
  );
}
