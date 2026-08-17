import { Router } from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { createUser, findUserByPhone, findUserById, updateUser, UserAccount } from "../db/store";
import { signToken } from "../services/tokenService";
import { requireAuth } from "../middleware/auth";

export const authRouter = Router();

function publicUser(u: UserAccount) {
  return { id: u.id, nom: u.nom, telephone: u.telephone };
}

authRouter.post("/register", async (req, res) => {
  const { nom, telephone, password } = req.body ?? {};
  if (typeof nom !== "string" || !nom.trim() || typeof telephone !== "string" || !telephone.trim()) {
    return res.status(400).json({ error: "Champs 'nom' et 'telephone' requis." });
  }
  if (typeof password !== "string" || password.length < 6) {
    return res.status(400).json({ error: "Le mot de passe doit contenir au moins 6 caractères." });
  }
  if (findUserByPhone(telephone.trim())) {
    return res.status(409).json({ error: "Un compte existe déjà avec ce numéro." });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user: UserAccount = {
    id: crypto.randomUUID(),
    nom: nom.trim(),
    telephone: telephone.trim(),
    passwordHash,
    createdAt: Date.now() / 1000,
  };
  createUser(user);

  const token = signToken(user.id);
  res.status(201).json({ token, user: publicUser(user) });
});

authRouter.post("/login", async (req, res) => {
  const { telephone, password } = req.body ?? {};
  if (typeof telephone !== "string" || typeof password !== "string") {
    return res.status(400).json({ error: "Champs 'telephone' et 'password' requis." });
  }

  const user = findUserByPhone(telephone.trim());
  if (!user) return res.status(401).json({ error: "Numéro ou mot de passe incorrect." });

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return res.status(401).json({ error: "Numéro ou mot de passe incorrect." });

  const token = signToken(user.id);
  res.json({ token, user: publicUser(user) });
});

authRouter.get("/me", requireAuth, (req, res) => {
  const user = findUserById(req.userId!);
  if (!user) return res.status(404).json({ error: "Compte introuvable." });
  res.json(publicUser(user));
});

authRouter.put("/me", requireAuth, (req, res) => {
  const { nom, telephone } = req.body ?? {};
  const update: { nom?: string; telephone?: string } = {};
  if (typeof nom === "string" && nom.trim()) update.nom = nom.trim();
  if (typeof telephone === "string" && telephone.trim()) update.telephone = telephone.trim();

  const user = updateUser(req.userId!, update);
  if (!user) return res.status(404).json({ error: "Compte introuvable." });
  res.json(publicUser(user));
});
