// ============================================================
// Authentification et contrôle d'accès.
//
// Trois niveaux :
//  - requireAuth        : identifie l'utilisateur (JWT de l'application)
//  - requireParcelAccess: vérifie qu'il est membre de la parcelle visée
//  - requireDevice      : authentifie un boîtier par sa clé propre
//
// requireParcelAccess est la pièce qui empêche un agriculteur de lire les
// relevés — ou de piloter la pompe — d'une parcelle qui n'est pas la
// sienne : sans elle, un simple changement d'identifiant dans l'URL
// suffirait.
// ============================================================
import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../services/tokenService";
import { authenticateDevice, getMemberRole, Role } from "../db/store";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      parcelId?: string;
      role?: Role;
      deviceId?: string;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.header("Authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: "Authentification requise (en-tête Authorization: Bearer <token>)." });
  }
  const userId = verifyToken(token);
  if (!userId) {
    return res.status(401).json({ error: "Session invalide ou expirée, reconnectez-vous." });
  }
  req.userId = userId;
  next();
}

/**
 * À monter sur les routes /api/parcels/:parcelId/... — suppose requireAuth
 * déjà passé. Renseigne req.parcelId et req.role.
 */
export async function requireParcelAccess(req: Request, res: Response, next: NextFunction) {
  const parcelId = req.params.parcelId;
  if (!parcelId || !/^[0-9a-f-]{36}$/i.test(parcelId)) {
    return res.status(400).json({ error: "Identifiant de parcelle invalide." });
  }
  try {
    const role = await getMemberRole(parcelId, req.userId!);
    if (!role) {
      // 404 plutôt que 403 : ne pas révéler l'existence d'une parcelle
      // à quelqu'un qui n'y a pas accès.
      return res.status(404).json({ error: "Parcelle introuvable." });
    }
    req.parcelId = parcelId;
    req.role = role;
    next();
  } catch (err) {
    next(err);
  }
}

/** Restreint une route à certains rôles (ex. piloter la pompe). */
export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.role || !roles.includes(req.role)) {
      return res.status(403).json({ error: "Votre rôle sur cette parcelle ne permet pas cette action." });
    }
    next();
  };
}

/**
 * Boîtier -> backend. La clé porte l'identifiant du boîtier, donc la
 * parcelle concernée : le firmware n'a jamais à la préciser, et ne peut
 * pas écrire dans une autre.
 */
export async function requireDevice(req: Request, res: Response, next: NextFunction) {
  const key = req.header("X-Device-Key");
  if (!key) {
    return res.status(401).json({ error: "Clé du boîtier manquante (en-tête X-Device-Key)." });
  }
  try {
    const device = await authenticateDevice(key);
    if (!device) {
      return res.status(401).json({ error: "Clé du boîtier invalide." });
    }
    req.deviceId = device.id;
    req.parcelId = device.parcelId;
    next();
  } catch (err) {
    next(err);
  }
}
