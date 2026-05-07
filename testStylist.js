import { buildPickitStylistPrompt } from "./pickitStylistPrompt.js";

function runTest() {
  const testInput = {
    occasionLabel: "Social • Brunch",
    occasionKey: "social_brunch",
    vibeKey: "casual",
    vibeLabel: "Casual",
    tempC: 19,
    placeName: "Ancona",

    outfit: [
      {
        mainCategory: "parte_superiore",
        subCategory: "camicia",
        colors: ["blu"],
        _layerRole: "base",
      },
      {
        mainCategory: "parte_inferiore",
        subCategory: "pantalone",
        colors: ["beige"],
      },
      {
        mainCategory: "calzature",
        subCategory: "sneakers",
        colors: ["bianco"],
      },
    ],

    missingSlots: [
      {
        slot: "extra_accessori",
        suggestion: ["Orologio", "Occhiali"],
      },
    ],

    userProfile: {
      style: "equilibrato",
      shoesPref: "sportive",
    },

    userMessage: "Com'è il look?",
  };

  const prompt = buildPickitStylistPrompt(testInput);

  console.log("\n===== SYSTEM PROMPT =====\n");
  console.log(prompt.systemPrompt);

  console.log("\n===== USER PROMPT =====\n");
  console.log(prompt.userPrompt);
}

runTest();