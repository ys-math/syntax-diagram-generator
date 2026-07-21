/**
 * Primitives every renderer must implement. The shared draw pass ({@link drawDiagram})
 * computes all geometry and calls only these, so a new output format is just a new
 * backend — no layout logic to duplicate.
 */

export interface Point {
  x: number;
  y: number;
}

export type BoxStyle = "terminal" | "nonterminal" | "special" | "exception";

export interface DiagramBackend {
  /** A connected poly-line (the rails). Corners are rounded by the backend. */
  rail(points: Point[]): void;
  /** A labelled box. `y` is the top edge; text is centred. */
  box(x: number, y: number, w: number, h: number, style: BoxStyle, text: string): void;
  /** Small centred text sitting on a rail (e.g. a loop's `n×` count). */
  label(cx: number, cy: number, text: string): void;
  /** A small direction arrowhead centred at (cx, cy). */
  arrow(cx: number, cy: number, dir: "left" | "right"): void;
}
