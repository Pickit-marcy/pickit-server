import OpenAI from "openai";
import { buildPickitStylistPrompt } from "./pickitStylistPrompt.js";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function safeParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function fallbackResponse() {
  return {
    message:
      "Il look è coerente, ma posso aiutarti a rifinirlo meglio con una variante più adatta al contesto.",
    actions: [
      { type: "improve", label: "Più elegante" },
      { type: "swap_shoes", label: "Cambia scarpe" },
      { type: "lighter", label: "Più rilassato" },
    ],
    focus: {
      highlight: "Look già leggibile",
      problem: "",
      missing: "",
    },
  };
}

export async function getPickitStylistReply(input = {}) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY mancante nel file .env");
  }

  const { systemPrompt, userPrompt } = buildPickitStylistPrompt(input);

  const response = await client.responses.create({
    model: "gpt-5.4-mini",
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: systemPrompt }],
      },
      {
        role: "user",
        content: [{ type: "input_text", text: userPrompt }],
      },
    ],
    text: {
      format: {
        type: "json_object",
      },
    },
  });

  const text =
    response.output_text ||
    response?.output?.[0]?.content?.[0]?.text ||
    "";

  const parsed = safeParseJson(text);
  if (!parsed || typeof parsed !== "object") {
    return fallbackResponse();
  }

  return {
    message: String(parsed?.message || fallbackResponse().message),
    actions: Array.isArray(parsed?.actions) ? parsed.actions.slice(0, 3) : fallbackResponse().actions,
    focus:
      parsed?.focus && typeof parsed.focus === "object"
        ? {
            highlight: String(parsed.focus.highlight || ""),
            problem: String(parsed.focus.problem || ""),
            missing: String(parsed.focus.missing || ""),
          }
        : fallbackResponse().focus,
  };
}