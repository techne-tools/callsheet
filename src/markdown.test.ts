import { describe, it, expect } from "vitest";
import { renderMarkdown, markdownToPlainText, templateNameFromMarkdown, parseInline } from "./markdown";

describe("renderMarkdown", () => {
  it("renders an H1 heading", () => {
    expect(renderMarkdown("# Hello")).toBe("<h1>Hello</h1>");
  });

  it("renders H2 and H3 headings", () => {
    expect(renderMarkdown("## Two")).toBe("<h2>Two</h2>");
    expect(renderMarkdown("### Three")).toBe("<h3>Three</h3>");
  });

  it("renders bold", () => {
    expect(renderMarkdown("**bold**")).toBe("<p><strong>bold</strong></p>");
  });

  it("renders italic", () => {
    expect(renderMarkdown("*italic*")).toBe("<p><em>italic</em></p>");
  });

  it("renders a bullet list", () => {
    expect(renderMarkdown("- one\n- two")).toBe(
      "<ul>\n<li>one</li>\n<li>two</li>\n</ul>",
    );
  });

  it("renders a blockquote", () => {
    expect(renderMarkdown("> quote")).toBe(
      "<blockquote>\n<p>quote</p>\n</blockquote>",
    );
  });

  it("escapes raw HTML instead of injecting it", () => {
    const html = renderMarkdown("<script>alert('x')</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });

  it("keeps a leading H1 (no display-only title drop)", () => {
    // Eidolon's public renderMarkdown drops a leading H1 because its pane header
    // shows the title; callsheet seeds its editor from this output and serialises
    // the DOM back to markdown on save, so dropping the H1 would delete it.
    expect(renderMarkdown("# Title\n\nbody")).toContain("<h1>Title</h1>");
  });

  it("renders frontmatter as prose rather than stripping it", () => {
    // Same rationale: eidolon strips a YAML block; callsheet must not, or the
    // block is deleted the moment the card is edited.
    expect(renderMarkdown("---\nx: 1\n---\n\nbody")).toContain("x: 1");
  });
});

describe("renderMarkdown — shared eidolon grammar", () => {
  it("renders GFM tables", () => {
    const html = renderMarkdown("| a | b |\n|---|---|\n| 1 | 2 |");
    expect(html).toContain("<table>");
    expect(html).toContain("<td>1</td>");
  });

  it("renders ordered lists", () => {
    expect(renderMarkdown("1. one\n2. two")).toContain("<ol>");
  });

  it("renders strikethrough and inline code", () => {
    expect(renderMarkdown("~~gone~~")).toContain("<del>gone</del>");
    expect(renderMarkdown("`x`")).toContain("<code>x</code>");
  });

  it("renders ==highlight== via the inline extension", () => {
    expect(renderMarkdown("==hi==")).toContain("<mark>hi</mark>");
  });

  it("renders [[wikilinks]] as internal links", () => {
    const html = renderMarkdown("[[page|the page]]");
    expect(html).toContain('class="internal-link"');
    expect(html).toContain('data-href="page"');
    expect(html).toContain(">the page</a>");
  });

  it("renders Obsidian callouts", () => {
    const html = renderMarkdown("> [!warning] Careful\n> body");
    expect(html).toContain('class="callout callout-warning"');
    expect(html).toContain('data-callout="warning"');
    expect(html).toContain("Careful");
    expect(html).toContain("body");
  });

  it("escapes raw HTML injected through a callout title", () => {
    const html = renderMarkdown("> [!warning] <img src=x onerror=y>");
    expect(html).toContain('class="callout callout-warning"');
    expect(html).not.toContain("<img");
  });

  it("escapes script tags in wikilink labels", () => {
    const html = renderMarkdown("[[page|<script>x</script>]]");
    expect(html).toContain('class="internal-link"');
    expect(html).not.toContain("<script>");
  });

  it("guards link schemes", () => {
    expect(renderMarkdown("[x](javascript:alert(1))")).not.toContain("javascript:");
    expect(renderMarkdown("[x](https://example.com)")).toContain(
      'href="https://example.com"',
    );
  });

  it("escapes quote-breakout attempts in link hrefs", () => {
    const html = renderMarkdown('[x](https://e.com/"onmouseover="alert(1))');
    expect(html).not.toContain('"onmouseover');
  });

  it("allows an explicit obsidian:// scheme (heading/block anchors need it)", () => {
    // Deliberate callsheet-only widening of the shared guard: Obsidian's own
    // "copy link" form, and the only route to a #heading / ^block anchor.
    const html = renderMarkdown("[note](obsidian://open?vault=black-wish&file=X%23Heading)");
    expect(html).toContain("obsidian://open?vault=black-wish");
    expect(html).not.toContain('href="#"');
  });
});

describe("parseInline", () => {
  it("renders inline emphasis without a block wrapper", () => {
    expect(parseInline("**bold** and *italic*")).toBe(
      "<strong>bold</strong> and <em>italic</em>",
    );
  });

  it("escapes raw HTML", () => {
    expect(parseInline("<script>x</script>")).toBe("&lt;script&gt;x&lt;/script&gt;");
  });

  it("renders the wider inline grammar the editor can produce", () => {
    expect(parseInline("~~gone~~")).toBe("<del>gone</del>");
    expect(parseInline("`x`")).toBe("<code>x</code>");
    expect(parseInline("==hi==")).toBe("<mark>hi</mark>");
    expect(parseInline("[[page]]")).toContain('class="internal-link"');
  });
});

describe("markdownToPlainText", () => {
  it("strips heading markers and inline emphasis", () => {
    expect(markdownToPlainText("# **Title**")).toBe("Title");
  });

  it("turns bullets into •", () => {
    expect(markdownToPlainText("- one\n- two")).toBe("• one\n• two");
  });

  it("strips the wider shared grammar", () => {
    expect(markdownToPlainText("==hi==")).toBe("hi");
    expect(markdownToPlainText("`code`")).toBe("code");
    expect(markdownToPlainText("[[page|label]]")).toBe("label");
    expect(markdownToPlainText("[x](https://e.com)")).toBe("x");
    expect(markdownToPlainText("1. one")).toBe("• one");
  });
});

describe("templateNameFromMarkdown", () => {
  it("uses the first line, stripped of markdown", () => {
    expect(templateNameFromMarkdown("# Standup\n- check-in")).toBe("Standup");
  });

  it("falls back to Untitled for empty content", () => {
    expect(templateNameFromMarkdown("")).toBe("Untitled");
  });

  it("truncates long first lines", () => {
    expect(templateNameFromMarkdown("x".repeat(60))).toBe("x".repeat(40));
  });
});
