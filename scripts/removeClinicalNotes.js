const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");
const mongoose = require("mongoose");

dotenv.config({ path: path.resolve(__dirname, "../.env"), quiet: true });

const DentalRecord = require("../models/DentalRecord");
const connectDatabase = require("../config/database");
const { deleteClinicalFile, isManagedClinicalFile } = require("../services/supabaseStorageService");

const localAttachmentDirectory = path.resolve(__dirname, "../uploads/clinical-files");
const storageUrl = String(process.env.SUPABASE_URL || "").toLowerCase();
const storageKey = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").toLowerCase();
const remoteStorageConfigured = Boolean(
  storageUrl
  && storageKey
  && !storageUrl.includes("your-project-ref")
  && !storageUrl.includes("example.com")
  && !storageKey.includes("replace-with")
  && !storageKey.includes("your-supabase"),
);

const main = async () => {
  if (process.env.CONFIRM_CLINICAL_NOTE_DATA_DELETION !== "YES") {
    throw new Error(
      "Refusing to delete clinical-note records. Set CONFIRM_CLINICAL_NOTE_DATA_DELETION=YES to confirm.",
    );
  }

  await connectDatabase();

  const records = DentalRecord.collection;
  const legacyNotes = await records.find(
    { recordType: "clinical_note" },
    { projection: { _id: 1, attachments: 1 } },
  ).toArray();
  const noteIds = legacyNotes.map((record) => record._id);
  const attachments = [...new Map(
    legacyNotes.flatMap((record) => record.attachments || [])
      .filter((attachment) => attachment?.path)
      .map((attachment) => [`${attachment.bucket || ""}\0${attachment.path}`, attachment]),
  ).values()];
  const attachmentPaths = [...new Set(attachments.map((attachment) => attachment.path))];
  const otherRecords = attachmentPaths.length
    ? await records.find(
        { recordType: { $ne: "clinical_note" }, "attachments.path": { $in: attachmentPaths } },
        { projection: { attachments: 1 } },
      ).toArray()
    : [];
  const sharedAttachmentPaths = new Set(
    otherRecords.flatMap((record) => record.attachments || [])
      .map((attachment) => attachment.path)
      .filter(Boolean),
  );
  const attachmentPathsToKeep = [];
  let deletedAttachmentCount = 0;

  for (const attachment of attachments) {
    if (!isManagedClinicalFile(attachment) || sharedAttachmentPaths.has(attachment.path)) {
      attachmentPathsToKeep.push(attachment.path);
      continue;
    }

    const localPath = path.resolve(localAttachmentDirectory, attachment.path);
    const hasLocalCopy = localPath.startsWith(`${localAttachmentDirectory}${path.sep}`) && fs.existsSync(localPath);
    if (!remoteStorageConfigured && !hasLocalCopy) {
      throw new Error(
        "Configure Supabase storage or provide local copies before removing legacy note attachments.",
      );
    }

    const removed = await deleteClinicalFile(attachment);
    if (!removed) {
      throw new Error(`Unable to remove legacy note attachment: ${attachment.path}`);
    }
    deletedAttachmentCount += 1;
  }

  const deleted = noteIds.length
    ? await records.deleteMany({ _id: { $in: noteIds }, recordType: "clinical_note" })
    : { deletedCount: 0 };
  const unset = await records.updateMany(
    { recordType: { $ne: "clinical_note" } },
    {
      $unset: {
        noteType: "",
        clinicalNotes: "",
        clinicalFollowUp: "",
      },
    },
  );

  console.log(`Deleted ${deleted.deletedCount} clinical-note records.`);
  console.log(`Removed note-only fields from ${unset.modifiedCount} remaining records.`);
  console.log(`Deleted ${deletedAttachmentCount} unshared managed attachments.`);
  console.log(`Retained ${attachmentPathsToKeep.length} attachments because they are shared or not managed by this app.`);
};

main()
  .catch((error) => {
    console.error("Clinical-note data removal failed:", error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect().catch((error) => {
    console.error("Failed to disconnect from MongoDB:", error.message);
    process.exitCode = 1;
  }));
