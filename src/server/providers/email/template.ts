import "server-only";

import { BRAND } from "@/lib/brand";

const BRAND_RED = "#F23645";
const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Optional extras that let an email stand on its own (no need to log in to read it). */
export type EmailExtras = {
  /** Label/value rows, e.g. Show, Date, Tickets. */
  details?: Array<{ label: string; value: string }>;
  /** A quoted message, e.g. the creator's pitch or chat message. */
  quote?: { from: string; text: string };
  ctaLabel?: string;
};

/** Plain-text rendering of the extras, appended to the text part. */
export function emailExtrasText(extras?: EmailExtras): string {
  if (!extras) return "";
  const lines: string[] = [];
  for (const row of extras.details ?? []) lines.push(`${row.label}: ${row.value}`);
  if (extras.quote?.text) {
    if (lines.length) lines.push("");
    lines.push(`${extras.quote.from} wrote:`, ...extras.quote.text.split("\n").map((l) => `> ${l}`));
  }
  return lines.length ? `\n\n${lines.join("\n")}` : "";
}

/**
 * A clean, email-client-safe HTML template for transactional notifications:
 * table layout + inline styles (so Gmail/Outlook/Apple Mail render it well),
 * a branded header, the message, optional details + quoted message, and a
 * single call-to-action button.
 */
export function notificationEmailHtml(input: {
  name: string;
  title: string;
  body: string;
  href?: string | null;
  ctaLabel?: string;
  extras?: EmailExtras;
}): string {
  const name = escapeHtml(input.name || "there");
  const title = escapeHtml(input.title);
  const body = escapeHtml(input.body || input.title);
  const cta = escapeHtml(input.extras?.ctaLabel || input.ctaLabel || `Open in ${BRAND.name}`);
  const details = input.extras?.details?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;border:1px solid #ececf0;border-radius:10px;">
         ${input.extras.details
           .map(
             (row, i) => `<tr>
           <td style="padding:9px 14px;${i ? "border-top:1px solid #ececf0;" : ""}font-family:${FONT};font-size:13px;color:#71717a;white-space:nowrap;vertical-align:top;">${escapeHtml(row.label)}</td>
           <td style="padding:9px 14px;${i ? "border-top:1px solid #ececf0;" : ""}font-family:${FONT};font-size:14px;color:#18181b;">${escapeHtml(row.value)}</td>
         </tr>`,
           )
           .join("")}
       </table>`
    : "";
  const quote = input.extras?.quote?.text
    ? `<p style="margin:0 0 6px;font-family:${FONT};font-size:13px;color:#71717a;">${escapeHtml(input.extras.quote.from)} wrote:</p>
       <div style="margin:0 0 20px;padding:12px 16px;border-left:3px solid ${BRAND_RED};background:#fafafa;border-radius:6px;font-family:${FONT};font-size:15px;line-height:1.55;color:#27272a;">${escapeHtml(input.extras.quote.text).replace(/\n/g, "<br />")}</div>`
    : "";
  const brand = escapeHtml(BRAND.name);
  const support = escapeHtml(BRAND.supportEmail);

  const button = input.href
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 4px;">
         <tr><td align="center" style="border-radius:10px;background:${BRAND_RED};">
           <a href="${escapeHtml(input.href)}" target="_blank"
              style="display:inline-block;padding:13px 30px;font-family:${FONT};font-size:15px;font-weight:600;line-height:1;color:#ffffff;text-decoration:none;border-radius:10px;">
             ${cta} &rarr;
           </a>
         </td></tr>
       </table>`
    : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body style="margin:0;padding:0;background:#f4f4f5;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f4f5;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;background:#ffffff;border:1px solid #e7e7ea;border-radius:16px;overflow:hidden;">
          <tr><td style="height:5px;background:${BRAND_RED};font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td style="padding:28px 32px 8px;">
            <span style="font-family:${FONT};font-size:20px;font-weight:800;letter-spacing:-0.02em;color:#18181b;">
              <span style="color:${BRAND_RED};">&#127903;</span>&nbsp;${brand}
            </span>
          </td></tr>
          <tr><td style="padding:12px 32px 4px;">
            <p style="margin:0 0 14px;font-family:${FONT};font-size:15px;line-height:1.5;color:#3f3f46;">Hi ${name},</p>
            <p style="margin:0 0 20px;font-family:${FONT};font-size:17px;line-height:1.5;font-weight:600;color:#18181b;">${body}</p>
            ${details}
            ${quote}
            ${button}
          </td></tr>
          <tr><td style="padding:24px 32px 28px;">
            <hr style="border:none;border-top:1px solid #ececf0;margin:0 0 16px;" />
            <p style="margin:0;font-family:${FONT};font-size:12px;line-height:1.5;color:#a1a1aa;">
              You're receiving this because you have a ${brand} account.<br />
              Questions? <a href="mailto:${support}" style="color:#71717a;">${support}</a>
            </p>
          </td></tr>
        </table>
        <p style="margin:16px 0 0;font-family:${FONT};font-size:11px;color:#b4b4bb;">&copy; ${brand}. ${escapeHtml(title)}</p>
      </td></tr>
    </table>
  </body>
</html>`;
}
