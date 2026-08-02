import { Router } from "express";
import { getKnex } from "../db.js";
import { optionalAuth, requireAuth } from "../middleware/auth.js";
import { executeQuery } from "../query/queryExecutor.js";

const router = Router();

router.post("/", optionalAuth, requireAuth, async (req, res) => {
  try {
    const knex = getKnex();
    const out = await executeQuery(knex, req.body, req.user);
    if (out.error) {
      return res.status(400).json({ data: null, error: out.error });
    }
    return res.json({ data: out.data, count: out.count ?? undefined, error: null });
  } catch (e) {
    console.error("query error", e);
    return res.status(400).json({ data: null, error: { message: e.message || "Query failed" } });
  }
});

export default router;
