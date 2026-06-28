import { ImageResponse } from "next/og";

type Status = "ok" | "warn" | "fail";
type Decision = "BLOCK" | "REVIEW" | "CLEAR";

const DEC = {
  CLEAR: { color: "#3ddc97", emoji: "✅" },
  REVIEW: { color: "#ffb454", emoji: "⚠️" },
  BLOCK: { color: "#ff5470", emoji: "⛔" },
};
const DOT: Record<Status, string> = { ok: "#3ddc97", warn: "#ffb454", fail: "#ff5470" };

export interface ShotOpts {
  kicker: string;
  decision: Decision;
  risk: number;
  summary: string;
  signals: { label: string; status: Status; detail: string }[];
  footer: string;
}

/** Portrait Mini App screenshot (1284x2778), built for Satori (next/og). */
export function renderShot(o: ShotOpts) {
  const dec = DEC[o.decision];
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "radial-gradient(1200px 800px at 50% -5%, #16202c 0%, #0a0e14 55%)",
          fontFamily: "monospace",
          padding: 90,
        }}
      >
        {/* brand */}
        <div style={{ display: "flex", alignItems: "center", marginBottom: 60 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: "#3ddc97", marginRight: 22 }} />
          <div style={{ display: "flex", color: "white", fontSize: 60, fontWeight: 700 }}>warden</div>
          <div style={{ display: "flex", color: "#3ddc97", fontSize: 60, fontWeight: 700 }}>402</div>
        </div>

        {/* kicker */}
        <div style={{ display: "flex", color: "#6b7b8b", fontSize: 38, letterSpacing: 4, marginBottom: 28 }}>
          {o.kicker}
        </div>

        {/* verdict card */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            border: "3px solid #1e2733",
            borderRadius: 36,
            background: "rgba(17,22,31,0.7)",
            padding: 64,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center" }}>
              <div style={{ display: "flex", fontSize: 64, marginRight: 24 }}>{dec.emoji}</div>
              <div style={{ display: "flex", color: dec.color, fontSize: 76, fontWeight: 800, letterSpacing: 4 }}>
                {o.decision}
              </div>
            </div>
            <div style={{ display: "flex", color: "#9fb0c0", fontSize: 40 }}>risk {o.risk}/100</div>
          </div>

          <div style={{ display: "flex", color: "#d6dde6", fontSize: 40, marginTop: 40, lineHeight: 1.4 }}>
            {o.summary}
          </div>

          <div style={{ display: "flex", flexDirection: "column", marginTop: 48 }}>
            {o.signals.map((s, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", marginBottom: 26 }}>
                <div style={{ width: 24, height: 24, borderRadius: 12, background: DOT[s.status], marginRight: 28 }} />
                <div style={{ display: "flex", width: 470, color: "#8aa", fontSize: 34 }}>{s.label}</div>
                <div style={{ display: "flex", color: "#d6dde6", fontSize: 34 }}>{s.detail}</div>
              </div>
            ))}
          </div>
        </div>

        {/* footer */}
        <div style={{ display: "flex", flexGrow: 1 }} />
        <div style={{ display: "flex", color: "#5b6b7b", fontSize: 38 }}>{o.footer}</div>
      </div>
    ),
    { width: 1284, height: 2778 },
  );
}
