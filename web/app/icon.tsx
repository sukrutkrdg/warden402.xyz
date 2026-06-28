import { ImageResponse } from "next/og";

// Browser tab favicon — auto-served by Next at /icon.
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
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
          borderRadius: 7,
          color: "#3ddc97",
          fontSize: 24,
          fontWeight: 800,
          fontFamily: "monospace",
        }}
      >
        W
      </div>
    ),
    { ...size },
  );
}
