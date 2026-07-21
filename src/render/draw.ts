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
// Vertical gap between snaked rows (holds the return sweep with breathing room).
const ROW_GAP = 24;

export interface Size {
  width: number;
  height: number;
}

/**
 * Measure `node`, then draw a complete rule diagram (start terminus → node →
 * end terminus) into `backend`. Returns the overall canvas size. Pure geometry:
 * every visual comes out through backend primitives.
 *
 * When `wrapWidth` > 0 and the root is a `seq` wider than that budget (in the
 * same pt units as the geometry), the sequence snakes across multiple rows
 * instead of running off to the right — see {@link drawWrappedSeq}.
 */
export function drawDiagram(node: DiagramNode, backend: DiagramBackend, wrapWidth = 0): Size {
  const box = layout(node);

  if (wrapWidth > 0 && node.kind === "seq") {
    const rows = packRows(node.children ?? [], wrapWidth);
    if (rows.length > 1) return drawWrappedSeq(rows, backend);
  }

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

/**
 * Greedily pack the top-level sequence's (already-measured) children into rows
 * that each fit within `wrapWidth`. A child wider than the budget lands alone on
 * its row and overflows it — we never break inside a child. Returns one row when
 * everything fits (caller then draws the normal single-line diagram).
 */
function packRows(kids: DiagramNode[], wrapWidth: number): DiagramNode[][] {
  const avail = wrapWidth - 2 * PAD;
  const rows: DiagramNode[][] = [];
  let cur: DiagramNode[] = [];
  let curW = 0;
  for (const k of kids) {
    const w = k.box!.width;
    if (cur.length > 0 && curW + H_SEQ + w > avail) {
      rows.push(cur);
      cur = [k];
      curW = w;
    } else {
      curW += (cur.length > 0 ? H_SEQ : 0) + w;
      cur.push(k);
    }
  }
  if (cur.length > 0) rows.push(cur);
  return rows;
}

/**
 * Draw a snaked sequence: rows flow left→right, and at each row's end the rail
 * turns down, sweeps back to the left margin, and drops into the next row (a
 * "carriage return"). Only the first row's left and the last row's right carry a
 * terminus; the rest are joined by connectors. Every content box stays natural
 * size and reads in grammar order.
 */
function drawWrappedSeq(rows: DiagramNode[][], backend: DiagramBackend): Size {
  const leftX = PAD; //          left spine: row-0 tick and every return drop
  const contentX = PAD + TERMINUS; // where each row's boxes begin

  // Measure each row from its children's boxes (endX = where its content stops).
  const info = rows.map((kids) => {
    let up = HALF;
    let down = HALF;
    let width = 0;
    kids.forEach((k, i) => {
      if (i > 0) width += H_SEQ;
      width += k.box!.width;
      up = Math.max(up, k.box!.up);
      down = Math.max(down, k.box!.down);
    });
    return { kids, up, down, endX: contentX + width };
  });

  // A shared right spine mirrors the left margin: every row runs out to the same
  // x (widest content + a terminus-width gap) before turning down or ending, so
  // the right edge is a clean vertical instead of ragged per-row turns.
  const rightX = Math.max(...info.map((r) => r.endX)) + TERMINUS;

  // Stack the rows vertically, ROW_GAP between one row's bottom and the next's top.
  const railY: number[] = [];
  let bottom = PAD;
  info.forEach((ri, i) => {
    const top = i === 0 ? PAD : bottom + ROW_GAP;
    railY[i] = top + ri.up;
    bottom = railY[i] + ri.down;
  });
  const height = bottom + PAD;

  info.forEach((ri, i) => {
    const y = railY[i];
    const first = i === 0;
    const last = i === info.length - 1;

    if (first) {
      tick(backend, leftX, y); // start terminus on the left spine
      backend.rail([p(leftX, y), p(contentX, y)]);
    }
    // Non-first rows: the previous row's connector already delivered the rail to contentX.

    let x = contentX;
    ri.kids.forEach((k, j) => {
      if (j > 0) {
        backend.rail([p(x, y), p(x + H_SEQ, y)]);
        x += H_SEQ;
      }
      drawNode(k, x, y, backend);
      x += k.box!.width;
    });

    if (last) {
      backend.rail([p(x, y), p(rightX, y)]); // run out to the right spine
      tick(backend, rightX, y); //             end terminus on the right spine
    } else {
      // Return connector: out to the right spine, down along the gap, left to the
      // left spine, down into the next row, then a lead-in to contentX — one path
      // so every corner rounds and both spines line up.
      const yNext = railY[i + 1];
      const yMid = (y + ri.down + (yNext - info[i + 1].up)) / 2;
      backend.rail([
        p(x, y),
        p(rightX, y),
        p(rightX, yMid),
        p(leftX, yMid),
        p(leftX, yNext),
        p(contentX, yNext),
      ]);
    }
  });

  return { width: rightX + PAD, height };
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
      const itemR = branchX + c.width;
      const rightEdge = x + box.width;
      const yTop = railY - c.up - V_SPACE;
      // Main line runs straight through the child (split so nothing shows behind the box).
      backend.rail([p(x, railY), p(branchX, railY)]);
      drawNode(child, branchX, railY, backend);
      backend.rail([p(itemR, railY), p(rightEdge, railY)]);
      // Bypass rides above, one continuous path — curves out with the flow, back in with it.
      backend.rail([
        p(x, railY),
        p(x + ARC, railY),
        p(x + ARC, yTop),
        p(rightEdge - ARC, yTop),
        p(rightEdge - ARC, railY),
        p(rightEdge, railY),
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

  // main branch on the entry rail (straight through)
  const main = kids[0];
  const mb = main.box!;
  backend.rail([p(x, railY), p(branchX, railY)]);
  drawNode(main, branchX, railY, backend);
  if (mb.width < innerWidth) backend.rail([p(branchX + mb.width, railY), p(branchEnd, railY)]);
  backend.rail([p(branchEnd, railY), p(rightEdge, railY)]);

  // remaining branches stacked below — each a continuous path (rail → arc down →
  // child → arc up → rail) so the divergence and convergence are rounded.
  let running = railY + mb.down;
  for (let i = 1; i < kids.length; i++) {
    const cb = kids[i].box!;
    running += V_SPACE;
    const yi = running + cb.up;
    running = yi + cb.down;
    backend.rail([p(x, railY), p(x + ARC, railY), p(x + ARC, yi), p(branchX, yi)]);
    drawNode(kids[i], branchX, yi, backend);
    if (cb.width < innerWidth) backend.rail([p(branchX + cb.width, yi), p(branchEnd, yi)]);
    backend.rail([
      p(branchEnd, yi),
      p(rightEdge - ARC, yi),
      p(rightEdge - ARC, railY),
      p(rightEdge, railY),
    ]);
  }
}

function drawLoop(node: DiagramNode, x: number, railY: number, backend: DiagramBackend): void {
  const box = node.box!;
  const child = node.child!;
  const c = child.box!;
  const sep = node.separator;
  const s = sep?.box;
  const inner = box.innerWidth ?? c.width;
  const rightEdge = x + box.width;
  const mid = (x + rightEdge) / 2;
  // Centre the child over the inner width (the loop or its separator may be wider).
  const childX = x + 2 * ARC + (inner - c.width) / 2;
  const childR = childX + c.width;

  // Child sits on the main line; the loop-back rides below, travelled right-to-left
  // (reversing direction is what reads as "repeat"): box → down → back → up → box.
  backend.rail([p(x, railY), p(childX, railY)]);
  drawNode(child, childX, railY, backend);
  backend.rail([p(childR, railY), p(rightEdge, railY)]);

  const yLoop = railY + c.down + V_SPACE + (s ? s.up : 0);
  // The loop leaves the box moving *forward*, curves down at the right edge, runs
  // right-to-left underneath, curves up at the left edge, and re-enters moving
  // *forward*. Risers sit at the outer edges (with a lead-in along the rail so the
  // corners round) — that keeps entry and exit tangent to the flow, with the only
  // direction reversal happening on the bottom leg, where the arrow lives.
  backend.rail([
    p(rightEdge - 2 * ARC, railY),
    p(rightEdge, railY),
    p(rightEdge, yLoop),
    p(x, yLoop),
    p(x, railY),
    p(x + 2 * ARC, railY),
  ]);

  if (sep && s) {
    // The separator token rides on the backward loop, centred under the child.
    const sepX = mid - s.width / 2;
    drawNode(sep, sepX, yLoop, backend);
    backend.arrow((x + ARC + sepX) / 2, yLoop, "left"); // arrow on the clear left leg
  } else {
    backend.arrow(mid, yLoop, "left");
  }

  if (node.zeroOrMore) {
    // `{ }` also allows *zero* passes: a bypass above, curving with the flow.
    const yTop = railY - c.up - V_SPACE;
    backend.rail([
      p(x, railY),
      p(x + ARC, railY),
      p(x + ARC, yTop),
      p(rightEdge - ARC, yTop),
      p(rightEdge - ARC, railY),
      p(rightEdge, railY),
    ]);
  }
  if (node.label) backend.label(mid, yLoop, node.label);
}
