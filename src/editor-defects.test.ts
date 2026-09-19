// @vitest-environment jsdom
// The defects reported from real use, asserted at the level the user hit them:
// the serializer, the churn guard, and the rail's block conversion.
//
// Note on scope: these run in jsdom, which has no layout engine and no
// execCommand. They cover the logic that made formatting vanish (serialize ->
// re-render -> lost) rather than the browser's own bold command. The browser
// behaviour was verified separately by inspecting the live DOM in WebKit.
import { describe, it, expect } from "vitest";
import { htmlToMarkdown, canonicalInlineHtml, serializeInline } from "./editor";
import { renderMarkdown } from "./markdown";

function root(html: string): HTMLElement {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div;
}

describe("the reported defect: styles do not stick", () => {
  /**
   * The failure chain, reproduced end to end.
   *
   * 1. The user selects a word and presses Cmd+B.
   * 2. WebKit wraps it in <b> (not <strong>).
   * 3. The input handler serialises the line to markdown.
   * 4. It re-renders that markdown back into the line.
   *
   * If step 3 drops the marker, step 4 writes plain text, and the bold is gone
   * before the user's finger leaves the key. This test walks that chain.
   */
  function typingRoundTrip(domHtml: string): string {
    // Step 3: serialise the edited line back to markdown.
    const md = htmlToMarkdown(root(`<p>${domHtml}</p>`));
    // Step 4: re-render and return the resulting text content.
    return renderMarkdown(md);
  }

  it("bold survives a browser bold command (the <b> case)", () => {
    const after = typingRoundTrip("some <b>bold</b> word");
    expect(after).toContain("<strong>bold</strong>");
  });

  it("italic survives a browser italic command (the <i> case)", () => {
    const after = typingRoundTrip("some <i>italic</i> word");
    expect(after).toContain("<em>italic</em>");
  });

  it("bold survives when markdown's own tags are produced", () => {
    expect(typingRoundTrip("some <strong>bold</strong> word")).toContain(
      "<strong>bold</strong>",
    );
  });

  it("bold and italic together survive", () => {
    const after = typingRoundTrip("a <b><i>both</i></b> b");
    expect(after).toContain("<strong>");
    expect(after).toContain("<em>");
  });

  it("plain text is untouched by the round trip", () => {
    expect(typingRoundTrip("just words")).toBe("<p>just words</p>");
  });
});

describe("the reported defect: editing is awkward (needless rewrites)", () => {
  /**
   * The churn guard. A keystroke that changes no markup must not trigger a
   * rewrite, because replacing innerHTML destroys the caret, the native undo
   * stack, and any in-flight IME composition. Canonical comparison is what
   * decides "nothing changed".
   */
  const same = (a: string, b: string) =>
    canonicalInlineHtml(a) === canonicalInlineHtml(b);

  it("a plain keystroke is recognised as no change", () => {
    expect(same("hello worl", "hello world")).toBe(false); // text DID change
    expect(same("hello world", "hello world")).toBe(true);
  });

  it("the browser's <b> is not treated as a change from <strong>", () => {
    // This is the case that would otherwise rewrite on every keystroke while
    // typing formatted text, killing the undo stack exactly when it is wanted.
    expect(same("a <b>x</b>", "a <strong>x</strong>")).toBe(true);
  });

  it("the browser's <i> is not treated as a change from <em>", () => {
    expect(same("a <i>x</i>", "a <em>x</em>")).toBe(true);
  });

  it("emphasis nesting order is not treated as a change", () => {
    expect(same("<strong><em>x</em></strong>", "<em><strong>x</strong></em>")).toBe(
      true,
    );
  });

  it("a real formatting change IS detected", () => {
    expect(same("plain", "<strong>plain</strong>")).toBe(false);
  });

  it("canonical comparison preserves the actual text", () => {
    // Guards against a normaliser that "simplifies" by dropping content.
    expect(canonicalInlineHtml("a <b>x</b> b")).toBe("a <strong>x</strong> b");
  });
});

describe("markdown fidelity for the inline subset", () => {
  it("does not corrupt nested formatted text", () => {
    const md = htmlToMarkdown(root("<p><strong>a</strong> and <em>b</em></p>"));
    expect(md).toBe("**a** and *b*");
  });

  it("keeps list items intact with inline formatting", () => {
    const md = htmlToMarkdown(root("<ul><li><b>one</b></li><li>two</li></ul>"));
    expect(md).toBe("- **one**\n- two");
  });

  it("keeps blockquote lines intact", () => {
    const md = htmlToMarkdown(root("<blockquote><p><i>q</i></p></blockquote>"));
    expect(md).toBe("> *q*");
  });

  it("serialises an empty paragraph to empty markdown", () => {
    expect(htmlToMarkdown(root("<p><br></p>"))).toBe("");
  });

  it("serialises bare text nodes (typing into a fresh card)", () => {
    expect(htmlToMarkdown(root("typed"))).toBe("typed");
  });

  it("serializeInline handles the b/i aliases directly", () => {
    expect(serializeInline(root("<b>x</b>"))).toBe("**x**");
    expect(serializeInline(root("<i>x</i>"))).toBe("*x*");
  });
});
