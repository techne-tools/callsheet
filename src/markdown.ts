// Dependency-light markdown renderer for the card content subset:
// H1–H3, bold, italic, bullet lists, blockquotes.
//
// Safety: we escape HTML first and only then apply the markdown transforms, so
// raw HTML in the source can never be injected. The transforms only emit the
// tags we control.

/** Escape the HTML-significant characters before any transform. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Inline transforms: **bold** then *italic*. Input is already escaped. */
function inline(md: string): string {
  let s = md;
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*\s][^*]*)\*(?!\*)/g, "$1<em>$2</em>");
  return s;
}

/** Render the markdown subset to safe HTML. */
export function renderMarkdown(md: string): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let inList = false;
  let inQuote = false;

  const closeList = () => {
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
  };
  const closeQuote = () => {
    if (inQuote) {
      out.push("</blockquote>");
      inQuote = false;
    }
  };

  for (const raw of lines) {
    const trimmed = raw.trim();
    const escaped = escapeHtml(trimmed);

    // Headings H1–H3
    const h = /^(#{1,3})\s+(.*)$/.exec(escaped);
    if (h) {
      closeList();
      closeQuote();
      const level = h[1].length;
      out.push(`<h${level}>${inline(h[2])}</h${level}>`);
      continue;
    }

    // Blockquote
    if (trimmed.startsWith(">")) {
      closeList();
      if (!inQuote) {
        out.push("<blockquote>");
        inQuote = true;
      }
      out.push(`<p>${inline(escapeHtml(trimmed.replace(/^>\s?/, "")))}</p>`);
      continue;
    }

    // Bullet list
    const bullet = /^[-*+]\s+(.*)$/.exec(escaped);
    if (bullet) {
      closeQuote();
      if (!inList) {
        out.push("<ul>");
        inList = true;
      }
      out.push(`<li>${inline(bullet[1])}</li>`);
      continue;
    }

    // Blank line separates blocks
    if (escaped === "") {
      closeList();
      closeQuote();
      continue;
    }

    // Paragraph
    closeList();
    closeQuote();
    out.push(`<p>${inline(escaped)}</p>`);
  }

  closeList();
  closeQuote();
  return out.join("\n");
}

/** Plain-text form of the markdown (for clipboard copy). */
export function markdownToPlainText(md: string): string {
  return md
    .replace(/^#{1,3}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^[-*+]\s+/gm, "• ")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
