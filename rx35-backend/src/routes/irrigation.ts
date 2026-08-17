import { Router } from "express";
import { getCommands, setIrrigationMode, setPumpManual } from "../db/store";
import { requireDeviceKey, requireAuth } from "../middleware/auth";

export const irrigationRouter = Router();

// L'app définit l'intention (mode, pompe manuelle)...
irrigationRouter.get("/mode", requireAuth, (_req, res) => {
  res.json({ mode: getCommands().irrigationMode });
});

// État complet tel que le backend le connaît. L'application le relit à
// chaque ouverture : sans ça, le bouton "Démarrer la pompe" repartirait de
// "éteint" alors que la pompe tourne peut-être encore côté parcelle.
irrigationRouter.get("/state", requireAuth, (_req, res) => {
  const c = getCommands();
  res.json({ mode: c.irrigationMode, pumpManualOn: c.pumpManualOn });
});

irrigationRouter.put("/mode", requireAuth, (req, res) => {
  const mode = req.body?.mode;
  if (mode !== "auto" && mode !== "manuel") {
    return res.status(400).json({ error: "mode doit être 'auto' ou 'manuel'." });
  }
  res.json(setIrrigationMode(mode));
});

irrigationRouter.put("/pump", requireAuth, (req, res) => {
  const on = !!req.body?.on;
  res.json(setPumpManual(on));
});

// ...et le boîtier va la relire régulièrement (le firmware n'accepte pas de
// connexions entrantes derrière le NAT du réseau mobile/Wi-Fi local — il
// interroge le backend à chaque cycle plutôt que l'inverse). La sécurité de
// niveau d'eau reste appliquée CÔTÉ FIRMWARE dans tous les cas (voir
// irrigation.cpp) : le backend transmet une intention, jamais un
// contournement de cette sécurité.
irrigationRouter.get("/commands", requireDeviceKey, (_req, res) => {
  res.json(getCommands());
});
