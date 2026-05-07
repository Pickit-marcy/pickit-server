// server/learnMemory.js
import fs from "fs";
import path from "path";

const MAIN_CATS = ["parte_superiore", "parte_inferiore", "calzature", "extra_accessori"];

function safeStr(x) {
  return typeof x === "string" ? x.trim() : "";
}
function safeArr(x) {
  return Array.isArray(x) ? x.filter((v) => typeof v === "string" && v.trim()).map((v) => v.trim()) : [];
}
function normColors(list) {
  // ordina + unique per confronto
  const s = new Set(safeArr(list));
  return Array.from(s).sort((a, b) => a.localeCompare(b));
}
function sameColors(a, b) {
  return JSON.stringify(normColors(a)) === JSON.stringify(normColors(b));
}
function isValidMain(x) {
  return MAIN_CATS.includes(x);
}

function parseJsonlLines(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const out = [];
  for (const line of lines) {
    try {
      out.push(JSON.parse(line));
    } catch {}
  }
  return out;
}

function hasCorrections(ev) {
  const ai = ev?.ai || {};
  const user = ev?.user || {};
  const difMain = safeStr(ai.mainCategory) !== safeStr(user.mainCategory);
  const difSub = safeStr(ai.subCategory) !== safeStr(user.subCategory);
  const difSeason = safeStr(ai.season) !== safeStr(user.season);
  const difColors = !sameColors(ai.colors, user.colors);
  return difMain || difSub || difSeason || difColors;
}

function buildKey(ev) {
  // chiave per deduplicare esempi simili
  const ai = ev?.ai || {};
  const user = ev?.user || {};
  const o = safeStr(ev?.originalUri) || safeStr(ev?.uri) || "";
  return [
    o.slice(-40),
    safeStr(ai.mainCategory),
    safeStr(ai.subCategory),
    safeStr(ai.season),
    normColors(ai.colors).join("|"),
    "=>",
    safeStr(user.mainCategory),
    safeStr(user.subCategory),
    safeStr(user.season),
    normColors(user.colors).join("|"),
  ].join(" ");
}

function scoreExample(ev) {
  // punteggio: esempi con cambio categoria/subCategory valgono di più
  const ai = ev?.ai || {};
  const user = ev?.user || {};

  let s = 0;

  if (safeStr(ai.mainCategory) !== safeStr(user.mainCategory)) s += 6;
  if (safeStr(ai.subCategory) !== safeStr(user.subCategory)) s += 5;
  if (safeStr(ai.season) !== safeStr(user.season)) s += 2;
  if (!sameColors(ai.colors, user.colors)) s += 3;

  // piccoli bonus se dati "puliti"
  if (isValidMain(safeStr(user.mainCategory))) s += 1;
  if (safeArr(user.colors).length) s += 1;

  // preferisci esempi recenti: user event ha receivedAt spesso
  const t = Date.parse(ev?.receivedAt || ev?.createdAt || "");
  if (!Number.isNaN(t)) {
    const ageHours = (Date.now() - t) / (1000 * 60 * 60);
    if (ageHours < 48) s += 2;
    else if (ageHours < 168) s += 1;
  }

  return s;
}

function toFewShot(ev) {
  const ai = ev?.ai || {};
  const user = ev?.user || {};

  // Manteniamo testo minimale: serve solo a “orientare” il modello
  return {
    when_ai_predicted: {
      mainCategory: safeStr(ai.mainCategory),
      subCategory: safeStr(ai.subCategory),
      season: safeStr(ai.season),
      colors: normColors(ai.colors),
    },
    user_corrected_to: {
      mainCategory: safeStr(user.mainCategory),
      subCategory: safeStr(user.subCategory),
      season: safeStr(user.season),
      colors: normColors(user.colors),
    },
  };
}

export class LearnMemory {
  constructor(opts = {}) {
    this.learnPath =
      opts.learnPath ||
      path.join(process.cwd(), "learn-data", "learn.jsonl");

    this.maxExamples = opts.maxExamples ?? 60; // in RAM
    this.maxFewShot = opts.maxFewShot ?? 8; // nel prompt
    this.refreshMs = opts.refreshMs ?? 15000;

    this._cache = [];
    this._lastMtimeMs = 0;
    this._timer = null;
  }

  start() {
    // prima load + polling leggero
    this.refresh().catch(() => {});
    this._timer = setInterval(() => this.refresh().catch(() => {}), this.refreshMs);
  }

  stop() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
  }

  getStats() {
    return {
      learnPath: this.learnPath,
      cachedExamples: this._cache.length,
      maxExamples: this.maxExamples,
      maxFewShot: this.maxFewShot,
      lastMtimeMs: this._lastMtimeMs,
    };
  }

  async refresh() {
    let st;
    try {
      st = fs.statSync(this.learnPath);
    } catch {
      // file non esiste ancora
      this._cache = [];
      this._lastMtimeMs = 0;
      return;
    }

    if (st.mtimeMs <= this._lastMtimeMs && this._cache.length) return;

    const text = fs.readFileSync(this.learnPath, "utf8");
    const events = parseJsonlLines(text);

    // tieni solo quelli utili
    const useful = events
      .filter((e) => (e?.event === "create_save" || e?.event === "edit_save") && hasCorrections(e))
      .map((e) => ({ e, key: buildKey(e), score: scoreExample(e) }));

    // dedup: prendi il migliore per key
    const bestByKey = new Map();
    for (const x of useful) {
      const prev = bestByKey.get(x.key);
      if (!prev || x.score > prev.score) bestByKey.set(x.key, x);
    }

    // ordina per score desc e prendi maxExamples
    const sorted = Array.from(bestByKey.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, this.maxExamples)
      .map((x) => x.e);

    this._cache = sorted;
    this._lastMtimeMs = st.mtimeMs;
  }

  buildFewShot(hints = {}) {
    // selezione: se hints contiene mainCategory/season ecc, potremmo filtrare in futuro.
    // per ora: prendiamo i migliori e basta.
    const pick = this._cache.slice(0, this.maxFewShot).map(toFewShot);

    return {
      instruction:
        "Use these real user corrections as guidance. Prefer consistent mapping and avoid repeating the same mistake.",
      examples: pick,
    };
  }
}
