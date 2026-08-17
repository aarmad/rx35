import { Router } from "express";
import { addSensorSnapshot, getLatestSensorSnapshot, getSensorHistory, SensorSnapshot } from "../db/store";
import { requireDeviceKey, requireAuth } from "../middleware/auth";

export const sensorsRouter = Router();

// --- Boîtier RX35 -> backend ---
// Correspond aux champs envoyés par le firmware (voir rx35-firmware-main,
// cycle de lecture dans main.cpp). Le firmware doit encore être complété
// avec la connexion Wi-Fi + l'appel HTTP vers cette route (prochaine étape).
sensorsRouter.post("/", requireDeviceKey, (req, res) => {
  const b = req.body ?? {};
  const required = ["temperatureC", "humidityAirPct", "soilMoisturePct", "waterLevelPct"];
  const missing = required.filter((k) => typeof b[k] !== "number");
  if (missing.length) {
    return res.status(400).json({ error: `Champs manquants ou invalides : ${missing.join(", ")}` });
  }

  const snapshot: SensorSnapshot = {
    timestamp: typeof b.timestamp === "number" ? b.timestamp : Date.now() / 1000,
    temperatureC: b.temperatureC,
    humidityAirPct: b.humidityAirPct,
    pressureHpa: b.pressureHpa ?? 0,
    lux: b.lux ?? 0,
    soilMoisturePct: b.soilMoisturePct,
    soilPh: b.soilPh ?? 0,
    waterLevelPct: b.waterLevelPct,
    flowLpm: b.flowLpm ?? 0,
    flowTotalL: b.flowTotalL ?? 0,
    batteryPct: b.batteryPct ?? 0,
    motion: !!b.motion,
  };
  addSensorSnapshot(snapshot);
  res.status(201).json({ ok: true });
});

// --- App mobile <- backend ---
sensorsRouter.get("/latest", requireAuth, (_req, res) => {
  const snapshot = getLatestSensorSnapshot();
  if (!snapshot) return res.status(404).json({ error: "Aucune donnée reçue du boîtier pour l'instant." });
  res.json(snapshot);
});

sensorsRouter.get("/history", requireAuth, (req, res) => {
  const period = Number(req.query.period ?? 7); // jours
  const sinceEpoch = Date.now() / 1000 - period * 86400;
  res.json(getSensorHistory(sinceEpoch));
});
