const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createClinicalFileSignedUrl,
  deleteManagedPromotionImage,
  getManagedPromotionImagePath,
  isManagedClinicalFile,
} = require("../services/supabaseStorageService");

const config = {
  url: "https://clinic.supabase.co",
  bucket: "fdmst-images",
};
const managedUrl = "https://clinic.supabase.co/storage/v1/object/public/fdmst-images/promotions/1789900000000-0123456789abcdef-offer.jpg";

test("recognizes promotion images uploaded by this application", () => {
  assert.equal(
    getManagedPromotionImagePath(managedUrl, config),
    "promotions/1789900000000-0123456789abcdef-offer.jpg",
  );
});

test("never treats external, shared-folder, or malformed images as managed promotion images", () => {
  for (const url of [
    "https://other.example.com/banner.jpg",
    managedUrl.replace("/promotions/", "/profiles/"),
    managedUrl.replace("offer.jpg", "../../offer.jpg"),
    `${managedUrl}?token=abc`,
    "data:image/png;base64,AAAA",
  ]) {
    assert.equal(getManagedPromotionImagePath(url, config), null);
  }
});

test("deletes only a managed promotion image through Supabase Storage", async () => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SECRET_KEY;
  const originalBucket = process.env.SUPABASE_STORAGE_BUCKET;
  const requests = [];

  try {
    process.env.SUPABASE_URL = config.url;
    process.env.SUPABASE_SECRET_KEY = "test-service-key";
    process.env.SUPABASE_STORAGE_BUCKET = config.bucket;
    global.fetch = async (url, options) => {
      requests.push({ url, options });
      return { ok: true, status: 200 };
    };

    assert.equal(await deleteManagedPromotionImage("https://other.example.com/banner.jpg"), false);
    assert.equal(requests.length, 0);
    assert.equal(await deleteManagedPromotionImage(managedUrl), true);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].options.method, "DELETE");
    assert.equal(requests[0].url, "https://clinic.supabase.co/storage/v1/object/fdmst-images/promotions/1789900000000-0123456789abcdef-offer.jpg");
  } finally {
    global.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = originalKey;
    if (originalBucket === undefined) delete process.env.SUPABASE_STORAGE_BUCKET;
    else process.env.SUPABASE_STORAGE_BUCKET = originalBucket;
  }
});

test("recognizes only files in the managed private clinical bucket", () => {
  const previousBucket = process.env.SUPABASE_CLINICAL_STORAGE_BUCKET;
  process.env.SUPABASE_CLINICAL_STORAGE_BUCKET = "fdmst-clinical-files";
  try {
    const attachment = {
      bucket: "fdmst-clinical-files",
      path: "clinical-notes/2026-09/1789900000000-0123456789abcdef01234567-xray.png",
    };
    assert.equal(isManagedClinicalFile(attachment), true);
    assert.equal(isManagedClinicalFile({ ...attachment, bucket: "fdmst-images" }), false);
    assert.equal(isManagedClinicalFile({ ...attachment, path: "clinical-notes/../../xray.png" }), false);
  } finally {
    if (previousBucket === undefined) delete process.env.SUPABASE_CLINICAL_STORAGE_BUCKET;
    else process.env.SUPABASE_CLINICAL_STORAGE_BUCKET = previousBucket;
  }
});

test("creates an expiring signed URL for a private clinical attachment", async () => {
  const originalFetch = global.fetch;
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SECRET_KEY;
  const previousBucket = process.env.SUPABASE_CLINICAL_STORAGE_BUCKET;
  const attachment = {
    bucket: "fdmst-clinical-files",
    path: "clinical-notes/2026-09/1789900000000-0123456789abcdef01234567-xray.png",
  };

  try {
    process.env.SUPABASE_URL = config.url;
    process.env.SUPABASE_SECRET_KEY = "test-service-key";
    process.env.SUPABASE_CLINICAL_STORAGE_BUCKET = attachment.bucket;
    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ signedURL: "/object/sign/fdmst-clinical-files/xray.png?token=test" }),
    });

    assert.equal(
      await createClinicalFileSignedUrl(attachment),
      "https://clinic.supabase.co/storage/v1/object/sign/fdmst-clinical-files/xray.png?token=test",
    );
  } finally {
    global.fetch = originalFetch;
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = previousKey;
    if (previousBucket === undefined) delete process.env.SUPABASE_CLINICAL_STORAGE_BUCKET;
    else process.env.SUPABASE_CLINICAL_STORAGE_BUCKET = previousBucket;
  }
});
