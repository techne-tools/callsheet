// @vitest-environment jsdom
// Round-trip fidelity for the shared (eidolon) markdown grammar.
//
// Callsheet's card editor seeds its contentEditable from renderMarkdown and
// serialises the DOM back to markdown with htmlToMarkdown on save, so anything
// the renderer can emit must survive that trip or it is deleted when a card is
// edited. These tests assert the strong form: re-rendering the serialised
// markdown yields byte-identical HTML (nothing visually changed), and the
// serialised markdown still carries the construct's markers.
import { describe, it, expect } from "vitest";
import { renderMarkdown } from "./markdown";
import { htmlToMarkdown } from "./editor";

function root(html: string): HTMLElement {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div;
}

/** md -> html -> md -> html; the two HTML forms must match for no visual loss. */
function roundtrip(md: string) {
  const html1 = renderMarkdown(md);
  const md2 = htmlToMarkdown(root(html1));
  const html2 = renderMarkdown(md2);
  return { html1, md2, html2 };
}

const cases: Array<{ name: string; md: string; contains?: string[] }> = [
  { name: "heading", md: "# Hello", contains: ["# Hello"] },
  { name: "bold and italic", md: "**b** and *i*", contains: ["**b**", "*i*"] },
  { name: "bullet list", md: "- one\n- two", contains: ["- one", "- two"] },
  { name: "ordered list", md: "1. one\n2. two", contains: ["1. one", "2. two"] },
  { name: "blockquote", md: "> quote", contains: ["> quote"] },
  { name: "strikethrough", md: "~~gone~~", contains: ["~~gone~~"] },
  { name: "highlight", md: "==hi==", contains: ["==hi=="] },
  { name: "inline code", md: "`x`", contains: ["`x`"] },
  { name: "external link", md: "see [x](https://example.com)", contains: ["[x](https://example.com)"] },
  { name: "wikilink", md: "[[page]]", contains: ["[[page]]"] },
  { name: "wikilink with label", md: "[[page|the page]]", contains: ["[[page|the page]]"] },
  {
    name: "explicit obsidian link",
    md: "see [n](obsidian://open?vault=black-wish&file=X)",
    contains: ["obsidian://open?vault=black-wish&file=X"],
  },
  { name: "hr", md: "---", contains: ["---"] },
  { name: "table", md: "| a | b |\n|---|---|\n| 1 | 2 |", contains: ["| a | b |", "| 1 | 2 |"] },
  { name: "callout with body", md: "> [!note] Title\n> body", contains: ["[!note] Title", "> body"] },
  { name: "bare callout", md: "> [!warning]\n> danger", contains: ["[!warning]", "> danger"] },
];

describe("markdown round-trips without visual loss", () => {
  for (const c of cases) {
    it(c.name, () => {
      const { html1, md2, html2 } = roundtrip(c.md);
      // The serialised markdown must re-render to exactly the same HTML.
      expect(html2).toBe(html1);
      // And it must still carry the construct's markers.
      for (const marker of c.contains ?? []) {
        expect(md2).toContain(marker);
      }
    });
  }
});

describe("round-trip is idempotent", () => {
  for (const c of cases) {
    it(c.name, () => {
      const first = roundtrip(c.md).md2;
      const second = roundtrip(first).md2;
      expect(second).toBe(first);
    });
  }
});

describe("mixed document round-trips", () => {
  it("keeps every block of a compound card", () => {
    const md = [
      "# Plan",
      "",
      "Some **bold** and a [link](https://example.com).",
      "",
      "- one",
      "- two",
      "",
      "> a quote",
      "",
      "| h1 | h2 |",
      "| --- | --- |",
      "| a | b |",
    ].join("\n");
    const { html1, html2 } = roundtrip(md);
    expect(html2).toBe(html1);
    expect(html1).toContain("<h1>Plan</h1>");
    expect(html1).toContain("<strong>bold</strong>");
    expect(html1).toContain("<li>one</li>");
    expect(html1).toContain("<blockquote>");
  });
});
