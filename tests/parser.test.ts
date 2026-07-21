import { describe, expect, it } from "vitest";
import { parseEbnf } from "../src/parser/parser";
import { ParseError } from "../src/parser/errors";
import type { Expression } from "../src/parser/ast";

/** Parse a one-rule grammar and return that rule's expression. */
function expr(src: string): Expression {
  const g = parseEbnf(src);
  expect(g.rules).toHaveLength(1);
  return g.rules[0].expr;
}

/** Parse `src`, expecting it to throw, and return the thrown ParseError. */
function catchParse(src: string): ParseError {
  try {
    parseEbnf(src);
  } catch (e) {
    return e as ParseError;
  }
  throw new Error("expected a ParseError but none was thrown");
}

describe("EBNF parser — constructs", () => {
  it("parses a terminal", () => {
    expect(expr('a = "x";')).toEqual({ kind: "terminal", value: "x" });
  });

  it("parses a nonterminal reference", () => {
    expect(expr("a = b;")).toEqual({ kind: "nonterminal", name: "b" });
  });

  it("parses concatenation", () => {
    expect(expr('a = "x", "y";')).toEqual({
      kind: "sequence",
      items: [
        { kind: "terminal", value: "x" },
        { kind: "terminal", value: "y" },
      ],
    });
  });

  it("parses alternation", () => {
    expect(expr('a = "x" | "y";')).toEqual({
      kind: "choice",
      alternatives: [
        { kind: "terminal", value: "x" },
        { kind: "terminal", value: "y" },
      ],
    });
  });

  it("parses optional [ ]", () => {
    expect(expr('a = ["x"];')).toEqual({
      kind: "optional",
      expr: { kind: "terminal", value: "x" },
    });
  });

  it("parses repetition { }", () => {
    expect(expr('a = {"x"};')).toEqual({
      kind: "repetition",
      expr: { kind: "terminal", value: "x" },
    });
  });

  it("treats grouping ( ) as transparent", () => {
    expect(expr('a = ("x");')).toEqual({ kind: "terminal", value: "x" });
  });

  it("parses a repetition factor n * x", () => {
    expect(expr('a = 3 * "x";')).toEqual({
      kind: "repetitionFactor",
      count: 3,
      expr: { kind: "terminal", value: "x" },
    });
  });

  it("parses an exception A - B", () => {
    expect(expr("a = letter - vowel;")).toEqual({
      kind: "exception",
      base: { kind: "nonterminal", name: "letter" },
      except: { kind: "nonterminal", name: "vowel" },
    });
  });

  it("parses a special sequence ? ... ?", () => {
    expect(expr("a = ? any unicode ?;")).toEqual({
      kind: "special",
      text: "any unicode",
    });
  });

  it("gives concatenation tighter binding than alternation", () => {
    expect(expr('a = "x", "y" | "z";')).toEqual({
      kind: "choice",
      alternatives: [
        {
          kind: "sequence",
          items: [
            { kind: "terminal", value: "x" },
            { kind: "terminal", value: "y" },
          ],
        },
        { kind: "terminal", value: "z" },
      ],
    });
  });

  it("skips (* comments *)", () => {
    expect(expr('a = (* the letter x *) "x";')).toEqual({ kind: "terminal", value: "x" });
  });

  it("allows internal spaces in meta identifiers", () => {
    const g = parseEbnf('single definition = "x";');
    expect(g.rules[0].name).toBe("single definition");
  });

  it("accepts an empty alternative", () => {
    expect(expr('a = "x" | ;')).toEqual({
      kind: "choice",
      alternatives: [{ kind: "terminal", value: "x" }, { kind: "empty" }],
    });
  });

  it("parses multiple rules", () => {
    const g = parseEbnf('a = "x";\nb = "y";');
    expect(g.rules.map((r) => r.name)).toEqual(["a", "b"]);
    expect(g.rules[1].line).toBe(2);
  });
});

describe("EBNF parser — errors", () => {
  it("reports a missing semicolon with line/col", () => {
    try {
      parseEbnf('a = "x"\nb = "y";');
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ParseError);
      const pe = e as ParseError;
      expect(pe.line).toBe(2);
      expect(pe.expected).toContain(";");
    }
  });

  it("reports a missing =", () => {
    const err = catchParse('a "x";');
    expect(err).toBeInstanceOf(ParseError);
    expect(err.expected).toContain("=");
  });

  it("reports an unterminated terminal string", () => {
    const err = catchParse('a = "x;');
    expect(err).toBeInstanceOf(ParseError);
    expect(err.expected).toContain("terminal string");
  });
});
