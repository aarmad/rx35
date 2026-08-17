// Stocke le token de session en mémoire (accès synchrone pour api.ts, qui
// n'est pas un composant React) et le persiste via SecureStore pour
// survivre à la fermeture de l'application.
import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "rx35_auth_token";

let currentToken: string | null = null;

export function getToken(): string | null {
  return currentToken;
}

export async function loadStoredToken(): Promise<string | null> {
  currentToken = await SecureStore.getItemAsync(TOKEN_KEY);
  return currentToken;
}

export async function setToken(token: string | null): Promise<void> {
  currentToken = token;
  if (token) {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  } else {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  }
}

// Session refusée par le backend en cours d'utilisation (token expiré au
// bout de 30 jours, ou JWT_SECRET changé côté serveur). api.ts le signale,
// AuthContext s'y abonne pour ramener l'utilisateur à l'écran de connexion
// au lieu de le laisser sur des écrans qui échouent silencieusement.
let unauthorizedHandler: (() => void) | null = null;

export function onUnauthorized(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

export function notifyUnauthorized(): void {
  unauthorizedHandler?.();
}
