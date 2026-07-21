import type { Grammar } from "./ast";
import { parseEbnf } from "./parser";

export { ParseError } from "./errors";
export type { Grammar, Rule, Expression } from "./ast";

/** A grammar dialect: a label for the UI and a parse function to the shared AST. */
export interface Dialect {
  id: string;
  label: string;
  parse: (input: string) => Grammar;
}

/**
 * The dialect registry. v1 ships EBNF only; BNF and ABNF slot in here as new
 * entries whose `parse` targets the same {@link Grammar} AST — no downstream change.
 */
export const dialects: Dialect[] = [
  { id: "ebnf", label: "EBNF (ISO/IEC 14977)", parse: parseEbnf },
];

export function getDialect(id: string): Dialect {
  return dialects.find((d) => d.id === id) ?? dialects[0];
}
