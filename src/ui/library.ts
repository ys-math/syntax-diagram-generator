import { SAMPLE_GRAMMAR } from "./sample";

/** One saved grammar in the in-browser library. Keyed by its (unique) title. */
export interface SavedGrammar {
  title: string;
  description: string;
  grammar: string;
  /** Epoch ms of the last save; powers the "Recent" sort. */
  savedAt: number;
}

export type LibrarySort = "recent" | "alpha";

const LIBRARY_KEY = "sdg:library";
const SORT_KEY = "sdg:librarySort";

/**
 * Grammars seeded as ordinary (deletable) entries on first run only: a small
 * arithmetic sample and EBNF's own grammar written in EBNF. Both share
 * `savedAt: 0`; the stable sort preserves this order in the "Recent" view.
 */
const SEED_LIBRARY: SavedGrammar[] = [
  {
    title: "Sample — Arithmetic (EBNF)",
    description: "A small arithmetic expression grammar showing off most EBNF constructs.",
    grammar: SAMPLE_GRAMMAR,
  },
  {
    title: "EBNF described in EBNF",
    description: "EBNF's own grammar expressed in EBNF (after ISO/IEC 14977).",
    grammar: `(* EBNF described in EBNF (after ISO/IEC 14977) *)

grammar = { rule };

rule = identifier, "=", definitions list, ";";

definitions list = single definition, { "|", single definition };

single definition = term, { ",", term };

term = factor, [ "-", factor ];

factor = [ integer, "*" ], primary;

primary = optional sequence
        | repeated sequence
        | grouped sequence
        | identifier
        | terminal string
        | special sequence;

optional sequence = "[", definitions list, "]";

repeated sequence = "{", definitions list, "}";

grouped sequence = "(", definitions list, ")";

terminal string = '"', character, { character }, '"'
                | "'", character, { character }, "'";

special sequence = "?", { character }, "?";

identifier = letter, { letter | digit | " " };

integer = digit, { digit };

letter = "a" | "b" | "c" | "d" | "e" | "f" | "g" | "h" | "i"
       | "j" | "k" | "l" | "m" | "n" | "o" | "p" | "q" | "r"
       | "s" | "t" | "u" | "v" | "w" | "x" | "y" | "z"
       | "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I"
       | "J" | "K" | "L" | "M" | "N" | "O" | "P" | "Q" | "R"
       | "S" | "T" | "U" | "V" | "W" | "X" | "Y" | "Z";
`,
  },
].map((e) => ({ ...e, savedAt: 0 }));

/**
 * Read the library. On the very first run (`sdg:library` absent) we seed the
 * sample and persist it, so deleting the sample later actually sticks. Corrupt
 * JSON fails safe to an empty library rather than crashing the app.
 */
export function loadLibrary(): SavedGrammar[] {
  const raw = localStorage.getItem(LIBRARY_KEY);
  if (raw === null) {
    const seeded = SEED_LIBRARY.map((e) => ({ ...e }));
    saveLibrary(seeded);
    return seeded;
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isEntry);
  } catch {
    return [];
  }
}

export function saveLibrary(entries: SavedGrammar[]): void {
  localStorage.setItem(LIBRARY_KEY, JSON.stringify(entries));
}

/** Insert or overwrite (by title) an entry, returning the updated library. */
export function upsertGrammar(
  entries: SavedGrammar[],
  entry: Omit<SavedGrammar, "savedAt">,
): SavedGrammar[] {
  const next = entries.filter((e) => e.title !== entry.title);
  next.push({ ...entry, savedAt: Date.now() });
  saveLibrary(next);
  return next;
}

/** Remove the entry with the given title, returning the updated library. */
export function removeGrammar(entries: SavedGrammar[], title: string): SavedGrammar[] {
  const next = entries.filter((e) => e.title !== title);
  saveLibrary(next);
  return next;
}

export function findByTitle(entries: SavedGrammar[], title: string): SavedGrammar | undefined {
  return entries.find((e) => e.title === title);
}

/** A copy of `entries` ordered for display. */
export function sortLibrary(entries: SavedGrammar[], sort: LibrarySort): SavedGrammar[] {
  const copy = [...entries];
  if (sort === "alpha") {
    copy.sort((a, b) => a.title.localeCompare(b.title));
  } else {
    copy.sort((a, b) => b.savedAt - a.savedAt);
  }
  return copy;
}

export function loadSort(): LibrarySort {
  return localStorage.getItem(SORT_KEY) === "alpha" ? "alpha" : "recent";
}

export function saveSort(sort: LibrarySort): void {
  localStorage.setItem(SORT_KEY, sort);
}

function isEntry(v: unknown): v is SavedGrammar {
  if (typeof v !== "object" || v === null) return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.title === "string" &&
    typeof e.description === "string" &&
    typeof e.grammar === "string" &&
    typeof e.savedAt === "number"
  );
}
