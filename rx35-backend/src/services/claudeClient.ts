// ============================================================
// Assistant IA — intégration Claude (cahier de présentation §11).
//
// Deux usages :
//  - chat texte, avec le contexte des derniers relevés capteurs injecté
//    dans le prompt système pour que les réponses soient concrètes
//  - diagnostic photo : la culture, envoyée en pièce jointe depuis
//    l'app, avec instruction d'analyser l'image et de conseiller
//    l'agriculteur (toujours en orientant vers un agronome humain pour
//    confirmation, jamais comme substitut — voir cahier §11)
// ============================================================
import Anthropic from "@anthropic-ai/sdk";
import { ParcelInfo, SensorSnapshot } from "../db/store";
import { chatSystemPrompt, photoSystemPrompt, MAX_TOKENS, PHOTO_USER_TEXT } from "./aiPrompts";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY manquante — configurez-la dans .env pour activer l'assistant IA.");
  }
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

const MODEL = "claude-sonnet-5";

export async function askAssistant(
  userText: string,
  parcel: ParcelInfo,
  snapshot: SensorSnapshot | null,
  history: { role: "user" | "assistant"; text: string }[]
): Promise<string> {
  const anthropic = getClient();

  const messages: Anthropic.MessageParam[] = history
    .slice(-10) // limite le contexte envoyé pour rester léger
    .map((m) => ({ role: m.role, content: m.text }));
  messages.push({ role: "user", content: userText });

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: chatSystemPrompt(parcel, snapshot),
    messages,
  });

  const textBlock = response.content.find((b) => b.type === "text");
  return textBlock && textBlock.type === "text" ? textBlock.text : "Désolé, je n'ai pas pu générer de réponse.";
}

export async function diagnosePhoto(imageBase64: string, mimeType: string, parcel: ParcelInfo): Promise<string> {
  const anthropic = getClient();

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: photoSystemPrompt(parcel),
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mimeType as any, data: imageBase64 } },
          { type: "text", text: PHOTO_USER_TEXT },
        ],
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  return textBlock && textBlock.type === "text" ? textBlock.text : "Désolé, je n'ai pas pu analyser cette photo.";
}
