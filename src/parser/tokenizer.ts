import { ParseError } from "./errors";

export type TokenType =
  | "def" //          =
  | "semicolon" //    ;
  | "concat" //       ,
  | "alt" //          |  /  !
  | "except" //       -
  | "repeat" //       *
  | "lparen" //       (
  | "rparen" //       )
  | "lbracket" //     [
  | "rbracket" //     ]
  | "lbrace" //       {
  | "rbrace" //       }
  | "terminal" //     "…" or '…'
  | "special" //      ? … ?
  | "integer" //      123
  | "identifier" //   meta identifier (may contain internal spaces per ISO)
  | "eof";

export interface Token {
  type: TokenType;
  /** Semantic value: terminal/special inner text, identifier name, integer digits. */
  value: string;
  line: number; // 1-based
  col: number; // 1-based
}

const LETTER = /[A-Za-z]/;
const DIGIT = /[0-9]/;
const IDENT_CHAR = /[A-Za-z0-9_]/;

/**
 * ISO/IEC 14977 tokenizer.
 *
 * Notable spec details handled here: `(* … *)` comments, `? … ?` special
 * sequences, terminal strings in either quote, and meta identifiers that may
 * contain internal spaces (collapsed to single spaces, trimmed).
 */
export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;
  let line = 1;
  let col = 1;

  const peek = (o = 0) => input[pos + o];

  const advance = (): string => {
    const ch = input[pos++];
    if (ch === "\n") {
      line++;
      col = 1;
    } else {
      col++;
    }
    return ch;
  };

  const push = (type: TokenType, value: string, l: number, c: number) => {
    tokens.push({ type, value, line: l, col: c });
  };

  while (pos < input.length) {
    const ch = peek();

    // Whitespace
    if (ch === " " || ch === "\t" || ch === "\r" || ch === "\n") {
      advance();
      continue;
    }

    const startLine = line;
    const startCol = col;

    // Comment: (* … *)  (may be unterminated → error)
    if (ch === "(" && peek(1) === "*") {
      advance();
      advance();
      let closed = false;
      while (pos < input.length) {
        if (peek() === "*" && peek(1) === ")") {
          advance();
          advance();
          closed = true;
          break;
        }
        advance();
      }
      if (!closed) {
        throw new ParseError(startLine, startCol, "closing `*)` for comment", "end of input");
      }
      continue;
    }

    // Special sequence: ? … ?
    if (ch === "?") {
      advance();
      let text = "";
      let closed = false;
      while (pos < input.length) {
        if (peek() === "?") {
          advance();
          closed = true;
          break;
        }
        text += advance();
      }
      if (!closed) {
        throw new ParseError(startLine, startCol, "closing `?` for special sequence", "end of input");
      }
      push("special", text.trim(), startLine, startCol);
      continue;
    }

    // Terminal string: "…" or '…'
    if (ch === '"' || ch === "'") {
      const quote = advance();
      let text = "";
      let closed = false;
      while (pos < input.length) {
        const c = peek();
        if (c === quote) {
          advance();
          closed = true;
          break;
        }
        if (c === "\n") {
          break; // strings do not span lines in ISO
        }
        text += advance();
      }
      if (!closed) {
        throw new ParseError(startLine, startCol, `closing ${quote} for terminal string`, "end of line");
      }
      push("terminal", text, startLine, startCol);
      continue;
    }

    // Integer
    if (DIGIT.test(ch)) {
      let digits = "";
      while (pos < input.length && DIGIT.test(peek())) {
        digits += advance();
      }
      push("integer", digits, startLine, startCol);
      continue;
    }

    // Meta identifier: letter, then letters/digits/underscores, with internal
    // single spaces allowed between word characters (collapsed).
    if (LETTER.test(ch)) {
      let name = advance();
      for (;;) {
        const c = peek();
        if (c !== undefined && IDENT_CHAR.test(c)) {
          name += advance();
          continue;
        }
        // Allow a run of spaces/tabs only if it is followed by another word char.
        if (c === " " || c === "\t") {
          let look = 1;
          while (peek(look) === " " || peek(look) === "\t") look++;
          const after = peek(look);
          if (after !== undefined && IDENT_CHAR.test(after)) {
            while (peek() === " " || peek() === "\t") advance();
            name += " ";
            continue;
          }
        }
        break;
      }
      push("identifier", name, startLine, startCol);
      continue;
    }

    // Single-character symbols
    const symbols: Record<string, TokenType> = {
      "=": "def",
      ";": "semicolon",
      ".": "semicolon", // ISO permits '.' as an alternative terminator symbol
      ",": "concat",
      "|": "alt",
      "/": "alt",
      "!": "alt",
      "-": "except",
      "*": "repeat",
      "(": "lparen",
      ")": "rparen",
      "[": "lbracket",
      "]": "rbracket",
      "{": "lbrace",
      "}": "rbrace",
    };
    const sym = symbols[ch];
    if (sym) {
      advance();
      push(sym, ch, startLine, startCol);
      continue;
    }

    throw new ParseError(startLine, startCol, "a valid EBNF token", `\`${ch}\``);
  }

  push("eof", "", line, col);
  return tokens;
}
