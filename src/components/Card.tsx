import { useEffect, useRef } from "react";
import type { Card as CardType } from "../tauri";
import { parseInline, renderMarkdown } from "../markdown";
import {
  applyLineTransform,
  caretOffsetInLine,
  exitList,
  exitQuote,
  htmlToMarkdown,
  lineMarkdown,
  setCaretAtMarkdownOffset,
} from "../editor";

interface CardProps {
  card: CardType;
  fill: string;
  border: string;
  selected: boolean;
  editing: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onSave: (markdown: string) => void;
  onDelete: () => void;
  onGrabStart: (e: React.MouseEvent) => void;
}

export default function Card({
  card,
  fill,
  border,
  selected,
  editing,
  onSelect,
  onEdit,
  onSave,
  onDelete,
  onGrabStart,
}: CardProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const committedRef = useRef(false);

  // Entering edit mode: render the markdown into the contentEditable and
  // place the caret at the end.
  useEffect(() => {
    if (editing) {
      committedRef.current = false;
      const el = editorRef.current;
      if (el) {
        el.innerHTML = renderMarkdown(card.markdown);
        const last = el.lastElementChild as HTMLElement | null;
        if (last) {
          const range = document.createRange();
          range.selectNodeContents(last);
          range.collapse(false);
          const sel = document.getSelection();
          sel?.removeAllRanges();
          sel?.addRange(range);
        }
        el.focus();
      }
    }
  }, [editing, card.markdown]);

  const commit = () => {
    if (committedRef.current) return;
    committedRef.current = true;
    const el = editorRef.current;
    if (el) {
      const md = htmlToMarkdown(el);
      if (md !== card.markdown) onSave(md);
    }
    onEdit(); // blur exits edit mode
  };

  /** The block element the caret is currently inside. */
  const currentLine = (): HTMLElement | null => {
    const el = editorRef.current;
    if (!el) return null;
    const sel = document.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    let node: Node | null = sel.getRangeAt(0).startContainer;
    while (node && node !== el) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const tag = (node as HTMLElement).tagName.toLowerCase();
        if (["p", "h1", "h2", "h3", "li"].includes(tag)) return node as HTMLElement;
      }
      node = node.parentNode;
    }
    return null;
  };

  /** Re-render a line's inline content from its markdown, preserving caret. */
  const refreshLine = (line: HTMLElement) => {
    const sel = document.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const offset = caretOffsetInLine(line, sel);
    const md = lineMarkdown(line);
    const tag = line.tagName.toLowerCase();
    if (tag === "li") {
      line.innerHTML = md.startsWith("- ") ? parseInlineSafe(md.slice(2)) : "<br>";
    } else if (tag === "h1" || tag === "h2" || tag === "h3") {
      const n = Number(tag[1]);
      line.innerHTML = parseInlineSafe(md.slice(n + 1));
    } else if (tag === "p" && line.parentElement?.tagName.toLowerCase() === "blockquote") {
      line.innerHTML = parseInlineSafe(md.startsWith("> ") ? md.slice(2) : md);
    } else {
      line.innerHTML = parseInlineSafe(md);
    }
    setCaretAtMarkdownOffset(line, offset);
  };

  const handleInput = () => {
    const line = currentLine();
    if (!line) return;
    const sel = document.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const md = lineMarkdown(line);
    const caret = caretOffsetInLine(line, sel);
    const transformed = applyLineTransform(line, md, caret);
    if (transformed) {
      setCaretAtMarkdownOffset(transformed.line, transformed.caretOffset);
      return;
    }
    refreshLine(line);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const el = editorRef.current;
    if (!el) return;
    const sel = document.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    if (e.key === "Escape") {
      e.preventDefault();
      el.blur();
      return;
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const line = currentLine();
      if (!line) return;
      const tag = line.tagName.toLowerCase();
      const md = lineMarkdown(line);
      const caret = caretOffsetInLine(line, sel);
      const content = tag === "li" ? md.slice(2) : tag === "p" && line.parentElement?.tagName.toLowerCase() === "blockquote" ? md.slice(2) : tag === "h1" || tag === "h2" || tag === "h3" ? md.slice(Number(tag[1]) + 1) : md;

      // Empty line inside a list/quote exits the block.
      if (content.trim() === "") {
        if (tag === "li") {
          const p = exitList(line as HTMLLIElement);
          setCaretAtMarkdownOffset(p, 0);
          return;
        }
        if (tag === "p" && line.parentElement?.tagName.toLowerCase() === "blockquote") {
          const p = exitQuote(line as HTMLParagraphElement);
          setCaretAtMarkdownOffset(p, 0);
          return;
        }
      }

      const before = content.slice(0, caret);
      const after = content.slice(caret);
      const doc = el.ownerDocument;
      const newP = doc.createElement("p");
      newP.innerHTML = parseInlineSafe(after);
      const newLine = doc.createElement("p");
      newLine.innerHTML = parseInlineSafe(before);
      line.replaceWith(newLine, newP);
      setCaretAtMarkdownOffset(newP, 0);
      return;
    }

    if (e.key === "Backspace") {
      const line = currentLine();
      if (!line) return;
      const caret = caretOffsetInLine(line, sel);
      const md = lineMarkdown(line);
      const tag = line.tagName.toLowerCase();
      const content = tag === "li" ? md.slice(2) : tag === "p" && line.parentElement?.tagName.toLowerCase() === "blockquote" ? md.slice(2) : tag === "h1" || tag === "h2" || tag === "h3" ? md.slice(Number(tag[1]) + 1) : md;

      // Backspace at the very start of a block: demote it to a paragraph.
      if (caret === 0 && content.trim() === "") {
        e.preventDefault();
        if (tag === "li") {
          const p = exitList(line as HTMLLIElement);
          setCaretAtMarkdownOffset(p, 0);
          return;
        }
        if (tag === "p" && line.parentElement?.tagName.toLowerCase() === "blockquote") {
          const p = exitQuote(line as HTMLParagraphElement);
          setCaretAtMarkdownOffset(p, 0);
          return;
        }
        if (tag === "h1" || tag === "h2" || tag === "h3") {
          const p = el.ownerDocument.createElement("p");
          p.innerHTML = "<br>";
          line.replaceWith(p);
          setCaretAtMarkdownOffset(p, 0);
          return;
        }
      }
      // Backspace at the start of a non-empty line: merge with the previous line.
      if (caret === 0 && content.trim() !== "") {
        e.preventDefault();
        const prev = line.previousElementSibling as HTMLElement | null;
        if (prev) {
          const prevMd = lineMarkdown(prev);
          const merged = el.ownerDocument.createElement("p");
          merged.innerHTML = parseInlineSafe(prevMd + content);
          line.replaceWith(merged);
          setCaretAtMarkdownOffset(merged, prevMd.length);
        }
        return;
      }
      return;
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    const sel = document.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const line = currentLine();
    if (!line) return;
    const caret = caretOffsetInLine(line, sel);
    const md = lineMarkdown(line);
    const tag = line.tagName.toLowerCase();
    const content = tag === "li" ? md.slice(2) : tag === "p" && line.parentElement?.tagName.toLowerCase() === "blockquote" ? md.slice(2) : tag === "h1" || tag === "h2" || tag === "h3" ? md.slice(Number(tag[1]) + 1) : md;
    const before = content.slice(0, caret);
    const after = content.slice(caret);
    const lines = text.split(/\r?\n/);
    const doc = line.ownerDocument;
    const first = doc.createElement("p");
    first.innerHTML = parseInlineSafe(before + lines[0]);
    line.replaceWith(first);
    let prev = first;
    for (let i = 1; i < lines.length; i++) {
      const p = doc.createElement("p");
      p.innerHTML = parseInlineSafe(lines[i]);
      prev.after(p);
      prev = p;
    }
    // Re-append the remainder of the original line after the pasted block.
    if (after !== "") {
      const tail = doc.createElement("p");
      tail.innerHTML = parseInlineSafe(after);
      prev.after(tail);
      prev = tail;
    }
    setCaretAtMarkdownOffset(prev, lines[lines.length - 1].length);
  };

  return (
    <div
      className={`card${selected ? " card--selected" : ""}`}
      style={{ background: fill, borderColor: selected ? undefined : border }}
      onClick={onSelect}
      onDoubleClick={onEdit}
      role="listitem"
      tabIndex={0}
      data-card-id={card.id}
    >
      <div
        className="card__grab"
        onMouseDown={onGrabStart}
        title="Drag to reorder"
        aria-label="Drag to reorder"
      >
        <svg width="8" height="14" viewBox="0 0 8 14" fill="currentColor" aria-hidden="true">
          <circle cx="2" cy="2" r="1.3" />
          <circle cx="6" cy="2" r="1.3" />
          <circle cx="2" cy="7" r="1.3" />
          <circle cx="6" cy="7" r="1.3" />
          <circle cx="2" cy="12" r="1.3" />
          <circle cx="6" cy="12" r="1.3" />
        </svg>
      </div>

      <div className="card__body">
        {editing ? (
          <div
            ref={editorRef}
            className="card__editor"
            contentEditable
            suppressContentEditableWarning
            spellCheck={false}
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onBlur={commit}
            role="textbox"
            aria-multiline="true"
            aria-label="Card content (markdown)"
          />
        ) : (
          // Safe: renderMarkdown escapes HTML first (see src/markdown.ts; test-proven).
          <div
            dangerouslySetInnerHTML={{ __html: renderMarkdown(card.markdown) }}
          />
        )}
      </div>

      <div className="card__actions">
        <button
          type="button"
          className="card__action card__action--delete"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          title="Delete card (Backspace / Delete)"
          aria-label="Delete card"
        >
          ×
        </button>
      </div>
    </div>
  );
}

/** Inline-render a markdown fragment for the editor DOM (escaped first). */
function parseInlineSafe(md: string): string {
  // Reuse the same escaping + inline transform as the display renderer.
  // The editor only ever sets innerHTML from this function, which escapes
  // HTML before applying the markdown transforms (see src/markdown.ts).
  return md === "" ? "<br>" : parseInline(md);
}
