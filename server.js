require("dotenv").config({ path: ".env.local" });
require("dotenv").config();

const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");
let admin = null;
let pdfParse = null;

try {
  admin = require("firebase-admin");
} catch (err) {
  admin = null;
}

try {
  pdfParse = require("pdf-parse");
} catch (err) {
  pdfParse = null;
}

const app = express();
app.use(express.static(__dirname));

const PORT = process.env.PORT || 3000;
const DEFAULT_FIREBASE_URL = "https://my-website-73785-default-rtdb.asia-southeast1.firebasedatabase.app";
const extractUrl = (value, fallback = "") => {
  const text = String(value || "").trim();
  const match = text.match(/https?:\/\/[^\s"'<>]+/i);
  return (match ? match[0] : fallback).replace(/\/+$/, "");
};
const extractHttpUrl = (value, fallback = "") => {
  const text = String(value || "").trim();
  const match = text.match(/https?:\/\/[^\s"'<>]+/i);
  return match ? match[0] : fallback;
};
const FIREBASE_URL = extractUrl(process.env.FIREBASE_URL, DEFAULT_FIREBASE_URL);
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "jasmelsolanki@gmail.com";
const SITE_BASE_URL = extractUrl(process.env.SITE_BASE_URL, "https://emitrawala.online");
const WHATSAPP_CHANNEL_URL = extractHttpUrl(process.env.WHATSAPP_CHANNEL_URL, "https://whatsapp.com/channel/0029Vb7y0JL9Bb67psBzxG1Q");
const TELEGRAM_BOT_TOKEN = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
const TELEGRAM_CHAT_ID = String(process.env.TELEGRAM_CHAT_ID || "").trim();
const WHATSAPP_ACCESS_TOKEN = String(process.env.WHATSAPP_ACCESS_TOKEN || "").trim();
const WHATSAPP_PHONE_NUMBER_ID = String(process.env.WHATSAPP_PHONE_NUMBER_ID || "").trim();
const WHATSAPP_TO_NUMBER = String(process.env.WHATSAPP_TO_NUMBER || "").replace(/\D/g, "");
const GEMINI_API_KEY = String(process.env.GEMINI_API_KEY || "").trim();
const GEMINI_MODEL = String(process.env.GEMINI_MODEL || "gemini-2.5-flash").trim();
const OPENAI_API_KEY = String(process.env.OPENAI_API_KEY || "").trim();
const OPENAI_MODEL = String(process.env.OPENAI_MODEL || "").trim();
const DEFAULT_MEMBER_PASSWORD = "User@123";
const CHECKER_INTERVAL_MS = Number(process.env.AUTO_JOB_CHECKER_INTERVAL_MS || 60 * 60 * 1000);
const BACKUP_INTERVAL_MS = Number(process.env.AUTO_BACKUP_INTERVAL_MS || 24 * 60 * 60 * 1000);
const execFileAsync = promisify(execFile);
let adminDb = null;
let autoCheckerRunning = false;

function normalizeMobile(value = "") {
  const digits = String(value || "").replace(/\D/g, "");
  let mobileDigits = digits;

  if (mobileDigits.length === 11 && mobileDigits.startsWith("0")) {
    mobileDigits = `91${mobileDigits.slice(1)}`;
  } else if (mobileDigits.length === 10) {
    mobileDigits = `91${mobileDigits}`;
  }

  if (!(mobileDigits.length === 12 && mobileDigits.startsWith("91"))) {
    return null;
  }

  return {
    key: mobileDigits,
    e164: `+${mobileDigits}`,
    display: mobileDigits.slice(2)
  };
}

app.use(express.json({ limit: "1mb" }));
app.use((req, res, next) => {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  return next();
});

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

function isAdminSdkConfigured() {
  return Boolean(
    process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 ||
    process.env.FIREBASE_SERVICE_ACCOUNT ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS
  );
}

function buildServerStatus(overrides = {}) {
  const aiProvider = GEMINI_API_KEY && GEMINI_MODEL ? "Gemini" : (OPENAI_API_KEY && OPENAI_MODEL ? "OpenAI" : "Local");
  return {
    ok: true,
    serverOnline: true,
    firebaseConfigured: Boolean(FIREBASE_URL),
    adminSdkConfigured: isAdminSdkConfigured(),
    databaseConnected: false,
    cronSecretConfigured: Boolean(String(process.env.CRON_SECRET || "").trim()),
    telegramConfigured: Boolean(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID),
    whatsappConfigured: Boolean(WHATSAPP_ACCESS_TOKEN && WHATSAPP_PHONE_NUMBER_ID && WHATSAPP_TO_NUMBER),
    aiConfigured: Boolean((GEMINI_API_KEY && GEMINI_MODEL) || (OPENAI_API_KEY && OPENAI_MODEL)),
    aiProvider,
    autoCheckerRunning,
    checkedAt: nowStamp(),
    ...overrides
  };
}

const toText = (value = "") => String(value || "").replace(/\s+/g, " ").trim();
const nowStamp = () => Date.now();
const escapeRegex = (value = "") => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const hashKey = (value = "") => crypto.createHash("sha256").update(String(value || "").trim().toLowerCase()).digest("hex");
const safeKey = (value = "") => hashKey(value).slice(0, 32);
const browserUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const decodeHtml = (value = "") => String(value || "")
  .replace(/<script[\s\S]*?<\/script>/gi, " ")
  .replace(/<style[\s\S]*?<\/style>/gi, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/gi, " ")
  .replace(/&amp;/gi, "&")
  .replace(/&quot;/gi, '"')
  .replace(/&#39;/gi, "'")
  .replace(/&lt;/gi, "<")
  .replace(/&gt;/gi, ">")
  .replace(/\s+/g, " ")
  .trim();

const autoJobKeywords = [
  "recruitment", "vacancy", "notification", "advertisement", "notice", "apply online",
  "online form", "admit card", "hall ticket", "result", "answer key", "syllabus",
  "exam date", "merit list", "pdf", "भर्ती", "विज्ञप्ति", "सूचना", "प्रवेश पत्र",
  "परिणाम", "उत्तर कुंजी", "परीक्षा", "रिक्ति"
];

const findFirstMatchLine = (text = "", patterns = []) => {
  const lines = String(text || "").split(/\r?\n|[।]/).map((line) => line.trim()).filter(Boolean);
  return lines.find((line) => patterns.some((pattern) => pattern.test(line))) || "";
};

const extractDatesBlock = (text = "") => {
  const lines = String(text || "").split(/\r?\n|[।]/).map((line) => line.trim()).filter(Boolean);
  const dateLine = /\b(?:date|start|last|exam|admit|result|fee|online|application|from|to|दिनांक|तिथि|परीक्षा|आवेदन|शुल्क)\b/i;
  const hasDate = /\b\d{1,2}[-./\s](?:\d{1,2}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[-./\s]\d{2,4}\b/i;
  return lines.filter((line) => dateLine.test(line) || hasDate.test(line)).slice(0, 8).join("\n");
};

const extractTotalPosts = (text = "") => {
  const match = String(text || "").match(/(?:total\s*(?:post|posts|vacancy|vacancies)|कुल\s*(?:पद|रिक्ति))\D{0,20}(\d{1,6})/i)
    || String(text || "").match(/(\d{1,6})\s*(?:post|posts|vacancy|vacancies|पद|रिक्ति)/i);
  return match ? match[1] : "";
};

const detectPostTarget = (title = "", link = "", text = "") => {
  const haystack = `${title} ${link} ${String(text || "").slice(0, 2000)}`.toLowerCase();
  if (/(answer\s*key|उत्तर\s*कुंजी)/i.test(haystack)) return "answerKey";
  if (/(admit\s*card|hall\s*ticket|प्रवेश\s*पत्र)/i.test(haystack)) return "admitCard";
  if (/(result|merit\s*list|परिणाम)/i.test(haystack)) return "result";
  if (/(syllabus|पाठ्यक्रम)/i.test(haystack)) return "syllabus";
  return "latestJob";
};

const pickJobLinkField = (target) => ({
  admitCard: "admitCardLink",
  result: "resultLink",
  syllabus: "syllabusLink",
  answerKey: "answerKeyLink"
}[target] || "detailLink");

const cleanSlug = (value = "") => String(value || "")
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "")
  .slice(0, 90);

const buildSlug = (title = "", id = "") => {
  const base = cleanSlug(title) || "job-update";
  const suffix = String(id || "").replace(/[^a-zA-Z0-9]/g, "").slice(-6).toLowerCase();
  return suffix ? `${base}-${suffix}` : base;
};

const getPublicJobUrl = (id = "", job = {}) => {
  const params = new URLSearchParams();
  params.set("id", id);
  if (job.slug) {
    params.set("slug", job.slug);
  }
  return `${SITE_BASE_URL}/job-detail.html?${params.toString()}`;
};

const compactLine = (label, value) => {
  const text = toText(value);
  return text ? `${label}: ${text}` : "";
};

const cleanMultiline = (value = "", limit = 6) => String(value || "")
  .split(/\r?\n/)
  .map((line) => toText(line))
  .filter(Boolean)
  .slice(0, limit)
  .join("\n");

const buildNotificationSummary = (job = {}) => {
  const title = toText(job.title || "Job Update");
  const lines = [
    title,
    compactLine("Department", job.department),
    compactLine("Total Posts", job.totalPosts || job.totalVacancy),
    compactLine("Last Date", job.lastApplyDate || job.lastDate),
    compactLine("Qualification", String(job.qualification || "").split(/\r?\n/)[0]),
    compactLine("Category", job.postTarget && job.postTarget !== "latestJob" ? job.postTarget : "")
  ].filter(Boolean);
  return lines.slice(0, 6).join("\n");
};

const buildSeoFields = (job = {}, id = "") => {
  const title = toText(job.title || "Job Update");
  const department = toText(job.department);
  const suffix = job.postTarget && job.postTarget !== "latestJob" ? ` ${job.postTarget}` : "";
  const seoTitle = toText(job.seoTitle || `${title}${suffix} | E-MITRA WALA`).slice(0, 70);
  const descParts = [
    title,
    department,
    job.totalPosts ? `${job.totalPosts} posts` : "",
    job.lastApplyDate || job.lastDate ? `Last date ${job.lastApplyDate || job.lastDate}` : "",
    "apply link, qualification and important dates"
  ].filter(Boolean);
  const metaDescription = toText(job.metaDescription || descParts.join(", ")).slice(0, 160);
  return {
    slug: toText(job.slug) || buildSlug(title, id),
    seoTitle,
    metaDescription
  };
};

const buildWhatsappPostText = (id = "", job = {}) => {
  const targetLabels = {
    latestJob: "Latest Job",
    admitCard: "Admit Card",
    result: "Result",
    answerKey: "Answer Key",
    syllabus: "Syllabus"
  };
  const label = targetLabels[job.postTarget || "latestJob"] || "Update";
  const summary = cleanMultiline(job.notificationSummary, 5);
  const lines = [
    `*${label} Update*`,
    toText(job.title || "Job Update"),
    summary ? `*Summary*\n${summary}` : "",
    compactLine("Department", job.department),
    compactLine("Total Posts", job.totalPosts || job.totalVacancy),
    compactLine("Post Date", job.postDate),
    compactLine("Last Date", job.lastApplyDate || job.lastDate),
    compactLine("Qualification", String(job.qualification || "").split(/\r?\n/)[0]),
    compactLine("Details", getPublicJobUrl(id, job)),
    compactLine("Official Link", job.sourceLink || job.detailLink || job.applyLink),
    compactLine("Join WhatsApp Channel", WHATSAPP_CHANNEL_URL)
  ];
  return lines.filter(Boolean).join("\n");
};

const generateJobJsonFromText = (text = "", base = {}) => {
  const body = String(text || "");
  const title = toText(base.title) || findFirstMatchLine(body, [
    /recruitment/i, /vacancy/i, /notification/i, /advertisement/i, /भर्ती/i, /विज्ञप्ति/i
  ]) || body.split(/\r?\n/).map((line) => toText(line)).find(Boolean) || "Job Update";
  const postTarget = base.postTarget || detectPostTarget(title, base.sourceLink || base.detailLink || "", body);
  return {
    title,
    department: toText(base.department) || findFirstMatchLine(body, [/department/i, /board/i, /commission/i, /विभाग/i]) || "",
    totalPosts: toText(base.totalPosts) || extractTotalPosts(body),
    importantDates: toText(base.importantDates) || extractDatesBlock(body),
    qualification: toText(base.qualification) || findFirstMatchLine(body, [/qualification/i, /eligibility/i, /education/i, /योग्यता/i, /पात्रता/i]),
    postTarget,
    type: postTarget === "latestJob" ? "Online Form" : "Update",
    postStatus: "draft",
    detailLayout: "table",
    pageContent: toText(base.pageContent) || body.slice(0, 5000)
  };
};

const enrichJobAutomation = (job = {}, id = "") => {
  const normalized = { ...generateJobJsonFromText(job.rawText || job.pageContent || job.title || "", job), ...job };
  const seo = buildSeoFields(normalized, id || normalized.duplicateKey || normalized.sourceLink || normalized.title);
  const enriched = {
    ...normalized,
    ...seo,
    notificationSummary: String(normalized.notificationSummary || "").trim() || buildNotificationSummary(normalized),
    updatedAt: nowStamp()
  };
  enriched.whatsappPostText = String(enriched.whatsappPostText || "").trim() || buildWhatsappPostText(id || enriched.duplicateKey || "", enriched);
  return enriched;
};

const duplicateKeysForJob = (job = {}) => {
  const keys = new Set();
  [job.sourceLink, job.detailLink, job.applyLink, job.officialWebsite].filter(Boolean).forEach((value) => {
    keys.add(`link_${hashKey(value)}`);
  });
  if (job.title) {
    keys.add(`title_${hashKey(`${job.title}|${job.department || ""}|${job.totalPosts || ""}`)}`);
    keys.add(`slug_${hashKey(buildSlug(job.title))}`);
  }
  return Array.from(keys);
};

const generateAiSummary = async (job = {}) => {
  const fallback = buildNotificationSummary(job);
  if (GEMINI_API_KEY && GEMINI_MODEL && typeof fetch === "function") {
    try {
      const prompt = [
        "Hindi me ek short government job/update notification summary likho.",
        "Sirf factual points rakho, 4 bullet lines max, extra claim mat karo.",
        JSON.stringify({
          title: job.title,
          department: job.department,
          totalPosts: job.totalPosts,
          lastDate: job.lastApplyDate || job.lastDate,
          qualification: job.qualification,
          sourceLink: job.sourceLink || job.detailLink
        })
      ].join("\n");
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }]
            }
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 220
          }
        })
      });
      if (!response.ok) {
        throw new Error(`Gemini HTTP ${response.status}`);
      }
      const data = await response.json();
      const summary = String(data?.candidates?.[0]?.content?.parts || [])
        ? (data.candidates[0].content.parts || []).map((part) => part.text || "").join("\n").trim()
        : "";
      return { summary: summary || fallback, provider: summary ? "gemini" : "local" };
    } catch (err) {
      if (!OPENAI_API_KEY || !OPENAI_MODEL) {
        return { summary: fallback, provider: "local", error: err.message };
      }
    }
  }
  if (!OPENAI_API_KEY || !OPENAI_MODEL || typeof fetch !== "function") {
    return { summary: fallback, provider: "local" };
  }
  const prompt = [
    "Write a short Hindi notification summary for a government job/update.",
    "Keep it factual, 4 bullet lines max, no extra claims.",
    JSON.stringify({
      title: job.title,
      department: job.department,
      totalPosts: job.totalPosts,
      lastDate: job.lastApplyDate || job.lastDate,
      qualification: job.qualification,
      sourceLink: job.sourceLink || job.detailLink
    })
  ].join("\n");
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          { role: "system", content: "You summarize job notifications for an Indian Hindi audience." },
          { role: "user", content: prompt }
        ],
        temperature: 0.2,
        max_tokens: 180
      })
    });
    if (!response.ok) {
      throw new Error(`AI HTTP ${response.status}`);
    }
    const data = await response.json();
    const summary = toText(data?.choices?.[0]?.message?.content || "");
    return { summary: summary || fallback, provider: summary ? "openai" : "local" };
  } catch (err) {
    return { summary: fallback, provider: "local", error: err.message };
  }
};

const prepareWhatsappShare = async (item = {}, id = "") => {
  const enriched = enrichJobAutomation(item, id);
  const ai = await generateAiSummary(enriched);
  enriched.notificationSummary = ai.summary;
  enriched.summaryProvider = ai.provider;
  enriched.whatsappPostText = buildWhatsappPostText(id, enriched);
  enriched.updatedAt = nowStamp();
  return { item: enriched, text: enriched.whatsappPostText, ai };
};

const pickShareAutomationFields = (item = {}) => ({
  slug: item.slug || "",
  seoTitle: item.seoTitle || "",
  metaDescription: item.metaDescription || "",
  notificationSummary: item.notificationSummary || "",
  summaryProvider: item.summaryProvider || "",
  whatsappPostText: item.whatsappPostText || "",
  updatedAt: nowStamp()
});

const sendTelegramMessage = async (text) => {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    const error = new Error("TELEGRAM_BOT_TOKEN aur TELEGRAM_CHAT_ID env me set nahi hain");
    error.statusCode = 400;
    throw error;
  }
  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text,
      disable_web_page_preview: false
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    throw new Error(data.description || `Telegram HTTP ${response.status}`);
  }
  return data;
};

const sendWhatsappMessage = async (text) => {
  if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID || !WHATSAPP_TO_NUMBER) {
    const error = new Error("WhatsApp auto send ke liye WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_TO_NUMBER env me set karein");
    error.statusCode = 400;
    throw error;
  }
  const response = await fetch(`https://graph.facebook.com/v20.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: WHATSAPP_TO_NUMBER,
      type: "text",
      text: { preview_url: true, body: text }
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) {
    throw new Error(data?.error?.message || `WhatsApp HTTP ${response.status}`);
  }
  return data;
};

const normalizeSource = (id, value = {}) => ({
  id,
  name: toText(value.name || "Official Source"),
  url: extractHttpUrl(value.url || ""),
  department: toText(value.department || value.name || ""),
  enabled: value.enabled !== false,
  keywords: toText(value.keywords || "")
});

const DEFAULT_AUTO_JOB_SOURCES = [
  {
    id: "default_ssc",
    name: "SSC",
    department: "Staff Selection Commission",
    url: "https://ssc.gov.in",
    keywords: "recruitment, admit card, result, vacancy, notification, notice"
  },
  {
    id: "default_upsc",
    name: "UPSC",
    department: "Union Public Service Commission",
    url: "https://upsc.gov.in/recruitment/recruitment-test",
    keywords: "recruitment, examination, notification, admit card, result, vacancy"
  },
  {
    id: "default_rpsc",
    name: "RPSC",
    department: "Rajasthan Public Service Commission",
    url: "https://rpsc.rajasthan.gov.in",
    keywords: "recruitment, advertisement, result, admit card, answer key, press note"
  },
  {
    id: "default_rssb",
    name: "RSSB",
    department: "Rajasthan Staff Selection Board",
    url: "https://rssb.rajasthan.gov.in",
    keywords: "recruitment, advertisement, result, admit card, answer key, notification"
  },
  {
    id: "default_rajasthan_recruitment",
    name: "Rajasthan Recruitment Portal",
    department: "Government of Rajasthan",
    url: "https://www.recruitment.rajasthan.gov.in",
    keywords: "notification, recruitment, vacancy, admit card, result, apply online"
  },
  {
    id: "default_ibps",
    name: "IBPS",
    department: "Institute of Banking Personnel Selection",
    url: "https://www.ibps.in/index.php/recruitment",
    keywords: "recruitment, CRP, notification, admit card, result, provisional allotment"
  },
  {
    id: "default_nta",
    name: "NTA",
    department: "National Testing Agency",
    url: "https://nta.ac.in",
    keywords: "notification, public notice, admit card, result, exam city, recruitment"
  },
  {
    id: "default_rrb_apply",
    name: "RRB Apply",
    department: "Railway Recruitment Boards",
    url: "https://www.rrbapply.gov.in",
    keywords: "CEN, recruitment, apply online, admit card, result, notice, railway"
  },
  {
    id: "default_rajasthan_police",
    name: "Rajasthan Police",
    department: "Rajasthan Police",
    url: "https://police.rajasthan.gov.in",
    keywords: "recruitment, constable, admit card, result, selection list, important notice"
  }
].map((source) => ({ ...source, enabled: true }));

const sourcePayloadFromRequest = (value = {}) => {
  const source = value && typeof value === "object" ? value : {};
  const name = toText(source.name);
  const url = extractHttpUrl(source.url || "");
  if (!name || !/^https?:\/\//i.test(url)) {
    const error = new Error("Source name and valid URL required");
    error.statusCode = 400;
    throw error;
  }
  return {
    name,
    department: toText(source.department || name),
    url,
    keywords: toText(source.keywords),
    enabled: source.enabled !== false,
    updatedAt: nowStamp()
  };
};

const snapshotValue = (snapshot, fallback = {}) => (snapshot.exists() ? snapshot.val() : fallback);

const logAutoJob = async (db, payload = {}) => {
  const createdAt = nowStamp();
  const ref = db.ref("autoJobLogs").push();
  await ref.set({
    level: payload.level || "info",
    message: toText(payload.message || ""),
    sourceId: payload.sourceId || "",
    sourceName: payload.sourceName || "",
    createdAt
  });
  return ref.key;
};

const fetchText = async (url, timeoutMs = 25000) => {
  if (typeof fetch !== "function") {
    throw new Error("Node fetch API available nahi hai. Node 18+ use karein.");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": browserUserAgent,
        "Accept": "text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8"
      }
    });
    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}`);
      error.httpStatus = response.status;
      throw error;
    }
    return {
      contentType: response.headers.get("content-type") || "",
      text: await response.text()
    };
  } catch (err) {
    if (err?.httpStatus) {
      throw err;
    }
    const fallback = await fetchTextWithCurl(url, timeoutMs).catch(() => null);
    if (fallback) {
      return fallback;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
};

const fetchTextWithCurl = async (url, timeoutMs = 25000) => {
  const curlBin = process.platform === "win32" ? "curl.exe" : "curl";
  const args = [
    "-L",
    "--silent",
    "--show-error",
    "--fail",
    "--max-time",
    String(Math.max(5, Math.ceil(timeoutMs / 1000))),
    "-A",
    browserUserAgent,
    "-H",
    "Accept: text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8",
    url
  ];
  const { stdout } = await execFileAsync(curlBin, args, {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024
  });
  return {
    contentType: "",
    text: stdout
  };
};

const explainFetchError = (err) => {
  const raw = String(err?.message || err || "fetch failed");
  const cause = String(err?.cause?.code || err?.cause?.reason || err?.cause?.message || "");
  const combined = `${raw} ${cause}`.toLowerCase();
  if (/http 404/.test(combined)) {
    return {
      code: "HTTP_404",
      message: "URL par page nahi mila. Source URL update karein.",
      detail: raw
    };
  }
  if (/http 403|forbidden/.test(combined)) {
    return {
      code: "HTTP_403",
      message: "Official site server scan ko block kar rahi hai.",
      detail: raw
    };
  }
  if (/unsafe legacy renegotiation|ssl|certificate|tls/.test(combined)) {
    return {
      code: "SSL_OLD_SITE",
      message: "Official site old SSL use kar rahi hai. Browser me khul sakti hai, server scan me fallback chahiye.",
      detail: raw
    };
  }
  if (/aborted|timeout|timed out/.test(combined)) {
    return {
      code: "TIMEOUT",
      message: "Official site time par response nahi de rahi. Baad me dobara test karein.",
      detail: raw
    };
  }
  if (/fetch failed|econnreset|enotfound|eai_again|network/.test(combined)) {
    return {
      code: "NETWORK",
      message: "Server se official site tak network/fetch issue aa raha hai.",
      detail: raw
    };
  }
  return {
    code: "UNKNOWN",
    message: "Source scan nahi ho paya. URL aur official site status check karein.",
    detail: raw
  };
};

const testAutoJobSource = async (source) => {
  const startedAt = nowStamp();
  try {
    const keywordList = source.keywords
      ? source.keywords.split(",").map((item) => item.trim()).filter(Boolean)
      : autoJobKeywords;
    const page = await fetchText(source.url, 20000);
    const notices = extractLinks(page.text, source.url, keywordList);
    return {
      ok: true,
      sourceId: source.id || "",
      sourceName: source.name || "",
      url: source.url,
      status: notices.length ? "ready" : "no_links",
      message: notices.length
        ? `Page open ho raha hai. ${notices.length} matching links mile.`
        : "Page open ho raha hai, par matching job links nahi mile. Keywords/URL check karein.",
      foundCount: notices.length,
      sampleLinks: notices.slice(0, 5),
      checkedAt: nowStamp(),
      durationMs: nowStamp() - startedAt
    };
  } catch (err) {
    const friendly = explainFetchError(err);
    return {
      ok: false,
      sourceId: source.id || "",
      sourceName: source.name || "",
      url: source.url,
      status: friendly.code,
      message: friendly.message,
      error: friendly.detail,
      checkedAt: nowStamp(),
      durationMs: nowStamp() - startedAt
    };
  }
};

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

const createBackupPayload = async (db) => {
  const createdAt = new Date().toISOString();
  const entries = await Promise.all(
    backupPaths.map(async (path) => {
      const snapshot = await db.ref(path).get();
      return [path, snapshotValue(snapshot, null)];
    })
  );
  return {
    meta: {
      site: "E-MITRA WALA",
      createdAt,
      databaseURL: FIREBASE_URL,
      paths: backupPaths
    },
    data: Object.fromEntries(entries)
  };
};

const backupFileName = (payload) => `emitra-backup-${payload.meta.createdAt.slice(0, 10)}-${payload.meta.createdAt.slice(11, 19).replace(/:/g, "")}.json`;

const writeBackupFile = async (db) => {
  const payload = await createBackupPayload(db);
  const backupDir = path.join(__dirname, "backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const fileName = backupFileName(payload);
  const fullPath = path.join(backupDir, fileName);
  fs.writeFileSync(fullPath, JSON.stringify(payload, null, 2));
  return { fileName, fullPath, payload };
};

const fetchPdfText = async (url, timeoutMs = 30000) => {
  if (!pdfParse || typeof fetch !== "function") {
    return "";
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": browserUserAgent }
    });
    if (!response.ok) {
      return "";
    }
    const length = Number(response.headers.get("content-length") || 0);
    if (length > 8 * 1024 * 1024) {
      return "";
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    const parsed = await pdfParse(buffer);
    return String(parsed.text || "").slice(0, 12000);
  } catch (err) {
    return "";
  } finally {
    clearTimeout(timer);
  }
};

const extractLinks = (html = "", baseUrl = "", keywords = []) => {
  const linkRegex = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const sourceKeywords = keywords.length ? keywords : autoJobKeywords;
  const rows = [];
  const seen = new Set();
  let match;
  while ((match = linkRegex.exec(html))) {
    const href = String(match[1] || "").trim();
    if (!href || /^(javascript:|mailto:|tel:|#)/i.test(href)) continue;
    let link = "";
    try {
      link = new URL(href, baseUrl).href;
    } catch (err) {
      continue;
    }
    const title = decodeHtml(match[2] || link).slice(0, 220);
    const haystack = `${title} ${link}`.toLowerCase();
    const matched = sourceKeywords.some((word) => haystack.includes(String(word).toLowerCase()));
    const isDocument = /\.(pdf|docx?|xlsx?|zip)(?:[?#].*)?$/i.test(link);
    if (!matched && !isDocument) continue;
    const key = link.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ title: title || link, link });
  }
  return rows.slice(0, 80);
};

const buildDraftFromNotice = async (source, notice) => {
  const pdfText = /\.pdf(?:[?#].*)?$/i.test(notice.link) ? await fetchPdfText(notice.link) : "";
  const bodyText = pdfText || `${notice.title}\n${notice.link}`;
  const target = detectPostTarget(notice.title, notice.link, bodyText);
  const linkField = pickJobLinkField(target);
  const qualification = findFirstMatchLine(bodyText, [
    /qualification/i, /eligibility/i, /education/i, /योग्यता/i, /पात्रता/i, /शैक्षणिक/i
  ]);
  const department = source.department || findFirstMatchLine(bodyText, [/department/i, /board/i, /कार्यालय/i, /विभाग/i]) || source.name;
  const officialLink = source.url;
  const draft = {
    title: notice.title,
    department,
    postDate: new Date().toLocaleDateString("en-GB").replace(/\//g, "-"),
    importantDates: extractDatesBlock(bodyText),
    qualification,
    totalPosts: extractTotalPosts(bodyText),
    officialWebsite: officialLink,
    officialLink,
    sourceLink: notice.link,
    detailLink: notice.link,
    applyLink: "#",
    type: target === "latestJob" ? "Online Form" : "Update",
    postTarget: target,
    postStatus: "draft",
    displayOrder: "1",
    detailLayout: "table",
    pageContent: pdfText ? `Auto PDF Text:\n${pdfText.slice(0, 5000)}` : "",
    rawText: pdfText.slice(0, 8000),
    pdfTextExtracted: Boolean(pdfText),
    checkerStatus: "draft",
    sourceId: source.id,
    sourceName: source.name,
    detectedLink: notice.link,
    createdAt: nowStamp(),
    updatedAt: nowStamp()
  };
  draft[linkField] = notice.link;
  return enrichJobAutomation(draft, hashKey(notice.link).slice(0, 8));
};

async function checkOneAutoJobSource(db, source) {
  const startedAt = nowStamp();
  let found = 0;
  let newDrafts = 0;
  const keywordList = source.keywords
    ? source.keywords.split(",").map((item) => item.trim()).filter(Boolean)
    : autoJobKeywords;
  try {
    const page = await fetchText(source.url);
    const notices = extractLinks(page.text, source.url, keywordList);
    found = notices.length;
    for (const notice of notices) {
      const draftSeed = {
        title: notice.title,
        department: source.department || source.name,
        sourceLink: notice.link,
        detailLink: notice.link,
        postTarget: detectPostTarget(notice.title, notice.link, "")
      };
      const duplicateKeys = duplicateKeysForJob(draftSeed);
      const seenSnapshots = await Promise.all(duplicateKeys.map((key) => db.ref(`autoJobSeen/${key}`).get()));
      if (seenSnapshots.some((item) => item.exists())) continue;
      const duplicateId = duplicateKeys[0] || `link_${hashKey(`${notice.link}`)}`;
      const draft = await buildDraftFromNotice(source, notice);
      const updates = {};
      duplicateKeys.forEach((key) => {
        updates[`autoJobSeen/${key}`] = {
          title: notice.title,
          link: notice.link,
          sourceId: source.id,
          sourceName: source.name,
          firstSeenAt: nowStamp(),
          draftId: duplicateId
        };
      });
      updates[`autoJobSeen/${duplicateId}`] = {
        title: notice.title,
        link: notice.link,
        sourceId: source.id,
        sourceName: source.name,
        firstSeenAt: nowStamp(),
        draftId: duplicateId
      };
      updates[`autoJobDrafts/${duplicateId}`] = {
        ...draft,
        duplicateKey: duplicateId,
        duplicateKeys
      };
      await db.ref().update(updates);
      newDrafts++;
    }
    await db.ref(`autoJobSources/${source.id}`).update({
      lastCheckedAt: nowStamp(),
      lastStatus: "success",
      lastError: "",
      lastErrorHelp: "",
      lastFoundCount: found,
      lastNewCount: newDrafts,
      updatedAt: nowStamp()
    });
    await logAutoJob(db, {
      level: "success",
      sourceId: source.id,
      sourceName: source.name,
      message: `${source.name}: ${found} links checked, ${newDrafts} new drafts`
    });
    return { sourceId: source.id, found, newDrafts, ok: true };
  } catch (err) {
    const friendly = explainFetchError(err);
    await db.ref(`autoJobSources/${source.id}`).update({
      lastCheckedAt: nowStamp(),
      lastStatus: "error",
      lastError: err.message,
      lastErrorHelp: friendly.message,
      lastErrorCode: friendly.code,
      updatedAt: nowStamp()
    });
    await logAutoJob(db, {
      level: "error",
      sourceId: source.id,
      sourceName: source.name,
      message: `${source.name}: ${friendly.message}`
    });
    return { sourceId: source.id, found, newDrafts, ok: false, error: err.message, errorHelp: friendly.message, errorCode: friendly.code, startedAt };
  }
}

async function runAutoJobChecker(options = {}) {
  const db = getAdminDb();
  if (!db) {
    throw new Error("Firebase Admin SDK is not configured");
  }
  if (autoCheckerRunning) {
    return { ok: true, skipped: true, message: "Checker already running" };
  }
  autoCheckerRunning = true;
  const startedAt = nowStamp();
  try {
    const snapshot = await db.ref("autoJobSources").get();
    const sources = [];
    if (snapshot.exists()) {
      snapshot.forEach((child) => {
        const source = normalizeSource(child.key, child.val() || {});
        if (source.enabled && source.url) sources.push(source);
      });
    }
    const results = [];
    for (const source of sources) {
      results.push(await checkOneAutoJobSource(db, source));
    }
    const summary = {
      ok: true,
      manual: Boolean(options.manual),
      startedAt,
      finishedAt: nowStamp(),
      sourceCount: sources.length,
      checkedCount: results.length,
      foundCount: results.reduce((sum, item) => sum + Number(item.found || 0), 0),
      newDraftCount: results.reduce((sum, item) => sum + Number(item.newDrafts || 0), 0),
      errorCount: results.filter((item) => !item.ok).length
    };
    await db.ref("autoJobCheckerStatus").set(summary);
    await logAutoJob(db, {
      level: summary.errorCount ? "warning" : "success",
      message: `Checker finished: ${summary.checkedCount} sources, ${summary.newDraftCount} new drafts`
    });
    return { ...summary, results };
  } finally {
    autoCheckerRunning = false;
  }
}

const getPortalTargetUrl = (job = {}) => {
  const key = pickJobLinkField(job.postTarget);
  const direct = job[key];
  if (direct && direct !== "#") return direct;
  if (job.detailLink && job.detailLink !== "#") return job.detailLink;
  if (job.applyLink && job.applyLink !== "#") return job.applyLink;
  return job.sourceLink || "";
};

async function publishAutoJobDraft(db, draftId, payload = {}) {
  const draftSnapshot = await db.ref(`autoJobDrafts/${draftId}`).get();
  if (!draftSnapshot.exists()) {
    const error = new Error("Draft not found");
    error.statusCode = 404;
    throw error;
  }
  const currentDraft = draftSnapshot.val() || {};
  const draft = enrichJobAutomation({ ...currentDraft, ...(payload.draft || {}) }, draftId);
  if (!toText(draft.title)) {
    const error = new Error("Draft title required");
    error.statusCode = 400;
    throw error;
  }
  const target = draft.postTarget || "latestJob";
  const now = nowStamp();
  const jobRef = db.ref("LatestJobs").push();
  const jobId = jobRef.key;
  const seo = buildSeoFields(draft, jobId);
  const autoSendChannels = Array.isArray(payload.autoSendChannels) ? payload.autoSendChannels.map((item) => String(item || "").toLowerCase()) : [];
  const job = {
    title: toText(draft.title),
    department: toText(draft.department),
    totalPosts: toText(draft.totalPosts),
    postDate: toText(draft.postDate),
    startDate: toText(draft.startDate || "Update Soon"),
    lastApplyDate: toText(draft.lastApplyDate || draft.lastDate || "Update Soon"),
    lastDate: toText(draft.lastDate || draft.lastApplyDate || "Update Soon"),
    qualification: toText(draft.qualification || "Update Soon"),
    importantDates: toText(draft.importantDates),
    applyLink: toText(draft.applyLink || "#"),
    detailLink: toText(draft.detailLink || draft.sourceLink || "#"),
    officialWebsite: toText(draft.officialWebsite || draft.officialLink),
    sourceLink: toText(draft.sourceLink),
    type: toText(draft.type || "Online Form"),
    postTarget: target,
    postStatus: "published",
    displayOrder: "1",
    slug: seo.slug,
    seoTitle: seo.seoTitle,
    metaDescription: seo.metaDescription,
    notificationSummary: String(draft.notificationSummary || "").trim() || buildNotificationSummary(draft),
    whatsappPostText: String(draft.whatsappPostText || "").trim(),
    detailLayout: toText(draft.detailLayout || "table"),
    pageContent: toText(draft.pageContent),
    autoCheckerDraftId: draftId,
    createdAt: now,
    updatedAt: now
  };
  job.whatsappPostText = job.whatsappPostText || buildWhatsappPostText(jobId, job);
  ["admitCardLink", "resultLink", "syllabusLink", "answerKeyLink"].forEach((key) => {
    if (draft[key]) job[key] = toText(draft[key]);
  });
  if (autoSendChannels.includes("whatsapp")) {
    const prepared = await prepareWhatsappShare(job, jobId);
    Object.assign(job, pickShareAutomationFields(prepared.item));
  }

  const jobsSnapshot = await db.ref("LatestJobs").get();
  const updates = {};
  if (jobsSnapshot.exists()) {
    jobsSnapshot.forEach((child) => {
      const existing = child.val() || {};
      if ((existing.postTarget || "latestJob") === target && Number(existing.displayOrder || 0) > 0) {
        const nextOrder = Number(existing.displayOrder || 0) + 1;
        updates[`LatestJobs/${child.key}/displayOrder`] = nextOrder;
        updates[`LatestJobs/${child.key}/updatedAt`] = now;
        if (target !== "latestJob") {
          updates[`portalItems/${target}/job_${child.key}/displayOrder`] = nextOrder;
          updates[`portalItems/${target}/job_${child.key}/updatedAt`] = now;
        }
      }
    });
  }
  updates[`LatestJobs/${jobId}`] = job;
  if (target !== "latestJob") {
    updates[`portalItems/${target}/job_${jobId}`] = {
      source: "LatestJobs",
      sourceJobId: jobId,
      jobTitle: job.title,
      title: `${job.title} ${target === "admitCard" ? "Admit Card" : target === "result" ? "Result" : target === "syllabus" ? "Syllabus" : "Answer Key"}`.trim(),
      url: getPortalTargetUrl(job),
      displayOrder: "1",
      createdAt: now,
      updatedAt: now
    };
  }
  updates[`autoJobDrafts/${draftId}/checkerStatus`] = "published";
  updates[`autoJobDrafts/${draftId}/publishedJobId`] = jobId;
  updates[`autoJobDrafts/${draftId}/publishedAt`] = now;
  updates[`autoJobDrafts/${draftId}/updatedAt`] = now;
  duplicateKeysForJob(job).forEach((key) => {
    updates[`autoJobSeen/${key}`] = {
      title: job.title,
      link: job.sourceLink || job.detailLink || "",
      sourceId: draft.sourceId || "",
      sourceName: draft.sourceName || "",
      firstSeenAt: now,
      draftId,
      publishedJobId: jobId
    };
  });
  await db.ref().update(updates);
  const sent = [];
  for (const channel of autoSendChannels) {
    try {
      if (channel === "telegram") {
        await sendTelegramMessage(job.whatsappPostText);
        sent.push({ channel, ok: true });
      } else if (channel === "whatsapp") {
        await sendWhatsappMessage(job.whatsappPostText);
        sent.push({ channel, ok: true });
      }
    } catch (err) {
      sent.push({ channel, ok: false, error: err.message });
    }
  }
  await logAutoJob(db, {
    level: "success",
    sourceId: draft.sourceId || "",
    sourceName: draft.sourceName || "",
    message: `Draft published: ${job.title}`
  });
  return { ok: true, jobId, slug: job.slug, shareText: job.whatsappPostText, sent };
}

function requireCronSecret(req) {
  const expected = String(process.env.CRON_SECRET || "").trim();
  if (!expected) {
    const error = new Error("CRON_SECRET is not configured");
    error.statusCode = 503;
    throw error;
  }
  const received = String(req.headers["x-cron-secret"] || req.query?.secret || req.body?.secret || "").trim();
  if (received !== expected) {
    const error = new Error("Invalid cron secret");
    error.statusCode = 401;
    throw error;
  }
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

app.get("/api/health", (req, res) => {
  res.json(buildServerStatus({ message: "Admin API is running" }));
});

app.post("/api/health", (req, res) => {
  res.json(buildServerStatus({ message: "Admin API is running" }));
});

app.get("/", (req, res) => {
  res.json(buildServerStatus({ message: "Admin API is running" }));
});

app.post("/admin/status", async (req, res) => {
  try {
    const { db, decoded } = await requireAdmin(req);
    await db.ref("autoJobCheckerStatus").get();
    return res.json(buildServerStatus({
      databaseConnected: true,
      adminEmail: decoded.email || ""
    }));
  } catch (err) {
    return res.status(err.statusCode || 500).json(buildServerStatus({
      ok: false,
      databaseConnected: false,
      error: err.message
    }));
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

    const normalizedMobile = normalizeMobile(mobile);
    if (!normalizedMobile) {
      return res.status(400).json({ ok: false, error: "Valid 10 digit mobile required" });
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
      mobile: normalizedMobile.display,
      mobileKey: normalizedMobile.key,
      phoneNumber: normalizedMobile.e164,
      mobileVerified: true,
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

    await db.ref(`mobileIndex/${normalizedMobile.key}`).set({
      uid: createdUid,
      email,
      mobile: normalizedMobile.display,
      phoneNumber: normalizedMobile.e164,
      createdAt: now,
      updatedAt: now
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

    const memberSnapshot = await db.ref(`members/${uid}`).get();
    const member = memberSnapshot.exists() ? memberSnapshot.val() || {} : {};
    const mobile = normalizeMobile(member.mobile || member.phoneNumber || "");

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

    if (mobile) {
      await db.ref(`mobileIndex/${mobile.key}`).remove();
    }

    return res.json({ ok: true, message: "Member deleted" });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ ok: false, error: err.message });
  }
});

app.post("/admin/auto-job-checker/run", async (req, res) => {
  try {
    await requireAdmin(req);
    const result = await runAutoJobChecker({ manual: true });
    return res.json(result);
  } catch (err) {
    return res.status(err.statusCode || 500).json({ ok: false, error: err.message });
  }
});

app.post("/admin/auto-job-checker/state", async (req, res) => {
  try {
    const { db } = await requireAdmin(req);
    const [sources, drafts, logs, status] = await Promise.all([
      db.ref("autoJobSources").get(),
      db.ref("autoJobDrafts").get(),
      db.ref("autoJobLogs").get(),
      db.ref("autoJobCheckerStatus").get()
    ]);
    return res.json({
      ok: true,
      sources: snapshotValue(sources),
      drafts: snapshotValue(drafts),
      logs: snapshotValue(logs),
      checkerStatus: snapshotValue(status)
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ ok: false, error: err.message });
  }
});

app.post("/admin/auto-job-checker/source/save", async (req, res) => {
  try {
    const { db } = await requireAdmin(req);
    const sourceId = String(req.body?.sourceId || "").trim();
    const source = sourcePayloadFromRequest(req.body?.source || {});
    const targetRef = sourceId ? db.ref(`autoJobSources/${sourceId}`) : db.ref("autoJobSources").push();
    const id = sourceId || targetRef.key;
    if (sourceId) {
      await targetRef.update(source);
    } else {
      await targetRef.set({ ...source, createdAt: nowStamp() });
    }
    return res.json({ ok: true, sourceId: id });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ ok: false, error: err.message });
  }
});

app.post("/admin/auto-job-checker/source/delete", async (req, res) => {
  try {
    const { db } = await requireAdmin(req);
    const sourceId = String(req.body?.sourceId || "").trim();
    if (!sourceId) {
      return res.status(400).json({ ok: false, error: "Source ID required" });
    }
    await db.ref(`autoJobSources/${sourceId}`).remove();
    return res.json({ ok: true });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ ok: false, error: err.message });
  }
});

app.post("/admin/auto-job-checker/source/test", async (req, res) => {
  try {
    const { db } = await requireAdmin(req);
    const sourceId = String(req.body?.sourceId || "").trim();
    let source = null;
    if (sourceId) {
      const snapshot = await db.ref(`autoJobSources/${sourceId}`).get();
      if (!snapshot.exists()) {
        return res.status(404).json({ ok: false, error: "Source not found" });
      }
      source = normalizeSource(sourceId, snapshot.val() || {});
    } else {
      source = sourcePayloadFromRequest(req.body?.source || {});
    }
    const result = await testAutoJobSource(source);
    const updateData = {
      lastTestedAt: result.checkedAt,
      lastTestStatus: result.ok ? "success" : "error",
      lastTestMessage: result.message,
      lastTestError: result.error || "",
      lastTestFoundCount: result.foundCount || 0,
      updatedAt: nowStamp()
    };
    if (sourceId) {
      await db.ref(`autoJobSources/${sourceId}`).update(updateData);
    }
    await logAutoJob(db, {
      level: result.ok ? "success" : "error",
      sourceId: sourceId || "",
      sourceName: source.name || "",
      message: `${source.name || "Source"} test: ${result.message}`
    });
    return res.json({ ok: true, test: result });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ ok: false, error: err.message });
  }
});

app.post("/admin/auto-job-checker/sources/seed", async (req, res) => {
  try {
    const { db } = await requireAdmin(req);
    const snapshot = await db.ref("autoJobSources").get();
    const existingByUrl = new Map();
    if (snapshot.exists()) {
      snapshot.forEach((child) => {
        const source = child.val() || {};
        const url = extractHttpUrl(source.url || "").replace(/\/+$/, "").toLowerCase();
        if (url) existingByUrl.set(url, child.key);
      });
    }

    let added = 0;
    let updated = 0;
    const now = nowStamp();
    for (const source of DEFAULT_AUTO_JOB_SOURCES) {
      const key = source.url.replace(/\/+$/, "").toLowerCase();
      const existingId = existingByUrl.get(key);
      const { id, ...payload } = source;
      if (existingId) {
        await db.ref(`autoJobSources/${existingId}`).update({ ...payload, updatedAt:now });
        updated++;
      } else {
        await db.ref(`autoJobSources/${id}`).set({ ...payload, createdAt:now, updatedAt:now });
        added++;
      }
    }

    return res.json({ ok: true, added, updated, total: DEFAULT_AUTO_JOB_SOURCES.length });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ ok: false, error: err.message });
  }
});

app.post("/admin/auto-job-checker/draft/save", async (req, res) => {
  try {
    const { db } = await requireAdmin(req);
    const draftId = String(req.body?.draftId || "").trim();
    const draft = req.body?.draft && typeof req.body.draft === "object" ? req.body.draft : {};
    if (!draftId) {
      return res.status(400).json({ ok: false, error: "Draft ID required" });
    }
    if (!toText(draft.title)) {
      return res.status(400).json({ ok: false, error: "Draft title required" });
    }
    await db.ref(`autoJobDrafts/${draftId}`).update({ ...draft, updatedAt: nowStamp() });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ ok: false, error: err.message });
  }
});

app.post("/admin/auto-job-checker/json/generate", async (req, res) => {
  try {
    await requireAdmin(req);
    const text = String(req.body?.text || "").trim();
    const draft = req.body?.draft && typeof req.body.draft === "object" ? req.body.draft : {};
    const generated = enrichJobAutomation(generateJobJsonFromText(text || draft.pageContent || draft.rawText || draft.title || "", draft), safeKey(draft.sourceLink || draft.title || text));
    return res.json({ ok: true, json: generated });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ ok: false, error: err.message });
  }
});

app.post("/admin/auto-job-checker/draft/enrich", async (req, res) => {
  try {
    const { db } = await requireAdmin(req);
    const draftId = String(req.body?.draftId || "").trim();
    const incoming = req.body?.draft && typeof req.body.draft === "object" ? req.body.draft : {};
    let current = {};
    if (draftId) {
      const snapshot = await db.ref(`autoJobDrafts/${draftId}`).get();
      current = snapshot.exists() ? (snapshot.val() || {}) : {};
    }
    const enriched = enrichJobAutomation({ ...current, ...incoming }, draftId);
    const ai = await generateAiSummary(enriched);
    enriched.notificationSummary = ai.summary;
    enriched.summaryProvider = ai.provider;
    enriched.whatsappPostText = buildWhatsappPostText(draftId, enriched);
    if (draftId) {
      await db.ref(`autoJobDrafts/${draftId}`).update(enriched);
    }
    return res.json({ ok: true, draft: enriched, ai });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ ok: false, error: err.message });
  }
});

app.post("/admin/auto-job-checker/draft/delete", async (req, res) => {
  try {
    const { db } = await requireAdmin(req);
    const draftId = String(req.body?.draftId || "").trim();
    if (!draftId) {
      return res.status(400).json({ ok: false, error: "Draft ID required" });
    }
    await db.ref(`autoJobDrafts/${draftId}`).remove();
    return res.json({ ok: true });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ ok: false, error: err.message });
  }
});

app.post("/admin/auto-job-checker/draft/ignore", async (req, res) => {
  try {
    const { db } = await requireAdmin(req);
    const draftId = String(req.body?.draftId || "").trim();
    if (!draftId) {
      return res.status(400).json({ ok: false, error: "Draft ID required" });
    }
    await db.ref(`autoJobDrafts/${draftId}`).update({
      checkerStatus: "ignored",
      ignoredAt: nowStamp(),
      updatedAt: nowStamp()
    });
    await logAutoJob(db, {
      level: "info",
      message: `Draft ignored: ${draftId}`
    });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ ok: false, error: err.message });
  }
});

app.post("/admin/auto-job-checker/whatsapp/prepare", async (req, res) => {
  try {
    const { db } = await requireAdmin(req);
    const draftId = String(req.body?.draftId || "").trim();
    const jobId = String(req.body?.jobId || "").trim();
    let item = req.body?.draft && typeof req.body.draft === "object" ? req.body.draft : {};
    if (draftId) {
      const snapshot = await db.ref(`autoJobDrafts/${draftId}`).get();
      if (snapshot.exists()) {
        item = { ...(snapshot.val() || {}), ...item };
      }
    } else if (jobId) {
      const snapshot = await db.ref(`LatestJobs/${jobId}`).get();
      if (snapshot.exists()) {
        item = { ...(snapshot.val() || {}), ...item };
      }
    }
    const shareId = jobId || draftId || safeKey(item.sourceLink || item.title || "");
    const prepared = await prepareWhatsappShare(item, shareId);
    const updateFields = pickShareAutomationFields(prepared.item);
    if (draftId) {
      await db.ref(`autoJobDrafts/${draftId}`).update(updateFields);
    } else if (jobId) {
      await db.ref(`LatestJobs/${jobId}`).update(updateFields);
    }
    return res.json({
      ok: true,
      text: prepared.text,
      draft: prepared.item,
      ai: prepared.ai
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ ok: false, error: err.message });
  }
});

app.post("/admin/auto-job-checker/share/send", async (req, res) => {
  try {
    const { db } = await requireAdmin(req);
    const channel = String(req.body?.channel || "").trim().toLowerCase();
    const draftId = String(req.body?.draftId || "").trim();
    const jobId = String(req.body?.jobId || "").trim();
    let item = req.body?.draft && typeof req.body.draft === "object" ? req.body.draft : {};
    if (draftId) {
      const snapshot = await db.ref(`autoJobDrafts/${draftId}`).get();
      if (snapshot.exists()) {
        item = { ...(snapshot.val() || {}), ...item };
      }
    } else if (jobId) {
      const snapshot = await db.ref(`LatestJobs/${jobId}`).get();
      if (snapshot.exists()) {
        item = { ...(snapshot.val() || {}), ...item };
      }
    }
    const shareId = jobId || draftId || safeKey(item.sourceLink || item.title || "");
    let prepared = null;
    let text = String(req.body?.text || "").trim();
    if (channel === "whatsapp" && !req.body?.aiPrepared) {
      prepared = await prepareWhatsappShare(item, shareId);
      item = prepared.item;
      text = prepared.text;
      const updateFields = pickShareAutomationFields(item);
      if (draftId) {
        await db.ref(`autoJobDrafts/${draftId}`).update(updateFields);
      } else if (jobId) {
        await db.ref(`LatestJobs/${jobId}`).update(updateFields);
      }
    }
    text = text || item.whatsappPostText || buildWhatsappPostText(shareId, enrichJobAutomation(item, shareId));
    if (!text) {
      return res.status(400).json({ ok: false, error: "Share text missing" });
    }
    let result = null;
    if (channel === "telegram") {
      result = await sendTelegramMessage(text);
    } else if (channel === "whatsapp") {
      result = await sendWhatsappMessage(text);
    } else {
      return res.status(400).json({ ok: false, error: "Channel telegram ya whatsapp hona chahiye" });
    }
    await logAutoJob(db, {
      level: "success",
      sourceId: item.sourceId || "",
      sourceName: item.sourceName || "",
      message: `${channel} send ho gaya: ${item.title || shareId}`
    });
    return res.json({ ok: true, channel, result, text, draft: prepared ? prepared.item : item, ai: prepared ? prepared.ai : null });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ ok: false, error: err.message });
  }
});

app.post("/admin/auto-job-checker/publish", async (req, res) => {
  try {
    const { db } = await requireAdmin(req);
    const draftId = String(req.body?.draftId || "").trim();
    if (!draftId) {
      return res.status(400).json({ ok: false, error: "Draft ID required" });
    }
    const result = await publishAutoJobDraft(db, draftId, req.body || {});
    return res.json(result);
  } catch (err) {
    return res.status(err.statusCode || 500).json({ ok: false, error: err.message });
  }
});

app.post("/admin/backup", async (req, res) => {
  try {
    const { db } = await requireAdmin(req);
    const payload = await createBackupPayload(db);
    const fileName = backupFileName(payload);
    return res.json({ ok: true, fileName, backup: payload });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ ok: false, error: err.message });
  }
});

app.post("/admin/git-safety", async (req, res) => {
  try {
    await requireAdmin(req);
    const { stdout } = await execFileAsync(process.execPath, ["scripts/check-git-safety.js", "--json"], {
      cwd: __dirname,
      encoding: "utf8",
      maxBuffer: 1024 * 1024
    });
    const result = JSON.parse(stdout || "{}");
    return res.json({ ok: true, ...result });
  } catch (err) {
    return res.status(err.statusCode || 500).json({
      ok: false,
      error: err.message,
      safe: false,
      findings: ["Git safety script nahi chal paya. Local command try karein: npm run safety"]
    });
  }
});

const runCronAutoJobChecker = async (req, res) => {
  try {
    requireCronSecret(req);
    const result = await runAutoJobChecker({ scheduled: true });
    return res.json(result);
  } catch (err) {
    return res.status(err.statusCode || 500).json({ ok: false, error: err.message });
  }
};

app.get("/cron/auto-job-checker", runCronAutoJobChecker);
app.post("/cron/auto-job-checker", runCronAutoJobChecker);

app.listen(PORT, () => {
  console.log(`Admin API running on port ${PORT}`);
  if (CHECKER_INTERVAL_MS > 0) {
    setInterval(() => {
      runAutoJobChecker({ scheduled: true }).catch((err) => {
        console.error("Auto job checker failed:", err.message);
      });
    }, CHECKER_INTERVAL_MS);
  }
  if (BACKUP_INTERVAL_MS > 0 && isAdminSdkConfigured()) {
    setInterval(() => {
      const db = getAdminDb();
      if (!db) {
        return;
      }
      writeBackupFile(db)
        .then((result) => console.log(`Firebase backup saved: ${result.fileName}`))
        .catch((err) => console.error("Firebase backup failed:", err.message));
    }, BACKUP_INTERVAL_MS);
  }
});
