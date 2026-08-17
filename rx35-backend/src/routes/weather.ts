import { Router } from "express";
import { getParcel } from "../db/store";
import { fetchWeather } from "../services/weatherService";
import { requireAuth } from "../middleware/auth";

export const weatherRouter = Router();

weatherRouter.get("/", requireAuth, async (_req, res) => {
  try {
    const parcel = getParcel();
    const days = await fetchWeather(parcel.latitude, parcel.longitude);
    res.json(days);
  } catch (err) {
    console.error("[weather]", err);
    res.status(502).json({ error: "Service météo indisponible pour le moment." });
  }
});
