import { layout } from "../layout/layout";
import {
  ARC,
  BOX_H,
  H_SEQ,
  PAD,
  TERMINUS,
  V_SPACE,
  type DiagramNode,
} from "../model/nodes";
import type { BoxStyle, DiagramBackend, Point } from "./backend";

const HALF = BOX_H / 2;

export interface Size {
  width: number;
  height: number;
}

/**
 * Measure `node`, then draw a complete rule diagram (start terminus → node →
 * end terminus) into `backend`. Returns the overall canvas size. Pure geometry:
 * every visual comes out through backend primitives.
 */
export function drawDiagram(node: DiagramNode, backend: DiagramBackend): Size {
  const box = layout(node);
  const railY = PAD + box.up;
  const height = PAD * 2 + box.up + box.down;

  let x = PAD;
  tick(backend, x, railY); // start terminus
  backend.rail([p(x, railY), p(x + TERMINUS, railY)]);
  x += TERMINUS;

  drawNode(node, x, railY, backend);
  x += box.width;

  backend.rail([p(x, railY), p(x + TERMINUS, railY)]);
  tick(backend, x + TERMINUS, railY); // end terminus
  x += TERMINUS;

  return { width: x + PAD, height };
}

const p = (x: number, y: number): Point => ({ x, y });

function tick(backend: DiagramBackend, x: number, y: number): void {
  backend.rail([p(x, y - 7), p(x, y + 7)]);
}

const boxStyles: Partial<Record<DiagramNode["kind"], BoxStyle>> = {
  terminal: "terminal",
  nonterminal: "nonterminal",
  special: "special",
  exception: "exception",
};

/** Draw `node` so its rail enters at (x, railY) on the left and exits on the right. */
function drawNode(node: DiagramNode, x: number, railY: number, backend: DiagramBackend): void {
  const box = node.box!;
  switch (node.kind) {
    case "terminal":
    case "nonterminal":
    case "special":
    case "exception":
      backend.box(x, railY - HALF, box.width, BOX_H, boxStyles[node.kind]!, node.text ?? "");
      return;

    case "skip":
      backend.rail([p(x, railY), p(x + box.width, railY)]);
      return;

    case "seq": {
      let cursor = x;
      (node.children ?? []).forEach((child, i) => {
        if (i > 0) {
          backend.rail([p(cursor, railY), p(cursor + H_SEQ, railY)]);
          cursor += H_SEQ;
        }
        drawNode(child, cursor, railY, backend);
        cursor += child.box!.width;
      });
      return;
    }

    case "choice": {
      drawChoice(node, x, railY, backend);
      return;
    }

    case "optional": {
      const child = node.child!;
      const c = child.box!;
      const branchX = x + 2 * ARC;
      const rightEdge = x + box.width;
      // main line: lead-in, child, lead-out (never drawn through the child)
      backend.rail([p(x, railY), p(branchX, railY)]);
      drawNode(child, branchX, railY, backend);
      backend.rail([p(branchX + c.width, railY), p(rightEdge, railY)]);
      // bypass line above
      const yby = railY - (c.up + V_SPACE);
      backend.rail([
        p(x + ARC, railY),
        p(x + ARC, yby),
        p(rightEdge - ARC, yby),
        p(rightEdge - ARC, railY),
      ]);
      return;
    }

    case "loop": {
      drawLoop(node, x, railY, backend);
      return;
    }
  }
}

function drawChoice(node: DiagramNode, x: number, railY: number, backend: DiagramBackend): void {
  const box = node.box!;
  const kids = node.children ?? [];
  const innerWidth = box.innerWidth ?? 0;
  const branchX = x + 2 * ARC;
  const rightEdge = x + box.width;
  const branchEnd = branchX + innerWidth;

  // entry stub shared by every branch's left connector
  backend.rail([p(x, railY), p(x + ARC, railY)]);

  // main branch on the entry rail
  const main = kids[0];
  const mb = main.box!;
  backend.rail([p(x + ARC, railY), p(branchX, railY)]);
  drawNode(main, branchX, railY, backend);
  if (mb.width < innerWidth) backend.rail([p(branchX + mb.width, railY), p(branchEnd, railY)]);
  backend.rail([p(branchEnd, railY), p(rightEdge, railY)]);

  // remaining branches stacked below
  let running = railY + mb.down;
  for (let i = 1; i < kids.length; i++) {
    const cb = kids[i].box!;
    running += V_SPACE;
    const yi = running + cb.up;
    running = yi + cb.down;
    backend.rail([p(x + ARC, railY), p(x + ARC, yi), p(branchX, yi)]);
    drawNode(kids[i], branchX, yi, backend);
    if (cb.width < innerWidth) backend.rail([p(branchX + cb.width, yi), p(branchEnd, yi)]);
    backend.rail([p(branchEnd, yi), p(rightEdge - ARC, yi), p(rightEdge - ARC, railY), p(rightEdge, railY)]);
  }
}

function drawLoop(node: DiagramNode, x: number, railY: number, backend: DiagramBackend): void {
  const box = node.box!;
  const child = node.child!;
  const c = child.box!;
  const branchX = x + 2 * ARC;
  const rightEdge = x + box.width;

  backend.rail([p(x, railY), p(branchX, railY)]);
  drawNode(child, branchX, railY, backend);
  backend.rail([p(branchX + c.width, railY), p(rightEdge, railY)]);

  // return line below (travelled right-to-left)
  const yret = railY + c.down + V_SPACE + (node.label ? HALF : 0);
  backend.rail([
    p(rightEdge - ARC, railY),
    p(rightEdge - ARC, yret),
    p(x + ARC, yret),
    p(x + ARC, railY),
  ]);
  backend.arrow((x + rightEdge) / 2, yret, "left");
  if (node.label) backend.label((x + rightEdge) / 2, yret - HALF + 2, node.label);

  // bypass above for zero-or-more
  if (node.zeroOrMore) {
    const yby = railY - (c.up + V_SPACE);
    backend.rail([
      p(x + ARC, railY),
      p(x + ARC, yby),
      p(rightEdge - ARC, yby),
      p(rightEdge - ARC, railY),
    ]);
  }
}
