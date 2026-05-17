require("dotenv").config({ path: ".env.local" });
require("dotenv").config();

const express = require("express");
const axios = require("axios");
let admin = null;

try {
  admin = require("firebase-admin");
} catch (err) {
  admin = null;
}

const app = express();

const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN;
const DEFAULT_FIREBASE_URL = "https://my-website-73785-default-rtdb.asia-southeast1.firebasedatabase.app";
const extractUrl = (value, fallback = "") => {
  const text = String(value || "").trim();
  const match = text.match(/https?:\/\/[^\s"'<>]+/i);
  return (match ? match[0] : fallback).replace(/\/+$/, "");
};
const FIREBASE_URL = extractUrl(process.env.FIREBASE_URL, DEFAULT_FIREBASE_URL);
const JOBS_PATH = process.env.JOBS_PATH || "LatestJobs";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "jasmelsolanki@gmail.com";
const DEFAULT_MEMBER_PASSWORD = "User@123";
let adminDb = null;

app.use(express.json({ limit: "1mb" }));

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

function getAdminDb() {
  if (adminDb) {
    return adminDb;
  }

  const serviceAccount = getServiceAccount();

  if (!admin || (!serviceAccount && !process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
    return null;
  }

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: serviceAccount
        ? admin.credential.cert(serviceAccount)
        : admin.credential.applicationDefault(),
      databaseURL: FIREBASE_URL
    });
  }

  adminDb = admin.database();
  return adminDb;
}

function getTelegramPost(update) {
  return update.message || update.channel_post || update.edited_message || update.edited_channel_post || null;
}

function getText(post) {
  return String(post?.text || post?.caption || "").trim();
}

function pickField(lines, labels) {
  const labelPattern = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const regex = new RegExp(`^\\s*(?:${labelPattern})\\s*[:\\-]\\s*(.+)$`, "i");
  const match = lines.map((line) => line.match(regex)).find(Boolean);
  return match ? match[1].trim() : "";
}

function firstUrl(value) {
  const match = String(value || "").match(/https?:\/\/\S+/i);
  return match ? match[0].replace(/[),.]+$/, "") : "";
}

function buildJobData(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const title =
    pickField(lines, ["title", "job", "job title", "post"]) ||
    lines[0] ||
    "Job Update";

  const applyLine = pickField(lines, ["apply", "apply link", "online apply", "form link"]);
  const detailLine = pickField(lines, ["detail", "details", "notification", "official", "official link"]);

  return {
    title,
    type: pickField(lines, ["type", "category"]) || "Online Form",
    startDate: pickField(lines, ["start", "start date", "starting date"]) || "Update Soon",
    lastDate: pickField(lines, ["last", "last date", "closing date", "end date"]) || "Update Soon",
    qualification: pickField(lines, ["qualification", "eligibility"]) || "Update Soon",
    location: pickField(lines, ["location", "job location"]) || "All India",
    applyLink: firstUrl(applyLine) || firstUrl(text) || "#",
    detailLink: firstUrl(detailLine) || "#",
    pageContent: lines.length > 1 ? lines.slice(1).join("\n") : "",
    source: "telegram",
    createdAt: Date.now()
  };
}

async function saveJob(jobData) {
  if (!FIREBASE_URL) {
    throw new Error("FIREBASE_URL env variable missing");
  }

  const db = getAdminDb();
  if (db) {
    const savedRef = await db.ref(JOBS_PATH).push(jobData);
    return { name: savedRef.key, method: "firebase-admin" };
  }

  try {
    const response = await axios.post(`${FIREBASE_URL}/${JOBS_PATH}.json`, jobData);
    return { ...response.data, method: "rest" };
  } catch (err) {
    const firebaseError = err.response?.data?.error || err.response?.data || err.message;
    throw new Error(`Firebase REST write failed: ${firebaseError}`);
  }
}

function isAdminSdkConfigured() {
  return Boolean(
    process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 ||
    process.env.FIREBASE_SERVICE_ACCOUNT ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS
  );
}

async function requireAdmin(req) {
  const db = getAdminDb();
  if (!admin || !db) {
    const error = new Error("Firebase Admin SDK is not configured");
    error.statusCode = 503;
    throw error;
  }

  const authHeader = String(req.headers.authorization || "");
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token) {
    const error = new Error("Admin token missing");
    error.statusCode = 401;
    throw error;
  }

  const decoded = await admin.auth().verifyIdToken(token);
  if (decoded.email !== ADMIN_EMAIL) {
    const error = new Error("Only admin can perform this action");
    error.statusCode = 403;
    throw error;
  }

  return { decoded, db };
}

app.get("/", (req, res) => {
  res.json({
    ok: true,
    message: "Telegram job bot is running",
    firebasePath: JOBS_PATH,
    botConfigured: Boolean(BOT_TOKEN),
    firebaseConfigured: Boolean(FIREBASE_URL),
    adminSdkConfigured: isAdminSdkConfigured()
  });
});

app.post("/", async (req, res) => {
  try {
    const post = getTelegramPost(req.body);
    const text = getText(post);

    if (!text) {
      return res.status(200).send("No text found");
    }

    const jobData = buildJobData(text);
    const saved = await saveJob(jobData);

    return res.status(200).json({
      ok: true,
      message: "Job Added",
      id: saved.name,
      method: saved.method,
      path: JOBS_PATH,
      title: jobData.title
    });
  } catch (err) {
    console.error("Webhook error:", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/admin/update-member-password", async (req, res) => {
  try {
    const { db } = await requireAdmin(req);
    const uid = String(req.body?.uid || "").trim();
    const password = String(req.body?.password || "").trim();

    if (!uid || password.length < 6) {
      return res.status(400).json({ ok: false, error: "UID and 6+ character password required" });
    }

    await admin.auth().updateUser(uid, { password });
    await db.ref(`members/${uid}`).update({ updatedAt: Date.now(), passwordChangedAt: Date.now() });

    return res.json({ ok: true, message: "Password updated" });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ ok: false, error: err.message });
  }
});

app.post("/admin/create-member", async (req, res) => {
  let createdUid = "";

  try {
    const { db, decoded } = await requireAdmin(req);
    const name = String(req.body?.name || "").trim();
    const email = String(req.body?.email || "").trim().toLowerCase();
    const mobile = String(req.body?.mobile || "").trim();
    const password = String(req.body?.password || DEFAULT_MEMBER_PASSWORD).trim() || DEFAULT_MEMBER_PASSWORD;

    if (!name || !email || !mobile || password.length < 6) {
      return res.status(400).json({
        ok: false,
        error: "Name, email, mobile and 6+ character password required"
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ ok: false, error: "Valid email required" });
    }

    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: name,
      emailVerified: true,
      disabled: false
    });
    createdUid = userRecord.uid;

    const now = Date.now();
    const storageLimitBytes = 50 * 1024 * 1024;
    await db.ref(`members/${createdUid}`).set({
      uid: createdUid,
      email,
      profileEmail: email,
      name,
      mobile,
      role: "member",
      status: "Active",
      emailVerified: true,
      uploadApproved: false,
      freeStorageLimitMb: 50,
      storageLimitBytes,
      storageUsedBytes: 0,
      createdAt: now,
      createdBy: decoded.email || ADMIN_EMAIL,
      adminCreated: true,
      lastLoginAt: 0
    });

    return res.json({
      ok: true,
      uid: createdUid,
      message: "Member created and active. Email verification is not required."
    });
  } catch (err) {
    if (createdUid) {
      await admin.auth().deleteUser(createdUid).catch(() => {});
    }
    return res.status(err.statusCode || 500).json({ ok: false, error: err.message });
  }
});

app.post("/admin/delete-member", async (req, res) => {
  try {
    const { db } = await requireAdmin(req);
    const uid = String(req.body?.uid || "").trim();

    if (!uid) {
      return res.status(400).json({ ok: false, error: "UID required" });
    }

    try {
      await admin.auth().deleteUser(uid);
    } catch (err) {
      if (err.code !== "auth/user-not-found") {
        throw err;
      }
    }

    await db.ref().update({
      [`members/${uid}`]: null,
      [`memberFiles/${uid}`]: null,
      [`memberCloudLinks/${uid}`]: null
    });

    return res.json({ ok: true, message: "Member deleted" });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ ok: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Bot Running on port ${PORT}`);
});
