import { describe, expect, it } from "vitest";
import { generate } from "../src/pipeline";

const svgDim = (svg: string, attr: "width" | "height"): number =>
  Number(svg.match(new RegExp(`${attr}="([\\d.]+)"`))![1]);

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
  const rules = generate(GRAMMAR);

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

  it("wraps the tikzpicture in a page-fit adjustbox (both axes)", () => {
    expect(rules[0].tikz).toContain("\\adjustbox{max size={\\linewidth}{\\textheight}}");
  });

  it("matches the SVG golden snapshot", () => {
    expect(rules.map((r) => `${r.name}\n${r.svg}`).join("\n\n")).toMatchSnapshot();
  });

  it("matches the TikZ golden snapshot", () => {
    expect(rules.map((r) => `${r.name}\n${r.tikz}`).join("\n\n")).toMatchSnapshot();
  });
});

describe("wrap mode — snaking wide sequences", () => {
  // A long top-level concatenation: single-line it runs far to the right.
  const LONG = `long = a, b, c, d, e, f, g, h, i, j, k, l, m, n, o, p;`;

  it("narrows and heightens a wide sequence versus shrink mode", () => {
    const [flat] = generate(LONG, { mode: "shrink", wrapWidthCm: 12.7 });
    const [snaked] = generate(LONG, { mode: "wrap", wrapWidthCm: 6 });
    expect(svgDim(snaked.svg, "width")).toBeLessThan(svgDim(flat.svg, "width"));
    expect(svgDim(snaked.svg, "height")).toBeGreaterThan(svgDim(flat.svg, "height"));
  });

  it("keeps the snaked width within a small margin of the wrap budget", () => {
    const wrapWidthCm = 6;
    const [snaked] = generate(LONG, { mode: "wrap", wrapWidthCm });
    const budgetPt = (wrapWidthCm * 72.27) / 2.54;
    // Rows never start a new item past the budget; allow one item's overshoot.
    expect(svgDim(snaked.svg, "width")).toBeLessThan(budgetPt * 1.6);
  });

  it("does not wrap when the sequence already fits the budget", () => {
    const [flat] = generate(LONG, { mode: "shrink", wrapWidthCm: 12.7 });
    const [wide] = generate(LONG, { mode: "wrap", wrapWidthCm: 100 });
    expect(wide.svg).toBe(flat.svg);
  });

  it("leaves a non-sequence rule (tall choice) single-line under wrap mode", () => {
    const grammar = `digit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";`;
    const [a] = generate(grammar, { mode: "shrink", wrapWidthCm: 12.7 });
    const [b] = generate(grammar, { mode: "wrap", wrapWidthCm: 2 });
    // No top-level seq to break — geometry is identical; adjustbox scales it in LaTeX.
    expect(b.svg).toBe(a.svg);
  });
});
