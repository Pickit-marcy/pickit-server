// server/index.js
import "dotenv/config";
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import OpenAI from "openai";
import { LearnMemory } from "./learnMemory.js";
import pickitStylistRouter from "./routes/pickitStylist.js";


const app = express();

// =====================
// LEARN MEMORY (RAM CACHE)
// =====================
const learnMem = new LearnMemory({
  learnPath: "learn-data/learn.jsonl",
  maxExamples: 60,
  maxFewShot: 8,
  refreshMs: 15000,
});
learnMem.start();

// =====================
// MIDDLEWARES
// =====================
app.use(cors());

// ✅ IMPORTANT: base64 payload can be big
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

// ✅ If body too large or JSON parse issues, respond cleanly (instead of silent {} / weird errors)
app.use((err, req, res, next) => {
  if (!err) return next();

  // Payload too large (body-parser / express)
  const msg = String(err?.message || "");
  if (err?.type === "entity.too.large" || msg.toLowerCase().includes("entity too large")) {
    return res.status(413).json({
      ok: false,
      error: "PayloadTooLarge",
      hint:
        "L'immagine base64 è troppo grande. Riduci dimensione/qualità (es. width 480, compress 0.5) oppure aumenta limit nel server.",
    });
  }

  // Invalid JSON
  if (msg.toLowerCase().includes("unexpected token") || msg.toLowerCase().includes("json")) {
    return res.status(400).json({
      ok: false,
      error: "InvalidJSON",
      hint: "Il body non è JSON valido oppure è stato troncato.",
    });
  }

  return res.status(500).json({ ok: false, error: msg });
});

const PORT = process.env.PORT || 8787;

// =====================
// OPENAI
// =====================
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

// =====================
// LABELS (DEVONO combaciare con Screen4)
// =====================
const MAIN_CATS = ["parte_superiore", "parte_inferiore", "calzature", "extra_accessori"];

const SUB_BY_MAIN = {
  parte_superiore: [
    "Canottiera",
    "Camicia",
    "Cardigan",
    "Felpa",
    "Giaccone",
    "Giacca",
    "Giubbino",
    "Gilet",
    "Maglia maniche lunghe",
    "Maglione",
    "Piumino",
    "Polo",
    "Pullover",
    "T-shirt",
    "Top",
    "Tuta",
  ],
  parte_inferiore: [
    "Bermuda",
    "Gonna lunga",
    "Gonna midi",
    "Gonna mini",
    "Jeans",
    "Leggings",
    "Pantaloncini",
    "Pantaloni",
    "Tuta",
  ],
  calzature: [
    "Ciabatte",
    "Décolleté",
    "Mocassini",
    "Sandali",
    "Scarpe eleganti",
    "Sneakers",
    "Stivaletti",
    "Stivali",
    "Zeppe",
  ],
  extra_accessori: [
    "Borsa",
    "Braccialetto",
    "Bretelle",
    "Calzini",
    "Cappello",
    "Cintura",
    "Collana",
    "Cravatta",
    "Guanti",
    "Occhiali",
    "Orecchini",
    "Orologio",
    "Papillon",
    "Sciarpa",
    "Zaino",
  ],
};

const SEASONS = ["Inverno", "Primavera", "Estate", "Autunno", "4 Stagioni"];

const COLOR_OPTIONS = [
  "Nero",
  "Bianco",
  "Grigio",
  "Beige",
  "Bordeaux",
  "Marrone",
  "Blu",
  "Azzurro",
  "Verde",
  "Giallo",
  "Arancione",
  "Rosso",
  "Rosa",
  "Viola",
  "Fantasia",
];

// =====================
// LEARN STORAGE (JSONL)
// =====================
const LEARN_DIR = path.join(process.cwd(), "learn-data");
const LEARN_FILE = path.join(LEARN_DIR, "learn.jsonl");

function ensureLearnFile() {
  if (!fs.existsSync(LEARN_DIR)) fs.mkdirSync(LEARN_DIR, { recursive: true });
  if (!fs.existsSync(LEARN_FILE)) fs.writeFileSync(LEARN_FILE, "", "utf8");
}
ensureLearnFile();

// =====================
// HELPERS
// =====================
function uniq(arr = []) {
  return Array.from(new Set(arr.filter(Boolean)));
}

function normColorList(list) {
  return uniq(Array.isArray(list) ? list : [])
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean)
    .filter((x) => COLOR_OPTIONS.includes(x));
}

function pickBestSub(mainCategory, subCategory) {
  if (!MAIN_CATS.includes(mainCategory)) return "";
  const subs = SUB_BY_MAIN[mainCategory] || [];
  if (subs.includes(subCategory)) return subCategory;
  return "";
}

function safeResult(raw = {}) {
  const mainCategory = MAIN_CATS.includes(raw.mainCategory) ? raw.mainCategory : "";
  const subCategory = pickBestSub(mainCategory, raw.subCategory || "");
  const season = SEASONS.includes(raw.season) ? raw.season : "";
  const colors = normColorList(raw.colors);
  const isPatterned = typeof raw.isPatterned === "boolean" ? raw.isPatterned : undefined;

  return {
    mainCategory,
    subCategory,
    season,
    colors,
    ...(typeof isPatterned === "boolean" ? { isPatterned } : {}),
  };
}

function tryParseJsonLoose(text) {
  try {
    return JSON.parse(text);
  } catch {}
  const m = text.match(/\{[\s\S]*\}/);
  if (m?.[0]) {
    try {
      return JSON.parse(m[0]);
    } catch {}
  }
  return null;
}

// =====================
// CORE: ANALYZE WITH OPENAI + LEARN MEMORY
// =====================
async function analyzeWithOpenAI(imageBase64Jpg, hints = {}) {
  let prompt = `
Sei un classificatore di capi d'abbigliamento per un'app chiamata PICKIT.
Devi rispondere SOLO con JSON valido (niente testo extra).

Vincoli:
- mainCategory deve essere UNO tra: ${JSON.stringify(MAIN_CATS)}
- subCategory deve essere coerente con mainCategory e UNO tra:
  - parte_superiore: ${JSON.stringify(SUB_BY_MAIN.parte_superiore)}
  - parte_inferiore: ${JSON.stringify(SUB_BY_MAIN.parte_inferiore)}
  - calzature: ${JSON.stringify(SUB_BY_MAIN.calzature)}
  - extra_accessori: ${JSON.stringify(SUB_BY_MAIN.extra_accessori)}
- season deve essere UNO tra: ${JSON.stringify(SEASONS)}
- colors: array di 1..3 elementi scelti SOLO da: ${JSON.stringify(COLOR_OPTIONS)}
- isPatterned: true/false (se fantasia/righe/loghi evidenti -> true)

Regole pratiche:
- Camicia vs T-shirt: se vedi colletto e/o bottoni frontali -> Camicia.
- Canottiera: spalline sottili o senza maniche molto evidente.
- Maglia maniche lunghe: se sembra una T-shirt ma con maniche lunghe evidenti -> "Maglia maniche lunghe".
- Se il capo è a fantasia/texture evidente -> includi "Fantasia" nei colors e isPatterned=true.

Ora analizza l'immagine e restituisci JSON nel formato:
{
  "mainCategory": "...",
  "subCategory": "...",
  "season": "...",
  "colors": ["..."],
  "isPatterned": false
}

Hints (puoi usarli come preferenze leggere, non obbligatorie):
${JSON.stringify(hints || {})}
`.trim();

  if (hints?.__learnMemory?.examples?.length) {
    prompt += `

=========================
USER CORRECTION EXAMPLES
=========================
These are REAL past corrections made by the user. Use them as guidance to avoid repeating the same mistakes.
${JSON.stringify(hints.__learnMemory, null, 2)}
`;
  }

  const resp = await client.chat.completions.create({
    model: MODEL,
    temperature: 0.2,
    messages: [
      { role: "system", content: "Rispondi solo con JSON valido." },
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          {
            type: "image_url",
            image_url: { url: `data:image/jpeg;base64,${imageBase64Jpg}` },
          },
        ],
      },
    ],
  });

  const text = resp?.choices?.[0]?.message?.content || "";
  const parsed = tryParseJsonLoose(text);

  if (!parsed) {
    throw new Error("OpenAI ha risposto ma non sono riuscito a parsare JSON.");
  }

  return safeResult(parsed);
}

// =====================
// ROUTES
// =====================
app.get("/health", (req, res) => {
  res.json({ ok: true, service: "pickit-server", port: PORT });
});

app.get("/learn/stats", (req, res) => {
  res.json({ ok: true, stats: learnMem.getStats() });
});

app.post("/learn", (req, res) => {
  try {
    ensureLearnFile();
    const payload = req.body || {};
    const receivedAt = new Date().toISOString();
    const line = JSON.stringify({ ...payload, receivedAt });
    fs.appendFileSync(LEARN_FILE, line + "\n", "utf8");
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/analyze", async (req, res) => {
  try {
    const { image_base64, hints } = req.body || {};

    if (!image_base64 || typeof image_base64 !== "string") {
      return res.status(400).json({ ok: false, error: "Missing image_base64" });
    }
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ ok: false, error: "Missing OPENAI_API_KEY in .env" });
    }

    const fewShot = learnMem.buildFewShot(hints || {});
    const out = await analyzeWithOpenAI(image_base64, {
      ...(hints || {}),
      __learnMemory: fewShot,
    });

    return res.json({
      ok: true,
      _learnStats: learnMem.getStats(),
      ...out,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.use("/stylist", pickitStylistRouter);



function cleanStylistReply(reply) {
  if (!reply || typeof reply !== "object") return reply;

  let msg = String(reply.message || "");

  // ❌ parole vietate
  const bannedWords = [
    "cardigan",
    "giacca di jeans",
    "giacca denim",
    "blazer",
    "aggiungere una giacca",
    "abbinare una giacca",
  ];

  for (const w of bannedWords) {
    if (msg.toLowerCase().includes(w)) {
      // 🔥 sostituzione intelligente
      msg = msg.replace(
        new RegExp(w, "gi"),
        "semplificare il look"
      );
    }
  }

  // 👉 fallback forte: se parla di aggiungere roba → blocca
  if (msg.toLowerCase().includes("aggiungere")) {
    msg =
      "Il look è già completo, ma risulta un po’ carico. Meglio semplificare un elemento per renderlo più pulito e coerente.";
  }

  return {
    ...reply,
    message: msg,
  };
}



// =====================
// START
// =====================
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ pickit-server running: http://0.0.0.0:${PORT}`);
  console.log(`✅ health:      http://0.0.0.0:${PORT}/health`);
  console.log(`✅ learn:       http://0.0.0.0:${PORT}/learn  -> learn-data/learn.jsonl`);
  console.log(`✅ learn stats: http://0.0.0.0:${PORT}/learn/stats`);
  console.log(`✅ analyze:     http://0.0.0.0:${PORT}/analyze`);
});