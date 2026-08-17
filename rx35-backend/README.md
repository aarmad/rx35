# RX35 — Backend

API centrale reliant le boîtier (firmware ESP32), l'application mobile, le
service météo, la cartographie satellite (NDVI) et l'assistant IA (Claude).

**Vérifié sur cette machine** : `npm install`, `npx tsc --noEmit` et
démarrage réel du serveur, puis un test bout-en-bout rejouant exactement les
appels de `rx35-app/src/services/api.ts` — tous les endpoints du tableau
ci-dessous répondent :

- authentification complète (inscription, connexion, `/me`, refus 401 sans
  token) ;
- envoi par le boîtier (capteurs, NPK, alertes, upload photo) avec
  `X-Device-Key`, et refus 401 sur mauvaise clé ;
- lecture par l'app (dernier relevé, historique, parcelle, irrigation,
  alertes, galerie) ;
- **météo réelle** : appel Open-Meteo effectué avec succès (prévisions
  renvoyées sur les coordonnées de Lomé) ;
- **satellite** : grille NDVI de 48 zones renvoyée en mode simulé
  (`source: "simule"`), faute d'identifiants Copernicus configurés ;
- **assistant IA** : testé avec une vraie clé Anthropic — le chat répond à
  partir des relevés capteurs réellement reçus (« humidité du sol 38 %, en
  dessous de l'optimal pour la tomate »), et le diagnostic photo analyse
  bien l'image transmise. Deux réglages ont été corrigés à cette occasion :
  `max_tokens` (500 coupait les réponses en pleine phrase) et une consigne
  de réponse en texte brut, l'application n'interprétant pas le Markdown.

## Installation

```bash
cd rx35-backend
npm install
cp .env.example .env
# Éditez .env : ANTHROPIC_API_KEY, DEVICE_API_KEY, JWT_SECRET au minimum
npm run dev
```

Le serveur démarre sur `http://localhost:3000` (configurable via `PORT`).

## Déploiement en ligne (accessible depuis n'importe où)

Tant que le backend tourne en local (`localhost`), seuls des appareils sur
le même réseau Wi-Fi peuvent le joindre — suffisant pour tester chez vous,
mais pas pour un boîtier déployé sur une vraie parcelle ou une app partagée
avec d'autres personnes. **Render** est recommandé pour cette étape : niveau
gratuit réel (pas de carte bancaire demandée), déploiement direct depuis un
dépôt Git, adapté à Node.js.

### Étapes

1. Poussez le dépôt sur GitHub (le dépôt contient `rx35-app` **et**
   `rx35-backend`, d'où le réglage « Root Directory » ci-dessous).
2. Sur [render.com](https://render.com) : **New → Web Service**, choisissez
   le dépôt, puis renseignez :

   | Champ | Valeur |
   | --- | --- |
   | Root Directory | `rx35-backend` ← **indispensable**, le dépôt a deux projets |
   | Build Command | `npm install && npm run build` |
   | Start Command | `npm start` |
   | Health Check Path | `/health` (section Advanced) |
   | Instance Type | Free |

   Ne définissez **pas** `PORT` : Render l'injecte, et `src/index.ts` le lit
   déjà (`process.env.PORT`).

   Variables d'environnement à saisir : `AI_PROVIDER`, `GEMINI_API_KEY`,
   `GEMINI_MODEL`, `DEVICE_API_KEY` (la même que dans le firmware) et
   `JWT_SECRET` (valeur longue et aléatoire, ex. `openssl rand -hex 32`).

   L'option « Blueprint » (lecture automatique de `render.yaml`) n'est pas
   proposée sur tous les comptes ; la création manuelle ci-dessus donne
   exactement le même résultat.
3. Renseignez les variables d'environnement demandées dans le tableau de
   bord Render (`DEVICE_API_KEY`, `ANTHROPIC_API_KEY`, et éventuellement
   `SENTINEL_HUB_CLIENT_ID`/`SECRET`) — `JWT_SECRET` est généré
   automatiquement par Render grâce à `generateValue: true` dans
   `render.yaml`.
4. Une fois déployé, Render fournit une URL publique du type
   `https://rx35-backend.onrender.com`. C'est cette adresse qu'il faut
   mettre :
   - dans `set_backend <url>` du firmware principal (voir
     `rx35-firmware-main/README.md`)
   - dans `BACKEND_URL` de `rx35-firmware-cam/src/wifi_config.h`
   - dans `EXPO_PUBLIC_API_BASE_URL` du fichier `.env` de `rx35-app`

### Limites importantes du niveau gratuit Render

- **Le service s'endort après 15 minutes d'inactivité** et met 30 à 60
  secondes à se réveiller à la requête suivante (normal pour un boîtier qui
  interroge le backend en continu une fois déployé, mais à savoir pendant
  les tests).
- **Le stockage local (`data/db.json`, `data/photos/`) n'est pas garanti
  persistant** au-delà de la durée de vie de l'instance — un nouveau
  déploiement (ex. un `git push`) repart avec des données vides. Très bien
  pour tester le pipeline de bout en bout, **mais pas fiable pour de vraies
  données de production** : avant un déploiement réel avec des agriculteurs,
  il faudra migrer vers une vraie base de données hébergée (voir la section
  "Stockage des données" ci-dessous) et un stockage d'images externe (ex.
  S3-compatible) plutôt que le disque local du service.
- 750 heures gratuites par mois, largement suffisant pour un seul service.

## Stockage des données

Pas de base de données externe à installer : tout est écrit dans
`data/db.json` (créé automatiquement au premier démarrage) et les photos
dans `data/photos/`. Un choix volontaire pour rester facile à déployer et
tester à cette étape — à remplacer par une vraie base (Postgres, etc.) avant
un déploiement à grande échelle avec plusieurs boîtiers/parcelles en
simultané (voir le commentaire en tête de `src/db/store.ts`).

## Authentification

Deux mécanismes distincts, pour deux appelants différents :

- **Boîtier → backend** : `X-Device-Key` (clé partagée, `DEVICE_API_KEY`).
  Pas de notion de compte côté matériel.
- **Application → backend** : vrais comptes utilisateurs. `POST
  /api/auth/register` (nom, téléphone, mot de passe ≥ 6 caractères) ou
  `POST /api/auth/login` renvoient un token JWT, à envoyer ensuite dans
  `Authorization: Bearer <token>` sur toutes les autres routes `/api/*`
  (sauf celles réservées au boîtier). Mots de passe hashés avec bcrypt,
  jamais stockés en clair. Sessions valables 30 jours.

## Endpoints

| Méthode & route | Appelant | Description |
| --- | --- | --- |
| `GET /health` | — | Vérification que le serveur tourne |
| `POST /api/auth/register` | app | Créer un compte (nom, téléphone, mot de passe) |
| `POST /api/auth/login` | app | Se connecter, renvoie un token |
| `GET /api/auth/me` / `PUT /api/auth/me` | app | Lire / modifier son propre compte |
| `GET /api/parcel` | app | Infos de la parcelle |
| `PUT /api/parcel` | app | Mise à jour (nom, culture, date, GPS) |
| `POST /api/sensors` | boîtier | Envoi d'un relevé capteurs |
| `GET /api/sensors/latest` | app | Dernier relevé |
| `GET /api/sensors/history?period=1\|7\|30` | app | Historique (jours) |
| `POST /api/npk` | boîtier | Envoi d'un relevé sonde NPK |
| `GET /api/npk/latest` | app | Dernier relevé NPK |
| `GET /api/irrigation/mode` / `PUT /api/irrigation/mode` | app | Lire/régler auto ou manuel |
| `GET /api/irrigation/state` | app | Mode **et** état de la pompe, relus à l'ouverture de l'accueil |
| `PUT /api/irrigation/pump` | app | Commande pompe en mode manuel |
| `GET /api/irrigation/commands` | boîtier | Le firmware relit ici ce que l'app a demandé |
| `POST /api/alerts` | boîtier | Nouvel événement (mouvement, alarme, badge refusé...) |
| `GET /api/alerts` / `GET /api/alerts/unread-count` / `PUT /api/alerts/:id/read` | app | Lecture et gestion des alertes |
| `POST /api/photos` (multipart, champ `photo`) | boîtier (ESP32-CAM) | Upload d'une capture |
| `GET /api/photos` / `GET /api/photos/near?timestamp=&tolerance=` | app | Galerie / photo la plus proche d'un événement (`tolerance` en secondes, 1800 par défaut) |
| `GET /api/weather` | app | Prévisions 5 jours (Open-Meteo, sur les coordonnées de la parcelle) |
| `GET /api/satellite/dates` / `GET /api/satellite/ndvi?date=` | app | Cartographie NDVI |
| `GET /api/assistant/history` | app | Historique de conversation |
| `POST /api/assistant/message` (JSON `{text}`) | app | Message texte à l'assistant |
| `POST /api/assistant/photo` (multipart, champ `photo`) | app | Diagnostic photo d'une plante |

## Obtenir les clés API (Anthropic + Sentinel Hub)

Le backend fonctionne sans ces clés (assistant IA en erreur propre, carte
satellite en mode simulé), mais voici comment les obtenir pour activer les
vraies fonctionnalités :

### Anthropic (assistant IA — chat + diagnostic photo)

1. Créez un compte sur [console.anthropic.com](https://console.anthropic.com)
2. Ajoutez un moyen de paiement (facturation à l'usage, pas d'abonnement)
3. Section "API Keys" → "Create Key" → copiez la clé dans `ANTHROPIC_API_KEY`

### Sentinel Hub / Copernicus (cartographie satellite NDVI)

Gratuit, aucune carte bancaire requise :

1. Créez un compte sur [dataspace.copernicus.eu](https://dataspace.copernicus.eu)
2. Connectez-vous, survolez l'icône de profil (en haut à droite), cliquez
   "Sentinel Hub" pour ouvrir le tableau de bord dédié
3. Dans "User Settings" → "OAuth clients", créez un nouveau client : vous
   obtenez immédiatement un `Client ID` et un `Client Secret`
4. Renseignez-les dans `SENTINEL_HUB_CLIENT_ID` et `SENTINEL_HUB_CLIENT_SECRET`

Le décodage de l'image NDVI renvoyée par Sentinel Hub (GeoTIFF) est
implémenté avec la librairie `geotiff.js` et a été vérifié par un test
d'aller-retour (écriture d'une image de test, puis décodage avec exactement
le même code que celui utilisé en production — dimensions et valeurs
retrouvées à l'identique). Le seul maillon non testé est l'appel réel à
Sentinel Hub lui-même, faute d'identifiants disponibles dans cet
environnement — à vérifier dès qu'un compte Copernicus est configuré. Tant
qu'aucun identifiant n'est renseigné, ou si l'appel échoue pour une raison
quelconque (pas de scène disponible à la date demandée, service
indisponible), le service retombe automatiquement sur des données simulées
(`"source": "simule"` dans la réponse) plutôt que de faire échouer la
requête.

## Ce qui reste à faire pour une intégration complète

1. **Firmware → backend** : ✅ implémenté (Wi-Fi + appels HTTP vers ces
   routes) dans `rx35-firmware-main` et `rx35-firmware-cam` — voir leurs
   README respectifs. Reste à tester sur du vrai matériel ESP32, non
   disponible dans cet environnement de développement.
2. **App mobile → backend** : ✅ `rx35-app/src/services/api.ts` appelle
   réellement ces routes (plus de données simulées par défaut).
3. **Cartographie satellite réelle** : ✅ authentification et décodage
   d'image implémentés et vérifiés par un test de round-trip (voir
   ci-dessus) — reste à tester contre le vrai service avec un compte
   Copernicus.
4. **Comptes utilisateurs** : ✅ authentification par compte (inscription,
   connexion, JWT) en place et testée. Reste à ajouter si besoin :
   réinitialisation de mot de passe oublié, vérification du numéro par
   SMS/OTP, et une notion de plusieurs parcelles par compte (actuellement
   une seule parcelle globale, partagée par tous les comptes).

