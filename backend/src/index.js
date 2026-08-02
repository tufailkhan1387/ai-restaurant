import "dotenv/config";
import express from "express";
import { runMigrations } from "./db/runMigrations.js";
import cors from "cors";
import authRoutes from "./routes/auth.js";
import queryRoutes from "./routes/query.js";
import uploadsRoutes from "./routes/uploads.js";
import publicRoutes from "./routes/public.js";
import functionRoutes from "./routes/functions.js";
import statsRoutes from "./routes/stats.js";
import inventoryRoutes from "./routes/inventory.js";
import { twilioInboundWebhook } from "./fns/twilioInboundWebhook.js";

const app = express();
const PORT = Number(process.env.PORT || 3033);

const allowedOrigins = [
  process.env.PUBLIC_APP_URL,
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "https://airestaurant.toolkitpro.cloud"
].filter(Boolean);

const corsMiddleware = cors({
  origin(origin, cb) {
    // Allow non-browser clients (no Origin header)
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    // Allow local development ports
    if (origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:")) return cb(null, true);
    return cb(null, false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
});

app.use(corsMiddleware);
app.options("*", corsMiddleware);

const jsonParser = express.json({ limit: "2mb" });

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "airestaurantorder-api" });
});

app.use("/api/auth", jsonParser, authRoutes);
app.use("/api/uploads", uploadsRoutes);
app.use("/api/public", jsonParser, publicRoutes);
app.use("/api/query", jsonParser, queryRoutes);
app.use("/api/stats", jsonParser, statsRoutes);
app.use("/api/inventory", jsonParser, inventoryRoutes);

app.post(
  "/api/functions/twilio-inbound-webhook",
  express.urlencoded({ extended: false }),
  twilioInboundWebhook,
);
app.use("/api/functions", jsonParser, functionRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || "Server error" });
});

async function start() {
  if (process.env.DATABASE_URL?.trim()) {
    try {
      const count = await runMigrations(process.env.DATABASE_URL);
      console.log(`Database migrations ok (${count} file(s)).`);
    } catch (err) {
      console.error("Database migration failed:", err.message || err);
      process.exit(1);
    }
  } else {
    console.warn("DATABASE_URL not set — skipping migrations.");
  }

  app.listen(PORT, () => {
    console.log(`API listening on http://127.0.0.1:${PORT}`);
  });
}

start();
