// Configuration de connexion au backend RX35.
//
// Avec Expo SDK 51+, toute variable préfixée EXPO_PUBLIC_ dans un fichier
// .env à la racine du projet est automatiquement injectée ici via
// process.env — voir .env.example et le README pour la marche à suivre.
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:3000";
