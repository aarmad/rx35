import "dotenv/config";
import express from "express";
import cors from "cors";

import { authRouter } from "./routes/auth";
import { parcelsRouter } from "./routes/parcels";
import { parcelDataRouter } from "./routes/parcelData";
import { deviceRouter, photosUploadDir } from "./routes/device";
import { requireAuth, requireParcelAccess } from "./middleware/auth";
import { initDb } from "./db/store";
import { currentProvider } from "./services/aiProvider";

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => res.json({ ok: true, service: "rx35-backend", time: new Date().toISOString() }));

// Application : compte, puis tout le reste sous une parcelle dont on a
// vérifié que l'utilisateur est membre.
app.use("/api/auth", authRouter);
app.use("/api/parcels", parcelsRouter);
app.use("/api/parcels/:parcelId", requireAuth, requireParcelAccess, parcelDataRouter);

// Boîtier (firmware), authentifié par sa propre clé.
app.use("/api/device", deviceRouter);
app.use("/photos/files", express.static(photosUploadDir));

app.use((_req, res) => res.status(404).json({ error: "Route inconnue." }));

// Gestionnaire d'erreurs : sans lui, une requête SQL qui échoue laisse le
// client attendre indéfiniment.
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[erreur]", err);
  res.status(500).json({ error: "Erreur interne du serveur." });
});

const PORT = Number(process.env.PORT ?? 3000);

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`RX35 backend démarré sur http://localhost:${PORT}`);

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
  })
  .catch((err) => {
    // Sans base, rien ne peut fonctionner : mieux vaut échouer bruyamment
    // au démarrage que servir des erreurs 500 à chaque requête.
    console.error("Impossible d'initialiser la base de données :", err);
    process.exit(1);
  });
