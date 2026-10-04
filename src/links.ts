// Link activation for rendered card bodies.
//
// Card markdown (src/markdown.ts) renders anchors in exactly two shapes:
//   [[wikilink]]   → <a class="internal-link" data-href="Target">
//   [label](href)  → <a href="…">   (scheme-guarded renderer)
// Both routes reach Obsidian: a [[wikilink]] carries its target in `data-href`,
// and an explicit `[label](obsidian://…)` survives the renderer's scheme guard
// as an ordinary href (see the `obsidian:` clause in src/markdown.ts). Every
// activation decision lives here rather than in the renderer.
//
// Display-only. Nothing here changes what is persisted — the editor serialiser
// (src/editor.ts) already round-trips both anchor shapes losslessly, so a click
// is a pure read of the rendered DOM.

/**
 * The vault [[wikilinks]] open in. A readable name rather than the opaque vault
 * id, so the URI is legible by hand and matches the convention the fleet's
 * failure-log-checkins script already emits.
 */
export const OBSIDIAN_VAULT = "black-wish";

/** ELEMENT_NODE without depending on a global `Element` (keeps this
 *  importable outside a DOM environment). */
function isElement(node: unknown): node is Element {
  return (
    typeof node === "object" &&
    node !== null &&
    (node as Node).nodeType === 1
  );
}

/**
 * Resolve one rendered anchor to the URL to open, or null if it is not an
 * activatable link.
 *
 * Obsidian requires URI values percent-encoded, with `/` as %2F and space as
 * %20 (Obsidian URI help, "Encoding"). `encodeURIComponent` does both.
 */
export function linkTargetFor(el: Element): string | null {
  if (el.tagName.toLowerCase() !== "a") return null;

  const wikilink = el.getAttribute("data-href");
  if (wikilink !== null) {
    const target = wikilink.trim();
    if (target === "") return null;
    return `obsidian://open?vault=${encodeURIComponent(OBSIDIAN_VAULT)}&file=${encodeURIComponent(target)}`;
  }

  const href = (el.getAttribute("href") ?? "").trim();
  // The renderer emits "#"/"" for a refused link and a guarded scheme
  // otherwise; nothing else can be in the attribute.
  if (href === "" || href.startsWith("#")) return null;
  if (/^(https?:|mailto:|obsidian:)/i.test(href)) return href;
  return null;
}

/**
 * The URL to open for a click whose target may be a link *or a child of one*
 * (a <strong>, <mark> or <code> chip inside the anchor). Climbs to the nearest
 * anchor and resolves it; null when the click was not on an activatable link,
 * so the caller can leave the event alone (e.g. let it select the card).
 */
export function linkUrlFromEventTarget(target: unknown): string | null {
  if (!isElement(target)) return null;
  let el: Element | null = target;
  while (el && el.tagName.toLowerCase() !== "a") el = el.parentElement;
  return el ? linkTargetFor(el) : null;
}
