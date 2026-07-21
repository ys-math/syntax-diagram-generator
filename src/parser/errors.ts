/** A structured parse error carrying enough location detail for a useful UI banner. */
export class ParseError extends Error {
  /** 1-based line number where the error was detected. */
  readonly line: number;
  /** 1-based column number where the error was detected. */
  readonly col: number;
  /** Human description of what the parser expected at this point. */
  readonly expected: string;
  /** The token/text actually found (already truncated for display). */
  readonly found: string;

  constructor(line: number, col: number, expected: string, found: string) {
    super(`Line ${line}, col ${col}: expected ${expected} but found ${found}`);
    this.name = "ParseError";
    this.line = line;
    this.col = col;
    this.expected = expected;
    this.found = found;
  }
}
