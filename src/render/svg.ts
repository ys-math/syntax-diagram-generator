import { ARC, FONT_SIZE, type DiagramNode } from "../model/nodes";
import type { BoxStyle, DiagramBackend, Point } from "./backend";
import { drawDiagram } from "./draw";

const num = (n: number): string => {
  const r = Math.round(n * 100) / 100;
  return Object.is(r, -0) ? "0" : String(r);
};

const escapeXml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const dist = (a: Point, b: Point): number => Math.hypot(b.x - a.x, b.y - a.y);

/** Move `dist` units from `from` toward `to`. */
function toward(from: Point, to: Point, d: number): Point {
  const len = dist(from, to) || 1;
  return { x: from.x + ((to.x - from.x) * d) / len, y: from.y + ((to.y - from.y) * d) / len };
}

/** A poly-line path with rounded corners of radius `r`. */
function roundedPath(points: Point[], r: number): string {
  if (points.length < 2) return "";
  let d = `M ${num(points[0].x)} ${num(points[0].y)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    const next = points[i + 1];
    const rr = Math.min(r, dist(prev, cur) / 2, dist(cur, next) / 2);
    const a = toward(cur, prev, rr);
    const b = toward(cur, next, rr);
    d += ` L ${num(a.x)} ${num(a.y)} Q ${num(cur.x)} ${num(cur.y)} ${num(b.x)} ${num(b.y)}`;
  }
  const last = points[points.length - 1];
  d += ` L ${num(last.x)} ${num(last.y)}`;
  return d;
}

class SvgBackend implements DiagramBackend {
  parts: string[] = [];

  rail(points: Point[]): void {
    this.parts.push(`<path class="rail" d="${roundedPath(points, ARC)}"/>`);
  }

  box(x: number, y: number, w: number, h: number, style: BoxStyle, text: string): void {
    const rx = style === "terminal" ? h / 2 : 3;
    this.parts.push(
      `<rect class="${style}" x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}" rx="${num(rx)}"/>` +
        `<text class="lbl" x="${num(x + w / 2)}" y="${num(y + h / 2)}">${escapeXml(text)}</text>`,
    );
  }

  label(cx: number, cy: number, text: string): void {
    const w = text.length * 7.4 + 6;
    this.parts.push(
      `<rect class="count-bg" x="${num(cx - w / 2)}" y="${num(cy - 8)}" width="${num(w)}" height="16" rx="3"/>` +
        `<text class="count" x="${num(cx)}" y="${num(cy)}">${escapeXml(text)}</text>`,
    );
  }

  arrow(cx: number, cy: number, dir: "left" | "right"): void {
    const s = dir === "left" ? 1 : -1;
    const pts = `${num(cx + s * 4)},${num(cy - 4)} ${num(cx - s * 4)},${num(cy)} ${num(cx + s * 4)},${num(cy + 4)}`;
    this.parts.push(`<polygon class="arrow" points="${pts}"/>`);
  }
}

const STYLE = `
.rail { fill: none; stroke: #394656; stroke-width: 1.5; }
.arrow { fill: #394656; }
.terminal { fill: #eef3fb; stroke: #3a67a8; stroke-width: 1.5; }
.nonterminal { fill: #ffffff; stroke: #394656; stroke-width: 1.5; }
.special { fill: #fff6e6; stroke: #b8860b; stroke-width: 1.5; }
.exception { fill: #fdeceb; stroke: #b0413a; stroke-width: 1.5; }
.lbl { fill: #1b2430; font-family: 'SFMono-Regular','Consolas','Liberation Mono',monospace; font-size: ${FONT_SIZE}px; text-anchor: middle; dominant-baseline: central; }
.count-bg { fill: #ffffff; }
.count { fill: #6a7686; font-family: 'SFMono-Regular','Consolas',monospace; font-size: 11px; text-anchor: middle; dominant-baseline: central; }
`.trim();

/** Render a measured-or-unmeasured diagram node to a self-contained SVG string. */
export function renderSvg(node: DiagramNode): string {
  const backend = new SvgBackend();
  const { width, height } = drawDiagram(node, backend);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${num(width)} ${num(height)}" ` +
    `width="${num(width)}" height="${num(height)}" role="img">` +
    `<style>${STYLE}</style>` +
    backend.parts.join("") +
    `</svg>`
  );
}
