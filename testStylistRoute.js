import fetch from "node-fetch";

const URL = "http://127.0.0.1:8787/stylist";

async function test() {
  const res = await fetch(URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      occasionLabel: "Social • Brunch",
      occasionKey: "social_brunch",
      vibeKey: "casual",
      vibeLabel: "Casual",
      tempC: 19,
      placeName: "Ancona",

      outfit: [
        {
          mainCategory: "parte_superiore",
          subCategory: "Camicia",
          colors: ["Blu", "Fantasia"],
          _layerRole: "base",
        },
        {
          mainCategory: "parte_inferiore",
          subCategory: "Jeans",
          colors: ["Beige", "Nero"],
        },
        {
          mainCategory: "calzature",
          subCategory: "Sneakers",
          colors: ["Bianco"],
        },
        {
          mainCategory: "extra_accessori",
          subCategory: "Calzini",
          colors: ["Fantasia"],
        },
      ],

      candidateOutfits: [
        {
          label: "Outfit 1",
          outfit: [
            {
              mainCategory: "parte_superiore",
              subCategory: "Camicia",
              colors: ["Blu", "Fantasia"],
              _layerRole: "base",
            },
            {
              mainCategory: "parte_inferiore",
              subCategory: "Jeans",
              colors: ["Beige", "Nero"],
            },
            {
              mainCategory: "calzature",
              subCategory: "Sneakers",
              colors: ["Bianco"],
            },
          ],
        },
        {
          label: "Outfit 2",
          outfit: [
            {
              mainCategory: "parte_superiore",
              subCategory: "Polo",
              colors: ["Bianco"],
              _layerRole: "base",
            },
            {
              mainCategory: "parte_inferiore",
              subCategory: "Pantaloni",
              colors: ["Beige"],
            },
            {
              mainCategory: "calzature",
              subCategory: "Sneakers",
              colors: ["Bianco"],
            },
          ],
        },
        {
          label: "Outfit 3",
          outfit: [
            {
              mainCategory: "parte_superiore",
              subCategory: "Camicia",
              colors: ["Blu"],
              _layerRole: "base",
            },
            {
              mainCategory: "parte_inferiore",
              subCategory: "Jeans",
              colors: ["Blu"],
            },
            {
              mainCategory: "calzature",
              subCategory: "Sneakers",
              colors: ["Bianco"],
            },
          ],
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
        colorStyle: "sperimentale",
      },

      userMessage: "Scegli tu come vestirmi e spiegami perché.",
      debug: {
        baseScore: 72,
        finalScore: 75,
        eventProfile: "social",
      },
    }),
  });

  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}

test();