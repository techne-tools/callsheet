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
  if (tag === "strong") return `**${serializeChildren(el)}**`;
  if (tag === "em") return `*${serializeChildren(el)}*`;
  if (tag === "br") return "\n";
  return serializeChildren(el);
}

function serializeChildren(el: HTMLElement): string {
  let out = "";
  for (const child of Array.from(el.childNodes)) out += serializeInline(child);
  return out;
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

    if (tag === "strong" || tag === "em") {
      const marker = tag === "strong" ? "**" : "*";
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

    if (tag === "strong" || tag === "em") {
      const marker = tag === "strong" ? "**" : "*";
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
