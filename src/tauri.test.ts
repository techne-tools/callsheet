import { describe, it, expect } from "vitest";
import { deriveBorder, deriveDarkFill, deriveDarkBorder } from "./tauri";

describe("deriveBorder", () => {
  it("derives the same hue at 62% lightness (v0.4.0 default)", () => {
    expect(deriveBorder("hsl(215, 20%, 88%)")).toBe("hsl(215, 20%, 62%)");
    expect(deriveBorder("hsl(120, 20%, 87%)")).toBe("hsl(120, 20%, 62%)");
    expect(deriveBorder("hsl(38, 40%, 88%)")).toBe("hsl(38, 40%, 62%)");
    expect(deriveBorder("hsl(350, 30%, 89%)")).toBe("hsl(350, 30%, 62%)");
    expect(deriveBorder("hsl(30, 15%, 88%)")).toBe("hsl(30, 15%, 62%)");
  });

  it("supports a custom lightness target", () => {
    expect(deriveBorder("hsl(215, 20%, 88%)", 60)).toBe("hsl(215, 20%, 60%)");
  });

  it("returns the input unchanged if it is not a parseable HSL token", () => {
    expect(deriveBorder("#fff")).toBe("#fff");
  });
});

describe("deriveDarkFill", () => {
  it("drops a light fill to a quiet dark surface, same hue", () => {
    expect(deriveDarkFill("hsl(215, 20%, 88%)")).toBe("hsl(215, 20%, 22%)");
    expect(deriveDarkFill("hsl(38, 40%, 88%)")).toBe("hsl(38, 40%, 22%)");
  });

  it("supports a custom lightness target", () => {
    expect(deriveDarkFill("hsl(215, 20%, 88%)", 18)).toBe("hsl(215, 20%, 18%)");
  });

  it("returns the input unchanged if it is not a parseable HSL token", () => {
    expect(deriveDarkFill("#fff")).toBe("#fff");
  });
});

describe("deriveDarkBorder", () => {
  it("derives a dark-theme border lighter than the dark fill, same hue", () => {
    expect(deriveDarkBorder("hsl(215, 20%, 88%)")).toBe("hsl(215, 20%, 34%)");
    expect(deriveDarkBorder("hsl(120, 20%, 87%)")).toBe("hsl(120, 20%, 34%)");
  });

  it("supports a custom lightness target", () => {
    expect(deriveDarkBorder("hsl(215, 20%, 88%)", 40)).toBe("hsl(215, 20%, 40%)");
  });

  it("returns the input unchanged if it is not a parseable HSL token", () => {
    expect(deriveDarkBorder("#fff")).toBe("#fff");
  });
});
