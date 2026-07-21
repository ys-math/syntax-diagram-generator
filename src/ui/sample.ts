/** A friendly default grammar that shows off most EBNF constructs. */
export const SAMPLE_GRAMMAR = `(* A small arithmetic grammar (ISO/IEC 14977 EBNF) *)

expression = term, { ("+" | "-"), term };

term = factor, { ("*" | "/"), factor };

factor = number
       | "(", expression, ")";

number = digit, { digit };

digit = "0" | "1" | "2" | "3" | "4"
      | "5" | "6" | "7" | "8" | "9";
`;
