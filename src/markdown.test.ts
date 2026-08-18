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
});

describe("markdownToPlainText", () => {
  it("strips heading markers and inline emphasis", () => {
    expect(markdownToPlainText("# **Title**")).toBe("Title");
  });

  it("turns bullets into •", () => {
    expect(markdownToPlainText("- one\n- two")).toBe("• one\n• two");
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
