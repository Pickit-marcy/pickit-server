import express from "express";
import { getPickitStylistReply } from "../pickitStylistService.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const body = req.body || {};

    const reply = await getPickitStylistReply({
      occasionLabel: body.occasionLabel,
      occasionKey: body.occasionKey,
      vibeKey: body.vibeKey,
      vibeLabel: body.vibeLabel,
      tempC: body.tempC,
      placeName: body.placeName,
      outfit: body.outfit,
      missingSlots: body.missingSlots,
      userProfile: body.userProfile,
      userMessage: body.userMessage,
      debug: body.debug,
    });

    return res.json({
      ok: true,
      reply,
    });
  } catch (err) {
    console.error("pickit stylist route error:", err?.message || String(err));

    return res.status(500).json({
      ok: false,
      error: err?.message || "Errore server stylist AI",
    });
  }
});

export default router;