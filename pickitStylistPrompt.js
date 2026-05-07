function safeStr(v) {
  return String(v || "").trim();
}

function normMain(v) {
  const s = safeStr(v).toLowerCase();

  if (
    s === "parte_superiore" ||
    s === "parte superiore" ||
    s.includes("superiore")
  ) {
    return "parte_superiore";
  }

  if (
    s === "parte_inferiore" ||
    s === "parte inferiore" ||
    s.includes("inferiore")
  ) {
    return "parte_inferiore";
  }

  if (s === "calzature" || s.includes("scar")) {
    return "calzature";
  }

  if (
    s === "extra_accessori" ||
    s === "extra accessori" ||
    s.includes("accessori")
  ) {
    return "extra_accessori";
  }

  return s;
}

function getSub(it) {
  return safeStr(
    it?.subCat ||
      it?.subCategory ||
      it?.ai?.subCat ||
      it?.ai?.subCategory ||
      "Capo"
  );
}

function getColors(it) {
  const arr = Array.isArray(it?.colors)
    ? it.colors
    : Array.isArray(it?.colors3)
    ? it.colors3
    : [];

  return arr.map((x) => safeStr(x)).filter(Boolean);
}

function getLayerRole(it) {
  return safeStr(it?._layerRole || it?.ai?.layerRole || "");
}

function formatItemLine(it) {
  const main = normMain(
    it?.mainCat || it?.mainCategory || it?.ai?.mainCat || it?.ai?.mainCategory
  );
  const sub = getSub(it);
  const colors = getColors(it);
  const role = getLayerRole(it);

  const chunks = [sub];

  if (role) chunks.push(`layer:${role}`);
  if (colors.length) chunks.push(`colori:${colors.join(", ")}`);
  if (main) chunks.push(`main:${main}`);

  return `- ${chunks.join(" | ")}`;
}

function formatOutfit(outfit) {
  const arr = Array.isArray(outfit) ? outfit : [];
  if (!arr.length) return "Nessun outfit disponibile.";
  return arr.map(formatItemLine).join("\n");
}

function formatCandidateOutfits(candidates) {
  const arr = Array.isArray(candidates) ? candidates : [];
  if (!arr.length) return "Nessuna variante disponibile.";

  return arr
    .map((c, idx) => {
      const label = safeStr(c?.label || `Outfit ${idx + 1}`);
      const outfit = Array.isArray(c?.outfit) ? c.outfit : [];
      return `### ${label}\n${formatOutfit(outfit)}`;
    })
    .join("\n\n");
}

function formatMissingSlots(missingSlots) {
  const arr = Array.isArray(missingSlots) ? missingSlots : [];
  if (!arr.length) return "Nessuno.";

  return arr
    .map((x) => {
      const slot = safeStr(x?.slot || x?.label || "slot");
      const suggestion = Array.isArray(x?.suggestion)
        ? x.suggestion.join(", ")
        : safeStr(x?.suggestion || "");
      return suggestion ? `- ${slot}: ${suggestion}` : `- ${slot}`;
    })
    .join("\n");
}

function formatUserProfile(userProfile) {
  if (!userProfile || typeof userProfile !== "object") return "Non disponibile.";

  const rows = Object.entries(userProfile)
    .filter(([, value]) => safeStr(value))
    .map(([key, value]) => `- ${key}: ${safeStr(value)}`);

  return rows.length ? rows.join("\n") : "Non disponibile.";
}

function buildStylistSystemPrompt() {
  return `
Sei Pickit Stylist AI.
Non sei un giudice del look: sei la stylist di Pickit che sceglie come vestire l’utente.

Compito:
- scegliere il miglior outfit tra le opzioni disponibili
- spiegare perché hai scelto proprio quello
- valorizzare il look scelto
- proporre solo micro-miglioramenti coerenti
- segnalare cosa manca se un capo o extra utile non è presente

Regole obbligatorie:
- Parla solo di outfit, stile, apparenza e contesto.
- Non parlare mai di medicina, finanza, legge o temi fuori moda/abbigliamento.
- Parla in italiano.
- Sii concreta, breve, utile.
- Non essere un chatbot generico.
- Non contraddire Pickit: l’outfit scelto va trattato come valido.
- Non dire che il look è sbagliato o brutto.
- Se il look è migliorabile, dillo come variante o rifinitura.
- Non proporre cardigan in nessun caso.
- Non aggiungere layer o giacche se l’outfit è già completo e il problema non lo richiede.
- Se il look è già visivamente carico, suggerisci di semplificare un elemento, non di aggiungere altro.
- Se mancano capi o extra, puoi evidenziarlo in ottica pratica e shopping.
- Ragiona in base a occasione, temperatura, vibe, guardaroba e missing slots.

Devi rispondere SEMPRE in JSON valido con questa struttura:

{
  "chosenIndex": 0,
  "message": "Ho pensato di vestirti così perché ...",
  "actions": [
    { "type": "improve", "label": "Più elegante" },
    { "type": "lighter", "label": "Più pulito" },
    { "type": "swap_shoes", "label": "Cambia scarpe" }
  ],
  "focus": {
    "highlight": "punto forte principale del look scelto",
    "problem": "micro area migliorabile senza contraddire il look",
    "missing": "capo o extra utile mancante se presente"
  },
  "shopping": {
    "needed": true,
    "query": "prodotto da cercare se manca qualcosa",
    "reason": "perché aiuterebbe il look"
  }
}

Regole per la risposta:
- massimo 2 frasi nel campo "message"
- "chosenIndex" deve essere l’indice della variante scelta
- massimo 3 actions
- actions brevi e reali
- se non manca nulla, shopping.needed=false
- se manca qualcosa, shopping deve essere coerente con il look
`.trim();
}

function buildStylistUserPrompt({
  occasionLabel = "",
  occasionKey = "",
  vibeKey = "",
  vibeLabel = "",
  tempC = null,
  placeName = "",
  outfit = [],
  candidateOutfits = [],
  missingSlots = [],
  userProfile = null,
  userMessage = "",
  debug = null,
} = {}) {
  const safeTemp =
    typeof tempC === "number" && Number.isFinite(tempC)
      ? `${tempC}°C`
      : "non disponibile";

  const baseMessage =
    safeStr(userMessage) || "Scegli il look migliore e spiegami perché.";

  const extraDebug =
    debug && typeof debug === "object"
      ? `
DEBUG PICKIT:
- baseScore: ${safeStr(debug?.baseScore)}
- finalScore: ${safeStr(debug?.finalScore)}
- eventProfile: ${safeStr(debug?.eventProfile)}
- topGap: ${safeStr(debug?.topGap?.label)}
- extraGap: ${safeStr(debug?.extraGap?.label)}
`.trim()
      : "DEBUG PICKIT:\n- non disponibile";

  return `
CONTESTO PICKIT
- occasioneLabel: ${safeStr(occasionLabel)}
- occasioneKey: ${safeStr(occasionKey)}
- vibeKey: ${safeStr(vibeKey)}
- vibeLabel: ${safeStr(vibeLabel)}
- temperatura: ${safeTemp}
- luogo: ${safeStr(placeName) || "non disponibile"}

PROFILO UTENTE
${formatUserProfile(userProfile)}

OUTFIT PRINCIPALE ATTUALE
${formatOutfit(outfit)}

VARIANTI DISPONIBILI
${formatCandidateOutfits(candidateOutfits)}

MISSING SLOTS
${formatMissingSlots(missingSlots)}

${extraDebug}

MESSAGGIO UTENTE
${baseMessage}

ISTRUZIONE FINALE
Scegli la variante migliore tra quelle disponibili.
Se non ci sono varianti utili, puoi confermare l’outfit principale.
Parla come Pickit:
"Ho pensato di vestirti così perché..."
Spiega la scelta in modo coerente e premium.
Non contraddire mai l’outfit scelto: puoi solo rifinirlo o proporre una variante migliore.
Se manca un capo utile, valorizza anche il possibile suggerimento shopping.
Rispondi solo in JSON valido.
`.trim();
}

function buildPickitStylistPrompt(input = {}) {
  return {
    systemPrompt: buildStylistSystemPrompt(),
    userPrompt: buildStylistUserPrompt(input),
  };
}

export {
  buildPickitStylistPrompt,
  buildStylistSystemPrompt,
  buildStylistUserPrompt,
};