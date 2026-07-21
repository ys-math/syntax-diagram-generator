import { buildRuleDiagram } from "./model/builder";
import { getDialect } from "./parser";
import { renderSvg } from "./render/svg";
import { renderTikz } from "./render/tikz";

/** How wide diagrams are made to fit the page. */
export type FitMode = "shrink" | "wrap";

/** Rendering options for a run. */
export interface RenderOptions {
  /** `shrink` keeps single-line layout; `wrap` snakes wide sequences across rows. */
  mode: FitMode;
  /** Target line width in cm (drives the wrap break point). Used only in wrap mode. */
  wrapWidthCm: number;
}

export const DEFAULT_OPTIONS: RenderOptions = { mode: "shrink", wrapWidthCm: 12.7 };

/** TeX points per centimetre (1cm = 72.27/2.54 pt). */
const PT_PER_CM = 72.27 / 2.54;

/** One rule's rendered output in every backend. */
export interface RuleDiagram {
  name: string;
  svg: string;
  tikz: string;
}

/**
 * Full pipeline: parse `input` with the chosen dialect, then render each rule to
 * SVG and TikZ. Throws {@link ParseError} on invalid input — callers keep the
 * previous good result and surface the error.
 */
export function generate(
  input: string,
  dialectId: string,
  options: RenderOptions = DEFAULT_OPTIONS,
): RuleDiagram[] {
  const wrapWidth = options.mode === "wrap" ? options.wrapWidthCm * PT_PER_CM : 0;
  const grammar = getDialect(dialectId).parse(input);
  return grammar.rules.map((rule) => {
    const node = buildRuleDiagram(rule);
    return {
      name: rule.name,
      svg: renderSvg(node, wrapWidth),
      // The rule name is the snippet's only comment (labels it once pasted into LaTeX).
      tikz: `% ${rule.name}\n${renderTikz(node, wrapWidth)}`,
    };
  });
}
