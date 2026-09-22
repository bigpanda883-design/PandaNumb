// One-off audit: find light surfaces / dark text that never get a dark override.
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = "vite-project/src";
const DARK_FILES = [
  "vite-project/src/CSS/PublicDarkMode.css",
  "vite-project/src/CSS/dashboard/DarkMode.css",
];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === ".git" || entry === "node_modules") continue;
      walk(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

const files = walk(ROOT);

const LIGHT_RE =
  /(background(-color)?\s*:\s*)(#(?:fff|ffffff|f8fafc|f7f9fc|f9fafb|f1f5f9|ecfdf5|eff6ff|e0f2fe|edf2f7|eef2f7|f5f7fb|dceaff|e8f3ff)\b|white\b|rgba?\(\s*255\s*,\s*255\s*,\s*255)/i;
const DARK_TEXT_RE =
  /(^|;|\s)(color\s*:\s*)(#(?:0f172a|0d1727|0d1321|111827|172033|1a202c|1e293b|2d3748|334155|4a5568|64748b|94a3b8|8b95a7|cbd5e1)\b)/i;
const LIGHT_BORDER_RE =
  /(border(-top|-bottom|-right|-left)?(-color)?\s*:\s*[^;]*(#(?:e2e8f0|e5e7eb|edf0f5|f1f5f9|cbd5e1)\b))/i;

// Classes that a dark rule overrides *per property*.
function classesOf(selector) {
  return (selector.match(/\.[a-zA-Z][\w-]*/g) || []).filter(
    (c) => c !== ".dashboard-app",
  );
}

// Split a selector list on commas that are not nested inside ().
function splitSelectors(raw) {
  const out = [];
  let depth = 0;
  let current = "";
  for (const ch of raw) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) {
      out.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

const PROP_TESTS = {
  bg: [LIGHT_RE, /(background(-color)?\s*:)/i],
  color: [DARK_TEXT_RE, /(^|;|\s)(color\s*:)/i],
  border: [LIGHT_BORDER_RE, /(border(-[a-z]+)?(-color)?\s*:)/i],
};

const darkCovered = { bg: new Set(), color: new Set(), border: new Set() };
for (const f of DARK_FILES) {
  const css = readFileSync(f, "utf8");
  let m;
  const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
  while ((m = ruleRe.exec(css)) !== null) {
    const selectors = splitSelectors(m[1]);
    const body = m[2];
    for (const kind of ["bg", "color", "border"]) {
      if (!PROP_TESTS[kind][1].test(body)) continue;
      for (const sel of selectors) {
        // A state override does not cover the resting state.
        if (/:(hover|focus|focus-visible|focus-within|active|visited|disabled|checked)\b/.test(sel)) continue;
        for (const c of classesOf(sel)) darkCovered[kind].add(c);
      }
    }
  }
}

// Only report selectors that are actually rendered by JSX.
const jsxClasses = new Set();
for (const file of files) {
  if (!/\.jsx?$/.test(file)) continue;
  const src = readFileSync(file, "utf8");
  for (const m of src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\}|\{"([^"]*)"\})/g)) {
    const raw = m[1] || m[2] || m[3] || "";
    for (const token of raw.split(/[\s${}?:'"`,()[\]]+/)) {
      if (/^[a-zA-Z][\w-]*$/.test(token)) jsxClasses.add(`.${token}`);
    }
  }
}

const missing = [];
const seen = new Set();

for (const file of files) {
  if (!file.endsWith(".css")) continue;
  if (DARK_FILES.includes(file.replace(/\\/g, "/"))) continue;
  const css = readFileSync(file, "utf8");

  const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
  let match;
  while ((match = ruleRe.exec(css)) !== null) {
    const selector = match[1].trim().replace(/\s+/g, " ");
    const body = match[2];

    const kinds = [];
    if (LIGHT_RE.test(body)) kinds.push("bg");
    if (DARK_TEXT_RE.test(body)) kinds.push("color");
    if (LIGHT_BORDER_RE.test(body)) kinds.push("border");
    if (kinds.length === 0) continue;

    const classes = classesOf(selector);
    if (classes.length === 0) continue;

    // Skip rules that are never rendered.
    if (!classes.some((c) => jsxClasses.has(c))) continue;

    const uncoveredKinds = [];
    for (const kind of kinds) {
      const uncovered = classes.filter((c) => !darkCovered[kind].has(c));
      if (uncovered.length > 0) {
        uncoveredKinds.push(`${kind}:${uncovered.join("+")}`);
      }
    }
    if (uncoveredKinds.length === 0) continue;

    const key = `${relative(ROOT, file)} :: ${selector}`;
    if (seen.has(key)) continue;
    seen.add(key);
    missing.push({
      file: relative(ROOT, file),
      selector,
      kinds: uncoveredKinds.join(","),
    });
  }
}

const byFile = new Map();
for (const item of missing) {
  if (!byFile.has(item.file)) byFile.set(item.file, []);
  byFile.get(item.file).push(item);
}

const lines = [];
for (const [file, items] of byFile) {
  lines.push(`\n=== ${file} (${items.length}) ===`);
  for (const it of items) {
    lines.push(`  [${it.kinds}] ${it.selector}`);
  }
}
lines.push(`\nTOTAL uncovered light-surface rules: ${missing.length}`);
writeFileSync("theme-audit.txt", lines.join("\n"), "utf8");