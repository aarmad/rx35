import { Router } from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { createUser, findUserByPhone, findUserById, updateUser, createParcel, UserAccount } from "../db/store";
import { signToken } from "../services/tokenService";
import { requireAuth } from "../middleware/auth";

export const authRouter = Router();

function publicUser(u: UserAccount) {
  return { id: u.id, nom: u.nom, telephone: u.telephone };
}

authRouter.post("/register", async (req, res, next) => {
  const { nom, telephone, password, nomParcelle } = req.body ?? {};
  if (typeof nom !== "string" || !nom.trim() || typeof telephone !== "string" || !telephone.trim()) {
    return res.status(400).json({ error: "Champs 'nom' et 'telephone' requis." });
  }
  if (typeof password !== "string" || password.length < 6) {
    return res.status(400).json({ error: "Le mot de passe doit contenir au moins 6 caractères." });
  }

  try {
    if (await findUserByPhone(telephone.trim())) {
      return res.status(409).json({ error: "Un compte existe déjà avec ce numéro." });
    }

    const user: UserAccount = {
      id: crypto.randomUUID(),
      nom: nom.trim(),
      telephone: telephone.trim(),
      passwordHash: await bcrypt.hash(password, 10),
      createdAt: Date.now() / 1000,
    };
    await createUser(user);

    // Une première parcelle est créée d'office : sans elle, l'application
    // n'aurait aucun écran à afficher juste après l'inscription. Elle est
    // renommable dans Réglages.
    const parcel = await createParcel(user.id, {
      nom: typeof nomParcelle === "string" && nomParcelle.trim() ? nomParcelle.trim() : "Ma parcelle",
    });

    res.status(201).json({ token: signToken(user.id), user: publicUser(user), parcel });
  } catch (e) {
    next(e);
  }
});

authRouter.post("/login", async (req, res, next) => {
  const { telephone, password } = req.body ?? {};
  if (typeof telephone !== "string" || typeof password !== "string") {
    return res.status(400).json({ error: "Champs 'telephone' et 'password' requis." });
  }

  try {
    const user = await findUserByPhone(telephone.trim());
    // Message identique dans les deux cas : ne pas révéler quels numéros
    // ont un compte.
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: "Numéro ou mot de passe incorrect." });
    }
    res.json({ token: signToken(user.id), user: publicUser(user) });
  } catch (e) {
    next(e);
  }
});

authRouter.get("/me", requireAuth, async (req, res, next) => {
  try {
    const user = await findUserById(req.userId!);
    if (!user) return res.status(404).json({ error: "Compte introuvable." });
    res.json(publicUser(user));
  } catch (e) {
    next(e);
  }
});

authRouter.put("/me", requireAuth, async (req, res, next) => {
  const { nom, telephone } = req.body ?? {};
  try {
    if (typeof telephone === "string" && telephone.trim()) {
      const existant = await findUserByPhone(telephone.trim());
      if (existant && existant.id !== req.userId) {
        return res.status(409).json({ error: "Ce numéro est déjà utilisé par un autre compte." });
      }
    }
    const user = await updateUser(req.userId!, {
      nom: typeof nom === "string" && nom.trim() ? nom.trim() : undefined,
      telephone: typeof telephone === "string" && telephone.trim() ? telephone.trim() : undefined,
    });
    if (!user) return res.status(404).json({ error: "Compte introuvable." });
    res.json(publicUser(user));
  } catch (e) {
    next(e);
  }
});
