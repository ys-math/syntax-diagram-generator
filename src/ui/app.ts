import { ParseError } from "../parser";
import { DEFAULT_OPTIONS, generate, type FitMode, type RuleDiagram } from "../pipeline";
import { combineSvg } from "../render/combine";
import {
  findByTitle,
  loadLibrary,
  loadSort,
  removeGrammar,
  saveSort,
  sortLibrary,
  upsertGrammar,
  type LibrarySort,
  type SavedGrammar,
} from "./library";
import { SAMPLE_GRAMMAR } from "./sample";

const DEBOUNCE_MS = 250;
const STORAGE_KEY = "sdg:grammar";
const THEME_KEY = "sdg:theme";
const MODE_KEY = "sdg:mode";
const WIDTH_KEY = "sdg:wrapWidthCm";
const EDITOR_WIDTH_KEY = "sdg:editorWidth";

function $<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
}

let lastGood: RuleDiagram[] = [];

export function initApp(): void {
  const grammarEl = $<HTMLTextAreaElement>("grammar");
  const gutterEl = $<HTMLDivElement>("gutter");
  const diagramsEl = $<HTMLDivElement>("diagrams");
  const banner = $<HTMLDivElement>("error-banner");
  const errorText = $<HTMLSpanElement>("error-text");
  const modeSel = $<HTMLSelectElement>("fit-mode");
  const widthField = $<HTMLLabelElement>("wrap-width-field");
  const widthInput = $<HTMLInputElement>("wrap-width");

  initTheme();
  $("theme-toggle").addEventListener("click", toggleTheme);
  initResizer();

  grammarEl.value = localStorage.getItem(STORAGE_KEY) ?? SAMPLE_GRAMMAR;

  // VSCode-style line-number gutter, kept in sync with the textarea's content and
  // scroll. Because the textarea wraps, one logical line can occupy several visual
  // rows; an off-screen mirror measures each line's wrapped height so the numbers
  // stay aligned (blank continuation rows fill the extra height).
  const mirror = document.createElement("div");
  mirror.setAttribute("aria-hidden", "true");
  Object.assign(mirror.style, {
    position: "absolute",
    top: "0",
    left: "-9999px",
    visibility: "hidden",
    height: "auto",
    boxSizing: "border-box",
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.append(mirror);

  const updateGutter = () => {
    const lines = grammarEl.value.split("\n");
    const cs = getComputedStyle(grammarEl);
    // Match the textarea's text box so the mirror wraps at the same column.
    mirror.style.font = cs.font;
    mirror.style.lineHeight = cs.lineHeight;
    mirror.style.letterSpacing = cs.letterSpacing;
    mirror.style.tabSize = cs.tabSize;
    mirror.style.paddingLeft = cs.paddingLeft;
    mirror.style.paddingRight = cs.paddingRight;
    mirror.style.width = `${grammarEl.clientWidth}px`;

    mirror.replaceChildren();
    const lineEls = lines.map((ln) => {
      const d = document.createElement("div");
      d.textContent = ln.length ? ln : " "; // an empty line is still one row
      mirror.append(d);
      return d;
    });

    const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.55;
    let s = "";
    for (let i = 0; i < lines.length; i++) {
      const wrapped = Math.max(1, Math.round(lineEls[i].offsetHeight / lh));
      s += `${i + 1}\n${"\n".repeat(wrapped - 1)}`;
    }
    gutterEl.textContent = s;
  };
  grammarEl.addEventListener("input", updateGutter);
  grammarEl.addEventListener("scroll", () => {
    gutterEl.scrollTop = grammarEl.scrollTop;
  });
  // Re-measure when the pane is resized (splitter drag, window resize): the wrap
  // column changes even though the text does not.
  new ResizeObserver(() => updateGutter()).observe(grammarEl);
  updateGutter();

  // Restore persisted fit settings; the cm field only matters (and only shows) in wrap mode.
  modeSel.value = localStorage.getItem(MODE_KEY) ?? DEFAULT_OPTIONS.mode;
  widthInput.value = localStorage.getItem(WIDTH_KEY) ?? String(DEFAULT_OPTIONS.wrapWidthCm);
  const syncWidthField = () => {
    widthField.hidden = modeSel.value !== "wrap";
  };
  syncWidthField();

  const run = () => {
    localStorage.setItem(STORAGE_KEY, grammarEl.value);
    localStorage.setItem(MODE_KEY, modeSel.value);
    localStorage.setItem(WIDTH_KEY, widthInput.value);
    try {
      const wrapWidthCm = Number(widthInput.value) || DEFAULT_OPTIONS.wrapWidthCm;
      const rules = generate(grammarEl.value, {
        mode: modeSel.value as FitMode,
        wrapWidthCm,
      });
      lastGood = rules;
      hideError(banner);
      renderRules(diagramsEl, rules);
    } catch (e) {
      if (e instanceof ParseError) {
        showError(banner, errorText, e.message);
      } else {
        showError(banner, errorText, (e as Error).message);
      }
      // keep last-good diagrams on screen
    }
  };

  let timer: number | undefined;
  const schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(run, DEBOUNCE_MS);
  };

  grammarEl.addEventListener("input", schedule);
  modeSel.addEventListener("change", () => {
    syncWidthField();
    run();
  });
  widthInput.addEventListener("input", schedule);
  $("error-dismiss").addEventListener("click", () => hideError(banner));

  initLibrary(grammarEl, () => {
    updateGutter();
    run();
  });

  $("download-all").addEventListener("click", () => {
    if (lastGood.length === 0) return;
    downloadText("diagrams.svg", combineSvg(lastGood), "image/svg+xml");
  });
  $("copy-all-tikz").addEventListener("click", async () => {
    if (lastGood.length === 0) return;
    const all = lastGood.map((r) => r.tikz).join("\n\n");
    await copy(all, "All TikZ copied");
  });

  run();
}

/**
 * The in-browser grammar library: a "Save" modal and a "Saved ▾" popover list.
 * `loadIntoEditor` sets the editor's value then refreshes the gutter + diagrams.
 */
function initLibrary(grammarEl: HTMLTextAreaElement, refresh: () => void): void {
  let library = loadLibrary();
  let sort: LibrarySort = loadSort();

  const saveBtn = $<HTMLButtonElement>("save-btn");
  const savedBtn = $<HTMLButtonElement>("saved-btn");
  const popover = $<HTMLDivElement>("library-popover");
  const listEl = $<HTMLUListElement>("library-list");
  const sortRecent = $<HTMLButtonElement>("sort-recent");
  const sortAlpha = $<HTMLButtonElement>("sort-alpha");

  const modal = $<HTMLDialogElement>("save-modal");
  const form = $<HTMLFormElement>("save-form");
  const titleInput = $<HTMLInputElement>("save-title");
  const descInput = $<HTMLTextAreaElement>("save-description");
  const hint = $<HTMLParagraphElement>("save-hint");

  const loadInto = (entry: SavedGrammar): void => {
    grammarEl.value = entry.grammar;
    refresh();
  };

  const renderList = (): void => {
    sortRecent.classList.toggle("active", sort === "recent");
    sortAlpha.classList.toggle("active", sort === "alpha");
    listEl.replaceChildren();

    if (library.length === 0) {
      const empty = document.createElement("li");
      empty.className = "library-empty";
      empty.textContent = "No saved grammars yet.";
      listEl.append(empty);
      return;
    }

    for (const entry of sortLibrary(library, sort)) {
      const li = document.createElement("li");
      li.className = "library-item";

      const load = document.createElement("button");
      load.type = "button";
      load.className = "library-load";
      const title = document.createElement("span");
      title.className = "library-item-title";
      title.textContent = entry.title;
      load.append(title);
      if (entry.description) {
        const desc = document.createElement("span");
        desc.className = "library-item-desc";
        desc.textContent = entry.description;
        load.append(desc);
        load.title = entry.description;
      }
      load.addEventListener("click", () => {
        loadInto(entry);
        closePopover();
      });

      const del = document.createElement("button");
      del.type = "button";
      del.className = "library-delete";
      del.setAttribute("aria-label", `Delete ${entry.title}`);
      del.title = "Delete";
      del.textContent = "✕";
      del.addEventListener("click", () => {
        if (!confirm(`Delete “${entry.title}”?`)) return;
        library = removeGrammar(library, entry.title);
        renderList();
        toast("Deleted");
      });

      li.append(load, del);
      listEl.append(li);
    }
  };

  // Popover open/close.
  const openPopover = (): void => {
    renderList();
    popover.hidden = false;
    savedBtn.setAttribute("aria-expanded", "true");
    document.addEventListener("pointerdown", onOutside, true);
    document.addEventListener("keydown", onEsc);
  };
  function closePopover(): void {
    popover.hidden = true;
    savedBtn.setAttribute("aria-expanded", "false");
    document.removeEventListener("pointerdown", onOutside, true);
    document.removeEventListener("keydown", onEsc);
  }
  const onOutside = (e: PointerEvent): void => {
    const t = e.target as Node;
    if (!popover.contains(t) && t !== savedBtn) closePopover();
  };
  const onEsc = (e: KeyboardEvent): void => {
    if (e.key === "Escape") closePopover();
  };
  savedBtn.addEventListener("click", () => {
    if (popover.hidden) openPopover();
    else closePopover();
  });

  const setSort = (next: LibrarySort): void => {
    sort = next;
    saveSort(next);
    renderList();
  };
  sortRecent.addEventListener("click", () => setSort("recent"));
  sortAlpha.addEventListener("click", () => setSort("alpha"));

  // Save modal. The form opens blank; typing a title that already exists warns
  // in-place that saving will overwrite it (title is the entry's identity).
  const openModal = (): void => {
    closePopover();
    form.reset();
    updateHint();
    modal.showModal();
    titleInput.focus();
  };
  const updateHint = (): void => {
    const existing = findByTitle(library, titleInput.value.trim());
    if (existing) {
      hint.textContent = `A grammar titled “${existing.title}” exists — saving overwrites it.`;
      hint.hidden = false;
    } else {
      hint.hidden = true;
    }
  };
  titleInput.addEventListener("input", updateHint);

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const title = titleInput.value.trim();
    if (!title) return;
    library = upsertGrammar(library, {
      title,
      description: descInput.value.trim(),
      grammar: grammarEl.value,
    });
    modal.close();
    toast("Saved");
  });
  $("save-cancel").addEventListener("click", () => modal.close());

  saveBtn.addEventListener("click", openModal);
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      openModal();
    }
  });
}

function renderRules(container: HTMLElement, rules: RuleDiagram[]): void {
  container.replaceChildren();
  if (rules.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No rules yet — start typing a grammar.";
    container.append(empty);
    return;
  }
  for (const rule of rules) {
    container.append(ruleCard(rule));
  }
}

function ruleCard(rule: RuleDiagram): HTMLElement {
  const card = document.createElement("div");
  card.className = "rule-card";

  const head = document.createElement("div");
  head.className = "rule-head";
  const name = document.createElement("span");
  name.className = "rule-name";
  name.textContent = rule.name;
  const actions = document.createElement("div");
  actions.className = "rule-actions";

  const dl = button("Download SVG", () =>
    downloadText(`${safeName(rule.name)}.svg`, rule.svg, "image/svg+xml"),
  );
  const copySvg = button("Copy SVG", () => copy(rule.svg, "SVG copied"));
  const tikzToggle = button("TikZ", () => {
    panel.hidden = !panel.hidden;
  });
  actions.append(dl, copySvg, tikzToggle);
  head.append(name, actions);

  const diagram = document.createElement("div");
  diagram.className = "rule-diagram";
  diagram.innerHTML = rule.svg; // our own escaped, self-contained SVG

  const panel = document.createElement("div");
  panel.className = "tikz-panel";
  panel.hidden = true;
  const pre = document.createElement("pre");
  pre.textContent = rule.tikz;
  const copyTikz = button("Copy TikZ", () => copy(rule.tikz, "TikZ copied"));
  copyTikz.classList.add("small");
  const tikzHead = document.createElement("div");
  tikzHead.className = "rule-head";
  const tikzLabel = document.createElement("span");
  tikzLabel.className = "rule-name";
  tikzLabel.textContent = "TikZ";
  tikzHead.append(tikzLabel, copyTikz);
  panel.append(tikzHead, pre);

  card.append(head, diagram, panel);
  return card;
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "ghost small";
  b.textContent = label;
  b.addEventListener("click", onClick);
  return b;
}

function showError(banner: HTMLElement, text: HTMLElement, msg: string): void {
  text.textContent = msg;
  banner.hidden = false;
}

function hideError(banner: HTMLElement): void {
  banner.hidden = true;
}

function safeName(name: string): string {
  return name.replace(/[^\w.-]+/g, "_") || "rule";
}

function downloadText(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function copy(text: string, message: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast(message);
  } catch {
    toast("Copy failed");
  }
}

let toastEl: HTMLDivElement | undefined;
let toastTimer: number | undefined;
function toast(message: string): void {
  if (!toastEl) {
    toastEl = document.createElement("div");
    toastEl.className = "toast";
    document.body.append(toastEl);
  }
  toastEl.textContent = message;
  toastEl.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl?.classList.remove("show"), 1400);
}

// Draggable vertical split between the editor and diagrams panes. The chosen
// width is stored (in px) as the grid's first column via --editor-w.
function initResizer(): void {
  const workspace = document.querySelector<HTMLElement>(".workspace");
  const resizer = $<HTMLDivElement>("resizer");
  if (!workspace) return;

  const MIN_EDITOR = 240; // px; also leaves room for the output pane
  const MIN_OUTPUT = 320;

  const clamp = (px: number): number => {
    const max = workspace.clientWidth - MIN_OUTPUT;
    return Math.max(MIN_EDITOR, Math.min(px, Math.max(MIN_EDITOR, max)));
  };
  const apply = (px: number): void => {
    workspace.style.setProperty("--editor-w", `${px}px`);
  };
  const persist = (): void => {
    const w = workspace.style.getPropertyValue("--editor-w");
    if (w) localStorage.setItem(EDITOR_WIDTH_KEY, w);
  };
  const currentWidth = (): number =>
    parseFloat(workspace.style.getPropertyValue("--editor-w")) ||
    (workspace.querySelector<HTMLElement>(".editor-pane")?.clientWidth ?? MIN_EDITOR);

  const saved = localStorage.getItem(EDITOR_WIDTH_KEY);
  if (saved) apply(clamp(parseFloat(saved)));

  let dragging = false;
  resizer.addEventListener("pointerdown", (e) => {
    dragging = true;
    resizer.classList.add("dragging");
    resizer.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  resizer.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    apply(clamp(e.clientX - workspace.getBoundingClientRect().left));
  });
  const endDrag = (e: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    resizer.classList.remove("dragging");
    resizer.releasePointerCapture(e.pointerId);
    persist();
  };
  resizer.addEventListener("pointerup", endDrag);
  resizer.addEventListener("pointercancel", endDrag);

  // Keyboard resize + double-click to reset the split.
  resizer.addEventListener("keydown", (e) => {
    const step = e.shiftKey ? 40 : 12;
    if (e.key === "ArrowLeft") apply(clamp(currentWidth() - step));
    else if (e.key === "ArrowRight") apply(clamp(currentWidth() + step));
    else return;
    e.preventDefault();
    persist();
  });
  resizer.addEventListener("dblclick", () => {
    workspace.style.removeProperty("--editor-w");
    localStorage.removeItem(EDITOR_WIDTH_KEY);
  });
}

function initTheme(): void {
  const saved = localStorage.getItem(THEME_KEY);
  const dark = saved ? saved === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

function toggleTheme(): void {
  const dark = document.documentElement.dataset.theme !== "dark";
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
}
