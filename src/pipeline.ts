import { buildRuleDiagram } from "./model/builder";
import { getDialect } from "./parser";
import { renderSvg } from "./render/svg";
import { renderTikz } from "./render/tikz";

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
export function generate(input: string, dialectId: string): RuleDiagram[] {
  const grammar = getDialect(dialectId).parse(input);
  return grammar.rules.map((rule) => {
    const node = buildRuleDiagram(rule);
    return {
      name: rule.name,
      svg: renderSvg(node),
      tikz: renderTikz(node),
    };
  });
}
