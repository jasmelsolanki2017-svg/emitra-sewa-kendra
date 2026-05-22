require("dotenv").config({ path: ".env.local" });
require("dotenv").config();

const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

const DEFAULT_FIREBASE_URL = "https://my-website-73785-default-rtdb.asia-southeast1.firebasedatabase.app";
const FIREBASE_URL = String(process.env.FIREBASE_URL || DEFAULT_FIREBASE_URL).trim().replace(/\/+$/, "");
const backupPaths = [
  "LatestJobs",
  "portalItems",
  "latestUpdates",
  "importantLinks",
  "advertisements",
  "serviceGuides",
  "members",
  "memberFiles",
  "memberCloudLinks",
  "serviceRequests",
  "userServiceRequests",
  "activeServiceRequests",
  "userMessages",
  "autoJobSources",
  "autoJobDrafts",
  "autoJobLogs",
  "autoJobCheckerStatus"
];

function getServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    const json = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, "base64").toString("utf8");
    return JSON.parse(json);
  }
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  }
  return null;
}

async function main() {
  const serviceAccount = getServiceAccount();
  if (!serviceAccount && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error("Firebase Admin credentials missing. Set FIREBASE_SERVICE_ACCOUNT_BASE64 or GOOGLE_APPLICATION_CREDENTIALS.");
  }

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: serviceAccount ? admin.credential.cert(serviceAccount) : admin.credential.applicationDefault(),
      databaseURL: FIREBASE_URL
    });
  }

  const db = admin.database();
  const createdAt = new Date().toISOString();
  const data = {};
  for (const itemPath of backupPaths) {
    const snapshot = await db.ref(itemPath).get();
    data[itemPath] = snapshot.exists() ? snapshot.val() : null;
  }

  const payload = {
    meta: {
      site: "E-MITRA WALA",
      createdAt,
      databaseURL: FIREBASE_URL,
      paths: backupPaths
    },
    data
  };
  const backupDir = path.join(process.cwd(), "backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const fileName = `emitra-backup-${createdAt.slice(0, 10)}-${createdAt.slice(11, 19).replace(/:/g, "")}.json`;
  const fullPath = path.join(backupDir, fileName);
  fs.writeFileSync(fullPath, JSON.stringify(payload, null, 2));
  console.log(fullPath);
}

main().catch((error) => {
  console.error("Backup failed:", error.message);
  process.exitCode = 1;
});
