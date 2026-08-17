// ============================================================
// Parcelles : création, liste, membres et boîtiers.
//
// Toutes les routes de données de l'application sont montées SOUS
// /api/parcels/:parcelId (voir index.ts), derrière requireParcelAccess.
// ============================================================
import { Router } from "express";
import crypto from "crypto";
import {
  createParcel,
  listParcelsForUser,
  getParcel,
  updateParcel,
  listMembers,
  addMember,
  removeMember,
  findUserByPhone,
  createDevice,
  listDevices,
  deleteDevice,
  Culture,
  Role,
} from "../db/store";
import { requireAuth, requireParcelAccess, requireRole } from "../middleware/auth";

export const parcelsRouter = Router();

const CULTURES: Culture[] = ["tomate", "mais", "riz", "piment", "oignon"];
const ROLES: Role[] = ["proprietaire", "membre", "observateur"];

parcelsRouter.use(requireAuth);

// --- Mes parcelles ---
parcelsRouter.get("/", async (req, res, next) => {
  try {
    res.json(await listParcelsForUser(req.userId!));
  } catch (e) {
    next(e);
  }
});

parcelsRouter.post("/", async (req, res, next) => {
  const { nom, culture, datePlantation, latitude, longitude } = req.body ?? {};
  if (typeof nom !== "string" || !nom.trim()) {
    return res.status(400).json({ error: "Le nom de la parcelle est requis." });
  }
  if (culture !== undefined && !CULTURES.includes(culture)) {
    return res.status(400).json({ error: `Culture inconnue. Valeurs acceptées : ${CULTURES.join(", ")}.` });
  }
  try {
    const parcel = await createParcel(req.userId!, {
      nom: nom.trim(),
      culture,
      datePlantation,
      latitude: typeof latitude === "number" ? latitude : undefined,
      longitude: typeof longitude === "number" ? longitude : undefined,
    });
    res.status(201).json({ ...parcel, role: "proprietaire" });
  } catch (e) {
    next(e);
  }
});

// --- Une parcelle ---
parcelsRouter.get("/:parcelId", requireParcelAccess, async (req, res, next) => {
  try {
    const parcel = await getParcel(req.parcelId!);
    res.json({ ...parcel, role: req.role });
  } catch (e) {
    next(e);
  }
});

parcelsRouter.put("/:parcelId", requireParcelAccess, requireRole("proprietaire", "membre"), async (req, res, next) => {
  const { culture } = req.body ?? {};
  if (culture !== undefined && !CULTURES.includes(culture)) {
    return res.status(400).json({ error: `Culture inconnue. Valeurs acceptées : ${CULTURES.join(", ")}.` });
  }
  try {
    const updated = await updateParcel(req.parcelId!, req.body ?? {});
    res.json({ ...updated, role: req.role });
  } catch (e) {
    next(e);
  }
});

// --- Membres (coopérative) ---
parcelsRouter.get("/:parcelId/members", requireParcelAccess, async (req, res, next) => {
  try {
    res.json(await listMembers(req.parcelId!));
  } catch (e) {
    next(e);
  }
});

// On invite par numéro de téléphone : c'est l'identifiant que les
// agriculteurs connaissent les uns des autres.
parcelsRouter.post("/:parcelId/members", requireParcelAccess, requireRole("proprietaire"), async (req, res, next) => {
  const { telephone, role } = req.body ?? {};
  if (typeof telephone !== "string" || !telephone.trim()) {
    return res.status(400).json({ error: "Numéro de téléphone requis." });
  }
  if (role !== undefined && !ROLES.includes(role)) {
    return res.status(400).json({ error: `Rôle inconnu. Valeurs acceptées : ${ROLES.join(", ")}.` });
  }
  try {
    const user = await findUserByPhone(telephone.trim());
    if (!user) {
      return res.status(404).json({ error: "Aucun compte RX35 avec ce numéro. La personne doit d'abord créer son compte." });
    }
    await addMember(req.parcelId!, user.id, role ?? "membre");
    res.status(201).json(await listMembers(req.parcelId!));
  } catch (e) {
    next(e);
  }
});

parcelsRouter.delete("/:parcelId/members/:userId", requireParcelAccess, requireRole("proprietaire"), async (req, res, next) => {
  if (req.params.userId === req.userId) {
    return res.status(400).json({ error: "Un propriétaire ne peut pas se retirer lui-même de sa parcelle." });
  }
  try {
    await removeMember(req.parcelId!, req.params.userId);
    res.json(await listMembers(req.parcelId!));
  } catch (e) {
    next(e);
  }
});

// --- Boîtiers ---
parcelsRouter.get("/:parcelId/devices", requireParcelAccess, async (req, res, next) => {
  try {
    res.json(await listDevices(req.parcelId!));
  } catch (e) {
    next(e);
  }
});

// La clé complète n'est renvoyée qu'ici, une seule fois : elle est ensuite
// stockée hashée. À recopier dans la configuration du firmware.
parcelsRouter.post("/:parcelId/devices", requireParcelAccess, requireRole("proprietaire"), async (req, res, next) => {
  try {
    const { device, key } = await createDevice(req.parcelId!, req.body?.nom);
    res.status(201).json({ ...device, key });
  } catch (e) {
    next(e);
  }
});

parcelsRouter.delete("/:parcelId/devices/:deviceId", requireParcelAccess, requireRole("proprietaire"), async (req, res, next) => {
  try {
    const ok = await deleteDevice(req.params.deviceId, req.parcelId!);
    if (!ok) return res.status(404).json({ error: "Boîtier introuvable sur cette parcelle." });
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});
