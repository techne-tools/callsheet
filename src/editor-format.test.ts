// @vitest-environment jsdom
// Regression tests for the card editor defects reported in use:
//   - "styles don't stick"  -> the serializer dropped the tags Cmd+B/Cmd+I produce
//   - "generally awkward"   -> the line was rebuilt from markdown on every keystroke
// Plus the rail's block conversion, which is caret-sensitive.
import { describe, it, expect } from "vitest";
import {
  blockKindOf,
  blockPrefixLength,
  canonicalInlineHtml,
  changeBlockKind,
  htmlToMarkdown,
  serializeInline,
} from "./editor";
import { renderMarkdown } from "./markdown";

function root(html: string): HTMLElement {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div;
}

function line(html: string): HTMLElement {
  return root(html).firstElementChild as HTMLElement;
}

describe("inline formatting survives the round trip", () => {
  // The browser's own bold/italic commands produce <b>/<i> in a contentEditable,
  // not <strong>/<em>. Serializing only the latter wrote the formatting back as
  // plain text on the next keystroke, so Cmd+B looked like it did nothing.
  it("serializes <b> as bold markdown (execCommand output)", () => {
    expect(serializeInline(line("<p>a <b>bold</b> c</p>"))).toBe("a **bold** c");
  });

  it("serializes <i> as italic markdown (execCommand output)", () => {
    expect(serializeInline(line("<p>a <i>it</i> c</p>"))).toBe("a *it* c");
  });

  it("serializes <strong>/<em> as before", () => {
    expect(serializeInline(line("<p>a <strong>b</strong> c <em>d</em></p>"))).toBe(
      "a **b** c *d*",
    );
  });

  it("round-trips bold and italic through markdown", () => {
    expect(renderMarkdown(htmlToMarkdown(root("<p><b>x</b> <i>y</i></p>")))).toBe(
      "<p><strong>x</strong> <em>y</em></p>",
    );
  });

  it("round-trips bold+italic (either nesting order) to bold+italic", () => {
    // Nesting order is not significant in markdown; both must survive as
    // emphasised-and-bold rather than collapsing to one of the two.
    const md = htmlToMarkdown(root("<p><strong><em>x</em></strong></p>"));
    expect(md).toBe("***x***");
    const out = renderMarkdown(md);
    expect(out).toContain("<strong>");
    expect(out).toContain("<em>");
    expect(out).toContain("x");
  });
});

describe("canonicalInlineHtml", () => {
  // Drives the "rewrite only when rendering actually changed" guard.
  it("treats <b> and <strong> as equivalent", () => {
    expect(canonicalInlineHtml("<b>x</b>")).toBe(canonicalInlineHtml("<strong>x</strong>"));
  });

  it("treats <i> and <em> as equivalent", () => {
    expect(canonicalInlineHtml("<i>x</i>")).toBe(canonicalInlineHtml("<em>x</em>"));
  });

  it("normalises emphasis nesting order", () => {
    expect(canonicalInlineHtml("<strong><em>x</em></strong>")).toBe(
      canonicalInlineHtml("<em><strong>x</strong></em>"),
    );
  });

  it("still detects a real difference", () => {
    expect(canonicalInlineHtml("plain")).not.toBe(canonicalInlineHtml("<strong>plain</strong>"));
  });

  it("leaves unformatted text alone", () => {
    expect(canonicalInlineHtml("just text")).toBe("just text");
  });
});

describe("blockKindOf / blockPrefixLength", () => {
  it("identifies each block kind", () => {
    expect(blockKindOf(line("<p>x</p>"))).toBe("p");
    expect(blockKindOf(line("<h1>x</h1>"))).toBe("h1");
    expect(blockKindOf(line("<h2>x</h2>"))).toBe("h2");
    expect(blockKindOf(line("<h3>x</h3>"))).toBe("h3");
    expect(blockKindOf(line("<ul><li>x</li></ul>").querySelector("li")!)).toBe("li");
  });

  it("reads a blockquote's paragraph as a quote, not a paragraph", () => {
    expect(blockKindOf(line("<blockquote><p>x</p></blockquote>").querySelector("p")!)).toBe(
      "quote",
    );
  });

  it("prefix lengths match the markdown each kind emits", () => {
    expect(blockPrefixLength("p")).toBe(0);
    expect(blockPrefixLength("h1")).toBe("# ".length);
    expect(blockPrefixLength("h2")).toBe("## ".length);
    expect(blockPrefixLength("h3")).toBe("### ".length);
    expect(blockPrefixLength("quote")).toBe("> ".length);
    expect(blockPrefixLength("li")).toBe("- ".length);
  });
});

describe("changeBlockKind", () => {
  it("converts a paragraph to a heading, keeping its text", () => {
    const p = line("<p>Title</p>");
    const res = changeBlockKind(p, "h1", 5);
    expect(res.line.tagName).toBe("H1");
    expect(res.line.textContent).toBe("Title");
  });

  it("keeps the caret on the same character when a prefix is added", () => {
    // Caret at end of "Title" (markdown offset 5) must land at markdown offset
    // 7 in "# Title", not shift with the new prefix.
    const res = changeBlockKind(line("<p>Title</p>"), "h1", 5);
    expect(res.caretOffset).toBe(7);
  });

  it("keeps the caret on the same character when a prefix is removed", () => {
    const res = changeBlockKind(line("<h1>Title</h1>"), "p", 7);
    expect(res.line.tagName).toBe("P");
    expect(res.caretOffset).toBe(5);
  });

  it("converting to the same kind is a no-op", () => {
    const p = line("<p>x</p>");
    const res = changeBlockKind(p, "p", 1);
    expect(res.line).toBe(p);
    expect(res.caretOffset).toBe(1);
  });

  it("converts a paragraph to a list item inside a new list", () => {
    const res = changeBlockKind(line("<p>item</p>"), "li", 2);
    expect(res.line.tagName).toBe("LI");
    expect(res.line.parentElement!.tagName).toBe("UL");
  });

  it("joins a preceding list instead of creating a second one", () => {
    const el = root("<ul><li>one</li></ul><p>two</p>");
    const p = el.lastElementChild as HTMLElement;
    const res = changeBlockKind(p, "li", 3);
    const uls = el.querySelectorAll("ul");
    expect(uls.length).toBe(1);
    expect(uls[0].children.length).toBe(2);
    // The item must live inside the ul, not be stranded beside it.
    expect(res.line.parentElement!.tagName).toBe("UL");
    expect(el.querySelectorAll("ul li").length).toBe(2);
  });

  it("lifts a list item back out to a paragraph", () => {
    const el = root("<ul><li>one</li><li>two</li></ul>");
    const li = el.querySelectorAll("li")[1] as HTMLElement;
    const res = changeBlockKind(li, "p", 2);
    expect(res.line.tagName).toBe("P");
    expect(res.line.textContent).toBe("two");
    // The sibling must survive; exiting must not eat the rest of the list.
    expect(el.querySelector("ul")!.textContent).toBe("one");
  });

  it("lifts a quote line out to a paragraph", () => {
    const el = root("<blockquote><p>quoted</p></blockquote>");
    const p = el.querySelector("p") as HTMLElement;
    const res = changeBlockKind(p, "p", 6);
    expect(res.line.tagName).toBe("P");
    expect(el.querySelector("blockquote")).toBeNull();
  });

  it("converts a paragraph to a quote", () => {
    const res = changeBlockKind(line("<p>q</p>"), "quote", 1);
    expect(res.line.tagName).toBe("P");
    expect(res.line.parentElement!.tagName).toBe("BLOCKQUOTE");
  });

  it("preserves inline formatting across a block conversion", () => {
    const res = changeBlockKind(line("<p>a <b>b</b></p>"), "h2", 2);
    expect(res.line.tagName).toBe("H2");
    expect(htmlToMarkdown(root(`<h2>${res.line.innerHTML}</h2>`))).toBe("## a **b**");
  });
});

describe("htmlToMarkdown over converted blocks", () => {
  it("serializes a list built by repeated conversion", () => {
    const el = root("<p>one</p><p>two</p>");
    const first = changeBlockKind(el.firstElementChild as HTMLElement, "li", 3);
    // Re-read the sibling: converting the first line moved it into a new <ul>.
    const second = changeBlockKind(el.lastElementChild as HTMLElement, "li", 3);
    expect(first.line.parentElement!.tagName).toBe("UL");
    expect(second.line.parentElement!.tagName).toBe("UL");
    expect(el.querySelectorAll("ul").length).toBe(1);
    expect(htmlToMarkdown(el)).toBe("- one\n- two");
  });
});
