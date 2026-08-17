import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";

import { parcelRouter } from "./routes/parcel";
import { authRouter } from "./routes/auth";
import { sensorsRouter } from "./routes/sensors";
import { npkRouter } from "./routes/npk";
import { irrigationRouter } from "./routes/irrigation";
import { alertsRouter } from "./routes/alerts";
import { photosRouter, photosUploadDir } from "./routes/photos";
import { weatherRouter } from "./routes/weather";
import { satelliteRouter } from "./routes/satellite";
import { assistantRouter } from "./routes/assistant";
import { currentProvider } from "./services/aiProvider";

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => res.json({ ok: true, service: "rx35-backend", time: new Date().toISOString() }));

app.use("/api/auth", authRouter);
app.use("/api/parcel", parcelRouter);
app.use("/api/sensors", sensorsRouter);
app.use("/api/npk", npkRouter);
app.use("/api/irrigation", irrigationRouter);
app.use("/api/alerts", alertsRouter);
app.use("/api/photos", photosRouter);
app.use("/photos/files", express.static(photosUploadDir));
app.use("/api/weather", weatherRouter);
app.use("/api/satellite", satelliteRouter);
app.use("/api/assistant", assistantRouter);

app.use((_req, res) => res.status(404).json({ error: "Route inconnue." }));

const PORT = Number(process.env.PORT ?? 3000);
app.listen(PORT, () => {
  console.log(`RX35 backend démarré sur http://localhost:${PORT}`);

  // L'assistant peut tourner sur Gemini ou sur Claude (voir
  // services/aiProvider.ts) : on n'avertit que sur la clé réellement
  // utilisée, sinon le message induit en erreur dans les logs Render.
  const provider = currentProvider();
  console.log(`Assistant IA : ${provider}${provider === "gemini" ? ` (${process.env.GEMINI_MODEL ?? "gemini-3.5-flash"})` : ""}`);
  const cleAttendue = provider === "claude" ? "ANTHROPIC_API_KEY" : "GEMINI_API_KEY";
  if (!process.env[cleAttendue]) {
    console.warn(`⚠ ${cleAttendue} absente : l'assistant IA (chat + diagnostic photo) renverra une erreur 502.`);
  }

  if (!process.env.JWT_SECRET) {
    console.warn("⚠ JWT_SECRET absente : l'authentification (register/login) échouera tant qu'elle n'est pas définie.");
  }
  if (!process.env.SENTINEL_HUB_CLIENT_ID) {
    console.warn("ℹ SENTINEL_HUB_CLIENT_ID absente : la carte satellite fonctionnera en mode simulé.");
  }
});
