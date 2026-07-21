import { describe, expect, it } from "vitest";
import { parseEbnf } from "../src/parser/parser";
import { buildRuleDiagram } from "../src/model/builder";
import type { DiagramNode } from "../src/model/nodes";

/** Build the diagram for the first rule of a one-rule grammar. */
function build(src: string): DiagramNode {
  const grammar = parseEbnf(src);
  return buildRuleDiagram(grammar.rules[0]);
}

describe("builder — repetition idioms", () => {
  it("collapses `A, { A }` into a one-or-more loop (no bypass, no separator)", () => {
    const node = build(`digits = digit, { digit } ;`);
    expect(node.kind).toBe("loop");
    expect(node.zeroOrMore).toBe(false); // mandatory once → no forward bypass
    expect(node.separator).toBeUndefined();
    expect(node.child?.kind).toBe("nonterminal");
    expect(node.child?.text).toBe("digit");
  });

  it("collapses `A, { sep, A }` so the separator rides on the loop", () => {
    const node = build(`list = item, { ",", item } ;`);
    expect(node.kind).toBe("loop");
    expect(node.zeroOrMore).toBe(false);
    expect(node.child?.text).toBe("item");
    expect(node.separator?.kind).toBe("terminal");
    expect(node.separator?.text).toBe(",");
  });

  it("keeps a choice separator on the loop (`A, { (x|y), A }`)", () => {
    const node = build(`expr = term, { ("+" | "-"), term } ;`);
    expect(node.kind).toBe("loop");
    expect(node.child?.text).toBe("term");
    expect(node.separator?.kind).toBe("choice");
    expect(node.separator?.children?.map((c) => c.text)).toEqual(["+", "-"]);
  });

  it("leaves a bare `{ A }` as a zero-or-more loop with a forward bypass", () => {
    const node = build(`ws = { " " } ;`);
    expect(node.kind).toBe("loop");
    expect(node.zeroOrMore).toBe(true);
    expect(node.separator).toBeUndefined();
  });

  it("does not collapse when the repeated element differs from its predecessor", () => {
    const node = build(`pair = a, { ",", b } ;`);
    expect(node.kind).toBe("seq"); // no idiom → element-by-element
  });
});
