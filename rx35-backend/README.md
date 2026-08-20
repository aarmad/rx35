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

**PostgreSQL** (`pg`), schéma dans `src/db/schema.sql`, appliqué
automatiquement au démarrage. Toutes les requêtes SQL vivent dans
`src/db/store.ts` — les routes n'écrivent jamais de SQL.

Le stockage a d'abord été un simple fichier `data/db.json`. Il a fallu en
sortir : sur le plan gratuit de Render, le disque est **effacé à chaque
redéploiement**, ce qui a été constaté en pratique — comptes et historique
perdus. `DATABASE_URL` pointe donc vers une base Postgres gérée (Render,
Neon, Supabase…). En local, un conteneur sur le port 5433 :

```bash
docker run -d --name rx35-db -p 5433:5432   -e POSTGRES_PASSWORD=rx35dev -e POSTGRES_DB=rx35 postgres:16
```

Les photos restent des fichiers (`data/photos/`).

## Cloisonnement des données (multi-parcelles)

Tout est rattaché à une **parcelle**. Un utilisateur n'accède qu'aux
parcelles dont il est membre, avec un rôle :

| Rôle | Peut |
| --- | --- |
| `proprietaire` | tout, y compris ajouter/retirer des membres et des boîtiers |
| `membre` | consulter et **commander la pompe** |
| `observateur` | consulter seulement |

Un non-membre reçoit **404** et non 403 : savoir qu'une parcelle existe est
déjà une information. Ce cloisonnement est couvert par une suite de tests
d'isolation (deux agriculteurs, chacun aveugle à la parcelle de l'autre).

## Authentification

Trois mécanismes, pour trois appelants :

- **Boîtier → backend** : `X-Device-Key`, une clé **propre à chaque
  boîtier** de la forme `<uuid>.<secret>`, générée à la création du boîtier
  et affichée une seule fois. Seul son hachage SHA-256 est stocké, et la
  comparaison est à temps constant. La parcelle est déduite de la clé : un
  boîtier ne peut écrire que dans la sienne. (Le `DEVICE_API_KEY` unique et
  partagé des premières versions a disparu — il donnait accès à tout.)
- **Application → backend** : comptes utilisateurs. `POST
  /api/auth/register` (nom, téléphone, mot de passe ≥ 6 caractères) ou
  `POST /api/auth/login` renvoient un token JWT, à envoyer dans
  `Authorization: Bearer <token>`. Mots de passe hachés avec bcrypt.
  Sessions valables 30 jours.
- **Mot de passe oublié** : voir ci-dessous.

## Mot de passe oublié

`POST /api/auth/forgot` envoie un code à 6 chiffres à l'adresse e-mail du
compte (l'e-mail est facultatif, renseigné via `PUT /api/auth/me`).
`POST /api/auth/reset` échange le code contre un nouveau mot de passe et
connecte l'utilisateur.

Ce qui protège le compte :

- le code est **haché** en base (jamais lisible, même avec un accès SQL) ;
- il **expire en 15 minutes** et ne sert **qu'une fois** ;
- **5 essais** ratés le brûlent — il faut en redemander un ;
- une nouvelle demande **annule** la précédente ;
- le serveur renvoie **le même message** que le numéro existe ou non, et la
  **même erreur** pour un code faux, expiré ou un compte inconnu ;
- le code n'apparaît **jamais** dans une réponse HTTP.

**Envoi de l'e-mail.** Renseignez `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`
(et `SMTP_PORT`, `SMTP_FROM`) — n'importe quel fournisseur convient (Brevo,
Resend, Gmail…). **Sans SMTP configuré**, la fonctionnalité reste utilisable
pour les tests : le code est écrit dans les **logs du serveur** au lieu
d'être envoyé. `GET /api/auth/reset-disponible` dit à l'app si l'envoi
d'e-mail est réellement actif, pour qu'elle n'invite pas l'agriculteur à
attendre un message qui n'arrivera pas.

## Endpoints

`:p` = identifiant de parcelle. Toutes les routes `/api/parcels/:p/*`
exigent un token **et** la qualité de membre de cette parcelle.

| Méthode & route | Appelant | Description |
| --- | --- | --- |
| `GET /health` | — | Vérification que le serveur tourne |
| `POST /api/auth/register` | app | Créer un compte (crée aussi sa première parcelle) |
| `POST /api/auth/login` | app | Se connecter, renvoie un token |
| `GET` / `PUT /api/auth/me` | app | Lire / modifier son compte (dont l'e-mail) |
| `POST /api/auth/forgot` | app | Demander un code de réinitialisation |
| `POST /api/auth/reset` | app | Nouveau mot de passe via le code |
| `GET /api/auth/reset-disponible` | app | L'envoi d'e-mail est-il configuré ? |
| `GET` / `POST /api/parcels` | app | Lister ses parcelles / en créer une |
| `GET` / `PUT /api/parcels/:p` | app | Infos de la parcelle (nom, culture, date, GPS) |
| `GET` / `POST /api/parcels/:p/members` | app | Membres ; ajout réservé au propriétaire |
| `DELETE /api/parcels/:p/members/:userId` | app | Retirer un membre (propriétaire) |
| `GET` / `POST /api/parcels/:p/devices` | app | Boîtiers ; la création renvoie la clé **une seule fois** |
| `DELETE /api/parcels/:p/devices/:deviceId` | app | Révoquer un boîtier (propriétaire) |
| `GET /api/parcels/:p/sensors/latest` | app | Dernier relevé |
| `GET /api/parcels/:p/sensors/history?period=1\|7\|30` | app | Historique (jours) |
| `GET /api/parcels/:p/npk/latest` | app | Dernier relevé NPK |
| `GET /api/parcels/:p/irrigation/state` | app | Mode **et** état de la pompe |
| `PUT /api/parcels/:p/irrigation/mode` | app | Auto ou manuel (propriétaire/membre) |
| `PUT /api/parcels/:p/irrigation/pump` | app | Commande pompe (propriétaire/membre) |
| `GET /api/parcels/:p/alerts` · `/alerts/unread-count` · `PUT /alerts/:id/read` | app | Alertes |
| `GET /api/parcels/:p/photos` · `/photos/near?timestamp=&tolerance=` | app | Galerie / photo la plus proche (`tolerance` en s, 1800 par défaut) |
| `GET /api/parcels/:p/weather` | app | Prévisions 5 jours (Open-Meteo, sur les coordonnées GPS) |
| `GET /api/parcels/:p/satellite/dates` · `/satellite/ndvi?date=` | app | Cartographie NDVI |
| `GET /api/parcels/:p/assistant/history` | app | Historique de conversation |
| `POST /api/parcels/:p/assistant/message` (JSON `{text}`) | app | Message à l'assistant |
| `POST /api/parcels/:p/assistant/photo` (multipart `photo`) | app | Diagnostic photo |
| `POST /api/device/sensors` | boîtier | Envoi d'un relevé capteurs |
| `POST /api/device/npk` | boîtier | Envoi d'un relevé sonde NPK |
| `POST /api/device/alerts` | boîtier | Nouvel événement (mouvement, alarme, badge refusé…) |
| `POST /api/device/photos` (multipart `photo`) | boîtier (ESP32-CAM) | Upload d'une capture |
| `GET /api/device/commands` | boîtier | Le firmware relit ce que l'app a demandé |

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

