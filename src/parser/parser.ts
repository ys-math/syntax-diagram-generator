import { ParseError } from "./errors";
import { tokenize, type Token, type TokenType } from "./tokenizer";
import type {
  Expression,
  Grammar,
  Rule,
} from "./ast";

/** Human-friendly description of a token for error messages. */
function describe(tok: Token): string {
  switch (tok.type) {
    case "eof":
      return "end of input";
    case "terminal":
      return `terminal "${tok.value}"`;
    case "special":
      return `special sequence "? ${tok.value} ?"`;
    case "identifier":
      return `identifier \`${tok.value}\``;
    case "integer":
      return `\`${tok.value}\``;
    default:
      return `\`${tok.value}\``;
  }
}

/** Tokens that can begin a syntactic primary. */
const PRIMARY_START: ReadonlySet<TokenType> = new Set<TokenType>([
  "lbracket",
  "lbrace",
  "lparen",
  "terminal",
  "identifier",
  "special",
]);

class Parser {
  private tokens: Token[];
  private pos = 0;
  private input: string;

  constructor(tokens: Token[], input: string) {
    this.tokens = tokens;
    this.input = input;
  }

  private peek(): Token {
    return this.tokens[this.pos];
  }

  private next(): Token {
    return this.tokens[this.pos++];
  }

  private at(type: TokenType): boolean {
    return this.peek().type === type;
  }

  private expect(type: TokenType, description: string): Token {
    const tok = this.peek();
    if (tok.type !== type) {
      throw new ParseError(tok.line, tok.col, description, describe(tok));
    }
    return this.next();
  }

  parseGrammar(): Grammar {
    const rules: Rule[] = [];
    while (!this.at("eof")) {
      rules.push(this.parseRule());
    }
    if (rules.length === 0) {
      const tok = this.peek();
      throw new ParseError(tok.line, tok.col, "at least one rule", "end of input");
    }
    return { rules };
  }

  private parseRule(): Rule {
    const name = this.expect("identifier", "a rule name");
    this.expect("def", "`=` after the rule name");
    const expr = this.parseDefinitionsList();
    const end = this.expect("semicolon", "`;` to end the rule");
    const source = this.input.slice(name.offset, end.offset + end.value.length);
    return { name: name.value, expr, line: name.line, source };
  }

  /** definitions list = single definition, { '|', single definition } */
  private parseDefinitionsList(): Expression {
    const alternatives: Expression[] = [this.parseSingleDefinition()];
    while (this.at("alt")) {
      this.next();
      alternatives.push(this.parseSingleDefinition());
    }
    return alternatives.length === 1
      ? alternatives[0]
      : { kind: "choice", alternatives };
  }

  /** single definition = syntactic term, { ',', syntactic term } */
  private parseSingleDefinition(): Expression {
    const first = this.parseTerm();
    if (first === null) {
      return { kind: "empty" }; // empty sequence (e.g. `a | ;`)
    }
    const items: Expression[] = [first];
    while (this.at("concat")) {
      this.next();
      const term = this.parseTerm();
      if (term === null) {
        const tok = this.peek();
        throw new ParseError(tok.line, tok.col, "a term after `,`", describe(tok));
      }
      items.push(term);
    }
    return items.length === 1 ? items[0] : { kind: "sequence", items };
  }

  /** syntactic term = syntactic factor, [ '-', syntactic exception ] */
  private parseTerm(): Expression | null {
    const base = this.parseFactor();
    if (base === null) {
      return null;
    }
    if (this.at("except")) {
      this.next();
      const except = this.parseFactor();
      if (except === null) {
        const tok = this.peek();
        throw new ParseError(tok.line, tok.col, "an expression after `-`", describe(tok));
      }
      return { kind: "exception", base, except };
    }
    return base;
  }

  /** syntactic factor = [ integer, '*' ], syntactic primary */
  private parseFactor(): Expression | null {
    if (this.at("integer")) {
      const count = this.next();
      this.expect("repeat", "`*` after a repetition count");
      const primary = this.parsePrimary();
      if (primary === null) {
        const tok = this.peek();
        throw new ParseError(tok.line, tok.col, "an expression after `*`", describe(tok));
      }
      return { kind: "repetitionFactor", count: Number(count.value), expr: primary };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Expression | null {
    const tok = this.peek();
    if (!PRIMARY_START.has(tok.type)) {
      return null;
    }
    switch (tok.type) {
      case "lbracket": {
        this.next();
        const inner = this.parseDefinitionsList();
        this.expect("rbracket", "`]` to close an optional group");
        return { kind: "optional", expr: inner };
      }
      case "lbrace": {
        this.next();
        const inner = this.parseDefinitionsList();
        this.expect("rbrace", "`}` to close a repetition group");
        return { kind: "repetition", expr: inner };
      }
      case "lparen": {
        this.next();
        const inner = this.parseDefinitionsList();
        this.expect("rparen", "`)` to close a group");
        return inner; // grouping is transparent in the AST
      }
      case "terminal":
        this.next();
        return { kind: "terminal", value: tok.value };
      case "identifier":
        this.next();
        return { kind: "nonterminal", name: tok.value };
      case "special":
        this.next();
        return { kind: "special", text: tok.value };
      default:
        return null;
    }
  }
}

/** Parse ISO/IEC 14977 EBNF source into a {@link Grammar}. Throws {@link ParseError}. */
export function parseEbnf(input: string): Grammar {
  return new Parser(tokenize(input), input).parseGrammar();
}
