// ============================================================
// Choix du fournisseur d'IA — piloté par la variable AI_PROVIDER.
//
//   AI_PROVIDER=gemini  (défaut)  -> Google Gemini, palier gratuit
//   AI_PROVIDER=claude            -> Anthropic Claude, payant à l'usage
//
// Les deux implémentations exposent exactement les mêmes fonctions et
// partagent les mêmes prompts (aiPrompts.ts) : basculer ne change que le
// moteur, pas ce que l'assistant est censé dire. Les routes n'importent
// que ce fichier.
// ============================================================
import * as gemini from "./geminiClient";
import * as claude from "./claudeClient";

export type AiProvider = "gemini" | "claude";

export function currentProvider(): AiProvider {
  return process.env.AI_PROVIDER === "claude" ? "claude" : "gemini";
}

function impl() {
  return currentProvider() === "claude" ? claude : gemini;
}

export const askAssistant: typeof gemini.askAssistant = (...args) => impl().askAssistant(...args);
export const diagnosePhoto: typeof gemini.diagnosePhoto = (...args) => impl().diagnosePhoto(...args);
