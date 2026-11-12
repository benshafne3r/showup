import { ImageResponse } from "next/og";
import { BRAND } from "@/lib/brand";

// Link-preview card (Messenger, iMessage, Slack, WhatsApp, LinkedIn, X, …).
export const alt = `${BRAND.name} | ${BRAND.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const ticketSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="150" height="150"><path d="M4 6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5V9a1.75 1.75 0 0 0 0 6v2.5A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5V15a1.75 1.75 0 0 0 0-6V6.5Z" fill="#ef4444"/><path d="M14.5 6.5v11" stroke="#171210" stroke-width="1.4" stroke-linecap="round" stroke-dasharray="1 2.2"/></svg>`;

// Just the mark and the name, centered.
export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #171210 0%, #2c1414 100%)",
        }}
      >
        <img
          alt=""
          width={150}
          height={150}
          src={`data:image/svg+xml,${encodeURIComponent(ticketSvg)}`}
          style={{ marginRight: 36 }}
        />
        <div style={{ fontSize: 120, fontWeight: 800, color: "#fafafa", letterSpacing: "-3px" }}>{BRAND.name}</div>
      </div>
    ),
    { ...size },
  );
}
