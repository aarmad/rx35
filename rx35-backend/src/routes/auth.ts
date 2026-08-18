import { Router } from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import {
  createUser,
  findUserByPhone,
  findUserByEmail,
  findUserById,
  updateUser,
  createParcel,
  setPassword,
  creerCodeReinitialisation,
  consommerCodeReinitialisation,
  UserAccount,
} from "../db/store";
import { envoyerCodeReinitialisation, mailerConfigure } from "../services/mailer";
import { signToken } from "../services/tokenService";
import { requireAuth } from "../middleware/auth";

export const authRouter = Router();

function publicUser(u: UserAccount) {
  return { id: u.id, nom: u.nom, telephone: u.telephone, email: u.email ?? null };
}

const EMAIL_VALIDE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

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
  const { nom, telephone, email } = req.body ?? {};
  if (email !== undefined && email !== null && email !== "" && !EMAIL_VALIDE.test(String(email))) {
    return res.status(400).json({ error: "Adresse e-mail invalide." });
  }
  try {
    if (typeof email === "string" && email.trim()) {
      const autre = await findUserByEmail(email.trim());
      if (autre && autre.id !== req.userId) {
        return res.status(409).json({ error: "Cette adresse e-mail est déjà utilisée par un autre compte." });
      }
    }
    if (typeof telephone === "string" && telephone.trim()) {
      const existant = await findUserByPhone(telephone.trim());
      if (existant && existant.id !== req.userId) {
        return res.status(409).json({ error: "Ce numéro est déjà utilisé par un autre compte." });
      }
    }
    const user = await updateUser(req.userId!, {
      nom: typeof nom === "string" && nom.trim() ? nom.trim() : undefined,
      telephone: typeof telephone === "string" && telephone.trim() ? telephone.trim() : undefined,
      email: typeof email === "string" && email.trim() ? email.trim() : undefined,
    });
    if (!user) return res.status(404).json({ error: "Compte introuvable." });
    res.json(publicUser(user));
  } catch (e) {
    next(e);
  }
});

// --- Mot de passe oublié ----------------------------------------------
//
// L'agriculteur s'identifie par son numéro (l'identifiant qu'il connaît) ;
// le code part sur l'e-mail éventuellement enregistré. La réponse est
// TOUJOURS la même : révéler qu'un numéro existe, ou qu'il a un e-mail,
// renseignerait un attaquant.

authRouter.post("/forgot", async (req, res, next) => {
  const { telephone } = req.body ?? {};
  const reponseNeutre = {
    ok: true,
    message: "Si ce numéro correspond à un compte disposant d'une adresse e-mail, un code vient d'y être envoyé.",
  };
  if (typeof telephone !== "string" || !telephone.trim()) {
    return res.status(400).json({ error: "Numéro de téléphone requis." });
  }

  try {
    const user = await findUserByPhone(telephone.trim());
    if (user?.email) {
      const code = await creerCodeReinitialisation(user.id);
      try {
        await envoyerCodeReinitialisation(user.email, user.nom, code);
      } catch (err) {
        // L'envoi peut échouer (SMTP indisponible) : on le trace sans
        // l'exposer, le code reste valable si l'e-mail finit par partir.
        console.error("[forgot] envoi e-mail impossible :", err);
      }
    }
    res.json(reponseNeutre);
  } catch (e) {
    next(e);
  }
});

authRouter.post("/reset", async (req, res, next) => {
  const { telephone, code, password } = req.body ?? {};
  if (typeof telephone !== "string" || typeof code !== "string") {
    return res.status(400).json({ error: "Numéro et code requis." });
  }
  if (typeof password !== "string" || password.length < 6) {
    return res.status(400).json({ error: "Le nouveau mot de passe doit contenir au moins 6 caractères." });
  }

  try {
    const user = await findUserByPhone(telephone.trim());
    // Message identique que le compte existe ou non, et que le code soit
    // faux ou expiré : aucune information exploitable.
    const invalide = { error: "Code invalide ou expiré. Demandez-en un nouveau." };
    if (!user) return res.status(400).json(invalide);

    const ok = await consommerCodeReinitialisation(user.id, code.trim());
    if (!ok) return res.status(400).json(invalide);

    await setPassword(user.id, await bcrypt.hash(password, 10));
    // Connexion immédiate : l'agriculteur n'a pas à ressaisir ce qu'il
    // vient de choisir.
    res.json({ token: signToken(user.id), user: publicUser(user) });
  } catch (e) {
    next(e);
  }
});

/** Indique à l'application si la réinitialisation par e-mail est opérationnelle. */
authRouter.get("/reset-disponible", (_req, res) => {
  res.json({ email: mailerConfigure() });
});
