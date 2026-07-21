/**
 * Regenerate the sample diagram SVGs embedded in README.md.
 *   npx vite-node scripts/gen-samples.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generate } from "../src/pipeline";

const outDir = resolve(dirname(fileURLToPath(import.meta.url)), "../docs/images");
mkdirSync(outDir, { recursive: true });

const PAD = 16;

/**
 * A bare rule SVG is transparent with dark rails, so it vanishes on GitHub's
 * dark README. Wrap it on a padded white card that reads in either theme.
 */
function onWhiteCard(svg: string): string {
  const w = Number(svg.match(/width="([\d.]+)"/)![1]);
  const h = Number(svg.match(/height="([\d.]+)"/)![1]);
  const cw = w + PAD * 2;
  const ch = h + PAD * 2;
  const inner = svg.replace(/^<svg [^>]*>/, "").replace(/<\/svg>$/, "");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cw} ${ch}" ` +
    `width="${cw}" height="${ch}" role="img">` +
    `<rect width="${cw}" height="${ch}" rx="8" fill="#ffffff"/>` +
    `<g transform="translate(${PAD},${PAD})">${inner}</g>` +
    `</svg>`
  );
}

/** Grammars chosen to show off the main EBNF constructs, one file per rule. */
const samples: Array<{ file: string; rule: string; grammar: string }> = [
  {
    file: "expression",
    rule: "expression",
    grammar: `expression = term, { ("+" | "-"), term };`,
  },
  {
    file: "factor",
    rule: "factor",
    grammar: `factor = number | "(", expression, ")";`,
  },
  {
    file: "signed-number",
    rule: "signed number",
    grammar: `signed number = [ "+" | "-" ], digit, { digit };`,
  },
];

for (const { file, rule, grammar } of samples) {
  const diagram = generate(grammar, "ebnf").find((d) => d.name === rule);
  if (!diagram) throw new Error(`rule not found: ${rule}`);
  writeFileSync(resolve(outDir, `${file}.svg`), onWhiteCard(diagram.svg) + "\n");
  console.log(`wrote docs/images/${file}.svg`);
}
