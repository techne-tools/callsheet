import { describe, it, expect } from "vitest";
import { deriveBorder } from "./tauri";

describe("deriveBorder", () => {
  it("derives the same hue at 70% lightness", () => {
    expect(deriveBorder("hsl(215, 15%, 93%)")).toBe("hsl(215, 15%, 70%)");
    expect(deriveBorder("hsl(120, 15%, 92%)")).toBe("hsl(120, 15%, 70%)");
    expect(deriveBorder("hsl(38, 30%, 93%)")).toBe("hsl(38, 30%, 70%)");
    expect(deriveBorder("hsl(350, 20%, 94%)")).toBe("hsl(350, 20%, 70%)");
    expect(deriveBorder("hsl(30, 10%, 93%)")).toBe("hsl(30, 10%, 70%)");
  });

  it("supports a custom lightness target", () => {
    expect(deriveBorder("hsl(215, 15%, 93%)", 60)).toBe("hsl(215, 15%, 60%)");
  });

  it("returns the input unchanged if it is not a parseable HSL token", () => {
    expect(deriveBorder("#fff")).toBe("#fff");
  });
});
