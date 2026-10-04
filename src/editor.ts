// editor.ts
// DOM ↔ markdown bridge for the inline (contentEditable) card editor.
//
// The editor's DOM is the rendered markdown: block elements (h1–h3, p, ul>li,
// blockquote>p) whose innerHTML is the inline-rendered content (strong/em).
// These helpers serialize that DOM back to markdown, transform blocks as the
// user types (e.g. "# " → h1), and move the caret by markdown offset.

import { parseInline } from "./markdown";

/** Serialize a node's inline content back to markdown. */
export function serializeInline(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  if (tag === "br") return "\n";
  const wrap = wrapMarkers(el);
  if (wrap) return `${wrap.open}${serializeChildren(el)}${wrap.close}`;
  if (tag === "a") return serializeLink(el);
  if (tag === "img") {
    return `![${el.getAttribute("alt") ?? ""}](${el.getAttribute("src") ?? ""})`;
  }
  // Element with no markdown meaning of its own: keep its content.
  return serializeChildren(el);
}

function serializeChildren(el: HTMLElement): string {
  let out = "";
  for (const child of Array.from(el.childNodes)) out += serializeInline(child);
  return out;
}

/**
 * The symmetric markdown wrapper an inline element contributes, or null when the
 * element carries no wrapper. `<b>`/`<i>` are included because that is what the
 * browser's own bold/italic commands produce in a contentEditable — without
 * them, Cmd+B round-trips through the serializer as plain text and the
 * formatting is silently dropped. The added kinds (`mark`, `del`, `code`) mirror
 * the grammar the shared parser renders, so a round trip through the editor is
 * faithful for every inline construct the card can now contain.
 */
function wrapMarkers(el: HTMLElement): { open: string; close: string } | null {
  switch (el.tagName.toLowerCase()) {
    case "strong":
    case "b":
      return { open: "**", close: "**" };
    case "em":
    case "i":
      return { open: "*", close: "*" };
    case "mark":
      return { open: "==", close: "==" };
    case "del":
    case "s":
    case "strike":
      return { open: "~~", close: "~~" };
    case "code":
      return { open: "`", close: "`" };
    default:
      return null;
  }
}

/**
 * The markdown open/close that surrounds an element's children, for caret
 * arithmetic. Symmetric wrappers come from `wrapMarkers`; an anchor or an image
 * contributes its asymmetric affixes (`[`…`](href)`, `!`…`](src)`) so a caret
 * after a link does not drift by the wrapper's length. A refused or inert link
 * (rendered as `href="#"`) contributes none, matching what `serializeLink`
 * emits for it.
 */
function inlineAffixes(el: HTMLElement): { open: string; close: string } | null {
  const wrap = wrapMarkers(el);
  if (wrap) return wrap;
  const tag = el.tagName.toLowerCase();
  if (tag === "img") {
    return {
      open: `![${el.getAttribute("alt") ?? ""}](${el.getAttribute("src") ?? ""})`,
      close: "",
    };
  }
  if (tag !== "a") return null;
  const dataHref = el.getAttribute("data-href");
  if (dataHref !== null) {
    // Obsidian internal link (the [[wikilink]] extension renders this shape).
    const label = serializeChildren(el);
    return label === dataHref
      ? { open: "[[", close: "]]" }
      : { open: `[[${dataHref}|`, close: "]]" };
  }
  const href = el.getAttribute("href") ?? "";
  if (href === "#" || href === "") return { open: "", close: "" };
  return { open: "[", close: `](${href})` };
}

/** Serialize an anchor back to markdown (external link or Obsidian wikilink). */
function serializeLink(el: HTMLElement): string {
  const text = serializeChildren(el);
  const dataHref = el.getAttribute("data-href");
  if (dataHref !== null) {
    return text === dataHref ? `[[${dataHref}]]` : `[[${dataHref}|${text}]]`;
  }
  const href = el.getAttribute("href") ?? "";
  // A display-only or refused link renders as href="#"; keep its text rather
  // than writing a literal empty/`#` href back to the card.
  if (href === "#" || href === "") return text;
  return `[${text}](${href})`;
}

/** The Obsidian callout this line belongs to, if the line sits in one. */
function calloutOf(el: HTMLElement): HTMLElement | null {
  const parent = el.parentElement;
  return parent?.classList.contains("callout") ? parent : null;
}

/**
 * The markdown line a block element represents (prefix + inline content). A line
 * inside an Obsidian callout carries `> ` like any other blockquote line — the
 * callout header itself is emitted once by `htmlToMarkdown`, so the body
 * round-trips as an ordinary callout quote.
 */
export function lineMarkdown(line: HTMLElement): string {
  const tag = line.tagName.toLowerCase();
  if (tag === "li") {
    // An ordered item carries its number, not a dash, so the caret math that
    // measures this line's prefix stays right when the item is edited.
    const parent = line.parentElement;
    if (parent?.tagName.toLowerCase() === "ol") {
      const n = Array.from(parent.children).indexOf(line) + 1;
      return `${n}. ${serializeInline(line)}`;
    }
    return `- ${serializeInline(line)}`;
  }
  if (
    tag === "p" &&
    (line.parentElement?.tagName.toLowerCase() === "blockquote" || calloutOf(line))
  ) {
    return `> ${serializeInline(line)}`;
  }
  if (tag === "h1") return `# ${serializeInline(line)}`;
  if (tag === "h2") return `## ${serializeInline(line)}`;
  if (tag === "h3") return `### ${serializeInline(line)}`;
  return serializeInline(line);
}

/**
 * A line's inline content, with its block prefix stripped — the markdown a caret
 * offset within the line is measured against, and what splitting/merging a line
 * operates on. Kept in one place so the Enter/Backspace/paste paths and the live
 * re-render agree on where the content starts.
 */
export function lineContentMarkdown(line: HTMLElement): string {
  const md = lineMarkdown(line);
  const tag = line.tagName.toLowerCase();
  if (tag === "li") return md.replace(/^(\d+\.|-)\s+/, "");
  if (
    tag === "p" &&
    (line.parentElement?.tagName.toLowerCase() === "blockquote" || calloutOf(line))
  ) {
    return md.replace(/^>\s?/, "");
  }
  if (tag === "h1" || tag === "h2" || tag === "h3") {
    return md.slice(Number(tag[1]) + 1);
  }
  return md;
}

/** The `[!type] Title` header a callout element represents. */
function calloutHeader(el: HTMLElement): string {
  const type = el.getAttribute("data-callout") || "note";
  const titleEl = el.querySelector(":scope > .callout-title") as HTMLElement | null;
  const title = (titleEl?.textContent ?? "").trim();
  const bare = type.charAt(0).toUpperCase() + type.slice(1);
  return title && title !== bare ? `[!${type}] ${title}` : `[!${type}]`;
}

/**
 * Serialize the whole editor root to markdown.
 *
 * Top-level blocks are separated by a blank line. A single "\n" is not enough:
 * marked treats a bare newline as a lazy continuation, so a block that follows a
 * list or blockquote is absorbed into it (`- x` then `> q` nests the quote inside
 * the item; two adjacent paragraphs merge into one). Cards are edited and
 * re-serialised on every save, so a lossy join would silently restructure the
 * card each time it was touched. Empty blocks (a seeded `<p><br></p>`) are
 * dropped rather than emitted as blank lines.
 */
export function htmlToMarkdown(root: HTMLElement): string {
  const blocks: string[] = [];
  for (const child of Array.from(root.childNodes)) {
    const block = blockMarkdown(child);
    if (block.trim() !== "") blocks.push(block);
  }
  return blocks.join("\n\n");
}

/** The markdown of one top-level block (possibly multi-line). */
function blockMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    // Defensive: contentEditable can leave bare text under the root (e.g. if a
    // block was removed). Never drop typed content.
    return (node.textContent ?? "").trim();
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  if (tag === "ul" || tag === "ol") {
    const ordered = tag === "ol";
    let n = 1;
    return Array.from(el.children)
      .map((li) => `${ordered ? `${n++}.` : "-"} ${serializeInline(li)}`)
      .join("\n");
  }
  if (tag === "blockquote") {
    return Array.from(el.children)
      .map((p) => `> ${serializeInline(p)}`)
      .join("\n");
  }
  if (el.classList.contains("callout")) {
    // Obsidian callout: header + body, the body re-quoted. The callout element
    // has no markdown-inline form, so this is its lossless round trip.
    const body = el.querySelector(":scope > .callout-content") as HTMLElement | null;
    const out = [`> ${calloutHeader(el)}`];
    if (body) {
      for (const p of Array.from(body.children)) {
        out.push(`> ${serializeInline(p as HTMLElement)}`);
      }
    }
    return out.join("\n");
  }
  if (tag === "h1" || tag === "h2" || tag === "h3") {
    return `${"#".repeat(Number(tag[1]))} ${serializeInline(el)}`;
  }
  if (tag === "p") return serializeInline(el);
  if (tag === "hr") return "---";
  if (tag === "pre") {
    const code = el.querySelector("code");
    return "```\n" + (code?.textContent ?? "") + "\n```";
  }
  if (tag === "table") return serializeTable(el as HTMLTableElement);
  // Any other block (a loose image, a stray div): keep its text rather than
  // dropping content the way a tag-only switch would.
  return (el.textContent ?? "").trim();
}

/** Serialize a rendered GFM table back to markdown. */
function serializeTable(table: HTMLTableElement): string {
  const cell = (c: Element | undefined) =>
    (c?.textContent ?? "").trim().replace(/\|/g, "\\|");
  const row = (r: Element) =>
    "| " + Array.from(r.children).map(cell).join(" | ") + " |";
  const head = table.querySelector("thead tr");
  const bodyRows = Array.from(table.querySelectorAll("tbody tr"));
  const headCells = head?.children.length ?? bodyRows[0]?.children.length ?? 0;
  if (headCells === 0) return "";
  const out: string[] = [];
  out.push(head ? row(head) : "| " + Array(headCells).fill(" ").join(" | ") + " |");
  out.push("| " + Array(headCells).fill("---").join(" | ") + " |");
  for (const r of bodyRows) out.push(row(r));
  return out.join("\n");
}

/**
 * Normalise inline emphasis tags in an HTML fragment to their canonical form
 * (`<b>`->`<strong>`, `<i>`->`<em>`) and return the result.
 *
 * Used to compare "what the line currently renders as" against "what the line's
 * markdown says it should render as". The two differ only cosmetically when the
 * browser inserted `<b>` for Cmd+B, so comparing raw innerHTML would schedule a
 * pointless rewrite that destroys the caret and the native undo entry. Comparing
 * canonical forms recognises "already correct, just spelled differently".
 *
 * Safety: the argument is always markup this module produced via parseInline
 * (which escapes first) or tags the browser's own editing commands inserted —
 * it is parsed into a detached element and never executed.
 */
export function canonicalInlineHtml(html: string): string {
  const scratch = document.createElement("div");
  scratch.innerHTML = html;
  const aliases: Record<string, string> = {
    b: "strong",
    i: "em",
    s: "del",
    strike: "del",
  };
  for (const el of Array.from(scratch.querySelectorAll("b, i, s, strike"))) {
    const replacement = document.createElement(aliases[el.tagName.toLowerCase()]);
    while (el.firstChild) replacement.appendChild(el.firstChild);
    el.replaceWith(replacement);
  }
  // Emphasis nesting order is not significant in markdown but *is* significant
  // to a string comparison: "***x***" renders <em><strong> while typing bold
  // then italic in the browser can produce <strong><em>. Both mean exactly the
  // same thing (bold and italic), so fold the bold-inside-italic form into one
  // canonical order — otherwise bold+italic lines rewrite on every keystroke and
  // lose the caret. The content is re-wrapped, never unwrapped: dropping the
  // inner emphasis here would silently delete the bold.
  for (const em of Array.from(scratch.querySelectorAll("strong > em"))) {
    const strong = em.parentElement;
    // Only the simple case, where the emphasis is the bold run's entire
    // content. Mixed content is left alone and simply compares as different.
    if (!strong || strong.childNodes.length !== 1) continue;
    const newEm = scratch.ownerDocument.createElement("em");
    const newStrong = scratch.ownerDocument.createElement("strong");
    while (em.firstChild) newStrong.appendChild(em.firstChild);
    newEm.appendChild(newStrong);
    strong.replaceWith(newEm);
  }
  return scratch.innerHTML;
}

/** The caret's position as a markdown offset within a line. */
export function caretOffsetInLine(line: HTMLElement, sel: Selection): number {
  const range = sel.getRangeAt(0);
  if (!line.contains(range.startContainer)) {
    return lineMarkdown(line).length;
  }
  let acc = 0;
  let found = -1;

  const walk = (node: Node): void => {
    if (found >= 0) return;
    if (node.nodeType === Node.TEXT_NODE) {
      if (node === range.startContainer) {
        found = acc + range.startOffset;
      } else {
        acc += (node.textContent ?? "").length;
      }
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;

    const affixes = inlineAffixes(el);
    if (affixes) {
      const openLen = affixes.open.length;
      const closeLen = affixes.close.length;
      const inner = serializeChildren(el);
      if (el === range.startContainer) {
        // caret at a child boundary of this element
        const children = Array.from(el.childNodes);
        let childAcc = acc + openLen;
        for (let i = 0; i < children.length; i++) {
          if (i === range.startOffset) {
            found = childAcc;
            return;
          }
          childAcc += serializeInline(children[i]).length;
        }
        found = childAcc;
        return;
      }
      if (el.contains(range.startContainer)) {
        acc += openLen;
        for (const child of Array.from(el.childNodes)) walk(child);
        if (found < 0) found = acc;
        return;
      }
      acc += openLen + inner.length + closeLen;
      return;
    }

    if (el === range.startContainer) {
      const children = Array.from(el.childNodes);
      let childAcc = acc;
      for (let i = 0; i < children.length; i++) {
        if (i === range.startOffset) {
          found = childAcc;
          return;
        }
        childAcc += serializeInline(children[i]).length;
      }
      found = childAcc;
      return;
    }

    for (const child of Array.from(el.childNodes)) walk(child);
  };

  walk(line);
  return found >= 0 ? found : lineMarkdown(line).length;
}

/** Place the caret at a markdown offset within a line. */
export function setCaretAtMarkdownOffset(line: HTMLElement, offset: number): void {
  const doc = line.ownerDocument;
  const range = doc.createRange();
  const sel = doc.getSelection();
  let remaining = offset;
  let placed = false;

  const place = (node: Node, off: number) => {
    try {
      range.setStart(node, off);
      range.collapse(true);
      placed = true;
    } catch {
      placed = false;
    }
  };

  const walk = (node: Node): void => {
    if (placed) return;
    if (node.nodeType === Node.TEXT_NODE) {
      const len = (node.textContent ?? "").length;
      if (remaining <= len) {
        place(node, remaining);
        return;
      }
      remaining -= len;
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;

    const affixes = inlineAffixes(el);
    if (affixes) {
      const openLen = affixes.open.length;
      const closeLen = affixes.close.length;
      const inner = serializeChildren(el);
      if (remaining < openLen) {
        place(el, 0);
        return;
      }
      remaining -= openLen;
      if (remaining < inner.length) {
        for (const child of Array.from(el.childNodes)) walk(child);
        if (!placed) place(el, el.childNodes.length);
        return;
      }
      remaining -= inner.length;
      if (remaining < closeLen) {
        // End of content / inside the closing marker — clamp to content end.
        place(el, el.childNodes.length);
        return;
      }
      remaining -= closeLen;
      // Past the whole element — continue to the next sibling.
      return;
    }

    for (const child of Array.from(el.childNodes)) walk(child);
  };

  walk(line);
  if (!placed) {
    const last = line.lastChild ?? line;
    if (last.nodeType === Node.TEXT_NODE) {
      place(last, (last.textContent ?? "").length);
    } else {
      place(line, line.childNodes.length);
    }
  }
  if (placed) {
    sel?.removeAllRanges();
    sel?.addRange(range);
  }
}

export interface TransformResult {
  line: HTMLElement;
  caretOffset: number;
}

/**
 * Transform a paragraph into a heading / blockquote / list item when the user
 * types a block prefix ("# ", "> ", "- "). Returns null when no transform
 * applies. The caret offset is expressed in the new line's markdown.
 */
export function applyLineTransform(
  line: HTMLElement,
  md: string,
  caretInMd: number,
): TransformResult | null {
  const tag = line.tagName.toLowerCase();
  if (tag !== "p") return null;
  if (line.parentElement?.tagName.toLowerCase() === "blockquote") return null;

  const m = /^(#{1,3}|>|-|\*|\+|\d+\.)\s+(.*)$/.exec(md);
  if (!m) return null;

  const marker = m[1];
  const rest = m[2];
  const prefixLen = marker.length + 1;
  const contentCaret = Math.max(0, Math.min(rest.length, caretInMd - prefixLen));
  const doc = line.ownerDocument;
  const content = rest === "" ? "<br>" : parseInline(rest);

  if (marker === "#") {
    const h = doc.createElement("h1");
    h.innerHTML = content;
    line.replaceWith(h);
    return { line: h, caretOffset: contentCaret };
  }
  if (marker === "##") {
    const h = doc.createElement("h2");
    h.innerHTML = content;
    line.replaceWith(h);
    return { line: h, caretOffset: contentCaret };
  }
  if (marker === "###") {
    const h = doc.createElement("h3");
    h.innerHTML = content;
    line.replaceWith(h);
    return { line: h, caretOffset: contentCaret };
  }
  if (marker === ">") {
    const bq = doc.createElement("blockquote");
    const p = doc.createElement("p");
    p.innerHTML = content;
    bq.appendChild(p);
    line.replaceWith(bq);
    return { line: p, caretOffset: contentCaret };
  }
  // Ordered list ("1. "). A digit-led marker only counts if it looks like a list
  // marker (1–3 digits); a longer number ("2026.") is prose and is left alone
  // rather than silently rewritten into a list.
  if (/^\d+\.$/.test(marker)) {
    if (!/^\d{1,3}\.$/.test(marker)) return null;
    const ol = doc.createElement("ol");
    const li = doc.createElement("li");
    li.innerHTML = content;
    ol.appendChild(li);
    line.replaceWith(ol);
    return { line: li, caretOffset: contentCaret };
  }
  // list
  const ul = doc.createElement("ul");
  const li = doc.createElement("li");
  li.innerHTML = content;
  ul.appendChild(li);
  line.replaceWith(ul);
  return { line: li, caretOffset: contentCaret };
}

// ---------------------------------------------------------------------------
// Block kind — the format rail's view of "what is this line?"
// ---------------------------------------------------------------------------

export type BlockKind = "p" | "h1" | "h2" | "h3" | "quote" | "li";

/**
 * The block kind a line currently is. Quote lines are `<p>` inside a
 * `<blockquote>`, so the parent decides the kind rather than the tag alone.
 */
export function blockKindOf(line: HTMLElement): BlockKind {
  const tag = line.tagName.toLowerCase();
  if (tag === "h1" || tag === "h2" || tag === "h3") return tag;
  if (tag === "li") return "li";
  if (tag === "p" && line.parentElement?.tagName.toLowerCase() === "blockquote") {
    return "quote";
  }
  return "p";
}

/** Characters of block prefix a kind contributes to a line's markdown. */
export function blockPrefixLength(kind: BlockKind): number {
  switch (kind) {
    case "h1":
      return 2; // "# "
    case "h2":
      return 3; // "## "
    case "h3":
      return 4; // "### "
    case "quote":
      return 2; // "> "
    case "li":
      return 2; // "- "
    default:
      return 0;
  }
}

/**
 * Convert a block to another kind, keeping its inline content and placing the
 * caret at the same position *within the text* — not the same markdown offset,
 * because every kind carries a different prefix length. Without that
 * correction the caret slides by the prefix-length difference each time the
 * user switches kind.
 *
 * Converting to `p` from a list/quote also lifts the line out of its wrapper
 * (via exitList/exitQuote) so the user is never stranded in an empty <ul>.
 */
export function changeBlockKind(
  line: HTMLElement,
  kind: BlockKind,
  caretInLine: number,
): TransformResult {
  const from = blockKindOf(line);
  const content = line.innerHTML;
  const textOffset = Math.max(0, caretInLine - blockPrefixLength(from));
  const caretOffset = textOffset + blockPrefixLength(kind);
  const doc = line.ownerDocument;

  if (from === kind) return { line, caretOffset: caretInLine };

  if (kind === "p") {
    // Leaving a list/quote is a structural move; exitList/exitQuote already
    // produce a paragraph carrying this line's inline content.
    const p =
      from === "li"
        ? exitList(line as HTMLLIElement)
        : from === "quote"
          ? exitQuote(line as HTMLParagraphElement)
          : null;
    if (p) return { line: p, caretOffset: textOffset };
    const newP = doc.createElement("p");
    newP.innerHTML = content || "<br>";
    line.replaceWith(newP);
    return { line: newP, caretOffset: textOffset };
  }

  if (kind === "li") {
    const li = doc.createElement("li");
    li.innerHTML = content || "<br>";
    if (from === "li") return { line, caretOffset: caretInLine };
    // Reuse the preceding list when there is one, so converting consecutive
    // lines builds a single list rather than alternating ul/p. The original
    // block is then removed outright: its content has moved into the new item,
    // and re-inserting the <li> at its old position would strand the item
    // outside its <ul>.
    const prev = line.previousElementSibling;
    if (prev?.tagName.toLowerCase() === "ul") {
      prev.appendChild(li);
      line.remove();
      return { line: li, caretOffset };
    }
    const ul = doc.createElement("ul");
    ul.appendChild(li);
    line.replaceWith(ul);
    return { line: li, caretOffset };
  }

  if (kind === "quote") {
    const p = doc.createElement("p");
    p.innerHTML = content || "<br>";
    if (from === "quote") return { line, caretOffset: caretInLine };
    // Same rationale as the list branch above: join the neighbouring quote and
    // drop the original block.
    const prev = line.previousElementSibling;
    if (prev?.tagName.toLowerCase() === "blockquote") {
      prev.appendChild(p);
      line.remove();
      return { line: p, caretOffset };
    }
    const bq = doc.createElement("blockquote");
    bq.appendChild(p);
    line.replaceWith(bq);
    return { line: p, caretOffset };
  }

  // Headings
  const h = doc.createElement(kind);
  h.innerHTML = content || "<br>";
  line.replaceWith(h);
  return { line: h, caretOffset };
}

/** Exit a list item into a paragraph (Enter/Backspace on an empty item). */
export function exitList(li: HTMLLIElement): HTMLElement {
  const ul = li.parentElement as HTMLUListElement;
  const doc = li.ownerDocument;
  const p = doc.createElement("p");
  p.innerHTML = li.innerHTML;
  const siblings = Array.from(ul.children);
  const idx = siblings.indexOf(li);
  const beforeLis = siblings.slice(0, idx);
  const afterLis = siblings.slice(idx + 1);
  li.remove(); // detach the exiting item; the <ul> keeps the before items
  if (beforeLis.length > 0) {
    if (afterLis.length > 0) {
      const newUl = doc.createElement("ul");
      for (const l of afterLis) newUl.appendChild(l);
      ul.after(p, newUl);
    } else {
      ul.after(p);
    }
  } else if (afterLis.length > 0) {
    const newUl = doc.createElement("ul");
    for (const l of afterLis) newUl.appendChild(l);
    ul.replaceWith(p, newUl);
  } else {
    ul.replaceWith(p);
  }
  return p;
}

/** Exit a blockquote line into a paragraph (Enter/Backspace on an empty line). */
export function exitQuote(p: HTMLParagraphElement): HTMLElement {
  const bq = p.parentElement as HTMLElement;
  const doc = p.ownerDocument;
  const newP = doc.createElement("p");
  newP.innerHTML = p.innerHTML;
  const siblings = Array.from(bq.children);
  const idx = siblings.indexOf(p);
  const beforePs = siblings.slice(0, idx);
  const afterPs = siblings.slice(idx + 1);
  p.remove(); // detach the exiting line; the <blockquote> keeps the before lines
  if (beforePs.length > 0) {
    if (afterPs.length > 0) {
      const newBq = doc.createElement("blockquote");
      for (const q of afterPs) newBq.appendChild(q);
      bq.after(newP, newBq);
    } else {
      bq.after(newP);
    }
  } else if (afterPs.length > 0) {
    const newBq = doc.createElement("blockquote");
    for (const q of afterPs) newBq.appendChild(q);
    bq.replaceWith(newP, newBq);
  } else {
    bq.replaceWith(newP);
  }
  return newP;
}
