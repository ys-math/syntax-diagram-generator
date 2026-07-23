/**
 * Grammar AST produced by the EBNF parser (`parseEbnf`).
 *
 * Downstream stages — diagram building, layout, rendering — consume this shape
 * and never touch the source notation, so it stays a clean seam between parsing
 * and everything after it.
 */

export type Expression =
  | Sequence
  | Choice
  | Optional
  | Repetition
  | RepetitionFactor
  | Exception
  | Terminal
  | NonTerminal
  | Special
  | Empty;

/** Concatenation: items in order. */
export interface Sequence {
  kind: "sequence";
  items: Expression[];
}

/** Alternation: exactly one of the alternatives. */
export interface Choice {
  kind: "choice";
  alternatives: Expression[];
}

/** Zero-or-one — ISO `[ … ]`. */
export interface Optional {
  kind: "optional";
  expr: Expression;
}

/** Zero-or-more — ISO `{ … }`. */
export interface Repetition {
  kind: "repetition";
  expr: Expression;
}

/** Exactly `count` copies — ISO `count * primary`. */
export interface RepetitionFactor {
  kind: "repetitionFactor";
  count: number;
  expr: Expression;
}

/** Syntactic exception — ISO `base - except`. Rendered as an annotation. */
export interface Exception {
  kind: "exception";
  base: Expression;
  except: Expression;
}

/** A terminal string, e.g. `"if"` or `'+'`. */
export interface Terminal {
  kind: "terminal";
  value: string;
}

/** A reference to another rule (meta identifier). */
export interface NonTerminal {
  kind: "nonterminal";
  name: string;
}

/** ISO special sequence `? … ?` — arbitrary meta text, rendered verbatim. */
export interface Special {
  kind: "special";
  text: string;
}

/** The empty sequence (an alternative that matches nothing). */
export interface Empty {
  kind: "empty";
}

/** A single production: `name = expr ;`. */
export interface Rule {
  name: string;
  expr: Expression;
  /** 1-based line of the rule's defining name, for UI cross-referencing. */
  line: number;
  /** The rule's original source text, verbatim (name through terminator). */
  source: string;
}

/** A whole parsed grammar. */
export interface Grammar {
  rules: Rule[];
}
