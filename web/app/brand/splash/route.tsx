import { ImageResponse } from "next/og";

export const runtime = "edge";

// 200x200 splash mark shown while the Mini App loads.
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
            width: 120,
            height: 120,
            borderRadius: 28,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#11161f",
            border: "4px solid #3ddc97",
            boxShadow: "0 0 50px rgba(61,220,151,0.6)",
            color: "#3ddc97",
            fontSize: 76,
            fontWeight: 800,
          }}
        >
          W
        </div>
      </div>
    ),
    { width: 200, height: 200 },
  );
}
