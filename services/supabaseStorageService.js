const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

const loadedEnv = dotenv.config({ path: path.resolve(__dirname, "../.env"), quiet: true }).parsed || {};
const LOCAL_CLINICAL_DIR = path.resolve(__dirname, "../uploads/clinical-files");

const DATA_URL_PATTERN = /^data:(image\/(?:png|jpe?g|webp|gif));base64,([A-Za-z0-9+/=]+)$/i;
const CLINICAL_FILE_DATA_URL_PATTERN = /^data:(image\/(?:png|jpe?g|webp)|application\/pdf);base64,([A-Za-z0-9+/=]+)$/i;
const EXTENSIONS_BY_MIME = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
};

const normalizeSupabaseUrl = (value) => String(value || "").trim().replace(/\/+$/, "");

const encodeStoragePath = (path) => path
  .split("/")
  .map((part) => encodeURIComponent(part))
  .join("/");

const sanitizeFolder = (folder) => String(folder || "general")
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9/_-]+/g, "-")
  .replace(/^-+|-+$/g, "")
  .slice(0, 80) || "general";

const sanitizeBaseName = (name) => String(name || "image")
  .trim()
  .toLowerCase()
  .replace(/\.[a-z0-9]+$/i, "")
  .replace(/[^a-z0-9_-]+/g, "-")
  .replace(/^-+|-+$/g, "")
  .slice(0, 50) || "image";

const getEnvValue = (name) => String(process.env[name] || loadedEnv[name] || "").trim();

const getSupabaseConfig = () => ({
  url: normalizeSupabaseUrl(getEnvValue("SUPABASE_URL")),
  key: getEnvValue("SUPABASE_SECRET_KEY") || getEnvValue("SUPABASE_SERVICE_ROLE_KEY"),
  publishableKey: getEnvValue("SUPABASE_PUBLISHABLE_KEY") || getEnvValue("SUPABASE_ANON_KEY"),
  bucket: getEnvValue("SUPABASE_STORAGE_BUCKET") || "fdmst-images",
});

const getClinicalStorageConfig = () => ({
  ...getSupabaseConfig(),
  bucket: getEnvValue("SUPABASE_CLINICAL_STORAGE_BUCKET") || "fdmst-clinical-files",
});

const getChatStorageConfig = () => ({
  ...getSupabaseConfig(),
  bucket: getEnvValue("SUPABASE_CHAT_STORAGE_BUCKET") || "fdmst-chat-files",
});

const getSupabaseHeaders = (config, extraHeaders = {}) => {
  const usesNewSupabaseKey = config.key.startsWith("sb_");
  const headers = {
    apikey: config.key,
    ...extraHeaders,
  };

  if (!usesNewSupabaseKey) {
    headers.Authorization = `Bearer ${config.key}`;
  }

  return headers;
};

const parseImageDataUrl = (imageData) => {
  const match = String(imageData || "").trim().match(DATA_URL_PATTERN);

  if (!match) {
    const error = new Error("Upload must be a valid JPG, PNG, WebP, or GIF image.");
    error.status = 400;
    throw error;
  }

  const mimeType = match[1].toLowerCase();
  const buffer = Buffer.from(match[2], "base64");

  if (!buffer.length) {
    const error = new Error("Selected image is empty.");
    error.status = 400;
    throw error;
  }

  return {
    mimeType,
    extension: EXTENSIONS_BY_MIME[mimeType],
    buffer,
  };
};

const parseClinicalFileDataUrl = (fileData) => {
  const match = String(fileData || "").trim().match(CLINICAL_FILE_DATA_URL_PATTERN);

  if (!match) {
    const error = new Error("Clinical attachments must be a JPG, PNG, WebP, or PDF file.");
    error.status = 400;
    throw error;
  }

  const mimeType = match[1].toLowerCase();
  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length) {
    const error = new Error("Selected attachment is empty.");
    error.status = 400;
    throw error;
  }

  return { mimeType, extension: EXTENSIONS_BY_MIME[mimeType], buffer };
};

const isMissingBucketError = (details) => {
  const text = String(details || "").toLowerCase();
  return text.includes("bucket not found") || text.includes("nosuchbucket");
};

const createStorageBucket = async (config, isPublic = true) => {
  const response = await fetch(`${config.url}/storage/v1/bucket`, {
    method: "POST",
    headers: getSupabaseHeaders(config, {
      "Content-Type": "application/json",
    }),
    body: JSON.stringify({
      id: config.bucket,
      name: config.bucket,
      public: isPublic,
    }),
  });

  if (response.ok || response.status === 409) return;

  let details = "";
  try {
    details = await response.text();
  } catch {
    details = "";
  }

  const error = new Error(details || "Unable to create Supabase Storage bucket.");
  error.status = response.status;
  throw error;
};

const ensureConfigured = (config) => {
  if (config.url && config.key) return;
  const error = new Error("Supabase storage is not configured. Add SUPABASE_URL and SUPABASE_SECRET_KEY to .env.");
  error.status = 503;
  throw error;
};

const uploadObject = async ({ config, storagePath, parsed }) => {
  const uploadUrl = `${config.url}/storage/v1/object/${encodeURIComponent(config.bucket)}/${encodeStoragePath(storagePath)}`;
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: getSupabaseHeaders(config, {
      "Content-Type": parsed.mimeType,
      "Cache-Control": "3600",
      "x-upsert": "false",
    }),
    body: parsed.buffer,
  });

  if (response.ok) return;

  let details = "";
  try {
    details = await response.text();
  } catch {
    details = "";
  }

  const error = new Error(details || "Unable to upload image to Supabase Storage.");
  error.status = response.status;
  error.details = details;
  throw error;
};

const uploadImageToSupabase = async ({ imageData, folder, fileName, maxSizeBytes = 1024 * 1024 }) => {
  const config = getSupabaseConfig();
  ensureConfigured(config);

  const parsed = parseImageDataUrl(imageData);

  if (parsed.buffer.length > maxSizeBytes) {
    const error = new Error(`Image must be ${Math.round(maxSizeBytes / 1024)} KB or smaller.`);
    error.status = 400;
    throw error;
  }

  const storagePath = [
    sanitizeFolder(folder),
    `${Date.now()}-${crypto.randomBytes(8).toString("hex")}-${sanitizeBaseName(fileName)}.${parsed.extension}`,
  ].join("/");

  try {
    await uploadObject({ config, storagePath, parsed });
  } catch (error) {
    if (!isMissingBucketError(error.details || error.message)) {
      throw error;
    }

    await createStorageBucket(config);
    await uploadObject({ config, storagePath, parsed });
  }

  const publicUrl = `${config.url}/storage/v1/object/public/${encodeURIComponent(config.bucket)}/${encodeStoragePath(storagePath)}`;

  return {
    url: publicUrl,
    path: storagePath,
    bucket: config.bucket,
    mimeType: parsed.mimeType,
    size: parsed.buffer.length,
  };
};

const isPlaceholderSupabaseConfig = (config) => {
  const url = String(config?.url || "").toLowerCase();
  const key = String(config?.key || "").toLowerCase();
  return !url || !key || url.includes("your-project-ref") || url.includes("example.com") || key.includes("replace-with") || key.includes("your-supabase");
};

const uploadClinicalFileToSupabase = async ({ fileData, fileName, maxSizeBytes = 5 * 1024 * 1024 }) => {
  const config = getClinicalStorageConfig();
  const parsed = parseClinicalFileDataUrl(fileData);

  if (parsed.buffer.length > maxSizeBytes) {
    const error = new Error(`Clinical attachment must be ${Math.round(maxSizeBytes / (1024 * 1024))} MB or smaller.`);
    error.status = 400;
    throw error;
  }

  const storagePath = [
    "clinical-notes",
    new Date().toISOString().slice(0, 7),
    `${Date.now()}-${crypto.randomBytes(12).toString("hex")}-${sanitizeBaseName(fileName || "attachment")}.${parsed.extension}`,
  ].join("/");

  if (!isPlaceholderSupabaseConfig(config)) {
    try {
      await uploadObject({ config, storagePath, parsed });
      return {
        path: storagePath,
        bucket: config.bucket,
        mimeType: parsed.mimeType,
        size: parsed.buffer.length,
        name: String(fileName || `attachment.${parsed.extension}`).slice(0, 180),
      };
    } catch (error) {
      if (isMissingBucketError(error.details || error.message)) {
        await createStorageBucket(config, false);
        await uploadObject({ config, storagePath, parsed });
        return {
          path: storagePath,
          bucket: config.bucket,
          mimeType: parsed.mimeType,
          size: parsed.buffer.length,
          name: String(fileName || `attachment.${parsed.extension}`).slice(0, 180),
        };
      }
      console.warn("Supabase storage upload failed, saving to clinic local storage:", error.message);
    }
  }

  // Local filesystem fallback for dev or offline mode
  const fullFilePath = path.join(LOCAL_CLINICAL_DIR, storagePath);
  const targetDir = path.dirname(fullFilePath);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  fs.writeFileSync(fullFilePath, parsed.buffer);

  return {
    path: storagePath,
    bucket: config.bucket,
    mimeType: parsed.mimeType,
    size: parsed.buffer.length,
    name: String(fileName || `attachment.${parsed.extension}`).slice(0, 180),
  };
};

const uploadChatFileToSupabase = async ({ fileData, fileName, maxSizeBytes = 5 * 1024 * 1024 }) => {
  const config = getChatStorageConfig();
  ensureConfigured(config);
  const parsed = parseClinicalFileDataUrl(fileData);

  if (parsed.buffer.length > maxSizeBytes) {
    const error = new Error(`Chat attachment must be ${Math.round(maxSizeBytes / (1024 * 1024))} MB or smaller.`);
    error.status = 400;
    throw error;
  }

  const storagePath = [
    "messages",
    new Date().toISOString().slice(0, 7),
    `${Date.now()}-${crypto.randomBytes(12).toString("hex")}-${sanitizeBaseName(fileName || "attachment")}.${parsed.extension}`,
  ].join("/");

  try {
    await uploadObject({ config, storagePath, parsed });
  } catch (error) {
    if (!isMissingBucketError(error.details || error.message)) throw error;
    await createStorageBucket(config, false);
    await uploadObject({ config, storagePath, parsed });
  }

  return {
    path: storagePath,
    bucket: config.bucket,
    type: parsed.mimeType,
    size: parsed.buffer.length,
    filename: String(fileName || `attachment.${parsed.extension}`).slice(0, 180),
  };
};

const isManagedChatFile = (attachment) => {
  const config = getChatStorageConfig();
  return attachment
    && String(attachment.bucket || "") === config.bucket
    && /^messages\/\d{4}-\d{2}\/\d{13}-[a-f0-9]{24}-[a-z0-9_-]+\.(?:jpg|png|webp|pdf)$/.test(String(attachment.path || ""));
};

const createChatFileSignedUrl = async (attachment, expiresIn = 900) => {
  if (!isManagedChatFile(attachment)) return "";
  const config = getChatStorageConfig();
  ensureConfigured(config);
  const response = await fetch(`${config.url}/storage/v1/object/sign/${encodeURIComponent(config.bucket)}/${encodeStoragePath(attachment.path)}`, {
    method: "POST",
    headers: getSupabaseHeaders(config, { "Content-Type": "application/json" }),
    body: JSON.stringify({ expiresIn }),
  });
  if (!response.ok) return "";
  const data = await response.json();
  const signedUrl = data.signedURL || data.signedUrl || "";
  if (!signedUrl) return "";
  if (/^https?:\/\//i.test(signedUrl)) return signedUrl;
  return `${config.url}/storage/v1${signedUrl.startsWith("/") ? signedUrl : `/${signedUrl}`}`;
};

const deleteChatFile = async (attachment) => {
  if (!isManagedChatFile(attachment)) return false;
  const config = getChatStorageConfig();
  ensureConfigured(config);
  const response = await fetch(`${config.url}/storage/v1/object/${encodeURIComponent(config.bucket)}/${encodeStoragePath(attachment.path)}`, {
    method: "DELETE",
    headers: getSupabaseHeaders(config),
  });
  if (response.ok || response.status === 404) return true;
  throw new Error(`Unable to remove chat attachment (HTTP ${response.status}).`);
};

const isManagedClinicalFile = (attachment) => {
  const config = getClinicalStorageConfig();
  return attachment
    && String(attachment.bucket || "") === config.bucket
    && /^clinical-notes\/\d{4}-\d{2}\/\d{13}-[a-f0-9]{24}-[a-z0-9_-]+\.(?:jpg|png|webp|pdf)$/.test(String(attachment.path || ""));
};

const createClinicalFileSignedUrl = async (attachment, expiresIn = 900) => {
  if (!isManagedClinicalFile(attachment)) return "";
  const config = getClinicalStorageConfig();

  if (!isPlaceholderSupabaseConfig(config)) {
    try {
      const response = await fetch(`${config.url}/storage/v1/object/sign/${encodeURIComponent(config.bucket)}/${encodeStoragePath(attachment.path)}`, {
        method: "POST",
        headers: getSupabaseHeaders(config, { "Content-Type": "application/json" }),
        body: JSON.stringify({ expiresIn }),
      });

      if (response.ok) {
        const data = await response.json();
        const signedUrl = data.signedURL || data.signedUrl || "";
        if (signedUrl) {
          if (/^https?:\/\//i.test(signedUrl)) return signedUrl;
          return `${config.url}/storage/v1${signedUrl.startsWith("/") ? signedUrl : `/${signedUrl}`}`;
        }
      }
    } catch {
      // Supabase fetch failed or network offline, proceed to local check
    }
  }

  const localFile = path.join(LOCAL_CLINICAL_DIR, attachment.path);
  if (fs.existsSync(localFile)) {
    return `/api/uploads/clinical-file-view?path=${encodeURIComponent(attachment.path)}`;
  }
  return `/api/uploads/clinical-file-view?path=${encodeURIComponent(attachment.path)}`;
};

const deleteClinicalFile = async (attachment) => {
  if (!isManagedClinicalFile(attachment)) return false;
  const config = getClinicalStorageConfig();

  try {
    const localFile = path.join(LOCAL_CLINICAL_DIR, attachment.path);
    if (fs.existsSync(localFile)) {
      fs.unlinkSync(localFile);
    }
  } catch {}

  if (!isPlaceholderSupabaseConfig(config)) {
    const response = await fetch(`${config.url}/storage/v1/object/${encodeURIComponent(config.bucket)}/${encodeStoragePath(attachment.path)}`, {
      method: "DELETE",
      headers: getSupabaseHeaders(config),
    });
    if (response.ok || response.status === 404) return true;
    throw new Error(`Unable to remove clinical attachment (HTTP ${response.status}).`);
  }
  return true;
};

const getManagedPromotionImagePath = (imageUrl, config = getSupabaseConfig()) => {
  if (!config.url || !imageUrl) return null;

  try {
    const base = new URL(config.url);
    const image = new URL(imageUrl);
    const prefix = `${base.pathname.replace(/\/$/, "")}/storage/v1/object/public/${encodeURIComponent(config.bucket)}/promotions/`;
    if (image.origin !== base.origin || !image.pathname.startsWith(prefix) || image.search || image.hash) return null;

    const fileName = decodeURIComponent(image.pathname.slice(prefix.length));
    if (!/^\d{13}-[a-f0-9]{16}-[a-z0-9_-]+\.(?:jpg|png|webp|gif)$/.test(fileName)) return null;
    return `promotions/${fileName}`;
  } catch {
    return null;
  }
};

const deleteManagedPromotionImage = async (imageUrl) => {
  const config = getSupabaseConfig();
  const storagePath = getManagedPromotionImagePath(imageUrl, config);
  if (!storagePath) return false;
  if (!config.key) throw new Error("Supabase storage is not configured.");

  const response = await fetch(`${config.url}/storage/v1/object/${encodeURIComponent(config.bucket)}/${encodeStoragePath(storagePath)}`, {
    method: "DELETE",
    headers: getSupabaseHeaders(config),
  });
  if (response.ok || response.status === 404) return true;

  throw new Error(`Unable to remove the previous promotion image (HTTP ${response.status}).`);
};

module.exports = {
  uploadImageToSupabase,
  uploadClinicalFileToSupabase,
  createClinicalFileSignedUrl,
  deleteClinicalFile,
  isManagedClinicalFile,
  uploadChatFileToSupabase,
  createChatFileSignedUrl,
  deleteChatFile,
  isManagedChatFile,
  deleteManagedPromotionImage,
  getManagedPromotionImagePath,
  LOCAL_CLINICAL_DIR,
};
