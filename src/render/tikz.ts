import { ARC, type DiagramNode } from "../model/nodes";
import type { BoxStyle, DiagramBackend, Point } from "./backend";
import { drawDiagram } from "./draw";

const num = (n: number): string => {
  const r = Math.round(n * 100) / 100;
  return Object.is(r, -0) ? "0" : String(r);
};

/**
 * Escape text for LaTeX node contents. Also maps the two typographic glyphs the
 * builder emits (× and −) to math so the snippet compiles under pdflatex.
 * Arbitrary non-ASCII terminals still require xelatex/lualatex (noted in README).
 */
function latexEscape(s: string): string {
  return s
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/([&%$#_{}])/g, "\\$1")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}")
    .replace(/×/g, "$\\times$")
    .replace(/−/g, "$-$");
}

// Named colors, emitted as `\definecolor` with the snippet so it stays
// self-contained (needs only \usepackage{tikz} and \usepackage{xcolor}).
const COLORS: Record<string, [number, number, number]> = {
  sdgLine: [57, 70, 86],
  sdgTermFill: [238, 243, 251],
  sdgTermLine: [58, 103, 168],
  sdgSpecFill: [255, 246, 230],
  sdgSpecLine: [184, 134, 11],
  sdgExcFill: [253, 236, 235],
  sdgExcLine: [176, 65, 58],
  sdgLabel: [106, 118, 134],
};

const fills: Record<BoxStyle, string> = {
  terminal: "sdgTermFill",
  nonterminal: "white",
  special: "sdgSpecFill",
  exception: "sdgExcFill",
};
const strokes: Record<BoxStyle, string> = {
  terminal: "sdgTermLine",
  nonterminal: "sdgLine",
  special: "sdgSpecLine",
  exception: "sdgExcLine",
};

type Op =
  | { t: "rail"; pts: Point[] }
  | { t: "box"; x: number; y: number; w: number; h: number; style: BoxStyle; text: string }
  | { t: "label"; cx: number; cy: number; text: string }
  | { t: "arrow"; cx: number; cy: number; dir: "left" | "right" };

class TikzBackend implements DiagramBackend {
  ops: Op[] = [];
  rail(pts: Point[]): void {
    this.ops.push({ t: "rail", pts });
  }
  box(x: number, y: number, w: number, h: number, style: BoxStyle, text: string): void {
    this.ops.push({ t: "box", x, y, w, h, style, text });
  }
  label(cx: number, cy: number, text: string): void {
    this.ops.push({ t: "label", cx, cy, text });
  }
  arrow(cx: number, cy: number, dir: "left" | "right"): void {
    this.ops.push({ t: "arrow", cx, cy, dir });
  }

  /** Emit TikZ, flipping y so the diagram is upright (TikZ y grows upward). */
  serialize(height: number): string {
    const fy = (y: number) => num(height - y);
    const pt = (p: Point) => `(${num(p.x)},${fy(p.y)})`;
    const lines: string[] = [];
    for (const op of this.ops) {
      if (op.t === "rail") {
        const path = op.pts.map(pt).join(" -- ");
        lines.push(`  \\draw[line width=1.2pt, draw=sdgLine, rounded corners=${ARC}pt] ${path};`);
      } else if (op.t === "box") {
        const radius = op.style === "terminal" ? op.h / 2 : 3;
        lines.push(
          `  \\draw[line width=1.2pt, draw=${strokes[op.style]}, fill=${fills[op.style]}, rounded corners=${num(radius)}pt] ` +
            `(${num(op.x)},${fy(op.y + op.h)}) rectangle (${num(op.x + op.w)},${fy(op.y)});`,
        );
        lines.push(
          `  \\node[font=\\ttfamily\\small] at (${num(op.x + op.w / 2)},${fy(op.y + op.h / 2)}) {${latexEscape(op.text)}};`,
        );
      } else if (op.t === "label") {
        lines.push(
          `  \\node[fill=white, inner sep=1pt, font=\\ttfamily\\footnotesize, text=sdgLabel] ` +
            `at (${num(op.cx)},${fy(op.cy)}) {${latexEscape(op.text)}};`,
        );
      } else {
        const s = op.dir === "left" ? 1 : -1;
        const a = `(${num(op.cx + s * 4)},${fy(op.cy - 4)})`;
        const b = `(${num(op.cx - s * 4)},${fy(op.cy)})`;
        const c = `(${num(op.cx + s * 4)},${fy(op.cy + 4)})`;
        lines.push(`  \\fill[sdgLine] ${a} -- ${b} -- ${c} -- cycle;`);
      }
    }
    return lines.join("\n");
  }
}

function colorDefs(): string {
  return Object.entries(COLORS)
    .map(([name, [r, g, b]]) => `\\definecolor{${name}}{RGB}{${r},${g},${b}}`)
    .join("\n");
}

/** Render a diagram node to a self-contained TikZ snippet (needs `tikz` + `xcolor`). */
export function renderTikz(node: DiagramNode): string {
  const backend = new TikzBackend();
  const { height } = drawDiagram(node, backend);
  return (
    "% Requires \\usepackage{tikz} and \\usepackage{xcolor}\n" +
    colorDefs() +
    "\n\\begin{tikzpicture}[x=1pt, y=1pt]\n" +
    backend.serialize(height) +
    "\n\\end{tikzpicture}"
  );
}
