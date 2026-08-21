import { useEffect, useRef, useState } from "react";
import type { ActivityType, Card as CardType } from "../tauri";
import { deriveDarkFill } from "../tauri";
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
  activityTypes: ActivityType[];
  selected: boolean;
  editing: boolean;
  theme: "system" | "light" | "dark";
  onSelect: () => void;
  onEdit: () => void;
  onSave: (markdown: string) => void;
  onDelete: () => void;
  onGrabStart: (e: React.MouseEvent) => void;
  onTypeChange: (typeId: number) => void;
}

export default function Card({
  card,
  fill,
  border,
  activityTypes,
  selected,
  editing,
  theme,
  onSelect,
  onEdit,
  onSave,
  onDelete,
  onGrabStart,
  onTypeChange,
}: CardProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const committedRef = useRef(false);
  const [typeOpen, setTypeOpen] = useState(false);

  // Entering edit mode: render the markdown into the contentEditable and
  // place the caret at the end.
  useEffect(() => {
    if (editing) {
      committedRef.current = false;
      const el = editorRef.current;
      if (el) {
        // Empty markdown renders to no blocks; seed a single empty paragraph
        // so the caret has a block to live in and typed text lands inside a
        // <p> (htmlToMarkdown only serializes element children).
        el.innerHTML =
          card.markdown === "" ? "<p><br></p>" : renderMarkdown(card.markdown);
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

      // Splitting inside a list item keeps the list: new <li> in the same <ul>.
      if (tag === "li") {
        const newLineLi = doc.createElement("li");
        newLineLi.innerHTML = parseInlineSafe(before);
        const newLi = doc.createElement("li");
        newLi.innerHTML = parseInlineSafe(after);
        line.replaceWith(newLineLi, newLi);
        setCaretAtMarkdownOffset(newLi, 0);
        return;
      }
      // Splitting inside a blockquote keeps the quote: new <p> in the same <blockquote>.
      if (tag === "p" && line.parentElement?.tagName.toLowerCase() === "blockquote") {
        const newLineP = doc.createElement("p");
        newLineP.innerHTML = parseInlineSafe(before);
        const newP = doc.createElement("p");
        newP.innerHTML = parseInlineSafe(after);
        line.replaceWith(newLineP, newP);
        setCaretAtMarkdownOffset(newP, 0);
        return;
      }

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
          // Merging two list items keeps the list: single <li> in the same <ul>.
          const merged = el.ownerDocument.createElement(
            tag === "li" && prev.tagName.toLowerCase() === "li" ? "li" : "p",
          );
          // Strip the predecessor's block prefix so it isn't concatenated
          // literally into the merged content.
          const prevTag = prev.tagName.toLowerCase();
          let prevContent = prevMd;
          if (prevTag === "li") prevContent = prevMd.replace(/^-\s+/, "");
          else if (prevTag === "h1" || prevTag === "h2" || prevTag === "h3") prevContent = prevMd.slice(Number(prevTag[1]) + 1);
          else if (prevTag === "p" && prev.parentElement?.tagName.toLowerCase() === "blockquote") prevContent = prevMd.replace(/^>\s?/, "");
          merged.innerHTML = parseInlineSafe(prevContent + content);
          line.replaceWith(merged);
          setCaretAtMarkdownOffset(merged, prevContent.length);
        }
        return;
      }
      return;
    }
  };

  /** Insert plain text at the caret through the safe markdown path. */
  const insertPlainText = (text: string) => {
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
    // Pasting inside a list keeps the list: new <li>s in the same <ul>.
    // (Quote lines stay inside their <blockquote> automatically — the new
    // <p>s are inserted relative to the replaced line, which is inside it.)
    const inList = tag === "li";
    const first = doc.createElement(inList ? "li" : "p");
    first.innerHTML = parseInlineSafe(before + lines[0]);
    line.replaceWith(first);
    let prev = first;
    for (let i = 1; i < lines.length; i++) {
      const p = doc.createElement(inList ? "li" : "p");
      p.innerHTML = parseInlineSafe(lines[i]);
      prev.after(p);
      prev = p;
    }
    // Re-append the remainder of the original line after the pasted block.
    if (after !== "") {
      const tail = doc.createElement(inList ? "li" : "p");
      tail.innerHTML = parseInlineSafe(after);
      prev.after(tail);
      prev = tail;
    }
    const finalOffset = after !== "" ? after.length : lines[lines.length - 1].length;
    setCaretAtMarkdownOffset(prev, finalOffset);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    insertPlainText(e.clipboardData.getData("text/plain"));
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    insertPlainText(e.dataTransfer.getData("text/plain"));
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
        <div className="card__type-label">
          {activityTypes.find((t) => t.id === card.activityTypeId)?.name ?? ""}
        </div>
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
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
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
        <div className="card__type">
          <button
            type="button"
            className="card__action card__action--type"
            onClick={(e) => {
              e.stopPropagation();
              setTypeOpen((v) => !v);
            }}
            title="Change activity type"
            aria-label="Change activity type"
            aria-expanded={typeOpen}
          >
            <span
              className="card__type-dot"
              style={{ background: fill }}
              aria-hidden="true"
            />
          </button>
          {typeOpen && (
            <div className="card__type-menu" role="menu">
              {activityTypes.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="menuitem"
                  className={
                    t.id === card.activityTypeId
                      ? "card__type-option card__type-option--active"
                      : "card__type-option"
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    onTypeChange(t.id);
                    setTypeOpen(false);
                  }}
                >
                  <span
                    className="card__type-dot"
                    style={{ background: theme === "dark" ? deriveDarkFill(t.colour) : t.colour }}
                    aria-hidden="true"
                  />
                  {t.name}
                </button>
              ))}
            </div>
          )}
        </div>
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
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" />
          </svg>
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
