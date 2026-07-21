import { describe, expect, it } from "vitest";
import { generate } from "../src/pipeline";

/** A grammar exercising every construct, including the ISO edge cases. */
const GRAMMAR = `
(* a small but full-coverage grammar *)
expression = term, { ("+" | "-"), term };
term = factor, { ("*" | "/"), factor };
factor = number | "(", expression, ")";
number = digit, { digit };
digit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";
padded = 3 * digit;
letter = ? A-Z ?;
consonant = letter - vowel;
vowel = "A" | "E" | "I" | "O" | "U";
optional greeting = ["hello"], "world";
`.trim();

describe("renderers — golden snapshots", () => {
  const rules = generate(GRAMMAR, "ebnf");

  it("produces one diagram per rule", () => {
    expect(rules.map((r) => r.name)).toEqual([
      "expression",
      "term",
      "factor",
      "number",
      "digit",
      "padded",
      "letter",
      "consonant",
      "vowel",
      "optional greeting",
    ]);
  });

  it("emits self-contained SVG with an embedded style block", () => {
    const svg = rules[0].svg;
    expect(svg).toMatch(/^<svg /);
    expect(svg).toContain("<style>");
    expect(svg).toContain("viewBox");
  });

  it("emits a compilable-looking tikzpicture", () => {
    const tikz = rules[0].tikz;
    expect(tikz).toContain("\\begin{tikzpicture}");
    expect(tikz).toContain("\\end{tikzpicture}");
  });

  it("matches the SVG golden snapshot", () => {
    expect(rules.map((r) => `${r.name}\n${r.svg}`).join("\n\n")).toMatchSnapshot();
  });

  it("matches the TikZ golden snapshot", () => {
    expect(rules.map((r) => `${r.name}\n${r.tikz}`).join("\n\n")).toMatchSnapshot();
  });
});
