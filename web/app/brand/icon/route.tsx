import { ImageResponse } from "next/og";

export const runtime = "edge";

// 1024x1024 app icon for Farcaster / Base App.
export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0e14",
          fontFamily: "monospace",
        }}
      >
        <div
          style={{
            width: 560,
            height: 560,
            borderRadius: 120,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "linear-gradient(160deg, #11161f, #0a0e14)",
            border: "10px solid #3ddc97",
            boxShadow: "0 0 120px rgba(61,220,151,0.5)",
            color: "#3ddc97",
            fontSize: 360,
            fontWeight: 800,
          }}
        >
          W
        </div>
      </div>
    ),
    { width: 1024, height: 1024 },
  );
}
