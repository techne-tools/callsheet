// Markdown rendering for card content.
//
// The parser is shared with eidolon's mirror renderer (eidolon/src/api.ts):
// marked (GFM) with an escape-first `html` renderer, a scheme-guarded link
// renderer, an Obsidian callout blockquote renderer, and the `[[wikilink]]`
// and `==highlight==` inline extensions. Raw HTML can never be injected: the
// `html` renderer escapes every raw tag token before it reaches innerHTML, and
// every renderer that interpolates into an attribute escapes there too.
//
// Two display-only steps from eidolon's public `renderMarkdown` are deliberately
// NOT adopted here. Eidolon drops a leading H1 (its pane header already shows the
// title) and strips a YAML frontmatter block. Callsheet's renderer seeds the
// card editor's contentEditable and the DOM is serialised straight back to
// markdown on save (editor.ts), so either step would silently DELETE that
// content the moment the card is edited. Cards also carry no duplicate-title
// affordance to justify the H1 drop. The shared parser is what migrates; the
// lossy display preprocessing stays in eidolon.

import { Marked, type Token, type Tokens } from "marked";

// Obsidian + GFM Markdown renderer with HTML escaping and link scheme guards.
// Kept byte-for-byte in step with eidolon so the two surfaces render alike.
const markedRenderer = new Marked({
  gfm: true,
  breaks: false,
  renderer: {
    html({ text }: Tokens.HTML | Tokens.Tag) {
      return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    },
    link({ href, title, text }: Tokens.Link) {
      const h = (href || "").trim();
      // Scheme guard. `obsidian:` is a deliberate callsheet-only addition to
      // eidolon's set (https?|mailto|#|/|./..) so `[label](obsidian://…)` — the
      // form Obsidian itself copies for a note, and the only way to carry a
      // `#heading` / `^block` anchor — stays a live link. Everything else is
      // unchanged, so the two renderers still agree on every other scheme.
      const safe = /^(https?:|mailto:|obsidian:|#|\/|\.{1,2}\/)/i.test(h) ? h : "#";
      // Attribute context: escape after the scheme guard, including the quote,
      // so a crafted URL cannot break out of href="".
      const safeAttr = safe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
      const titleAttr = title
        ? ` title="${title
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")}"`
        : "";
      return `<a href="${safeAttr}" rel="noreferrer"${titleAttr}>${text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")}</a>`;
    },
    blockquote(token: Tokens.Blockquote) {
      const firstToken = token.tokens && token.tokens[0];
      if (firstToken && firstToken.type === "paragraph") {
        const textToken = firstToken.tokens && firstToken.tokens[0];
        if (textToken && textToken.type === "text") {
          const match = /^\[!([a-zA-Z0-9_-]+)\][+-]?(?:[ \t]+([^\n]*))?(\n|$)/.exec(textToken.text);
          if (match) {
            const type = match[1].toLowerCase();
            const customTitle = match[2] ? match[2].trim() : "";
            // Text context: the title reaches innerHTML, so escape it.
            const title = (customTitle || (type.charAt(0).toUpperCase() + type.slice(1)))
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;");

            const remainingText = textToken.text.slice(match[0].length);
            if (firstToken.tokens) {
              if (remainingText.trim()) {
                textToken.text = remainingText;
                textToken.raw = remainingText;
              } else {
                firstToken.tokens.shift();
              }
              if (firstToken.tokens.length === 0) {
                token.tokens.shift();
              }
            }

            const bodyHtml = this.parser.parse(token.tokens);
            return `<div class="callout callout-${type}" data-callout="${type}">\n` +
                   `  <div class="callout-title">${title}</div>\n` +
                   (bodyHtml.trim() ? `  <div class="callout-content">\n${bodyHtml}  </div>\n` : "") +
                   `</div>\n`;
          }
        }
      }
      return `<blockquote>\n${this.parser.parse(token.tokens)}</blockquote>\n`;
    },
  },
});

markedRenderer.use({
  extensions: [
    {
      name: "wikilink",
      level: "inline",
      start(src: string) {
        return src.indexOf("[[");
      },
      tokenizer(src: string) {
        const match = /^\[\[([^\]|\n]+)(?:\|([^\]\n]+))?\]\]/.exec(src);
        if (match) {
          return {
            type: "wikilink",
            raw: match[0],
            target: match[1].trim(),
            label: (match[2] || match[1]).trim(),
          };
        }
      },
      renderer(token: Token) {
        const t = token as unknown as { target: string; label: string };
        const target = t.target.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
        const label = t.label
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
        return `<a class="internal-link" data-href="${target}" href="#${encodeURIComponent(target)}">${label}</a>`;
      },
    },
    {
      name: "highlight",
      level: "inline",
      start(src: string) {
        return src.indexOf("==");
      },
      tokenizer(src: string) {
        const match = /^==([^=\n]+)==/.exec(src);
        if (match) {
          const token = {
            type: "highlight",
            raw: match[0],
            text: match[1],
            tokens: [] as Token[],
          };
          this.lexer.inlineTokens(token.text, token.tokens);
          return token;
        }
      },
      renderer(token: Token) {
        const t = token as unknown as { tokens: Token[] };
        return `<mark>${this.parser.parseInline(t.tokens)}</mark>`;
      },
    },
  ],
});

/**
 * Render the card markdown to safe HTML. The trailing newline marked appends is
 * trimmed: the output is set as innerHTML, where it carries no meaning, and the
 * card's own contract has always been newline-free.
 */
export function renderMarkdown(md: string): string {
  return (markedRenderer.parse(md) as string).replace(/\n+$/, "");
}

/**
 * Render the inline content of a single line (no block wrapper). Used by the
 * live editor to re-render a block's inner HTML as the user types. Raw HTML in
 * the source is escaped by the shared renderer, so the output is safe to set as
 * innerHTML, and the grammar (emphasis, code, links, ==highlight==, [[links]])
 * matches the display renderer exactly.
 */
export function parseInline(md: string): string {
  return markedRenderer.parseInline(md) as string;
}

/** Plain-text form of the markdown (for clipboard copy). */
export function markdownToPlainText(md: string): string {
  return md
    .replace(/^```.*$/gm, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?\[![a-zA-Z0-9_-]+\][+-]?\s*/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "• ")
    .replace(/^\s*\d+\.\s+/gm, "• ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/==([^=]+)==/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/^\s*\|.*\|\s*$/gm, (line) => line.replace(/\|/g, " ").trim())
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** A short template name derived from the card's first line. */
export function templateNameFromMarkdown(md: string): string {
  const first = markdownToPlainText(md).split("\n")[0]?.trim() || "";
  return first.slice(0, 40) || "Untitled";
}
