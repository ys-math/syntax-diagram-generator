/**
 * The diagram tree: a dialect-neutral, layout-oriented representation that sits
 * between the grammar AST and the renderers. Every renderer (SVG, TikZ, …)
 * consumes this same tree after {@link layout} annotates each node with a `box`.
 */

export type NodeKind =
  | "seq" //         concatenation, drawn left-to-right
  | "choice" //      alternation, branches stacked vertically
  | "optional" //    zero-or-one, with a bypass line above
  | "loop" //        repetition, with a return line below
  | "terminal" //    literal token (rounded box)
  | "nonterminal" // reference to another rule (rectangular box)
  | "special" //     ISO special sequence (distinct box)
  | "exception" //   ISO `A - B`, shown as one annotated box
  | "skip"; //       an empty path (straight line)

/** Layout box, filled in by the layout pass. `up`/`down` are measured from the rail. */
export interface Box {
  width: number;
  /** Distance from the horizontal rail up to the node's top. */
  up: number;
  /** Distance from the horizontal rail down to the node's bottom. */
  down: number;
  /** For `choice`/`optional`/`loop`: width of the widest inner branch. */
  innerWidth?: number;
}

export interface DiagramNode {
  kind: NodeKind;
  children?: DiagramNode[]; // seq, choice
  child?: DiagramNode; //      optional, loop
  separator?: DiagramNode; //  loop: delimiter that rides on the backward loop
  text?: string; //            terminal, nonterminal, special, exception
  zeroOrMore?: boolean; //     loop: forward bypass present (allows zero passes)
  label?: string; //           loop: count annotation (ISO `n *`)
  box?: Box; //                set by layout
}

// ── Shared geometry constants (used by layout and by the draw pass) ──────────
export const FONT_SIZE = 13;
export const CHAR_W = 7.4; // approximate advance width at FONT_SIZE for the chosen font
export const TEXT_PAD = 11; // horizontal padding inside a box
export const BOX_H = 24; // box height
export const MIN_BOX_W = 24;
export const H_SEQ = 12; // gap between sequence elements
export const V_SPACE = 15; // vertical gap between stacked branches (moderate breathing room)
export const ARC = 10; // corner radius / fan width for rails
export const TERMINUS = 12; // width of the start/end terminus rails
export const PAD = 8; // outer padding around a diagram
export const ARROW_CLEAR = 5; // vertical room a loop-back arrowhead needs below its rail
export const LABEL_CLEAR = 10; // vertical room a loop count label needs below its rail

/** Estimate the drawn width of a text label inside a box. */
export function measureText(text: string): number {
  return Math.max(MIN_BOX_W, text.length * CHAR_W + 2 * TEXT_PAD);
}

/** Convenience constructors keep the builder terse and the shape consistent. */
export const N = {
  seq: (children: DiagramNode[]): DiagramNode => ({ kind: "seq", children }),
  choice: (children: DiagramNode[]): DiagramNode => ({ kind: "choice", children }),
  optional: (child: DiagramNode): DiagramNode => ({ kind: "optional", child }),
  loop: (
    child: DiagramNode,
    zeroOrMore: boolean,
    opts?: { label?: string; separator?: DiagramNode },
  ): DiagramNode => ({
    kind: "loop",
    child,
    zeroOrMore,
    ...(opts?.label ? { label: opts.label } : {}),
    ...(opts?.separator ? { separator: opts.separator } : {}),
  }),
  terminal: (text: string): DiagramNode => ({ kind: "terminal", text }),
  nonterminal: (text: string): DiagramNode => ({ kind: "nonterminal", text }),
  special: (text: string): DiagramNode => ({ kind: "special", text }),
  exception: (text: string): DiagramNode => ({ kind: "exception", text }),
  skip: (): DiagramNode => ({ kind: "skip" }),
};
