import express, { Router } from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { optionalAuth, requireAuth } from "../middleware/auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsRoot = path.join(__dirname, "..", "..", "uploads");

function multerForSubdir(subdir) {
  const dir = path.join(uploadsRoot, subdir);
  fs.mkdirSync(dir, { recursive: true });
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, dir),
    filename: (_req, file, cb) => {
      const ext =
        file.mimetype === "image/jpeg"
          ? ".jpg"
          : file.mimetype === "image/png"
            ? ".png"
            : file.mimetype === "image/webp"
              ? ".webp"
              : file.mimetype === "image/gif"
                ? ".gif"
                : ".img";
      cb(null, `${randomUUID()}${ext}`);
    },
  });
  return multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (/^image\/(jpeg|png|gif|webp)$/.test(file.mimetype)) cb(null, true);
      else cb(null, false);
    },
  });
}

const uploadDeal = multerForSubdir("deals");
const uploadMenuItem = multerForSubdir("menu-items");
const uploadRestaurant = multerForSubdir("restaurants");
const uploadFleet = multerForSubdir("fleet");

function runSingleUpload(uploader, req, res, next) {
  uploader.single("file")(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ error: "Image must be 5MB or smaller" });
      }
      return res.status(400).json({ error: err.message });
    }
    if (err) return res.status(400).json({ error: err.message || "Upload failed" });
    next();
  });
}

const router = Router();

router.post("/deal-image", optionalAuth, requireAuth, (req, res, next) => {
  runSingleUpload(uploadDeal, req, res, next);
}, (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded (use JPEG, PNG, GIF, or WebP)" });
  }
  res.json({ url: `/api/uploads/deals/${req.file.filename}` });
});

router.post("/menu-item-image", optionalAuth, requireAuth, (req, res, next) => {
  runSingleUpload(uploadMenuItem, req, res, next);
}, (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded (use JPEG, PNG, GIF, or WebP)" });
  }
  res.json({ url: `/api/uploads/menu-items/${req.file.filename}` });
});

router.post("/restaurant-branding-image", optionalAuth, requireAuth, (req, res, next) => {
  runSingleUpload(uploadRestaurant, req, res, next);
}, (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded (use JPEG, PNG, GIF, or WebP)" });
  }
  res.json({ url: `/api/uploads/restaurants/${req.file.filename}` });
});

router.post("/fleet-image", optionalAuth, requireAuth, (req, res, next) => {
  runSingleUpload(uploadFleet, req, res, next);
}, (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded (use JPEG, PNG, GIF, or WebP)" });
  }
  res.json({ url: `/api/uploads/fleet/${req.file.filename}` });
});

router.use(express.static(uploadsRoot));

export default router;
