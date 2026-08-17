import { Router } from "express";
import crypto from "crypto";
import { addAlert, getAlerts, markAlertRead, getUnreadAlertCount, AlertItem } from "../db/store";
import { requireDeviceKey, requireAuth } from "../middleware/auth";

export const alertsRouter = Router();

const VALID_TYPES: AlertItem["type"][] = ["mouvement", "niveau_eau", "alarme", "badge_refuse", "info"];

// Boîtier -> backend : PIR, alarme, badge refusé, etc. (voir access_control.cpp)
alertsRouter.post("/", requireDeviceKey, (req, res) => {
  const { type, message } = req.body ?? {};
  if (!VALID_TYPES.includes(type) || typeof message !== "string") {
    return res.status(400).json({ error: `type doit être l'un de : ${VALID_TYPES.join(", ")}, et message une chaîne.` });
  }
  const alert: AlertItem = {
    id: crypto.randomUUID(),
    timestamp: Date.now() / 1000,
    type,
    message,
    lu: false,
  };
  addAlert(alert);
  res.status(201).json(alert);
});

alertsRouter.get("/", requireAuth, (_req, res) => {
  res.json(getAlerts());
});

alertsRouter.get("/unread-count", requireAuth, (_req, res) => {
  res.json({ count: getUnreadAlertCount() });
});

alertsRouter.put("/:id/read", requireAuth, (req, res) => {
  const ok = markAlertRead(req.params.id);
  if (!ok) return res.status(404).json({ error: "Alerte introuvable." });
  res.json({ ok: true });
});
