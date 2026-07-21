import { ParseError, dialects } from "../parser";
import { DEFAULT_OPTIONS, generate, type FitMode, type RuleDiagram } from "../pipeline";
import { combineSvg } from "../render/combine";
import { SAMPLE_GRAMMAR } from "./sample";

const DEBOUNCE_MS = 250;
const STORAGE_KEY = "sdg:grammar";
const THEME_KEY = "sdg:theme";
const MODE_KEY = "sdg:mode";
const WIDTH_KEY = "sdg:wrapWidthCm";

function $<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
}

let lastGood: RuleDiagram[] = [];

export function initApp(): void {
  const dialectSel = $<HTMLSelectElement>("dialect");
  const grammarEl = $<HTMLTextAreaElement>("grammar");
  const gutterEl = $<HTMLDivElement>("gutter");
  const diagramsEl = $<HTMLDivElement>("diagrams");
  const banner = $<HTMLDivElement>("error-banner");
  const errorText = $<HTMLSpanElement>("error-text");
  const modeSel = $<HTMLSelectElement>("fit-mode");
  const widthField = $<HTMLLabelElement>("wrap-width-field");
  const widthInput = $<HTMLInputElement>("wrap-width");

  // Dialect dropdown from the registry (EBNF-only today, more later).
  for (const d of dialects) {
    const opt = document.createElement("option");
    opt.value = d.id;
    opt.textContent = d.label;
    dialectSel.append(opt);
  }

  initTheme();
  $("theme-toggle").addEventListener("click", toggleTheme);

  grammarEl.value = localStorage.getItem(STORAGE_KEY) ?? SAMPLE_GRAMMAR;

  // VSCode-style line-number gutter, kept in sync with the textarea's content and scroll.
  let lineCount = 0;
  const updateGutter = () => {
    const n = grammarEl.value.split("\n").length;
    if (n === lineCount) return;
    lineCount = n;
    let s = "";
    for (let i = 1; i <= n; i++) s += `${i}\n`;
    gutterEl.textContent = s;
  };
  grammarEl.addEventListener("input", updateGutter);
  grammarEl.addEventListener("scroll", () => {
    gutterEl.scrollTop = grammarEl.scrollTop;
  });
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
      const rules = generate(grammarEl.value, dialectSel.value, {
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
  dialectSel.addEventListener("change", run);
  modeSel.addEventListener("change", () => {
    syncWidthField();
    run();
  });
  widthInput.addEventListener("input", schedule);
  $("error-dismiss").addEventListener("click", () => hideError(banner));
  $("sample-btn").addEventListener("click", () => {
    grammarEl.value = SAMPLE_GRAMMAR;
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
