import { Router } from "express";
import crypto from "crypto";
import multer from "multer";
import { addChatMessage, getChatHistory, getLatestSensorSnapshot, getParcel, ChatMessage } from "../db/store";
import { askAssistant, diagnosePhoto } from "../services/aiProvider";
import { requireAuth } from "../middleware/auth";

export const assistantRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

assistantRouter.get("/history", requireAuth, (_req, res) => {
  res.json(getChatHistory());
});

assistantRouter.post("/message", requireAuth, async (req, res) => {
  const text = req.body?.text;
  if (typeof text !== "string" || !text.trim()) {
    return res.status(400).json({ error: "Champ 'text' requis." });
  }

  const userMsg: ChatMessage = { id: crypto.randomUUID(), role: "user", text, timestamp: Date.now() / 1000 };
  addChatMessage(userMsg);

  try {
    const parcel = getParcel();
    const snapshot = getLatestSensorSnapshot();
    const history = getChatHistory().map((m) => ({ role: m.role, text: m.text }));
    const replyText = await askAssistant(text, parcel, snapshot, history);

    const assistantMsg: ChatMessage = { id: crypto.randomUUID(), role: "assistant", text: replyText, timestamp: Date.now() / 1000 };
    addChatMessage(assistantMsg);
    res.status(201).json(assistantMsg);
  } catch (err: any) {
    console.error("[assistant]", err);
    res.status(502).json({ error: err?.message ?? "Assistant IA indisponible pour le moment." });
  }
});

assistantRouter.post("/photo", requireAuth, upload.single("photo"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Champ 'photo' (multipart/form-data) manquant." });

  const base64 = req.file.buffer.toString("base64");
  const mimeType = req.file.mimetype || "image/jpeg";

  const userMsg: ChatMessage = {
    id: crypto.randomUUID(),
    role: "user",
    text: "Photo envoyée pour diagnostic",
    imageUri: `data:${mimeType};base64,${base64}`,
    timestamp: Date.now() / 1000,
  };
  addChatMessage(userMsg);

  try {
    const parcel = getParcel();
    const replyText = await diagnosePhoto(base64, mimeType, parcel);
    const assistantMsg: ChatMessage = { id: crypto.randomUUID(), role: "assistant", text: replyText, timestamp: Date.now() / 1000 };
    addChatMessage(assistantMsg);
    res.status(201).json(assistantMsg);
  } catch (err: any) {
    console.error("[assistant/photo]", err);
    res.status(502).json({ error: err?.message ?? "Diagnostic photo indisponible pour le moment." });
  }
});
