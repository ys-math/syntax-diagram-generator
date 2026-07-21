import type { Expression, Rule } from "../parser/ast";
import { N, type DiagramNode } from "./nodes";

/** Map a grammar-AST expression onto a diagram node. */
export function buildDiagram(expr: Expression): DiagramNode {
  switch (expr.kind) {
    case "sequence":
      return N.seq(expr.items.map(buildDiagram));
    case "choice":
      return N.choice(expr.alternatives.map(buildDiagram));
    case "optional":
      return N.optional(buildDiagram(expr.expr));
    case "repetition":
      return N.loop(buildDiagram(expr.expr), /* zeroOrMore */ true);
    case "repetitionFactor":
      // Exactly `count` copies: a loop with no bypass, annotated with the count.
      return N.loop(buildDiagram(expr.expr), /* zeroOrMore */ false, `${expr.count}×`);
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
