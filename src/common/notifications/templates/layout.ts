/**
 * The one HTML shell every transactional email renders through.
 *
 * Table-based and fully inline-styled on purpose: email clients do not share
 * a browser's CSS support, and the surest way to look the same in Gmail,
 * Outlook and Apple Mail is to write the 1998 subset that all three of them
 * render identically. A `<style>` block or an external stylesheet is a bet
 * that whichever client renders this is one of the modern ones — Outlook's
 * Word-based engine still isn't, so the bet is skipped entirely.
 */

const BRAND = 'Rakuxon';
const BRAND_COLOR = '#4f6df5';
const TEXT_COLOR = '#1a1f36';
const MUTED_COLOR = '#6b7280';
const BORDER_COLOR = '#e5e7eb';

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

export interface LayoutInput {
  /** Shown by the inbox list before the subject is opened; not shown in the body itself. */
  preheader: string;
  heading: string;
  /** Each entry becomes one paragraph, in both the HTML and the plain-text part. */
  paragraphs: string[];
  cta?: { label: string; url: string };
  /** A line under the button, e.g. an expiry note or "if you didn't request this…" */
  footnote?: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Renders one `<title>{subject}</title>`-carrying HTML document plus its plain-text twin. */
export function renderLayout(input: LayoutInput): Pick<EmailContent, 'html' | 'text'> {
  const paragraphsHtml = input.paragraphs
    .map(
      (paragraph) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${TEXT_COLOR};">${escapeHtml(paragraph)}</p>`,
    )
    .join('\n');

  const ctaHtml = input.cta
    ? `
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
        <tr>
          <td style="border-radius:8px;background:${BRAND_COLOR};">
            <a href="${escapeHtml(input.cta.url)}"
               style="display:inline-block;padding:12px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
              ${escapeHtml(input.cta.label)}
            </a>
          </td>
        </tr>
      </table>`
    : '';

  const footnoteHtml = input.footnote
    ? `<p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:${MUTED_COLOR};">${escapeHtml(input.footnote)}</p>`
    : '';

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(input.heading)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f4f5f7;">
    <span style="display:none;font-size:1px;color:#f4f5f7;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
      ${escapeHtml(input.preheader)}
    </span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;border:1px solid ${BORDER_COLOR};">
            <tr>
              <td style="padding:28px 32px 0;">
                <span style="font-size:18px;font-weight:700;color:${TEXT_COLOR};">${BRAND}</span>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 32px;">
                <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:${TEXT_COLOR};">${escapeHtml(input.heading)}</h1>
                ${paragraphsHtml}
                ${ctaHtml}
                ${footnoteHtml}
              </td>
            </tr>
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
            <tr>
              <td style="padding:16px 32px;text-align:center;">
                <span style="font-size:12px;color:${MUTED_COLOR};">${BRAND} · this is an automated message, please don't reply to it.</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const textLines = [
    input.heading,
    '',
    ...input.paragraphs,
    ...(input.cta ? ['', `${input.cta.label}: ${input.cta.url}`] : []),
    ...(input.footnote ? ['', input.footnote] : []),
    '',
    `— ${BRAND}`,
  ];

  return { html, text: textLines.join('\n') };
}
