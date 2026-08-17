import { Router } from "express";
import { getParcel } from "../db/store";
import { getAvailableNdviDates, getNdviSnapshot } from "../services/satelliteService";
import { requireAuth } from "../middleware/auth";

export const satelliteRouter = Router();

satelliteRouter.get("/dates", requireAuth, (_req, res) => {
  res.json(getAvailableNdviDates());
});

satelliteRouter.get("/ndvi", requireAuth, async (req, res) => {
  const date = String(req.query.date ?? "");
  if (!date) return res.status(400).json({ error: "Paramètre 'date' (YYYY-MM-DD) requis." });
  try {
    const parcel = getParcel();
    const snapshot = await getNdviSnapshot(parcel.latitude, parcel.longitude, date);
    res.json(snapshot);
  } catch (err) {
    console.error("[satellite]", err);
    res.status(502).json({ error: "Service satellite indisponible pour le moment." });
  }
});
