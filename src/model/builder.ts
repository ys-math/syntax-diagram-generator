import type { Expression, Rule } from "../parser/ast";
import { N, type DiagramNode } from "./nodes";

/** Map a grammar-AST expression onto a diagram node. */
export function buildDiagram(expr: Expression): DiagramNode {
  switch (expr.kind) {
    case "sequence":
      return buildSequence(expr.items);
    case "choice":
      return N.choice(expr.alternatives.map(buildDiagram));
    case "optional":
      return N.optional(buildDiagram(expr.expr));
    case "repetition":
      return N.loop(buildDiagram(expr.expr), /* zeroOrMore */ true);
    case "repetitionFactor":
      // Exactly `count` copies: a loop with no bypass, annotated with the count.
      return N.loop(buildDiagram(expr.expr), /* zeroOrMore */ false, { label: `${expr.count}×` });
    case "exception":
      // Set-difference has no flow shape; render the whole thing as one box.
      return N.exception(`${exprToString(expr.base)} − ${exprToString(expr.except)}`);
    case "terminal":
      return N.terminal(expr.value);
    case "nonterminal":
      return N.nonterminal(expr.name);
    case "special":
      return N.special(expr.text);
    case "empty":
      return N.skip();
  }
}

/**
 * Build a concatenation, collapsing the two railroad "list" idioms so the loop
 * reads the way people draw lists by hand:
 *
 *   A, { A }        → one-or-more A         (mandatory once, backward loop to repeat)
 *   A, { sep, A }   → one-or-more A / sep   (the separator rides on the backward loop)
 *
 * Anything that doesn't match is laid out element-by-element as usual.
 */
function buildSequence(items: Expression[]): DiagramNode {
  const out: DiagramNode[] = [];
  for (let i = 0; i < items.length; i++) {
    const cur = items[i];
    const next = items[i + 1];
    if (next && next.kind === "repetition") {
      const body = next.expr;
      // A, { sep, A } — separator on the loop.
      if (body.kind === "sequence" && body.items.length >= 2) {
        const [sep, ...rest] = body.items;
        const repeated: Expression =
          rest.length === 1 ? rest[0] : { kind: "sequence", items: rest };
        if (exprEqual(repeated, cur)) {
          out.push(N.loop(buildDiagram(cur), false, { separator: buildDiagram(sep) }));
          i++;
          continue;
        }
      }
      // A, { A } — plain one-or-more.
      if (exprEqual(body, cur)) {
        out.push(N.loop(buildDiagram(cur), false));
        i++;
        continue;
      }
    }
    out.push(buildDiagram(cur));
  }
  return out.length === 1 ? out[0] : N.seq(out);
}

/** Structural equality of two expressions (the AST holds only plain data). */
function exprEqual(a: Expression, b: Expression): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Build the top-level diagram for a rule (its right-hand side). */
export function buildRuleDiagram(rule: Rule): DiagramNode {
  return buildDiagram(rule.expr);
}

/** Compact EBNF-ish rendering of an expression, used for exception annotations. */
export function exprToString(expr: Expression): string {
  switch (expr.kind) {
    case "sequence":
      return expr.items.map(exprToString).join(", ");
    case "choice":
      return expr.alternatives.map(exprToString).join(" | ");
    case "optional":
      return `[${exprToString(expr.expr)}]`;
    case "repetition":
      return `{${exprToString(expr.expr)}}`;
    case "repetitionFactor":
      return `${expr.count} * ${exprToString(expr.expr)}`;
    case "exception":
      return `${exprToString(expr.base)} - ${exprToString(expr.except)}`;
    case "terminal":
      return `"${expr.value}"`;
    case "nonterminal":
      return expr.name;
    case "special":
      return `? ${expr.text} ?`;
    case "empty":
      return "";
  }
}
