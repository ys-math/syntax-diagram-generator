# Syntax Diagram Generator

Browser tool that turns an **EBNF grammar (ISO/IEC 14977)** into railroad
(syntax) diagrams, one per rule, and exports them to **SVG** or **TikZ**. Pure
client-side; no backend. Parser, layout, and renderers are written from scratch
(no third-party railroad library).

## Architecture

One pipeline, one measured diagram tree, multiple output backends:

```
input → parser → grammar rules → builder → diagram node → draw pass → backend (SVG | TikZ)
```

- `src/parser/` — tokenizer + recursive-descent parser → `ast.ts`; dialects via
  `getDialect(id)`. Errors are structured (`errors.ts`) with line/col + expected/found.
- `src/model/builder.ts` — turns a parsed rule into a diagram `node` (`nodes.ts`).
- `src/layout/layout.ts` — measures/positions the tree.
- `src/render/draw.ts` — single geometry pass; emits only the primitives in
  `backend.ts` (`rail`, `box`, `label`, `arrow`). New output format = new backend, no layout logic duplicated.
- `src/render/svg.ts`, `tikz.ts` — the two backends; `combine.ts` merges per-rule output.
- `src/pipeline.ts` — `generate(input, dialectId, options)`: entry point tying it together.
- `src/ui/app.ts` — live debounced UI wiring; `src/main.ts` boots it.

**Fit modes** (`RenderOptions.mode` in `pipeline.ts`): `shrink` (default, wraps
diagram in `\adjustbox` to fit the LaTeX page) or `wrap` (snakes wide sequences
across rows at `wrapWidthCm`).

## Commands

- `npm run dev` — Vite dev server
- `npm test` — Vitest (`tests/`, incl. render snapshots)
- `npm run build` — `tsc --noEmit` + Vite build
- `npm run samples` — regenerate `samples/samples.{tex,pdf}` (needs `latexmk`)

## Notes

- Exported diagrams always use a neutral light theme so they look right in any doc.
- Deploys to GitHub Pages on push to `main` (`.github/workflows/deploy.yml`).
