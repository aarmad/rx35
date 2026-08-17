import { Router } from "express";
import { addNpkSnapshot, getLatestNpkSnapshot, NpkSnapshot } from "../db/store";
import { requireDeviceKey, requireAuth } from "../middleware/auth";

export const npkRouter = Router();

npkRouter.post("/", requireDeviceKey, (req, res) => {
  const b = req.body ?? {};
  const required = ["nitrogenMgKg", "phosphorusMgKg", "potassiumMgKg"];
  const missing = required.filter((k) => typeof b[k] !== "number");
  if (missing.length) {
    return res.status(400).json({ error: `Champs manquants ou invalides : ${missing.join(", ")}` });
  }
  const snapshot: NpkSnapshot = {
    timestamp: typeof b.timestamp === "number" ? b.timestamp : Date.now() / 1000,
    nitrogenMgKg: b.nitrogenMgKg,
    phosphorusMgKg: b.phosphorusMgKg,
    potassiumMgKg: b.potassiumMgKg,
    conductivityUsCm: b.conductivityUsCm ?? 0,
  };
  addNpkSnapshot(snapshot);
  res.status(201).json({ ok: true });
});

npkRouter.get("/latest", requireAuth, (_req, res) => {
  const snapshot = getLatestNpkSnapshot();
  if (!snapshot) return res.status(404).json({ error: "Aucune donnée NPK reçue pour l'instant." });
  res.json(snapshot);
});
