// ============================================================
// Assistant IA — intégration Google Gemini (alternative gratuite à Claude).
//
// Appel direct à l'API REST plutôt qu'un SDK : une seule dépendance en
// moins à maintenir, et `fetch` est natif depuis Node 18.
//
// Choix du modèle : `gemini-3.5-flash`, vérifié sur cette clé pour le texte
// ET la vision (diagnostic photo). Attention, deux pièges constatés en
// testant l'API :
//  - `gemini-2.5-flash` est fermé aux nouveaux comptes (404) ;
//  - sur les modèles Gemini 3, les jetons de « réflexion » se déduisent du
//    même budget que la réponse : sans `thinkingBudget: 0` la réponse
//    revient vide ou coupée en pleine phrase.
// ============================================================
import { ParcelInfo, SensorSnapshot } from "../db/store";
import { chatSystemPrompt, photoSystemPrompt, MAX_TOKENS, PHOTO_USER_TEXT } from "./aiPrompts";

const MODEL = process.env.GEMINI_MODEL ?? "gemini-3.5-flash";
const ENDPOINT = (model: string, key: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

interface GeminiPart {
  text?: string;
  inline_data?: { mime_type: string; data: string };
}

function getKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY manquante — configurez-la dans .env pour activer l'assistant IA.");
  }
  return key;
}

// Le palier gratuit de Gemini renvoie régulièrement une surcharge
// temporaire ("high demand") : on réessaie brièvement avant d'abandonner,
// plutôt que d'afficher une erreur à l'agriculteur pour un incident d'une
// seconde.
const MAX_TENTATIVES = 3;

async function generate(systemPrompt: string, parts: GeminiPart[], history: GeminiPart[][] = []): Promise<string> {
  const key = getKey();
  const body = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [
      ...history.map((p, i) => ({ role: i % 2 === 0 ? "user" : "model", parts: p })),
      { role: "user", parts },
    ],
    generationConfig: {
      maxOutputTokens: MAX_TOKENS,
      // Indispensable : voir le commentaire en tête de fichier.
      thinkingConfig: { thinkingBudget: 0 },
    },
  };

  let derniereErreur = "";
  for (let tentative = 1; tentative <= MAX_TENTATIVES; tentative++) {
    const res = await fetch(ENDPOINT(MODEL, key), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data: any = await res.json().catch(() => ({}));

    if (res.ok) {
      const text: string = (data?.candidates?.[0]?.content?.parts ?? [])
        .map((p: GeminiPart) => p.text ?? "")
        .join("")
        .trim();
      if (text) return text;
      derniereErreur = `réponse vide (finishReason: ${data?.candidates?.[0]?.finishReason ?? "inconnu"})`;
    } else {
      derniereErreur = data?.error?.message ?? `HTTP ${res.status}`;
      // 4xx hors quota : réessayer ne changera rien (clé invalide, requête
      // malformée, modèle inexistant).
      if (res.status >= 400 && res.status < 500 && res.status !== 429) break;
    }

    if (tentative < MAX_TENTATIVES) await new Promise((r) => setTimeout(r, 1500 * tentative));
  }

  throw new Error(`Gemini indisponible : ${derniereErreur}`);
}

export async function askAssistant(
  userText: string,
  parcel: ParcelInfo,
  snapshot: SensorSnapshot | null,
  history: { role: "user" | "assistant"; text: string }[]
): Promise<string> {
  // Gemini attend une alternance user/model stricte : on repart du dernier
  // message utilisateur pour éviter un historique qui commencerait par une
  // réponse de l'assistant (message d'accueil).
  const recent = history.slice(-10);
  const debut = recent.findIndex((m) => m.role === "user");
  const alternes = debut === -1 ? [] : recent.slice(debut).map((m) => [{ text: m.text }]);

  return generate(chatSystemPrompt(parcel, snapshot), [{ text: userText }], alternes);
}

export async function diagnosePhoto(imageBase64: string, mimeType: string, parcel: ParcelInfo): Promise<string> {
  return generate(photoSystemPrompt(parcel), [
    { inline_data: { mime_type: mimeType, data: imageBase64 } },
    { text: PHOTO_USER_TEXT },
  ]);
}
