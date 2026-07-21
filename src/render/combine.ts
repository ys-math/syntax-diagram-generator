import type { RuleDiagram } from "../pipeline";

const dim = (svg: string, attr: "width" | "height"): number => {
  const m = svg.match(new RegExp(`${attr}="([\\d.]+)"`));
  return m ? Number(m[1]) : 0;
};

const escapeXml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const HEADING_H = 28;
const GAP = 18;
const MARGIN = 12;

/**
 * Stack every rule's diagram into one self-contained SVG (heading + nested
 * `<svg>` per rule), for a single "download all" file.
 */
export function combineSvg(rules: RuleDiagram[]): string {
  let y = MARGIN;
  let maxW = 0;
  const parts: string[] = [];

  for (const r of rules) {
    const w = dim(r.svg, "width");
    const h = dim(r.svg, "height");
    maxW = Math.max(maxW, w);
    parts.push(
      `<text x="${MARGIN}" y="${y + 18}" font-family="system-ui,sans-serif" font-size="15" font-weight="600" fill="#1b2430">${escapeXml(
        r.name,
      )}</text>`,
    );
    y += HEADING_H;
    // nest the rule's own <svg> by injecting x/y coordinates
    parts.push(r.svg.replace(/^<svg /, `<svg x="${MARGIN}" y="${y}" `));
    y += h + GAP;
  }

  const totalW = maxW + MARGIN * 2;
  const totalH = y + MARGIN;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW} ${totalH}" ` +
    `width="${totalW}" height="${totalH}">` +
    `<rect width="${totalW}" height="${totalH}" fill="#ffffff"/>` +
    parts.join("") +
    `</svg>`
  );
}
