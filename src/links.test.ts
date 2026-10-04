// @vitest-environment jsdom
// Link activation: how a rendered anchor maps to the URL that gets opened.
import { describe, it, expect } from "vitest";
import { linkTargetFor, linkUrlFromEventTarget, OBSIDIAN_VAULT } from "./links";
import { renderMarkdown } from "./markdown";

/** Build a detached element from an HTML string and return its first child. */
function el(html: string): Element {
  const host = document.createElement("div");
  host.innerHTML = html;
  return host.firstElementChild as Element;
}

describe("linkTargetFor", () => {
  it("resolves a wikilink to an obsidian:// open URL for the vault", () => {
    const a = el('<a class="internal-link" data-href="My Note" href="#My%20Note">My Note</a>');
    expect(linkTargetFor(a)).toBe(
      `obsidian://open?vault=${OBSIDIAN_VAULT}&file=My%20Note`,
    );
  });

  it("encodes a vault path so `/` becomes %2F (Obsidian URI requirement)", () => {
    const a = el('<a data-href="Projects/Film/Pitch" href="#">Pitch</a>');
    expect(linkTargetFor(a)).toBe(
      `obsidian://open?vault=${OBSIDIAN_VAULT}&file=Projects%2FFilm%2FPitch`,
    );
  });

  it("encodes a wikilink label-only target (no path) as a bare file name", () => {
    const a = el('<a data-href="Daily/2026-10-04" href="#">today</a>');
    expect(linkTargetFor(a)).toBe(
      `obsidian://open?vault=${OBSIDIAN_VAULT}&file=Daily%2F2026-10-04`,
    );
  });

  it("trims a wikilink target", () => {
    const a = el('<a data-href="  Spaced  " href="#">x</a>');
    expect(linkTargetFor(a)).toBe(
      `obsidian://open?vault=${OBSIDIAN_VAULT}&file=Spaced`,
    );
  });

  it("returns null for an empty wikilink target", () => {
    expect(linkTargetFor(el('<a data-href="" href="#">x</a>'))).toBeNull();
    expect(linkTargetFor(el('<a data-href="   " href="#">x</a>'))).toBeNull();
  });

  it("passes an https href through unchanged", () => {
    const a = el('<a href="https://example.com/path">x</a>');
    expect(linkTargetFor(a)).toBe("https://example.com/path");
  });

  it("passes an http href through unchanged", () => {
    expect(linkTargetFor(el('<a href="http://example.com">x</a>'))).toBe(
      "http://example.com",
    );
  });

  it("passes a mailto href through unchanged", () => {
    expect(linkTargetFor(el('<a href="mailto:a@b.com">x</a>'))).toBe(
      "mailto:a@b.com",
    );
  });

  it("returns null for a refused link (href=\"#\")", () => {
    expect(linkTargetFor(el('<a href="#">x</a>'))).toBeNull();
  });

  it("returns null for an anchor with no href at all", () => {
    expect(linkTargetFor(el("<a>x</a>"))).toBeNull();
  });

  it("returns null for an unguarded scheme that slipped into the DOM", () => {
    expect(linkTargetFor(el('<a href="javascript:alert(1)">x</a>'))).toBeNull();
    expect(linkTargetFor(el('<a href="file:///etc/hosts">x</a>'))).toBeNull();
  });

  it("returns null for a non-anchor element", () => {
    expect(linkTargetFor(el("<p>plain</p>"))).toBeNull();
  });
});

describe("linkUrlFromEventTarget", () => {
  it("resolves a click directly on the anchor", () => {
    const a = el('<a data-href="Note" href="#">Note</a>');
    expect(linkUrlFromEventTarget(a)).toBe(
      `obsidian://open?vault=${OBSIDIAN_VAULT}&file=Note`,
    );
  });

  it("climbs from a child of the anchor to the anchor", () => {
    const host = document.createElement("div");
    host.innerHTML =
      '<a href="https://example.com"><strong>bold</strong> link</a>';
    const strong = host.querySelector("strong") as Element;
    expect(linkUrlFromEventTarget(strong)).toBe("https://example.com");
  });

  it("returns null for a click inside the body that is not on a link", () => {
    const host = document.createElement("div");
    host.innerHTML = "<p>no link <em>here</em></p>";
    const em = host.querySelector("em") as Element;
    expect(linkUrlFromEventTarget(em)).toBeNull();
  });

  it("returns null for a null or non-element target", () => {
    expect(linkUrlFromEventTarget(null)).toBeNull();
    expect(linkUrlFromEventTarget(undefined)).toBeNull();
    expect(linkUrlFromEventTarget("not an element")).toBeNull();
  });

  it("returns null when the nearest anchor has a refused href", () => {
    const a = el('<a href="#"><span>x</span></a>');
    expect(linkUrlFromEventTarget(a.querySelector("span"))).toBeNull();
  });
});

describe("rendered markdown → open URL (the real seam)", () => {
  /** Put a card's rendered body into the DOM, as Card.tsx does. */
  function body(md: string): HTMLElement {
    const host = document.createElement("div");
    host.innerHTML = renderMarkdown(md);
    return host;
  }

  it("a rendered [[wikilink]] opens its note in Obsidian", () => {
    const host = body("See [[Projects/Pitch|the pitch]].");
    const a = host.querySelector("a.internal-link") as Element;
    expect(linkUrlFromEventTarget(a)).toBe(
      `obsidian://open?vault=${OBSIDIAN_VAULT}&file=Projects%2FPitch`,
    );
  });

  it("a rendered external link opens as-is", () => {
    const host = body("[docs](https://example.com/x)");
    const a = host.querySelector("a") as Element;
    expect(linkUrlFromEventTarget(a)).toBe("https://example.com/x");
  });

  it("link text is raw (eidolon parity): markers are literal, the anchor is the target", () => {
    // The shared renderer interpolates the raw link text, so inline markers in
    // a link label show through literally rather than as a <strong>. That is
    // eidolon's behaviour, preserved deliberately. Clicking the anchor opens it.
    const host = body("[**bold** link](https://e.com)");
    const a = host.querySelector("a") as Element;
    expect(a.textContent).toBe("**bold** link");
    expect(a.querySelector("strong")).toBeNull();
    expect(linkUrlFromEventTarget(a)).toBe("https://e.com");
  });

  it("climbs from a child element to its anchor (defensive)", () => {
    // Anchors that DO contain children (a hand-built DOM shape) still resolve:
    // the handler climbs to the nearest anchor.
    const host = document.createElement("div");
    host.innerHTML = '<a href="https://e.com"><strong>bold</strong> link</a>';
    const strong = host.querySelector("strong") as Element;
    expect(linkUrlFromEventTarget(strong)).toBe("https://e.com");
  });

  it("an explicit obsidian:// link is live and opens as-is", () => {
    const host = body("[n](obsidian://open?vault=black-wish&file=X%23Heading)");
    const a = host.querySelector("a") as Element;
    expect(a.getAttribute("href")).toBe(
      "obsidian://open?vault=black-wish&file=X%23Heading",
    );
    expect(linkUrlFromEventTarget(a)).toBe(
      "obsidian://open?vault=black-wish&file=X%23Heading",
    );
  });

  it("plain text is not a link target", () => {
    const host = body("just words");
    const p = host.querySelector("p") as Element;
    expect(linkUrlFromEventTarget(p)).toBeNull();
  });
});
