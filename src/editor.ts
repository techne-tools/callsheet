// editor.ts
// DOM ↔ markdown bridge for the inline (contentEditable) card editor.
//
// The editor's DOM is the rendered markdown: block elements (h1–h3, p, ul>li,
// blockquote>p) whose innerHTML is the inline-rendered content (strong/em).
// These helpers serialize that DOM back to markdown, transform blocks as the
// user types (e.g. "# " → h1), and move the caret by markdown offset.

import { parseInline } from "./markdown";

/** Serialize a node's inline content back to markdown (strong/em markers). */
export function serializeInline(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  const marker = inlineMarker(tag);
  if (marker) return `${marker}${serializeChildren(el)}${marker}`;
  if (tag === "br") return "\n";
  return serializeChildren(el);
}

function serializeChildren(el: HTMLElement): string {
  let out = "";
  for (const child of Array.from(el.childNodes)) out += serializeInline(child);
  return out;
}

/**
 * The markdown marker an inline emphasis element contributes, or null when the
 * element carries no markdown meaning. `<b>`/`<i>` are included because that is
 * what the browser's own bold/italic commands produce in a contentEditable —
 * without them, Cmd+B round-trips through the serializer as plain text and the
 * formatting is silently dropped.
 */
function inlineMarker(tag: string): string | null {
  if (tag === "strong" || tag === "b") return "**";
  if (tag === "em" || tag === "i") return "*";
  return null;
}

/** The markdown line a block element represents (prefix + inline content). */
export function lineMarkdown(line: HTMLElement): string {
  const tag = line.tagName.toLowerCase();
  const parent = line.parentElement;
  if (tag === "li") return `- ${serializeInline(line)}`;
  if (tag === "p" && parent?.tagName.toLowerCase() === "blockquote") {
    return `> ${serializeInline(line)}`;
  }
  if (tag === "h1") return `# ${serializeInline(line)}`;
  if (tag === "h2") return `## ${serializeInline(line)}`;
  if (tag === "h3") return `### ${serializeInline(line)}`;
  return serializeInline(line);
}

/** Serialize the whole editor root to markdown. */
export function htmlToMarkdown(root: HTMLElement): string {
  const lines: string[] = [];
  for (const child of Array.from(root.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      // Defensive: contentEditable can leave bare text under the root
      // (e.g. if a block was removed). Never drop typed content.
      const text = (child.textContent ?? "").trim();
      if (text !== "") lines.push(text);
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    const el = child as HTMLElement;
    const tag = el.tagName.toLowerCase();
    if (tag === "ul") {
      for (const li of Array.from(el.children)) {
        lines.push(`- ${serializeInline(li)}`);
      }
    } else if (tag === "blockquote") {
      for (const p of Array.from(el.children)) {
        lines.push(`> ${serializeInline(p)}`);
      }
    } else if (tag === "h1" || tag === "h2" || tag === "h3") {
      lines.push(`${"#".repeat(Number(tag[1]))} ${serializeInline(el)}`);
    } else if (tag === "p") {
      lines.push(serializeInline(el));
    }
  }
  return lines.join("\n").replace(/\n+$/, "");
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
  for (const el of Array.from(scratch.querySelectorAll("b, i"))) {
    const replacement = document.createElement(
      el.tagName.toLowerCase() === "b" ? "strong" : "em",
    );
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
    const tag = el.tagName.toLowerCase();

    const marker = inlineMarker(tag);
    if (marker) {
      const inner = serializeChildren(el);
      if (el === range.startContainer) {
        // caret at a child boundary of this element
        const children = Array.from(el.childNodes);
        let childAcc = acc + marker.length;
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
        acc += marker.length;
        for (const child of Array.from(el.childNodes)) walk(child);
        if (found < 0) found = acc;
        return;
      }
      acc += marker.length + inner.length + marker.length;
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
    const tag = el.tagName.toLowerCase();

    const marker = inlineMarker(tag);
    if (marker) {
      const inner = serializeChildren(el);
      if (remaining < marker.length) {
        place(el, 0);
        return;
      }
      remaining -= marker.length;
      if (remaining < inner.length) {
        for (const child of Array.from(el.childNodes)) walk(child);
        if (!placed) place(el, el.childNodes.length);
        return;
      }
      remaining -= inner.length;
      if (remaining < marker.length) {
        // End of content / inside the closing marker — clamp to content end.
        place(el, el.childNodes.length);
        return;
      }
      remaining -= marker.length;
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

  const m = /^(#{1,3}|>|-|\*|\+)\s+(.*)$/.exec(md);
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
