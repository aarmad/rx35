// ============================================================
// Authentification.
//
// Boîtier -> backend : toujours par clé partagée dans "X-Device-Key" (pas
// de notion de compte côté matériel).
//
// Application -> backend : authentification par compte utilisateur (JWT),
// voir routes/auth.ts. req.userId est renseigné par requireAuth pour que
// les routes suivantes sachent qui fait la requête.
// ============================================================
import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../services/tokenService";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export function requireDeviceKey(req: Request, res: Response, next: NextFunction) {
  const key = req.header("X-Device-Key");
  if (!key || key !== process.env.DEVICE_API_KEY) {
    return res.status(401).json({ error: "Clé du boîtier manquante ou invalide (en-tête X-Device-Key)." });
  }
  next();
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
