const fs = require("fs");
const path = require("path");
const express = require("express");

const asyncHandler = require("../utils/asyncHandler");
const { authenticate } = require("../middleware/auth");
const DentalRecord = require("../models/DentalRecord");
const Message = require("../models/Message");
const {
  deleteChatFile,
  deleteClinicalFile,
  isManagedChatFile,
  isManagedClinicalFile,
  uploadChatFileToSupabase,
  uploadImageToSupabase,
  uploadClinicalFileToSupabase,
  LOCAL_CLINICAL_DIR,
} = require("../services/supabaseStorageService");

const router = express.Router();
const allowedFolders = new Set(["profiles", "clinic", "promotions", "patients", "inventory", "general"]);

router.post(
  "/image",
  authenticate,
  asyncHandler(async (req, res) => {
    const folder = allowedFolders.has(String(req.body.folder || "").trim())
      ? String(req.body.folder).trim()
      : "general";
    if (folder === "promotions" && req.user.role !== "admin") {
      return res.status(403).json({ message: "Only administrators can upload promotion images." });
    }
    const maxSizeBytes = Math.min(Number(req.body.maxSizeBytes) || 1024 * 1024, 2 * 1024 * 1024);
    const result = await uploadImageToSupabase({
      imageData: req.body.imageData,
      folder,
      fileName: req.body.fileName,
      maxSizeBytes,
    });

    res.status(201).json({
      message: "Image uploaded successfully.",
      data: result,
    });
  }),
);

router.post(
  "/chat-file",
  authenticate,
  asyncHandler(async (req, res) => {
    if (!["patient", "admin", "staff"].includes(req.user.role)) {
      return res.status(403).json({ message: "You do not have permission to upload chat attachments." });
    }
    const result = await uploadChatFileToSupabase({
      fileData: req.body.fileData,
      fileName: req.body.fileName,
      maxSizeBytes: 5 * 1024 * 1024,
    });
    res.status(201).json({ message: "Chat attachment uploaded securely.", data: result });
  }),
);

router.delete(
  "/chat-file",
  authenticate,
  asyncHandler(async (req, res) => {
    if (!isManagedChatFile(req.body)) {
      return res.status(400).json({ message: "Chat attachment reference is invalid." });
    }
    const isInUse = await Message.exists({ "attachment.path": req.body.path });
    if (isInUse) return res.status(409).json({ message: "This attachment is already linked to a message." });
    await deleteChatFile(req.body);
    res.json({ message: "Unused chat attachment removed." });
  }),
);

router.delete(
  "/clinical-file",
  authenticate,
  asyncHandler(async (req, res) => {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Only administrators can remove clinical attachments." });
    }
    if (!isManagedClinicalFile(req.body)) {
      return res.status(400).json({ message: "Clinical attachment reference is invalid." });
    }
    const isInUse = await DentalRecord.exists({ "attachments.path": req.body.path });
    if (isInUse) {
      return res.status(409).json({ message: "This attachment is already linked to a record." });
    }
    await deleteClinicalFile(req.body);
    res.json({ message: "Unused clinical attachment removed." });
  }),
);

router.post(
  "/clinical-file",
  authenticate,
  asyncHandler(async (req, res) => {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Only administrators can upload clinical attachments." });
    }

    const result = await uploadClinicalFileToSupabase({
      fileData: req.body.fileData,
      fileName: req.body.fileName,
      maxSizeBytes: 5 * 1024 * 1024,
    });

    const category = req.body.category === "xray" ? "xray" : "file";
    res.status(201).json({
      message: "Clinical attachment uploaded securely.",
      data: {
        ...result,
        category,
      },
    });
  }),
);

router.get(
  "/clinical-file-view",
  authenticate,
  asyncHandler(async (req, res) => {
    const rawPath = String(req.query.path || "");
    if (!rawPath || rawPath.includes("..") || path.isAbsolute(rawPath)) {
      return res.status(400).json({ message: "Invalid file path." });
    }

    const fullPath = path.resolve(LOCAL_CLINICAL_DIR, rawPath);
    if (!fullPath.startsWith(path.resolve(LOCAL_CLINICAL_DIR)) || !fs.existsSync(fullPath)) {
      return res.status(404).json({ message: "Clinical attachment not found." });
    }

    const ext = path.extname(fullPath).toLowerCase();
    const mimeTypes = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".webp": "image/webp",
      ".pdf": "application/pdf",
    };

    res.setHeader("Content-Type", mimeTypes[ext] || "application/octet-stream");
    res.setHeader("Cache-Control", "private, max-age=3600");
    const stream = fs.createReadStream(fullPath);
    stream.pipe(res);
  }),
);

module.exports = router;
