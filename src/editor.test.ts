// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import {
  applyLineTransform,
  caretOffsetInLine,
  exitList,
  exitQuote,
  htmlToMarkdown,
  lineMarkdown,
  serializeInline,
  setCaretAtMarkdownOffset,
} from "./editor";

function root(html: string): HTMLElement {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div;
}

describe("serializeInline", () => {
  it("serializes plain text", () => {
    expect(serializeInline(document.createTextNode("hello"))).toBe("hello");
  });

  it("serializes strong and em back to markdown markers", () => {
    const el = root("<p>a <strong>b</strong> c <em>d</em></p>");
    expect(serializeInline(el)).toBe("a **b** c *d*");
  });

  it("preserves br elements as line breaks", () => {
    const el = root("<p>a<br>b</p>");
    expect(serializeInline(el)).toBe("a\nb");
  });
});

describe("lineMarkdown", () => {
  it("renders a paragraph", () => {
    expect(lineMarkdown(root("<p>hello</p>").firstElementChild as HTMLElement)).toBe("hello");
  });

  it("renders headings with their prefix", () => {
    expect(lineMarkdown(root("<h1>Title</h1>").firstElementChild as HTMLElement)).toBe("# Title");
    expect(lineMarkdown(root("<h2>Sub</h2>").firstElementChild as HTMLElement)).toBe("## Sub");
    expect(lineMarkdown(root("<h3>Sub</h3>").firstElementChild as HTMLElement)).toBe("### Sub");
  });

  it("renders list items with a dash prefix", () => {
    expect(lineMarkdown(root("<ul><li>item</li></ul>").querySelector("li") as HTMLElement)).toBe("- item");
  });

  it("renders blockquote lines with a quote prefix", () => {
    const bq = root("<blockquote><p>quote</p></blockquote>");
    expect(lineMarkdown(bq.querySelector("p") as HTMLElement)).toBe("> quote");
  });
});

describe("htmlToMarkdown", () => {
  it("serializes a mixed document", () => {
    const el = root(
      "<h1>Title</h1><p>Some <strong>bold</strong> text</p><ul><li>one</li><li>two</li></ul><blockquote><p>quoted</p></blockquote>",
    );
    expect(htmlToMarkdown(el)).toBe(
      "# Title\nSome **bold** text\n- one\n- two\n> quoted",
    );
  });

  it("trims trailing newlines", () => {
    const el = root("<p>a</p><p>b</p>");
    expect(htmlToMarkdown(el)).toBe("a\nb");
  });

  it("serializes bare text nodes under the root (empty-card typing)", () => {
    // Regression: an empty card seeded with "" leaves typed text as a bare
    // text node under the contentEditable root; it must not be dropped.
    const el = root("typed text");
    expect(htmlToMarkdown(el)).toBe("typed text");
  });

  it("serializes an empty seeded paragraph as empty markdown", () => {
    const el = root("<p><br></p>");
    expect(htmlToMarkdown(el)).toBe("");
  });
});

describe("applyLineTransform", () => {
  it("turns '# ' into an h1", () => {
    const el = root("<p># Title</p>");
    const p = el.firstElementChild as HTMLElement;
    const res = applyLineTransform(p, "# Title", 7);
    expect(res).not.toBeNull();
    expect(res!.line.tagName).toBe("H1");
    expect(res!.line.textContent).toBe("Title");
    expect(res!.caretOffset).toBe(5);
  });

  it("turns '## ' into an h2", () => {
    const el = root("<p>## Sub</p>");
    const p = el.firstElementChild as HTMLElement;
    const res = applyLineTransform(p, "## Sub", 6);
    expect(res!.line.tagName).toBe("H2");
  });

  it("turns '> ' into a blockquote", () => {
    const el = root("<p>> quote</p>");
    const p = el.firstElementChild as HTMLElement;
    const res = applyLineTransform(p, "> quote", 7);
    expect(res!.line.tagName).toBe("P");
    expect(res!.line.parentElement!.tagName).toBe("BLOCKQUOTE");
  });

  it("turns '- ' into a list item", () => {
    const el = root("<p>- item</p>");
    const p = el.firstElementChild as HTMLElement;
    const res = applyLineTransform(p, "- item", 6);
    expect(res!.line.tagName).toBe("LI");
    expect(res!.line.parentElement!.tagName).toBe("UL");
  });

  it("returns null for plain paragraphs", () => {
    const el = root("<p>hello</p>");
    expect(applyLineTransform(el.firstElementChild as HTMLElement, "hello", 5)).toBeNull();
  });

  it("returns null for non-paragraph blocks", () => {
    const el = root("<h1># Title</h1>");
    expect(applyLineTransform(el.firstElementChild as HTMLElement, "# Title", 7)).toBeNull();
  });
});

describe("exitList / exitQuote", () => {
  it("replaces a single-item list with a paragraph", () => {
    const el = root("<ul><li>item</li></ul>");
    const li = el.querySelector("li") as HTMLLIElement;
    const p = exitList(li);
    expect(p.tagName).toBe("P");
    expect(el.querySelector("ul")).toBeNull();
  });

  it("splits a multi-item list, keeping the remainder", () => {
    const el = root("<ul><li>one</li><li>two</li><li>three</li></ul>");
    const li = el.querySelector("li") as HTMLLIElement;
    const p = exitList(li);
    expect(p.textContent).toBe("one");
    const uls = el.querySelectorAll("ul");
    expect(uls.length).toBe(1);
    expect(uls[0].children.length).toBe(2);
  });

  it("exiting a middle item keeps the items before it", () => {
    // Regression: exitList used to drop every item before the exiting one.
    const el = root("<ul><li>one</li><li>two</li><li>three</li></ul>");
    const lis = el.querySelectorAll("li");
    const p = exitList(lis[1] as HTMLLIElement);
    expect(p.textContent).toBe("two");
    const uls = el.querySelectorAll("ul");
    expect(uls.length).toBe(2);
    expect(uls[0].children.length).toBe(1);
    expect(uls[0].textContent).toBe("one");
    expect(uls[1].children.length).toBe(1);
    expect(uls[1].textContent).toBe("three");
  });

  it("exiting the last item keeps the items before it", () => {
    const el = root("<ul><li>one</li><li>two</li></ul>");
    const lis = el.querySelectorAll("li");
    const p = exitList(lis[1] as HTMLLIElement);
    expect(p.textContent).toBe("two");
    const uls = el.querySelectorAll("ul");
    expect(uls.length).toBe(1);
    expect(uls[0].children.length).toBe(1);
    expect(uls[0].textContent).toBe("one");
  });

  it("replaces a single-line blockquote with a paragraph", () => {
    const el = root("<blockquote><p>quote</p></blockquote>");
    const p = el.querySelector("p") as HTMLParagraphElement;
    const newP = exitQuote(p);
    expect(newP.tagName).toBe("P");
    expect(el.querySelector("blockquote")).toBeNull();
  });

  it("exiting a middle quote line keeps the lines before it", () => {
    const el = root("<blockquote><p>one</p><p>two</p><p>three</p></blockquote>");
    const ps = el.querySelectorAll("p");
    const newP = exitQuote(ps[1] as HTMLParagraphElement);
    expect(newP.textContent).toBe("two");
    const bqs = el.querySelectorAll("blockquote");
    expect(bqs.length).toBe(2);
    expect(bqs[0].children.length).toBe(1);
    expect(bqs[0].textContent).toBe("one");
    expect(bqs[1].children.length).toBe(1);
    expect(bqs[1].textContent).toBe("three");
  });
});

describe("caret round-trip", () => {
  // jsdom's Selection only accepts ranges inside the document, so the test
  // elements must be attached (mirrors the real editor, which is in the DOM).
  function attached(html: string): HTMLElement {
    const host = document.createElement("div");
    host.innerHTML = html;
    document.body.appendChild(host);
    return host;
  }

  it("places the caret at a markdown offset and reads it back", () => {
    const host = attached("<p>a <strong>b</strong> c</p>");
    const p = host.firstElementChild as HTMLElement;
    setCaretAtMarkdownOffset(p, 4); // after "a **b**" → inside strong, after b
    const sel = document.getSelection()!;
    expect(caretOffsetInLine(p, sel)).toBe(4);
  });

  it("clamps offsets past the end", () => {
    const host = attached("<p>hi</p>");
    const p = host.firstElementChild as HTMLElement;
    setCaretAtMarkdownOffset(p, 99);
    const sel = document.getSelection()!;
    expect(caretOffsetInLine(p, sel)).toBe(2);
  });

  it("places the caret after a strong element (bold closing marker)", () => {
    // markdown "a **b** c": offset 7 is right after the closing **
    const host = attached("<p>a <strong>b</strong> c</p>");
    const p = host.firstElementChild as HTMLElement;
    setCaretAtMarkdownOffset(p, 7);
    const sel = document.getSelection()!;
    expect(caretOffsetInLine(p, sel)).toBe(7);
  });

  it("places the caret after an em element (italic closing marker)", () => {
    // markdown "a *b* c": offset 5 is right after the closing *
    const host = attached("<p>a <em>b</em> c</p>");
    const p = host.firstElementChild as HTMLElement;
    setCaretAtMarkdownOffset(p, 5);
    const sel = document.getSelection()!;
    expect(caretOffsetInLine(p, sel)).toBe(5);
  });

  it("places the caret at the end of strong content (inside closing marker)", () => {
    // markdown "a **b** c": offset 5 is after "b", before the closing **
    const host = attached("<p>a <strong>b</strong> c</p>");
    const p = host.firstElementChild as HTMLElement;
    setCaretAtMarkdownOffset(p, 5);
    const sel = document.getSelection()!;
    expect(caretOffsetInLine(p, sel)).toBe(5);
  });
});
