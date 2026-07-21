import {
  ARC,
  ARROW_CLEAR,
  BOX_H,
  H_SEQ,
  LABEL_CLEAR,
  V_SPACE,
  measureText,
  type Box,
  type DiagramNode,
} from "../model/nodes";

const HALF = BOX_H / 2;

/**
 * Annotate every node in the tree with a {@link Box} (width + up/down extents
 * from the horizontal rail). Pure measurement — no coordinates yet; the draw
 * pass positions nodes using these boxes.
 *
 * The single-line assumption lives only in `seq`; the rest of the engine is
 * wrap-agnostic, so adding line-wrapping later is a localized change here.
 */
export function layout(node: DiagramNode): Box {
  const box = measure(node);
  node.box = box;
  return box;
}

function measure(node: DiagramNode): Box {
  switch (node.kind) {
    case "terminal":
    case "nonterminal":
    case "special":
    case "exception":
      return { width: measureText(node.text ?? ""), up: HALF, down: HALF };

    case "skip":
      return { width: H_SEQ * 2, up: HALF, down: HALF };

    case "seq": {
      const kids = node.children ?? [];
      if (kids.length === 0) return { width: H_SEQ * 2, up: HALF, down: HALF };
      let width = 0;
      let up = 0;
      let down = 0;
      kids.forEach((k, i) => {
        const b = layout(k);
        width += b.width + (i > 0 ? H_SEQ : 0);
        up = Math.max(up, b.up);
        down = Math.max(down, b.down);
      });
      return { width, up, down };
    }

    case "choice": {
      const kids = node.children ?? [];
      const boxes = kids.map(layout);
      const innerWidth = Math.max(...boxes.map((b) => b.width), 0);
      // First branch sits on the entry rail; the rest stack below it.
      const up = boxes[0].up;
      let down = boxes[0].down;
      for (let i = 1; i < boxes.length; i++) {
        down += V_SPACE + boxes[i].up + boxes[i].down;
      }
      return { width: innerWidth + 4 * ARC, up, down, innerWidth };
    }

    case "optional": {
      const b = layout(node.child!);
      // Child sits on the rail; the bypass arc rides *above* it.
      return {
        width: b.width + 4 * ARC,
        up: b.up + V_SPACE,
        down: b.down,
        innerWidth: b.width,
      };
    }

    case "loop": {
      const b = layout(node.child!);
      const sep = node.separator ? layout(node.separator) : null;
      const innerWidth = Math.max(b.width, sep?.width ?? 0);
      // The backward loop rides V_SPACE below the child; whatever sits on it
      // (a separator token, a count label, or just the arrowhead) needs headroom.
      const loopExtra = sep
        ? V_SPACE + sep.up + sep.down
        : V_SPACE + (node.label ? LABEL_CLEAR : ARROW_CLEAR);
      return {
        width: innerWidth + 4 * ARC,
        // The forward bypass (zero-or-more only) rides V_SPACE above the child.
        up: node.zeroOrMore ? b.up + V_SPACE : b.up,
        down: b.down + loopExtra,
        innerWidth,
      };
    }
  }
}
