import { ImageResponse } from "next/og";
import { BRAND } from "@/lib/brand";

// Link-preview card (Messenger, iMessage, Slack, WhatsApp, LinkedIn, X, …).
export const alt = `${BRAND.name} — ${BRAND.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const ticketSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="104" height="104"><path d="M4 6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5V9a1.75 1.75 0 0 0 0 6v2.5A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5V15a1.75 1.75 0 0 0 0-6V6.5Z" fill="#ef4444"/><path d="M14.5 6.5v11" stroke="#171210" stroke-width="1.4" stroke-linecap="round" stroke-dasharray="1 2.2"/></svg>`;

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "90px",
          background: "linear-gradient(135deg, #171210 0%, #2c1414 100%)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", marginBottom: 44 }}>
          <img
            width={104}
            height={104}
            src={`data:image/svg+xml,${encodeURIComponent(ticketSvg)}`}
            style={{ marginRight: 28 }}
          />
          <div style={{ fontSize: 68, fontWeight: 800, color: "#fafafa", letterSpacing: "-2px" }}>
            {BRAND.name}
          </div>
        </div>
        <div
          style={{
            fontSize: 78,
            fontWeight: 800,
            color: "#fafafa",
            lineHeight: 1.04,
            maxWidth: 960,
            letterSpacing: "-2px",
          }}
        >
          Free tickets for creators who show up.
        </div>
        <div style={{ fontSize: 34, color: "#f0a6a6", marginTop: 40, maxWidth: 900, lineHeight: 1.3 }}>
          Labels give creators complimentary concert access — for showing up and posting.
        </div>
      </div>
    ),
    { ...size },
  );
}
