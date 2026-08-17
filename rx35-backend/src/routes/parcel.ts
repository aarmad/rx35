import { Router } from "express";
import { getParcel, updateParcel } from "../db/store";
import { requireAuth } from "../middleware/auth";

export const parcelRouter = Router();

parcelRouter.get("/", requireAuth, (_req, res) => {
  res.json(getParcel());
});

parcelRouter.put("/", requireAuth, (req, res) => {
  const updated = updateParcel(req.body ?? {});
  res.json(updated);
});
