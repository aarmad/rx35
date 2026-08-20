# RX35 — Application mobile

Application React Native (Expo) reprenant les six espaces définis dans le
cahier de présentation, §13 : Accueil, Carte satellite, Historique, Alertes,
Assistant IA, Réglages.

**État actuel : connectée au vrai backend.** `src/services/api.ts` appelle
l'API RX35 réelle (voir `rx35-backend`).

**Il n'y a plus aucune donnée de démonstration dans l'application.**
`mockApi.ts` a été supprimé : il produisait des relevés inventés qui
s'affichaient à la place des vrais quand le réseau manquait. Un agriculteur
pouvait alors décider d'arroser en croyant lire son sol. L'application
affiche désormais soit de vraies mesures, soit les dernières vraies mesures
reçues (datées à l'écran), soit un message disant clairement qu'elle n'a
rien — jamais un chiffre fabriqué. Voir « Fonctionnement hors connexion ».

## Installation

> ⚠️ **L'application ne se lance plus dans Expo Go.** Deux modules natifs en
> sont absents : la reconnaissance vocale d'Android
> (`@jamsch/expo-speech-recognition`) pour la dictée, et `expo-notifications`
> pour les alertes. Il faut donc un **build de développement** :
>
> ```bash
> cd rx35-app
> npm install
> npx expo run:android    # compile et installe le build de dev sur l'émulateur/appareil
> ```
>
> À refaire uniquement quand une dépendance **native** change ; le reste du
> temps `npx expo start --dev-client` suffit, le code JavaScript se recharge
> comme avant. Le dossier `android/` est généré par `npx expo prebuild` — il
> peut être supprimé et régénéré à tout moment.

```bash
cd rx35-app
npm install
cp .env.example .env
# Éditez .env : EXPO_PUBLIC_API_BASE_URL = adresse du backend.
# Aucune clé à mettre ici : l'app s'authentifie avec le compte de
# l'utilisateur (voir « Authentification » plus bas).
npx expo start
```

Le backend doit tourner en parallèle (`cd rx35-backend && npm run dev`).
Vérifiez qu'il répond avant de lancer l'app :

```bash
curl http://localhost:3000/health
# {"ok":true,"service":"rx35-backend",...}
```

L'adresse réellement utilisée par l'application est affichée en bas de
l'écran **Réglages**, section « À propos » → c'est la première chose à
vérifier si rien ne se charge sur le téléphone.

**Important sur un téléphone physique** : `localhost` dans `.env` pointerait
vers le téléphone lui-même, pas vers votre ordinateur. Utilisez l'adresse IP
locale de la machine qui fait tourner le backend (ex.
`http://192.168.1.42:3000`), les deux appareils devant être sur le même
réseau Wi-Fi. `localhost` fonctionne en revanche dans un simulateur iOS ou
un émulateur Android tournant sur la même machine que le backend.

Scannez le QR code avec l'app Expo Go (Android/iOS), ou lancez un
simulateur (`npx expo start --ios` / `--android`).

## Tests

```bash
npm run typecheck   # tsc --noEmit
npm test            # cache hors connexion (tests/cache.test.js)
```

`npm test` exécute le vrai code de `src/services/cache.ts` en remplaçant
seulement le stockage. Il vérifie le point qui compte : **ne jamais afficher
de chiffre inventé** — réseau coupé avec cache ⇒ dernières vraies données
horodatées ; réseau coupé sans cache ⇒ erreur à l'écran, et rien d'autre.

## Authentification

L'application a maintenant de vrais comptes utilisateurs (voir
`rx35-backend`) : au premier lancement, l'app affiche un écran de connexion
/ inscription (nom, téléphone, mot de passe). Le token de session est
conservé de façon sécurisée sur l'appareil (`expo-secure-store`) et renvoyé
automatiquement à chaque appel API — aucune clé à configurer à la main côté
app. La section Compte de Réglages permet de modifier son nom/téléphone et
de se déconnecter.

Le flux a été rejoué bout-en-bout contre le vrai backend (inscription →
lecture du profil → modification → accès protégé avec/sans token →
reconnexion), en reproduisant exactement les appels que fait
`src/services/api.ts`. Le rendu réel des écrans de connexion sur un appareil
n'a en revanche pas pu être testé ici.

## Mot de passe oublié

Un agriculteur qui perd son mot de passe ne doit pas perdre sa parcelle.
L'écran de connexion propose « Mot de passe oublié ? » :

1. il saisit son numéro ;
2. un **code à 6 chiffres** est envoyé à l'adresse e-mail de son compte ;
3. il saisit le code et choisit un nouveau mot de passe ; il est connecté.

L'e-mail est **facultatif** et se renseigne dans Réglages → Compte. Sans
e-mail, la réinitialisation est impossible : l'écran le dit plutôt que de
laisser l'agriculteur attendre un message qui n'arrivera pas.

Côté sécurité (détails dans `rx35-backend/README.md`) : le code est haché en
base, expire en 15 minutes, ne sert qu'une fois, et 5 essais ratés le
brûlent. Le serveur répond **la même chose** que le numéro existe ou non —
impossible de deviner qui est client de RX35.

## Notifications d'alerte

L'application surveille les alertes de la parcelle courante et déclenche une
notification système (mouvement, niveau d'eau critique, badge refusé…), sans
que l'agriculteur ait à ouvrir l'écran Alertes.

> **Limite assumée : ce sont des notifications *locales*, pas du push.**
> L'application interroge le serveur toutes les 60 secondes *pendant qu'elle
> tourne*, et à chaque retour au premier plan. Elle ne réveille donc pas un
> téléphone dont l'app est fermée depuis longtemps. De vraies notifications
> push exigeraient un projet Firebase (FCM) — possible plus tard sans rien
> changer aux écrans, seul `src/alerts/useAlertNotifications.ts` bougerait.

Au premier passage, les alertes déjà présentes sont enregistrées **sans**
notifier : ouvrir l'app ne déclenche pas une rafale pour de vieux événements.

## Fonctionnement hors connexion

Chaque écran de données passe par `avecCache()` (`src/services/cache.ts`) :

1. il tente le réseau ; en cas de succès la réponse est affichée **et** mise
   en cache (`expo-file-system`) ;
2. en cas d'échec, il ressort la dernière valeur mise en cache, avec la date
   de réception affichée à l'écran ;
3. si le cache est vide lui aussi, l'erreur remonte et l'écran le dit.

Le cache est **vidé à la déconnexion** : les données d'un compte ne
réapparaissent pas sous le compte suivant sur le même téléphone.

## Identité visuelle

- **Couleurs** : vert forêt profond (`#1F3B2C`) en primaire, ochre savane
  (`#C97A2E`) en accent, terracotta pour l'alarme — palette terre/feuillage
  plutôt que dashboard SaaS générique. Voir `src/theme/tokens.ts`.
- **Typographies** : Fraunces (serif chaleureuse) pour les titres et grands
  chiffres, Work Sans pour l'interface et les données.
- **Élément signature** : `RadialGauge` (`src/components/RadialGauge.tsx`),
  un anneau qui compare une mesure à son seuil de décision — la même logique
  que le firmware utilise pour déclencher l'irrigation. Utilisé en vedette
  sur l'écran Accueil (humidité du sol vs seuil de la culture).
- **Thème clair/sombre/automatique** réglable dans Réglages.

## Navigation (mise à jour suite aux retours)

- **Bas de l'écran** : 4 onglets seulement — Accueil, Carte, Historique, Assistant.
- **Haut de l'écran** (`TopBar`, présent sur les 4 onglets) : accès rapide aux
  Alertes (avec badge non-lues) et à Réglages, désormais fusionné avec le
  Compte. Ces deux écrans sont poussés en pile (bouton retour natif) plutôt
  que d'être des onglets à part entière.
- **Diagnostic photo d'une plante** : se fait depuis l'Assistant IA — bouton
  appareil photo à côté du champ de texte, qui propose "Prendre une photo"
  ou "Choisir depuis la galerie" (`expo-image-picker`). La photo apparaît
  dans la conversation avec la réponse de diagnostic.
- **Photos capturées automatiquement par le boîtier** (périodique 3h ou sur
  mouvement) : accessibles aux deux endroits demandés — un onglet "Galerie
  photo" dans Historique (grille complète, badge indiquant le type de
  capture), et un aperçu miniature directement sur l'événement correspondant
  dans le journal "Mesures".

```
App.tsx                        Chargement des polices, thème, point d'entrée
src/theme/                     Tokens de design + contexte de thème
src/services/types.ts          Types partagés (alignés sur le firmware)
src/services/config.ts         Adresse du backend (lue depuis .env)
src/services/api.ts            Appels au vrai backend RX35 (utilisé par tous les écrans)
src/services/authStore.ts      Token de session (SecureStore) + signal de session expirée
src/services/cache.ts          Cache hors connexion (dernières vraies données, datées)
src/alerts/                    Sondage des alertes + notifications système
src/parcels/                   Parcelle courante, rôles, cloisonnement multi-comptes
src/components/                RadialGauge, SensorCard, Screen, ScreenHeader...
src/navigation/RootNavigator   Navigation par onglets (6 écrans)
src/screens/                   Accueil, Carte, Historique, Alertes, Assistant, Réglages
```

## Ce qui reste à brancher (backend)

Le backend `rx35-backend` couvre déjà tous les endpoints utilisés par
`src/services/api.ts`. Ce qui reste :

| Sujet | État |
| --- | --- |
| Capteurs / NPK / alertes / commandes d'irrigation | ✅ Backend prêt — reste à connecter le **firmware** en Wi-Fi (voir `rx35-firmware-main/README.md`) |
| Photos (galerie + diagnostic) | ✅ Backend prêt — reste à connecter l'**ESP32-CAM** en Wi-Fi pour l'upload automatique |
| Carte satellite (NDVI) | ✅ Branché — le backend renvoie `source: "sentinel-hub"` ou `"simule"`, et l'écran Carte affiche laquelle des deux il montre. Reste à renseigner `SENTINEL_HUB_CLIENT_ID`/`_SECRET` pour sortir du mode simulé |
| Assistant IA (chat + photo) | ✅ Backend prêt, appelle Claude — nécessite `ANTHROPIC_API_KEY` dans le `.env` du backend |
| Comptes utilisateurs | ✅ Authentification réelle (inscription/connexion/JWT) branchée et testée bout-en-bout |

## Assistant IA et dialogue vocal (cahier §11)

L'assistant est branché sur Claude via le backend (`ANTHROPIC_API_KEY` dans
`rx35-backend/.env`). Trois modes d'interaction :

| Mode | Où | Détail technique |
| --- | --- | --- |
| **Écrit** | Champ de saisie | `POST /api/assistant/message` — les derniers relevés capteurs sont injectés dans le prompt, l'assistant refuse d'inventer un chiffre absent |
| **Dictée** | Bouton micro | Reconnaissance vocale **native Android**, sur l'appareil : ni service tiers, ni coût par minute. Le texte reconnu remplit le champ pour relecture avant envoi |
| **Écoute** | Bouton « Écouter » sous chaque réponse | Synthèse vocale du téléphone (`expo-speech`), en français, sans connexion |

Le diagnostic photo passe par le bouton appareil photo (`POST /api/assistant/photo`).

Les réponses sont demandées **en texte brut** : l'app les affiche dans un
composant `Text` qui n'interprète pas le Markdown, donc des `**` s'afficheraient
tels quels à l'agriculteur (voir `FORMAT_RULE` dans
`rx35-backend/src/services/claudeClient.ts`).

## Comportement quand le serveur ne répond pas

La liaison app ↔ backend est explicite plutôt que silencieuse :

- **Accueil / Historique / Carte** : ressortent les **dernières vraies
  données reçues**, avec un bandeau « Hors connexion — dernières données
  reçues le … ». Si rien n'a jamais été reçu, l'écran le dit (« Aucun relevé
  pour l'instant ») et propose *Réessayer* — il n'invente rien.
- **Alertes / Réglages** : affichent le message d'erreur du serveur.
- **Assistant IA** : la réponse d'erreur (ex. `ANTHROPIC_API_KEY` absente
  côté backend) s'affiche dans le fil de discussion, la saisie ne reste pas
  bloquée sur « envoi en cours ».
- **Session expirée** (token de 30 jours dépassé, ou `JWT_SECRET` changé
  côté serveur) : toute réponse 401 efface le token et ramène
  automatiquement à l'écran de connexion.

## Prochaine étape

L'application et le backend sont reliés. Ce qui manque encore pour une
chaîne complète : le **firmware** (ESP32 et ESP32-CAM) doit se connecter en
Wi-Fi et pousser ses relevés vers le backend (`X-Device-Key`), puis relire
`GET /api/irrigation/commands` à chaque cycle pour appliquer le mode et la
commande de pompe choisis dans l'application.
