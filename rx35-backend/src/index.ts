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
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("⚠ ANTHROPIC_API_KEY absente : l'assistant IA (chat + diagnostic photo) renverra une erreur 502.");
  }
  if (!process.env.JWT_SECRET) {
    console.warn("⚠ JWT_SECRET absente : l'authentification (register/login) échouera tant qu'elle n'est pas définie.");
  }
  if (!process.env.SENTINEL_HUB_CLIENT_ID) {
    console.warn("ℹ SENTINEL_HUB_CLIENT_ID absente : la carte satellite fonctionnera en mode simulé.");
  }
});
