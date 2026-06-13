require("dotenv").config({ path: ".env.local" });
require("dotenv").config();

const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");
const multer = require("multer");
const PDFDocument = require("pdfkit");
const { PDFDocument: LibPdfDocument, StandardFonts, rgb } = require("pdf-lib");
const forge = require("node-forge");
const { createClient: createSupabaseClient } = require("@supabase/supabase-js");
let admin = null;
let pdfParse = null;
let cheerio = null;
let cron = null;

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

try {
  cheerio = require("cheerio");
} catch (err) {
  cheerio = null;
}

try {
  cron = require("node-cron");
} catch (err) {
  cron = null;
}

const app = express();
const isAllowedCorsOrigin = (origin = "") => {
  if (!origin) return true;
  return origin === "https://emitrawala.online"
    || origin === "https://www.emitrawala.online"
    || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
};
app.use((req, res, next) => {
  const origin = req.headers.origin || "";
  res.setHeader("Access-Control-Allow-Origin", isAllowedCorsOrigin(origin) ? (origin || "https://emitrawala.online") : "https://emitrawala.online");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Cron-Secret");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  return next();
});
const staticMiddleware = express.static(__dirname);
app.use((req, res, next) => {
  const publicPath = String(req.path || "").toLowerCase();
  if (publicPath === "/sitemap.xml" || publicPath === "/sitemap-jobs.xml" || publicPath === "/robots.txt" || publicPath === "/job-form.html") {
    return next();
  }
  if (publicPath.startsWith("/post/")) {
    return next();
  }
  if (publicPath === "/job-detail.html" && (req.query?.id || req.query?.post || req.query?.slug)) {
    return next();
  }
  return staticMiddleware(req, res, next);
});

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
const SETTINGS_PATH = path.join(__dirname, "settings.json");
const CRAWLER_SOURCES_PATH = path.join(__dirname, "crawler-sources.json");
const FORMS_FIELDS_CONFIG_PATH = path.join(__dirname, "emitra-offline-form-fill", "assets", "forms-fields-config.json");
const FORMS_TEMPLATE_UPLOAD_DIR = path.join(__dirname, "emitra-offline-form-fill", "assets", "uploaded-templates");
const PDF_SIGNATURE_TEMP_DIR = path.join(__dirname, ".tmp", "pdf-signature-verification");
const PDF_SIGNATURE_REPORT_DIR = path.join(PDF_SIGNATURE_TEMP_DIR, "reports");
const PDF_VERIFICATION_BUCKET = String(process.env.SUPABASE_PDF_VERIFICATION_BUCKET || "pdf-verification").trim();
const SUPABASE_URL = String(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "").trim();
const SUPABASE_PUBLISHABLE_KEY = String(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "").trim();
const PDF_VERIFICATION_LOCAL_DIR = path.join(__dirname, ".uploads", "pdf-verification");
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "jasmelsolanki@gmail.com";
const SITE_BASE_URL = extractUrl(process.env.SITE_BASE_URL, "https://emitrawala.online");
const WHATSAPP_CHANNEL_URL = extractHttpUrl(process.env.WHATSAPP_CHANNEL_URL, "https://whatsapp.com/channel/0029Vb7y0JL9Bb67psBzxG1Q");
const TELEGRAM_CHANNEL_URL = extractHttpUrl(process.env.TELEGRAM_CHANNEL_URL, "https://t.me/emitrawalaonline");
const TELEGRAM_BOT_TOKEN = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
const TELEGRAM_CHAT_ID = String(process.env.TELEGRAM_CHAT_ID || "").trim();
const WHATSAPP_ACCESS_TOKEN = String(process.env.WHATSAPP_ACCESS_TOKEN || "").trim();
const WHATSAPP_PHONE_NUMBER_ID = String(process.env.WHATSAPP_PHONE_NUMBER_ID || "").trim();
const WHATSAPP_TO_NUMBER = String(process.env.WHATSAPP_TO_NUMBER || "").replace(/\D/g, "");
const GEMINI_API_KEY = String(process.env.GEMINI_API_KEY || "").trim();
const GEMINI_MODEL = String(process.env.GEMINI_MODEL || "gemini-2.5-flash").trim();
const OPENAI_API_KEY = String(process.env.OPENAI_API_KEY || "").trim();
const OPENAI_MODEL = String(process.env.OPENAI_MODEL || "").trim();
const AI_PROVIDER = String(process.env.AI_PROVIDER || "gemini").trim().toLowerCase();
const AI_MODEL = String(process.env.AI_MODEL || "").trim();
const OPENROUTER_DEEPSEEK_MODEL = "deepseek/deepseek-chat-v3-0324:free";
const OPENROUTER_QWEN_MODEL = "qwen/qwen3-coder:free";
const OPENROUTER_API_KEY = String(process.env.OPENROUTER_API_KEY || "").trim();
const OPENROUTER_MODEL = String(process.env.OPENROUTER_MODEL || AI_MODEL || OPENROUTER_DEEPSEEK_MODEL).trim();
const GROQ_API_KEY = String(process.env.GROQ_API_KEY || "").trim();
const GROQ_MODEL = String(process.env.GROQ_MODEL || "llama-3.1-8b-instant").trim();
const DEEPSEEK_API_KEY = String(process.env.DEEPSEEK_API_KEY || "").trim();
const DEEPSEEK_MODEL = String(process.env.DEEPSEEK_MODEL || "deepseek-chat").trim();
const GITHUB_TOKEN = String(process.env.GITHUB_TOKEN || process.env.SEO_GITHUB_TOKEN || "").trim();
const GITHUB_REPOSITORY = String(process.env.GITHUB_REPOSITORY || process.env.SEO_GITHUB_REPOSITORY || "jasmelsolanki2017-svg/emitra-sewa-kendra").trim();
const GITHUB_DISPATCH_EVENT = String(process.env.SEO_GITHUB_DISPATCH_EVENT || "seo-posts-update").trim();
const DEFAULT_MEMBER_PASSWORD = "User@123";
const CHECKER_INTERVAL_MS = Number(process.env.AUTO_JOB_CHECKER_INTERVAL_MS || 30 * 60 * 1000);
const CHECKER_CRON = String(process.env.AUTO_JOB_CHECKER_CRON || "*/30 * * * *").trim();
const BACKUP_INTERVAL_MS = Number(process.env.AUTO_BACKUP_INTERVAL_MS || 24 * 60 * 60 * 1000);
const execFileAsync = promisify(execFile);
let adminDb = null;
let supabaseAdminClient = null;
let autoCheckerRunning = false;
let lastSeoWorkflowDispatchAt = 0;
const quickPostBatches = new Map();

const githubApi = async (pathName = "", options = {}) => {
  const response = await fetch(`https://api.github.com${pathName}`, {
    ...options,
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${GITHUB_TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "emitra-seo-publisher",
      ...(options.headers || {})
    }
  });
  const text = await response.text().catch(() => "");
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_err) {
    data = text;
  }
  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    data
  };
};

const saveSeoPublishLog = async (db, payload = {}) => {
  if (!db) {
    return;
  }
  try {
    await db.ref("seoPublishLogs").push({
      ...payload,
      createdAt: nowStamp()
    });
  } catch (_err) {}
};

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

app.use(express.json({ limit: "20mb" }));
app.use((req, res, next) => {
  const origin = req.headers.origin || "";
  res.setHeader("Access-Control-Allow-Origin", isAllowedCorsOrigin(origin) ? (origin || "https://emitrawala.online") : "https://emitrawala.online");
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

const normalizeAiProvider = (value = "") => {
  const provider = String(value || "").trim().toLowerCase();
  if (provider === "openrouter") return "openrouter";
  if (provider === "openai") return "openai";
  return "gemini";
};

const getAiProviderConfig = (providerValue = "", modelValue = "") => {
  const provider = normalizeAiProvider(providerValue);
  const requestedModel = String(modelValue || "").trim();
  const configs = {
    gemini: { label: "Gemini", apiKey: GEMINI_API_KEY, model: requestedModel || (AI_PROVIDER === "gemini" ? AI_MODEL : "") || GEMINI_MODEL, type: "gemini" },
    openrouter: {
      label: "OpenRouter",
      apiKey: OPENROUTER_API_KEY,
      model: requestedModel || (AI_PROVIDER === "openrouter" ? AI_MODEL : "") || OPENROUTER_MODEL || "deepseek/deepseek-chat-v3-0324:free",
      type: "chat",
      url: "https://openrouter.ai/api/v1/chat/completions",
      extraHeaders: {
        "HTTP-Referer": SITE_BASE_URL,
        "X-Title": "E-MITRA WALA Auto Job Checker"
      }
    },
    groq: { label: "Groq", apiKey: GROQ_API_KEY, model: requestedModel || GROQ_MODEL, type: "chat", url: "https://api.groq.com/openai/v1/chat/completions" },
    deepseek: { label: "DeepSeek", apiKey: DEEPSEEK_API_KEY, model: requestedModel || DEEPSEEK_MODEL, type: "chat", url: "https://api.deepseek.com/chat/completions" },
    openai: { label: "OpenAI", apiKey: OPENAI_API_KEY, model: requestedModel || OPENAI_MODEL, type: "chat", url: "https://api.openai.com/v1/chat/completions" }
  };
  return configs[provider] || configs.gemini;
};

const isAiProviderConfigured = (providerValue = "", modelValue = "") => {
  const config = getAiProviderConfig(providerValue, modelValue);
  return Boolean(config.apiKey && config.model);
};

const readAiSettings = () => {
  const settings = readSettingsFile();
  const savedProvider = normalizeAiProvider(settings.aiProvider || "");
  const provider = settings.aiProvider ? savedProvider : normalizeAiProvider(AI_PROVIDER || "gemini");
  const model = String(settings.aiModel || settings.openRouterModel || (provider === "openrouter" ? OPENROUTER_MODEL : AI_MODEL) || "").trim();
  return { provider, model };
};

function buildServerStatus(overrides = {}) {
  const configured = readAiSettings();
  const selectedAi = getAiProviderConfig(configured.provider, configured.model);
  const fallbackAi = [selectedAi, getAiProviderConfig("gemini"), getAiProviderConfig("openrouter")]
    .find((config) => config.apiKey && config.model);
  const aiProvider = fallbackAi ? fallbackAi.label : "Local";
  const aiConfigured = Boolean(fallbackAi);
  return {
    ok: true,
    serverOnline: true,
    firebaseConfigured: Boolean(FIREBASE_URL),
    adminSdkConfigured: isAdminSdkConfigured(),
    databaseConnected: false,
    cronSecretConfigured: Boolean(String(process.env.CRON_SECRET || "").trim()),
    telegramConfigured: Boolean(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID),
    whatsappConfigured: Boolean(WHATSAPP_ACCESS_TOKEN && WHATSAPP_PHONE_NUMBER_ID && WHATSAPP_TO_NUMBER),
    aiConfigured,
    aiProvider,
    aiSelectedProvider: selectedAi.label,
    aiSelectedModel: selectedAi.model,
    aiSavedProvider: configured.provider,
    aiSavedModel: configured.model,
    aiEnvProvider: normalizeAiProvider(AI_PROVIDER || "gemini"),
    aiEnvModel: AI_MODEL,
    aiProviders: {
      gemini: isAiProviderConfigured("gemini"),
      openrouter: isAiProviderConfigured("openrouter"),
      openai: isAiProviderConfigured("openai")
    },
    aiModels: {
      gemini: GEMINI_MODEL,
      openrouter: OPENROUTER_MODEL,
      openai: OPENAI_MODEL,
      openrouterDeepSeek: OPENROUTER_DEEPSEEK_MODEL,
      openrouterQwen: OPENROUTER_QWEN_MODEL
    },
    githubDispatchConfigured: Boolean(GITHUB_TOKEN && GITHUB_REPOSITORY),
    githubRepository: GITHUB_REPOSITORY,
    githubDispatchEvent: GITHUB_DISPATCH_EVENT,
    autoCheckerRunning,
    checkedAt: nowStamp(),
    ...overrides
  };
}

const translateValue = (value = "", lang = "hi") => {
  if (Array.isArray(value)) return value.map((item) => translateValue(item, lang));
  if (value && typeof value === "object") {
    const keys = Object.keys(value);
    const hasLang = keys.some((key) => key === "hi" || key === "en");
    if (hasLang) return value[lang] ?? value.hi ?? value.en ?? "";
    return value;
  }
  return value;
};
const toText = (value = "") => {
  const translated = translateValue(value, "hi");
  if (translated && typeof translated === "object") return "";
  return String(translated || "").replace(/\s+/g, " ").trim();
};
const nowStamp = () => Date.now();
const escapeRegex = (value = "") => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const hashKey = (value = "") => crypto.createHash("sha256").update(String(value || "").trim().toLowerCase()).digest("hex");
const safeKey = (value = "") => hashKey(value).slice(0, 32);
const browserUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const EMITRA_BRAND_NAME = "E-MITRA WALA";
const EMITRA_WEBSITE = "https://emitrawala.online";
const PORTAL_BRAND_PATTERNS = [
  /sarkari\s*result/gi,
  /sarkari\s*exam/gi,
  /sarkariexam/gi,
  /free\s*job\s*alert/gi,
  /freejobalert/gi,
  /studygovthelp/gi,
  /\bemitra\s+wala\b/gi,
  /\bemitrawala\b(?!\.online)/gi
];
const PORTAL_NOISE_PATTERNS = [
  /(?:visit|read more at|source|credit|courtesy)\s*[:\-]?\s*(?:sarkari\s*result|sarkari\s*exam|sarkariexam|free\s*job\s*alert|freejobalert|studygovthelp)[^\n]*/gi,
  /(?:join|follow)\s+(?:telegram|whatsapp)[^\n]*/gi,
  /(?:all rights reserved|copyright)\s+[^\n]*/gi,
  /(?:home|latest jobs|admit card|results?|answer key|syllabus)\s*\|\s*/gi
];

const isAggregatorPortalUrl = (value = "") => {
  try {
    const host = new URL(String(value || "")).hostname.replace(/^www\./i, "").toLowerCase();
    return [
      "sarkariresult.com",
      "sarkariexam.com",
      "freejobalert.com",
      "studygovthelp.in",
      "studygovthelp.com"
    ].some((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch (_err) {
    return false;
  }
};

function sanitizePortalBranding(text = "") {
  if (Array.isArray(text)) return text.map((item) => sanitizePortalBranding(item));
  if (text && typeof text === "object") {
    return Object.fromEntries(Object.entries(text).map(([key, value]) => [key, sanitizePortalBranding(value)]));
  }
  let clean = String(text || "");
  PORTAL_NOISE_PATTERNS.forEach((pattern) => {
    clean = clean.replace(pattern, " ");
  });
  PORTAL_BRAND_PATTERNS.forEach((pattern) => {
    clean = clean.replace(pattern, " ");
  });
  clean = clean
    .replace(/\s+([,|:;])/g, "$1")
    .replace(/(?:^\s*[-|:;,.]+|[-|:;,.]+\s*$)/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return clean;
}

const sanitizeGeneratedJson = (value = "") => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw);
    const branded = brandDraftForEmitra(parsed);
    return JSON.stringify(branded, null, 2);
  } catch (_err) {
    return sanitizePortalBranding(raw);
  }
};

function brandDraftForEmitra(draft = {}) {
  const branded = draft && typeof draft === "object" ? { ...draft } : {};
  const textFields = [
    "title",
    "seoTitle",
    "metaDescription",
    "notificationSummary",
    "whatsappPostText",
    "pageContent",
    "rawText",
    "shortInfo",
    "description",
    "importantDates",
    "qualification",
    "applicationFeeManual",
    "feeDetails"
  ];
  textFields.forEach((field) => {
    if (branded[field] !== undefined && branded[field] !== null) {
      branded[field] = sanitizePortalBranding(branded[field]);
    }
  });
  if (branded.generatedJson) {
    branded.generatedJson = sanitizeGeneratedJson(branded.generatedJson);
  }
  if (branded.seo && typeof branded.seo === "object") {
    branded.seo = { ...branded.seo };
    ["title", "seoTitle", "description", "metaDescription"].forEach((field) => {
      if (branded.seo[field]) branded.seo[field] = sanitizePortalBranding(branded.seo[field]);
    });
  }
  if (branded.crawlerSummary && typeof branded.crawlerSummary === "object") {
    branded.crawlerSummary = { ...branded.crawlerSummary };
    ["title", "summary"].forEach((field) => {
      if (branded.crawlerSummary[field]) branded.crawlerSummary[field] = sanitizePortalBranding(branded.crawlerSummary[field]);
    });
    branded.crawlerSummary.siteName = EMITRA_BRAND_NAME;
    branded.crawlerSummary.website = EMITRA_WEBSITE;
  }
  if (!toText(branded.title) || isGenericNoticeTitle(branded.title)) {
    branded.title = "Job Update";
  }
  branded.siteName = EMITRA_BRAND_NAME;
  branded.brandName = EMITRA_BRAND_NAME;
  branded.website = EMITRA_WEBSITE;
  return branded;
}

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

const AUTO_JOB_CATEGORY_CONFIG = {
  latestJob: {
    label: "Latest Jobs",
    keywords: ["recruitment", "vacancy", "notification", "advertisement", "apply online", "online form", "भर्ती", "विज्ञप्ति", "रिक्ति"]
  },
  admitCard: {
    label: "Admit Card",
    keywords: ["admit card", "hall ticket", "exam city", "call letter", "प्रवेश पत्र", "परीक्षा शहर"]
  },
  result: {
    label: "Result",
    keywords: ["result", "merit list", "marks", "score card", "परिणाम", "मेरिट"]
  },
  answerKey: {
    label: "Answer Key",
    keywords: ["answer key", "response sheet", "objection", "उत्तर कुंजी", "आपत्ति"]
  },
  syllabus: {
    label: "Syllabus",
    keywords: ["syllabus", "exam pattern", "previous paper", "पाठ्यक्रम"]
  },
  currentAffairs: {
    label: "Current Affairs",
    keywords: ["current affairs", "daily current affairs", "news update", "करंट अफेयर्स", "समसामयिकी"]
  }
};

const AUTO_JOB_CATEGORY_KEYS = Object.keys(AUTO_JOB_CATEGORY_CONFIG);
const AUTO_JOB_DEFAULT_DRAFT_LIMIT = 12;
const AUTO_JOB_DEFAULT_PAGE_LIMIT = 20;
const AUTO_JOB_DEFAULT_PER_SOURCE_LIMIT = 4;
const AUTO_JOB_MAX_DRAFT_LIMIT = 120;
const AUTO_JOB_MAX_PAGE_LIMIT = 80;
const AUTO_JOB_MAX_PER_SOURCE_LIMIT = 40;
const CRAWLER_REQUIRED_FIELDS = ["title", "department", "totalPosts", "importantDates", "qualification", "applicationFee", "officialNotification", "officialWebsite"];
const BILINGUAL_PUBLIC_FIELDS = [
  "title",
  "seoTitle",
  "metaDescription",
  "notificationSummary",
  "importantDates",
  "applicationFee",
  "applicationFeeManual",
  "ageLimit",
  "qualification",
  "vacancyDetails",
  "selectionProcess",
  "examPattern",
  "salaryDetails",
  "howToApply",
  "whatsappPostText",
  "pageContent"
];
const BILINGUAL_PROMPT_INSTRUCTION = `Generate JSON with English keys. For all public-facing fields, return bilingual object values with hi and en. Hindi should be natural Devanagari and English should be clean SEO-friendly English. Keep official names, post names, exam names, URLs unchanged. Do not mention source portal names like FreeJobAlert, Sarkari Result, Sarkari Exam in public content. Branding must be ${EMITRA_BRAND_NAME}.`;
const AUTO_SOURCE_PRIORITY = { official: 1, freejobalert: 2, sarkariexam: 3, sarkariresult: 4 };

const readPositiveInt = (value, fallback, max) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.min(Math.floor(number), max);
};

const sourcePriorityKey = (source = {}) => {
  const text = `${source.id || ""} ${source.name || ""} ${source.url || ""}`.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (normalizeSourceKind(source.sourceKind || source.kind) !== "aggregator") return "official";
  if (text.includes("freejobalert")) return "freejobalert";
  if (text.includes("sarkariexam")) return "sarkariexam";
  if (text.includes("sarkariresult")) return "sarkariresult";
  return "aggregator";
};

const sourcePriorityValue = (source = {}) => AUTO_SOURCE_PRIORITY[sourcePriorityKey(source)] || 50;

const normalizeAutoJobCategory = (value = "") => {
  const key = String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const map = {
    latestjob: "latestJob",
    latestjobs: "latestJob",
    job: "latestJob",
    jobs: "latestJob",
    onlineform: "latestJob",
    admitcard: "admitCard",
    admitcards: "admitCard",
    hallticket: "admitCard",
    result: "result",
    results: "result",
    answerkey: "answerKey",
    answerkeys: "answerKey",
    admission: "admission",
    admissions: "admission",
    admissionform: "admission",
    syllabus: "syllabus",
    currentaffairs: "currentAffairs",
    currentaffair: "currentAffairs",
    current: "currentAffairs",
    ca: "currentAffairs"
  };
  return map[key] || "";
};

const isCurrentAffairsPost = (job = {}) => {
  const article = job.advancedArticleData && typeof job.advancedArticleData === "object" ? job.advancedArticleData : {};
  return [job.postTarget, job.postType, article.postTarget, article.postType, job.category, job.type]
    .some((value) => normalizeAutoJobCategory(value) === "currentAffairs");
};

const parseAutoJobCategories = (value) => {
  if (Array.isArray(value)) {
    const parsed = value.map(normalizeAutoJobCategory).filter(Boolean);
    return parsed.length ? Array.from(new Set(parsed)) : AUTO_JOB_CATEGORY_KEYS;
  }
  if (value && typeof value === "object") {
    const parsed = Object.entries(value)
      .filter(([, enabled]) => enabled !== false)
      .map(([key]) => normalizeAutoJobCategory(key))
      .filter(Boolean);
    return parsed.length ? Array.from(new Set(parsed)) : AUTO_JOB_CATEGORY_KEYS;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = value.split(/[,\n|]+/).map(normalizeAutoJobCategory).filter(Boolean);
    return parsed.length ? Array.from(new Set(parsed)) : AUTO_JOB_CATEGORY_KEYS;
  }
  return AUTO_JOB_CATEGORY_KEYS;
};

const parseAutoJobCategoryPages = (source = {}) => {
  const pages = {};
  if (source.categoryPages && typeof source.categoryPages === "object") {
    AUTO_JOB_CATEGORY_KEYS.forEach((key) => {
      const url = extractHttpUrl(source.categoryPages[key] || "");
      if (url) pages[key] = url;
    });
  }
  const aliases = {
    latestJob: ["latestJobUrl", "latestJobsUrl", "jobsUrl"],
    admitCard: ["admitCardUrl", "admitCardsUrl"],
    result: ["resultUrl", "resultsUrl"],
    answerKey: ["answerKeyUrl", "answerKeysUrl"],
    syllabus: ["syllabusUrl"]
  };
  Object.entries(aliases).forEach(([key, fields]) => {
    fields.forEach((field) => {
      const url = extractHttpUrl(source[field] || "");
      if (url) pages[key] = url;
    });
  });
  const raw = String(source.categoryUrls || "").trim();
  if (raw) {
    raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).forEach((line) => {
      const match = line.match(/^([^=:]+)\s*(?:=|:)\s*(https?:\/\/.+)$/i);
      if (!match) return;
      const key = normalizeAutoJobCategory(match[1]);
      const url = extractHttpUrl(match[2] || "");
      if (key && url) pages[key] = url;
    });
  }
  return pages;
};

const parseAutoJobFeedPages = (source = {}) => {
  const urls = [];
  const addUrl = (value = "") => {
    const url = extractHttpUrl(value || "");
    if (url) urls.push(url);
  };
  addUrl(source.feedUrl || source.rssUrl || "");
  if (Array.isArray(source.feedUrls)) {
    source.feedUrls.forEach(addUrl);
  } else if (typeof source.feedUrls === "string") {
    source.feedUrls.split(/[\r\n,|]+/).forEach(addUrl);
  }
  if (source.feedPages && typeof source.feedPages === "object") {
    Object.values(source.feedPages).forEach(addUrl);
  }
  return Array.from(new Set(urls.map((url) => url.replace(/\/+$/, ""))));
};

const normalizeProcessedUrl = (value = "") => {
  try {
    const url = new URL(String(value || "").trim());
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    const params = Array.from(url.searchParams.entries())
      .filter(([key]) => !/^utm_|^(fbclid|gclid)$/i.test(key))
      .sort(([a], [b]) => a.localeCompare(b));
    url.search = "";
    params.forEach(([key, val]) => url.searchParams.append(key, val));
    return url.href.replace(/\/+$/, "");
  } catch (err) {
    return String(value || "").trim().replace(/#.*$/, "").replace(/\/+$/, "").toLowerCase();
  }
};

const autoJobUrlCacheKey = (url = "") => `url_${safeKey(normalizeProcessedUrl(url))}`;

const cleanNoticeTitle = (value = "") => toText(value)
  .replace(/\b(new|click here|read more|view more|download)\b/gi, " ")
  .replace(/\s+/g, " ")
  .trim()
  .slice(0, 180);

const isGenericNoticeTitle = (title = "") => {
  const text = toText(title).toLowerCase();
  if (!text) return true;
  if (text.length < 4) return true;
  if (/^(home|login|register|contact|about|privacy|terms|download|click here|read more|view more|more|new)$/i.test(text)) return true;
  if (/^(pdf|doc|docx|xlsx?|zip)$/i.test(text)) return true;
  return false;
};

const isUsefulNoticeCandidate = (title = "", link = "", keywords = []) => {
  const cleanTitle = cleanNoticeTitle(title);
  if (isGenericNoticeTitle(cleanTitle)) return false;
  const sourceKeywords = keywords.length ? keywords : autoJobKeywords;
  const haystack = `${cleanTitle} ${link}`.toLowerCase();
  return sourceKeywords.some((word) => haystack.includes(String(word).toLowerCase()));
};

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

const extractSectionBlock = (text = "", patterns = [], maxLines = 10) => {
  const lines = String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const start = lines.findIndex((line) => patterns.some((pattern) => pattern.test(line)));
  if (start < 0) return "";
  const stopPattern = /^(?:important dates?|application fees?|age limit|qualification|eligibility|vacancy|selection process|how to apply|apply online|official|महत्वपूर्ण|आवेदन शुल्क|आयु|योग्यता|रिक्ति|चयन|आवेदन प्रक्रिया)\b/i;
  const picked = [];
  for (let index = start; index < lines.length && picked.length < maxLines; index += 1) {
    if (index > start && stopPattern.test(lines[index])) break;
    picked.push(lines[index]);
  }
  return picked.join("\n");
};
const extractApplicationFeeBlock = (text = "") => extractSectionBlock(text, [/application\s*fee/i, /exam\s*fee/i, /fee\s*details/i, /आवेदन\s*शुल्क/i, /शुल्क/i], 10);
const extractAgeLimitBlock = (text = "") => extractSectionBlock(text, [/age\s*limit/i, /upper\s*age/i, /minimum\s*age/i, /आयु/i], 8);
const extractVacancyBlock = (text = "") => extractSectionBlock(text, [/vacancy/i, /total\s*posts?/i, /रिक्ति/i, /पद/i], 12);
const extractSelectionProcessBlock = (text = "") => extractSectionBlock(text, [/selection\s*process/i, /mode\s*of\s*selection/i, /चयन/i], 10);
const extractHowToApplyBlock = (text = "") => extractSectionBlock(text, [/how\s*to\s*apply/i, /application\s*process/i, /apply\s*online/i, /आवेदन\s*कैसे/i, /आवेदन\s*प्रक्रिया/i], 10);
const extractPdfTitle = (text = "") => findFirstMatchLine(text, [/recruitment/i, /vacancy/i, /notification/i, /advertisement/i, /online\s*form/i, /admit\s*card/i, /result/i, /भर्ती/i, /विज्ञप्ति/i]) || "";
const extractPdfDepartment = (text = "") => findFirstMatchLine(text, [/department/i, /ministry/i, /board/i, /commission/i, /agency/i, /कार्यालय/i, /विभाग/i, /आयोग/i]) || "";
const isCrawlerFieldFilled = (value) => {
  if (Array.isArray(value)) return value.some(isCrawlerFieldFilled);
  if (value && typeof value === "object") return Object.values(value).some(isCrawlerFieldFilled);
  const text = toText(value);
  return Boolean(text && !/^(?:#|na|n\/a|null|undefined|update soon|coming soon|notify soon|not specified)$/i.test(text));
};

const detectPostTarget = (title = "", link = "", text = "") => {
  const haystack = `${title} ${link} ${String(text || "").slice(0, 2000)}`.toLowerCase();
  if (/(answer\s*key|उत्तर\s*कुंजी)/i.test(haystack)) return "answerKey";
  if (/(admit\s*card|hall\s*ticket|प्रवेश\s*पत्र)/i.test(haystack)) return "admitCard";
  if (/(result|merit\s*list|परिणाम)/i.test(haystack)) return "result";
  if (/(syllabus|पाठ्यक्रम)/i.test(haystack)) return "syllabus";
  if (/(current\s*affairs|करंट\s*अफेयर्स|समसामयिकी)/i.test(haystack)) return "currentAffairs";
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
  const slug = toText(job.slug) || buildSlug(job.title || "job-update", id);
  return `${SITE_BASE_URL}/post/${encodeURIComponent(slug)}/`;
};

const xmlEscape = (value = "") => String(value || "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&apos;");

const htmlEscape = (value = "") => String(value || "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#039;");

const sitemapDate = (value = "") => {
  const number = Number(value || 0);
  const date = number ? new Date(number) : new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }
  return date.toISOString().slice(0, 10);
};

const sitemapEntry = ({ loc, lastmod, changefreq = "daily", priority = "0.8" }) => `  <url>
    <loc>${xmlEscape(loc)}</loc>
    <lastmod>${xmlEscape(lastmod || new Date().toISOString().slice(0, 10))}</lastmod>
    <changefreq>${xmlEscape(changefreq)}</changefreq>
    <priority>${xmlEscape(priority)}</priority>
  </url>`;

const getLiveJobSitemapEntries = async () => {
  const db = getAdminDb();
  if (!db) {
    return [];
  }
  const snapshot = await db.ref("LatestJobs").get();
  if (!snapshot.exists()) {
    return [];
  }
  const entries = [];
  snapshot.forEach((child) => {
    const job = child.val() || {};
    if (String(job.postStatus || "published").toLowerCase() === "draft") {
      return;
    }
    const publicJob = {
      ...job,
      slug: toText(job.slug) || buildSlug(job.title || "job-update", child.key)
    };
    entries.push(sitemapEntry({
      loc: getPublicJobUrl(child.key, publicJob),
      lastmod: sitemapDate(job.updatedAt || job.createdAt || job.postDate),
      changefreq: "daily",
      priority: "0.8"
    }));
  });
  return entries;
};

const readStaticSitemap = () => fs.readFileSync(path.join(__dirname, "sitemap.xml"), "utf8");
const readStaticJobSitemap = () => fs.readFileSync(path.join(__dirname, "sitemap-jobs.xml"), "utf8");

const removeDynamicJobEntries = (xml = "") => String(xml || "")
  .replace(/\s*<url>\s*<loc>https?:\/\/[^<]+\/job-detail\.html<\/loc>[\s\S]*?<\/url>/g, "")
  .replace(/\s*<url>\s*<loc>https?:\/\/[^<]+\/job-detail\.html\?id=[\s\S]*?<\/url>/g, "")
  .replace(/\s*<url>\s*<loc>https?:\/\/[^<]+\/post\/[\s\S]*?<\/url>/g, "");

const fetchPublicFirebaseJson = async (pathName = "") => {
  const url = `${FIREBASE_URL}/${String(pathName || "").replace(/^\/+/, "")}.json`;
  const response = await fetch(url);
  if (!response.ok) {
    return null;
  }
  return response.json();
};

const getPublishedJobById = async (id = "") => {
  const cleanId = toText(id);
  if (!cleanId) {
    return null;
  }
  const db = getAdminDb();
  let job = null;
  if (db) {
    const snapshot = await db.ref(`LatestJobs/${cleanId}`).get();
    job = snapshot.exists() ? snapshot.val() : null;
  } else {
    job = await fetchPublicFirebaseJson(`LatestJobs/${cleanId}`);
  }
  if (!job || String(job.postStatus || "published").toLowerCase() === "draft") {
    return null;
  }
  return { id: cleanId, job };
};

const LEGACY_POST_SLUG_ALIASES = {
  "central-teacher-eligibility-test-ctet-september-2026-apply-online-form-tthxuz": "job-1779730227353",
  "rrb-alp-online-form-2026-11-127-posts-kfcxav": "rrb-alp-online-form-2026-11-127-posts"
};

const normalizeSlugKey = (value = "") => toText(value)
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "");

const parseLooseDate = (value = "") => {
  const text = toText(value);
  if (!text) {
    return null;
  }
  const number = Number(text);
  if (number) {
    const date = new Date(number);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const months = { jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11 };
  let match = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }
  match = text.match(/^(\d{1,2})[-/.\s]+(\d{1,2})[-/.\s]+(\d{4})$/);
  if (match) {
    return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
  }
  match = text.match(/^(\d{1,2})[-/.\s]+([a-zA-Z]+)[-/.\s]+(\d{4})$/);
  if (match && months[match[2].toLowerCase()] !== undefined) {
    return new Date(Number(match[3]), months[match[2].toLowerCase()], Number(match[1]));
  }
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
};

const isoDateOrUndefined = (value = "") => {
  const date = parseLooseDate(value);
  return date ? date.toISOString() : undefined;
};

const schemaDateOrUndefined = (value = "") => {
  const date = parseLooseDate(value);
  return date ? date.toISOString().slice(0, 10) : undefined;
};

const normalizeFaqItems = (items = []) => (Array.isArray(items) ? items : [])
  .map((item) => {
    if (!item || typeof item === "string") {
      return null;
    }
    const question = toText(item.question || item.q || item.title);
    const answer = toText(item.answer || item.a || item.text || item.content);
    return question && answer ? { question, answer } : null;
  })
  .filter(Boolean);

const normalizeCurrentAffairsFaqItems = (items = []) => normalizeFaqItems(items).filter((item) => {
  const question = item.question.toLowerCase();
  return !/(last date|department|apply link|official notification|category|अंतिम\s*तिथि|विभाग)/i.test(question);
});

const buildDefaultFaqItems = (job = {}, title = "Job Update") => {
  const targetLabel = ({
    latestJob: "online form",
    notification: "notification",
    admitCard: "admit card",
    result: "result",
    syllabus: "syllabus",
    answerKey: "answer key",
    admission: "admission form",
    currentAffairs: "current affairs"
  }[job.postTarget || "latestJob"] || "update");
  return [
    { question: `${title} ki last date kya hai?`, answer: toText(job.lastApplyDate || job.lastDate || "Official notification ke according check karein.") },
    { question: `${title} kis department se related hai?`, answer: `Ye update ${toText(job.department || "official department")} se related hai.` },
    { question: `${title} ka apply link kahan milega?`, answer: toText(job.applyLink) && toText(job.applyLink) !== "#" ? "Apply Online link Important Links section me diya gaya hai." : "Apply link update hone par Important Links section me show hoga." },
    { question: `${title} ka official notification kahan milega?`, answer: toText(job.detailLink) && toText(job.detailLink) !== "#" ? "Official notification/detail link Important Links section me available hai." : "Official detail link update hone par isi page par add kiya jayega." },
    { question: `${title} kis category ka update hai?`, answer: `Ye ${targetLabel} category ka update hai.` }
  ];
};

const jobSchemaGraph = ({ id = "", job = {}, title = "Job Update", description = "", canonicalUrl = "" }) => {
  const currentAffairs = isCurrentAffairsPost(job);
  const manualFaqs = currentAffairs ? normalizeCurrentAffairsFaqItems(job.faq) : normalizeFaqItems(job.faq);
  const faqItems = manualFaqs.length ? manualFaqs : (currentAffairs ? [] : buildDefaultFaqItems(job, title));
  const publisher = { "@type": "Organization", name: "E-MITRA WALA", url: `${SITE_BASE_URL}/` };
  const article = {
    "@type": currentAffairs ? "Article" : ["Article", "JobPosting"],
    "@id": `${canonicalUrl}#article`,
    headline: job.seoTitle || title,
    title,
    description,
    url: canonicalUrl,
    mainEntityOfPage: canonicalUrl,
    datePublished: isoDateOrUndefined(job.createdAt),
    dateModified: isoDateOrUndefined(job.updatedAt) || isoDateOrUndefined(job.createdAt),
    publisher
  };
  if (!currentAffairs) {
    article.employmentType = job.type || "Online Form";
    article.datePosted = schemaDateOrUndefined(job.postDate) || schemaDateOrUndefined(job.createdAt);
    article.validThrough = schemaDateOrUndefined(job.lastApplyDate || job.lastDate);
    article.hiringOrganization = job.department ? { "@type": "Organization", name: job.department } : publisher;
  }
  return removeUndefinedDeep({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        "@id": `${canonicalUrl}#breadcrumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_BASE_URL}/` },
          { "@type": "ListItem", position: 2, name: "Latest Jobs", item: `${SITE_BASE_URL}/#homePortalLatestJobs` },
          { "@type": "ListItem", position: 3, name: title, item: canonicalUrl }
        ]
      },
      article,
      faqItems.length ? {
        "@type": "FAQPage",
        "@id": `${canonicalUrl}#faq`,
        mainEntity: faqItems.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: { "@type": "Answer", text: item.answer }
        }))
      } : undefined
    ]
  });
};

function removeUndefinedDeep(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => removeUndefinedDeep(item))
      .filter((item) => item !== undefined);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, item]) => [key, removeUndefinedDeep(item)])
        .filter(([, item]) => item !== undefined)
    );
  }
  return value === undefined ? undefined : value;
}

const buildSeoStorageFields = (id = "", job = {}) => {
  const seo = buildSeoFields(job, id);
  const title = toText(job.title || "Job Update");
  const canonicalUrl = seo.canonicalUrl || getPublicJobUrl(id, { ...job, slug: seo.slug });
  const currentAffairs = isCurrentAffairsPost(job);
  const faq = currentAffairs ? normalizeCurrentAffairsFaqItems(job.faq) : normalizeFaqItems(job.faq);
  const faqItems = faq.length ? faq : (currentAffairs ? [] : buildDefaultFaqItems(job, title));
  const jsonLd = jobSchemaGraph({
    id,
    job: { ...job, slug: seo.slug, seoTitle: seo.seoTitle, metaDescription: seo.metaDescription, faq: faqItems },
    title,
    description: seo.metaDescription,
    canonicalUrl
  });
  return {
    slug: seo.slug,
    canonicalUrl,
    seoTitle: seo.seoTitle,
    metaDescription: seo.metaDescription,
    faq: faqItems,
    jsonLd
  };
};

const getCurrentAffairsQuestions = (job = {}) => {
  const article = job.advancedArticleData && typeof job.advancedArticleData === "object" ? job.advancedArticleData : {};
  const content = job.content && typeof job.content === "object" ? job.content : (article.content && typeof article.content === "object" ? article.content : {});
  const items = Array.isArray(job.mcqs) ? job.mcqs
    : (Array.isArray(job.questions) ? job.questions
      : (Array.isArray(article.mcqs) ? article.mcqs
        : (Array.isArray(article.questions) ? article.questions
          : (Array.isArray(content.questions) ? content.questions
            : (Array.isArray(job.currentAffairs) ? job.currentAffairs
              : (Array.isArray(article.currentAffairs) ? article.currentAffairs
                : (Array.isArray(job.currentAffairsData) ? job.currentAffairsData
                  : (Array.isArray(job.currentAffairsData?.currentAffairs) ? job.currentAffairsData.currentAffairs : []))))))));
  return items.map((item) => {
    if (!item || typeof item !== "object") return null;
    const question = toText(item.question || item.q || item.title);
    const options = (Array.isArray(item.options) ? item.options : [item.optionA || item.a, item.optionB || item.b, item.optionC || item.c, item.optionD || item.d])
      .map((option) => toText(option))
      .filter(Boolean);
    const answer = toText(item.correctAnswer || item.answer || item.correct || item.correct_option);
    const explanation = toText(item.explanation || item.reason || item.solution);
    return question && options.length ? { question, options, answer, explanation } : null;
  }).filter(Boolean);
};

const getCurrentAffairsIntro = (job = {}, description = "") => {
  const article = job.advancedArticleData && typeof job.advancedArticleData === "object" ? job.advancedArticleData : {};
  const content = job.content && typeof job.content === "object" ? job.content : (article.content && typeof article.content === "object" ? article.content : {});
  const intro = Array.isArray(job.intro) ? job.intro : (Array.isArray(article.intro) ? article.intro : (Array.isArray(content.intro) ? content.intro : []));
  return intro.map((item) => toText(item)).filter(Boolean).join("\n\n") || toText(job.shortInfo || description);
};

const getCurrentAffairsNewsItems = (job = {}) => {
  const article = job.advancedArticleData && typeof job.advancedArticleData === "object" ? job.advancedArticleData : {};
  const content = job.content && typeof job.content === "object" ? job.content : (article.content && typeof article.content === "object" ? article.content : {});
  const raw = Array.isArray(job.news) ? job.news
    : Array.isArray(article.news) ? article.news
      : Array.isArray(content.news) ? content.news
        : Array.isArray(job["समाचार"]) ? job["समाचार"]
          : Array.isArray(job.currentAffairsData?.["समाचार"]) ? job.currentAffairsData["समाचार"]
            : Array.isArray(job.currentAffairsData?.news) ? job.currentAffairsData.news : [];
  return raw.map((item) => {
    if (!item || typeof item !== "object") return null;
    const importance = toText(item["महत्व"] || item.importance || item.importanceLevel);
    const title = toText(item["शीर्षक"] || item.title || item.heading || item.headline);
    const category = toText(item["श्रेणी"] || item.category || item.topic);
    const summary = toText(item["सारांश"] || item.summary || item.description || item.content || item.text);
    const source = toText(item["स्रोत"] || item.source);
    return title || summary ? { importance, title, category, summary, source } : null;
  }).filter(Boolean);
};

const renderCurrentAffairsNewsHtml = (items = []) => items.map((item, index) => `<div class="content-section">
                <h2 class="sarkari-section-title">${htmlEscape(item.title || `Current Affairs ${index + 1}`)}</h2>
                ${item.importance ? `<p><strong class="manual-label">महत्व:</strong> ${htmlEscape(item.importance)}</p>` : ""}
                ${item.category ? `<p><strong class="manual-label">श्रेणी:</strong> ${htmlEscape(item.category)}</p>` : ""}
                ${item.summary ? `<p>${htmlEscape(item.summary)}</p>` : ""}
                ${item.source ? `<p><strong class="manual-label">स्रोत:</strong> ${htmlEscape(item.source)}</p>` : ""}
              </div>`).join("");

const renderCurrentAffairsFallbackHtml = (job = {}, title = "Current Affairs", description = "") => {
  const intro = getCurrentAffairsIntro(job, description);
  const dateText = toText(job.postDate || job.date || job.content?.date || job["तारीख"] || job.currentAffairsData?.["तारीख"]);
  const categoryText = toText(job.category || job.content?.category || job["श्रेणी"] || job.currentAffairsData?.["श्रेणी"]);
  const newsItems = getCurrentAffairsNewsItems(job);
  const questions = getCurrentAffairsQuestions(job);
  const sourceNames = Array.from(new Set(newsItems.map((item) => item.source).filter(Boolean))).slice(0, 4);
  const sourceDateNote = [
    sourceNames.length ? `Source: ${sourceNames.join(", ")}` : "Source: Official news updates and exam-oriented current affairs references",
    dateText ? `Updated: ${dateText}` : ""
  ].filter(Boolean).join(" | ");
  const questionHtml = questions.map((item, index) => `<article class="mcq-card">
                <div class="mcq-question">Q${index + 1}. ${htmlEscape(item.question)}</div>
                <div class="mcq-options">${item.options.map((option, optionIndex) => `<div class="mcq-option">${String.fromCharCode(65 + optionIndex)}. ${htmlEscape(option)}</div>`).join("")}</div>
                ${item.answer ? `<div class="mcq-answer"><span class="manual-label">Correct Answer:</span> ${htmlEscape(item.answer)}</div>` : ""}
                ${item.explanation ? `<div class="mcq-explanation"><span class="manual-label">Explanation:</span> ${htmlEscape(item.explanation)}</div>` : ""}
              </article>`).join("");
  return `<h2>${htmlEscape(title)}</h2>
            <div class="content-box">
              ${intro ? `<p>${htmlEscape(intro)}</p>` : ""}
              ${dateText ? `<p><strong class="manual-label">Date:</strong> ${htmlEscape(dateText)}</p>` : ""}
              ${categoryText ? `<p><strong class="manual-label">Category:</strong> ${htmlEscape(categoryText)}</p>` : ""}
              <p><strong class="manual-label">Source/Date Note:</strong> ${htmlEscape(sourceDateNote)}</p>
            </div>
            ${newsItems.length ? `<section class="panel">
              <h2>समाचार</h2>
              <div class="content-box">${renderCurrentAffairsNewsHtml(newsItems)}</div>
            </section>` : ""}
            ${questions.length ? `<section class="panel">
              <h2>Questions</h2>
              <div class="content-box"><div class="mcq-list">${questionHtml}</div></div>
            </section>` : ""}
            <section class="panel">
              <h2>More Current Affairs</h2>
              <div class="community-actions">
                <a class="btn whatsapp" href="https://whatsapp.com/channel/0029Vb7y0JL9Bb67psBzxG1Q" target="_blank" rel="noopener noreferrer">Join WhatsApp Channel</a>
                <a class="btn whatsapp" href="https://wa.me/919509453441" target="_blank" rel="noopener noreferrer">WhatsApp +91 9509453441</a>
                <a class="btn whatsapp" href="https://wa.me/918505090384" target="_blank" rel="noopener noreferrer">WhatsApp +91 8505090384</a>
                <a class="btn" href="current-affairs.html">Related Current Affairs</a>
                <a class="btn" href="mock-test.html">Mock Test</a>
              </div>
            </section>`;
};

const renderPrerenderedJobDetail = (id = "", job = {}) => {
  const seo = buildSeoFields(job, id);
  const title = toText(job.title || "Job Update");
  const description = seo.metaDescription;
  const canonicalUrl = seo.canonicalUrl || getPublicJobUrl(id, { ...job, slug: seo.slug });
  const html = fs.readFileSync(path.join(__dirname, "job-detail.html"), "utf8");
  const currentAffairs = isCurrentAffairsPost(job);
  const summaryRows = [
    ["Department", job.department],
    ["Post Name", job.postName || title],
    ["Total Posts", job.totalPosts || job.totalVacancy],
    ["Last Date", job.lastApplyDate || job.lastDate],
    ["Qualification", job.qualification],
    ["Location", job.location || job.jobLocation]
  ].filter(([, value]) => toText(value));
  const fallbackHtml = currentAffairs ? renderCurrentAffairsFallbackHtml(job, title, description) : `<h2>${htmlEscape(title)}</h2>
            <div class="content-box">
              <p>${htmlEscape(description)}</p>
              <table class="detail-table"><tbody>${summaryRows.map(([label, value]) => `<tr><th>${htmlEscape(label)}</th><td>${htmlEscape(value)}</td></tr>`).join("")}</tbody></table>
              <p><a class="auto-link" href="${htmlEscape(canonicalUrl)}">Canonical job detail link</a> | <a class="auto-link" href="/#homePortalLatestJobs">All Latest Jobs</a></p>
            </div>`;
  return html
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${htmlEscape(seo.seoTitle)}</title>`)
    .replace(/<meta name="description" content="[^"]*">/i, `<meta name="description" content="${htmlEscape(description)}">`)
    .replace(/<meta property="og:title" content="[^"]*">/i, `<meta property="og:title" content="${htmlEscape(seo.seoTitle)}">`)
    .replace(/<meta property="og:description" content="[^"]*">/i, `<meta property="og:description" content="${htmlEscape(description)}">`)
    .replace(/<meta property="og:url" content="[^"]*">/i, `<meta property="og:url" content="${htmlEscape(canonicalUrl)}">`)
    .replace(/<link rel="canonical" href="[^"]*">/i, `<link rel="canonical" href="${htmlEscape(canonicalUrl)}">`)
    .replace(/<script type="application\/ld\+json" id="jobSchemaJsonLd">[\s\S]*?<\/script>/i, `<script type="application/ld+json" id="jobSchemaJsonLd">\n${JSON.stringify(jobSchemaGraph({ id, job, title, description, canonicalUrl }), null, 2)}\n</script>`)
    .replace(/<h1 id="jobTitle">[\s\S]*?<\/h1>/i, `<h1 id="jobTitle">${htmlEscape(title)}</h1>`)
    .replace(/<p id="jobIntro">[\s\S]*?<\/p>/i, `<p id="jobIntro">${htmlEscape(description)}</p>`)
    .replace(/<aside class="detail-sidebar"/i, currentAffairs ? `<aside class="detail-sidebar" style="display:none;"` : `<aside class="detail-sidebar"`)
    .replace(/<section class="panel" id="seoFallbackPanel">[\s\S]*?<\/section>/i, `<section class="panel" id="seoFallbackPanel">\n          ${fallbackHtml}\n        </section>`);
};

const findPublishedJobBySlug = async (slug = "") => {
  const targetSlug = normalizeSlugKey(decodeURIComponent(slug));
  if (!targetSlug) {
    return null;
  }
  const aliasTargetSlug = normalizeSlugKey(LEGACY_POST_SLUG_ALIASES[targetSlug] || "");
  const db = getAdminDb();
  let jobs = null;
  if (db) {
    const snapshot = await db.ref("LatestJobs").get();
    jobs = snapshot.exists() ? snapshot.val() : null;
  } else {
    jobs = await fetchPublicFirebaseJson("LatestJobs");
  }
  if (!jobs || typeof jobs !== "object") {
    return null;
  }
  let found = null;
  Object.entries(jobs).some(([id, job]) => {
    if (found) {
      return true;
    }
    if (String(job.postStatus || "published").toLowerCase() === "draft") {
      return false;
    }
    const canonicalSlug = toText(job.slug) || buildSlug(job.title || "job-update", id);
    const canonicalKey = normalizeSlugKey(canonicalSlug);
    if (
      canonicalKey === targetSlug ||
      canonicalKey === aliasTargetSlug ||
      canonicalKey.indexOf(`${targetSlug}-`) === 0 ||
      targetSlug.indexOf(`${canonicalKey}-`) === 0
    ) {
      found = { id, job: { ...job, slug: canonicalSlug } };
      return true;
    }
    return false;
  });
  return found;
};

const buildCombinedSitemap = async () => {
  const originalXml = readStaticSitemap().trim();
  const jobEntries = await getLiveJobSitemapEntries();
  if (!jobEntries.length) {
    return originalXml;
  }
  const staticXml = removeDynamicJobEntries(originalXml).trim();
  return staticXml.replace("</urlset>", `${jobEntries.join("\n")}\n</urlset>`);
};

const normalizeLatestJobsSeo = async (db, onlyJobId = "") => {
  const updates = {};
  const now = nowStamp();
  const processJob = (id, job = {}) => {
    if (!job || String(job.postStatus || "published").toLowerCase() === "draft") {
      return;
    }
    const seo = buildSeoStorageFields(id, job);
    const patch = {};
    ["slug", "canonicalUrl", "seoTitle", "metaDescription"].forEach((key) => {
      if (toText(job[key]) !== toText(seo[key])) {
        patch[key] = seo[key];
      }
    });
    if (JSON.stringify(normalizeFaqItems(job.faq)) !== JSON.stringify(seo.faq)) {
      patch.faq = seo.faq;
    }
    if (JSON.stringify(job.jsonLd || null) !== JSON.stringify(seo.jsonLd)) {
      patch.jsonLd = seo.jsonLd;
    }
    if (Object.keys(patch).length) {
      patch.seoUpdatedAt = now;
      Object.entries(patch).forEach(([key, value]) => {
        updates[`LatestJobs/${id}/${key}`] = value;
      });
    }
  };

  if (onlyJobId) {
    const snapshot = await db.ref(`LatestJobs/${onlyJobId}`).get();
    if (snapshot.exists()) {
      processJob(onlyJobId, snapshot.val() || {});
    }
  } else {
    const snapshot = await db.ref("LatestJobs").get();
    if (snapshot.exists()) {
      snapshot.forEach((child) => processJob(child.key, child.val() || {}));
    }
  }

  if (Object.keys(updates).length) {
    await db.ref().update(updates);
  }
  return {
    ok: true,
    normalizedPosts: new Set(Object.keys(updates).map((key) => key.split("/")[1])).size,
    updatedFields: Object.keys(updates).length
  };
};

const triggerSeoPostsWorkflow = async ({ db = null, jobId = "", reason = "admin-save", deletedSlug = "" } = {}) => {
  const now = Date.now();
  const baseLog = {
    jobId,
    reason,
    repository: GITHUB_REPOSITORY,
    event: GITHUB_DISPATCH_EVENT
  };
  if (!GITHUB_TOKEN || !GITHUB_REPOSITORY) {
    const result = {
      ok: false,
      configured: false,
      skipped: true,
      reason: "GitHub token/repository env missing"
    };
    await saveSeoPublishLog(db, { ...baseLog, result });
    return result;
  }
  if (reason !== "admin-delete" && now - lastSeoWorkflowDispatchAt < 30000) {
    const result = {
      ok: true,
      configured: true,
      skipped: true,
      reason: "Recent SEO workflow dispatch already sent"
    };
    await saveSeoPublishLog(db, { ...baseLog, result });
    return result;
  }

  const repoCheck = await githubApi(`/repos/${GITHUB_REPOSITORY}`, { method: "GET" });
  if (!repoCheck.ok) {
    const result = {
      ok: false,
      configured: true,
      skipped: false,
      stage: "repo-access",
      status: repoCheck.status,
      error: JSON.stringify(repoCheck.data || {}).slice(0, 320) || `GitHub repo access failed (${repoCheck.status})`
    };
    await saveSeoPublishLog(db, { ...baseLog, result });
    return result;
  }

  const dispatch = await githubApi(`/repos/${GITHUB_REPOSITORY}/dispatches`, {
    method: "POST",
    body: JSON.stringify({
      event_type: GITHUB_DISPATCH_EVENT,
      client_payload: {
        jobId,
        deletedSlug,
        reason,
        source: "admin-portal",
        requestedAt: new Date(now).toISOString()
      }
    })
  });

  if (!dispatch.ok) {
    const result = {
      ok: false,
      configured: true,
      skipped: false,
      stage: "workflow-dispatch",
      status: dispatch.status,
      error: JSON.stringify(dispatch.data || {}).slice(0, 320) || `GitHub dispatch failed (${dispatch.status})`
    };
    await saveSeoPublishLog(db, { ...baseLog, result });
    return result;
  }

  lastSeoWorkflowDispatchAt = now;
  const result = {
    ok: true,
    configured: true,
    skipped: false,
    repository: GITHUB_REPOSITORY,
    event: GITHUB_DISPATCH_EVENT,
    dispatchStatus: dispatch.status
  };
  await saveSeoPublishLog(db, { ...baseLog, result });
  return result;
};

const deleteStaticPostFolder = async (slug = "") => {
  const clean = String(slug || "").trim();
  if (!/^[a-z0-9-]+$/i.test(clean)) {
    return { ok: false, skipped: true, reason: "Invalid or empty slug" };
  }
  const target = path.resolve(__dirname, "post", clean);
  const postRoot = path.resolve(__dirname, "post");
  if (!target.startsWith(`${postRoot}${path.sep}`)) {
    return { ok: false, skipped: true, reason: "Unsafe post path" };
  }
  if (!fs.existsSync(target)) {
    return { ok: true, skipped: true, slug: clean, reason: "Static post folder not found" };
  }
  await fs.promises.rm(target, { recursive: true, force: true });
  return { ok: true, skipped: false, slug: clean };
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

const feeSummaryLines = (job = {}) => {
  const feeFields = [
    ["General / OBC", job.generalObcFee || job.generalFee || job.obcFee],
    ["SC / ST", job.scStFee || job.scFee || job.stFee],
    ["Female", job.femaleFee],
    ["OBC Female", job.obcFemaleFee],
    ["SC Female", job.scFemaleFee],
    ["PH", job.phCandidateFee || job.phFee || job.pwdFee],
    ["All Candidate", job.allCandidateFee],
    ["Single Exam", job.singleExamFee || job.oneExamFee],
    ["Both Exam", job.bothExamFee || job.combinedExamFee],
    ["Payment Mode", job.paymentMode]
  ];
  const manual = cleanMultiline(job.applicationFeeManual || job.feeDetails || job.feesDetails || "", 5);
  const lines = feeFields
    .map(([label, value]) => compactLine(label, value))
    .filter(Boolean);
  if (manual) {
    lines.push(...manual.split("\n"));
  }
  return Array.from(new Set(lines)).slice(0, 8);
};

const buildNotificationSummary = (job = {}) => {
  const title = sanitizePortalBranding(toText(job.title || "Job Update")) || "Job Update";
  const lines = [
    title,
    compactLine("Department", sanitizePortalBranding(job.department)),
    compactLine("Total Posts", job.totalPosts || job.totalVacancy),
    compactLine("Last Date", job.lastApplyDate || job.lastDate),
    compactLine("Qualification", sanitizePortalBranding(String(job.qualification || "").split(/\r?\n/)[0])),
    compactLine("Category", job.postTarget && job.postTarget !== "latestJob" ? job.postTarget : "")
  ].filter(Boolean);
  return sanitizePortalBranding(lines.slice(0, 6).join("\n"));
};

const buildSeoFields = (job = {}, id = "") => {
  const seo = job.seo && typeof job.seo === "object" ? job.seo : {};
  const title = sanitizePortalBranding(toText(job.title || seo.title || "Job Update")) || "Job Update";
  const department = sanitizePortalBranding(toText(job.department));
  const suffix = job.postTarget && job.postTarget !== "latestJob" ? ` ${job.postTarget}` : "";
  const seoTitle = sanitizePortalBranding(toText(job.seoTitle || seo.seoTitle || seo.title || `${title}${suffix} | ${EMITRA_BRAND_NAME}`)).slice(0, 70);
  const descParts = [
    title,
    department,
    job.totalPosts ? `${job.totalPosts} posts` : "",
    job.lastApplyDate || job.lastDate ? `Last date ${job.lastApplyDate || job.lastDate}` : "",
    "apply link, qualification and important dates"
  ].filter(Boolean);
  const metaDescription = sanitizePortalBranding(toText(job.metaDescription || seo.metaDescription || seo.description || descParts.join(", "))).slice(0, 160);
  return {
    slug: toText(job.slug || seo.slug) || buildSlug(title, id),
    canonicalUrl: getPublicJobUrl(id, { ...job, slug: toText(job.slug || seo.slug) || buildSlug(title, id) }),
    seoTitle,
    metaDescription
  };
};

const buildWhatsappPostText = (id = "", job = {}) => {
  const targetLabels = {
    latestJob: "लेटेस्ट जॉब अपडेट",
    admitCard: "एडमिट कार्ड अपडेट",
    result: "रिजल्ट अपडेट",
    answerKey: "आंसर की अपडेट",
    syllabus: "सिलेबस अपडेट",
    currentAffairs: "करंट अफेयर्स अपडेट"
  };
  const label = targetLabels[job.postTarget || "latestJob"] || "लेटेस्ट अपडेट";
  const qualificationLines = cleanMultiline(job.qualification, 7)
    .split("\n")
    .map((line) => line.replace(/^[-*•✅\s]+/, "").trim())
    .filter(Boolean)
    .map((line) => `✅ ${line}`);
  const detailsLink = getPublicJobUrl(id, job);
  const officialLink = toText(job[pickJobLinkField(job.postTarget)] || job.sourceLink || job.detailLink || job.applyLink || job.officialWebsite);
  const lines = [
    `📢 *${label} - ${EMITRA_BRAND_NAME}*`,
    "",
    `📚 *${sanitizePortalBranding(toText(job.title || "Job Update")) || "Job Update"}*`,
    sanitizePortalBranding(toText(job.department)) ? `*${sanitizePortalBranding(toText(job.department))}*` : "",
    "",
    compactLine("🗓️ आवेदन शुरू", job.startDate || job.postDate),
    compactLine("⏳ अंतिम तिथि", job.lastApplyDate || job.lastDate),
    compactLine("📌 कुल पद", job.totalPosts || job.totalVacancy),
    compactLine("💳 फीस", feeSummaryLines(job)[0]),
    compactLine("📍 स्थान", job.location || job.jobLocation),
    feeSummaryLines(job).length > 1 ? ["", "💳 *आवेदन शुल्क:*", ...feeSummaryLines(job).slice(0, 6).map((line) => `• ${line}`)].join("\n") : "",
    qualificationLines.length ? ["", "🎓 *योग्यता:*", ...qualificationLines].join("\n") : "",
    "",
    "📌 *नोट:* पूरी पात्रता जानकारी के लिए ऑफिशियल नोटिफिकेशन जरूर पढ़ें।",
    "",
    "🔗 *Apply / Official Details:*",
    officialLink || detailsLink,
    "",
    "🌐 *वेबसाइट:*",
    EMITRA_WEBSITE,
    "",
    "📲 *WhatsApp Channel Join करें:*",
    WHATSAPP_CHANNEL_URL,
    "",
    "⚠️ *नोट:* इच्छुक उम्मीदवार अंतिम तिथि से पहले ऑनलाइन आवेदन जरूर करें।"
  ];
  return sanitizePortalBranding(lines.filter(Boolean).join("\n"));
};

const getJobCategoryLabel = (target = "") => ({
  latestJob: "Latest Job",
  notification: "Notification",
  admitCard: "Admit Card",
  result: "Result",
  answerKey: "Answer Key",
  syllabus: "Syllabus",
  admission: "Admission",
  currentAffairs: "Current Affairs"
}[target || "latestJob"] || "Latest Job");

const buildTelegramPostText = (id = "", job = {}) => {
  const detailsLink = getPublicJobUrl(id, job);
  const title = toText(job.title || job.text || "Job Update");
  const summary = toText(job.telegramSummary || job.customSummary || job.notificationSummary || job.shortInfo || job.summary || job.description);
  const lines = [
    "📢 लेटेस्ट जॉब अपडेट – E-Mitra Wala",
    "",
    `📌 ${title}`,
    ...(summary ? [summary] : []),
    "",
    `🗓️ आवेदन शुरू: ${toText(job.startDate || job.postDate || "Update Soon")}`,
    `⏳ अंतिम तिथि: ${toText(job.lastApplyDate || job.lastDate || "Update Soon")}`,
    `📌 कुल पद: ${toText(job.totalPosts || job.totalVacancy || "Update Soon")}`,
    ...(feeSummaryLines(job).length ? [`💳 फीस: ${feeSummaryLines(job).join(" | ")}`] : []),
    `📂 कैटेगरी: ${getJobCategoryLabel(job.postTarget || "latestJob")}`,
    "",
    "🔗 पूरी जानकारी देखें:",
    detailsLink,
    "",
    "✅ ऐसे ही अपडेट के लिए चैनल से जुड़े रहें:",
    TELEGRAM_CHANNEL_URL
  ];
  return lines.join("\n");
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
  return brandDraftForEmitra(enriched);
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



const callAiText = async ({ provider = "gemini", model = "", prompt = "", system = "", temperature = 0.2, maxTokens = 220 } = {}) => {
  const config = getAiProviderConfig(provider, model);
  if (!config.apiKey || !config.model || typeof fetch !== "function") {
    const error = new Error(`${config.label} API key/model missing`);
    error.code = "AI_NOT_CONFIGURED";
    throw error;
  }

  if (config.type === "gemini") {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: [system, prompt].filter(Boolean).join("\n\n") }] }],
        generationConfig: { temperature, maxOutputTokens: maxTokens }
      })
    });
    if (!response.ok) {
      const details = await response.text().catch(() => "");
      throw new Error(`${config.label} HTTP ${response.status}${details ? `: ${details.slice(0, 220)}` : ""}`);
    }
    const data = await response.json();
    return {
      text: (data?.candidates?.[0]?.content?.parts || []).map((part) => part.text || "").join("\n").trim(),
      provider: config.label.toLowerCase(),
      model: config.model
    };
  }

  const response = await fetch(config.url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      ...(config.extraHeaders || {})
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        ...(system ? [{ role: "system", content: system }] : []),
        { role: "user", content: prompt }
      ],
      temperature,
      max_tokens: maxTokens
    })
  });
  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`${config.label} HTTP ${response.status}${details ? `: ${details.slice(0, 220)}` : ""}`);
  }
  const data = await response.json();
  return {
    text: String(data?.choices?.[0]?.message?.content || "").trim(),
    provider: config.label.toLowerCase(),
    model: config.model
  };
};

const uniqueAiAttempts = (selected = {}) => {
  const attempts = [];
  const add = (provider, model = "") => {
    const config = getAiProviderConfig(provider, model);
    const key = `${config.label}:${config.model}`;
    if (!config.apiKey || !config.model || attempts.some((item) => item.key === key)) return;
    attempts.push({ key, provider: normalizeAiProvider(provider), model: config.model, label: config.label });
  };
  add(selected.provider || readAiSettings().provider, selected.model || readAiSettings().model);
  add("gemini");
  add("openai");
  add("openrouter", OPENROUTER_MODEL);
  add("openrouter", OPENROUTER_DEEPSEEK_MODEL);
  add("openrouter", OPENROUTER_QWEN_MODEL);
  return attempts;
};

const callAiTextWithFallback = async (options = {}) => {
  const attempts = uniqueAiAttempts({ provider: options.provider, model: options.model });
  if (!attempts.length) {
    const error = new Error("AI API key/model missing");
    error.code = "AI_NOT_CONFIGURED";
    throw error;
  }
  const failures = [];
  for (const attempt of attempts) {
    try {
      return await callAiText({ ...options, provider: attempt.provider, model: attempt.model });
    } catch (err) {
      failures.push(`${attempt.label} ${attempt.model}: ${err.message}`);
    }
  }
  const error = new Error(`AI providers failed: ${failures.join(" | ")}`);
  error.code = "AI_PROVIDER_FAILED";
  throw error;
};

const aiOptionsFromRequest = (body = {}) => ({
  provider: normalizeAiProvider(body.aiProvider || body.provider || readAiSettings().provider),
  model: String(body.aiModel || body.openRouterModel || body.model || readAiSettings().model || "").trim()
});

const generateAiSummary = async (job = {}, options = {}) => {
  const fallback = buildNotificationSummary(job);
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
  try {
    const result = await callAiText({
      ...options,
      prompt,
      system: "You summarize job notifications for an Indian Hindi audience.",
      temperature: 0.2,
      maxTokens: 220
    });
    const summary = sanitizePortalBranding(toText(result.text || ""));
    return { summary: summary || fallback, provider: summary ? result.provider : "local", model: result.model };
  } catch (err) {
    return { summary: sanitizePortalBranding(fallback) || fallback, provider: "local", error: err.message };
  }
};

const parseJsonFromAiText = (value = "") => {
  const text = String(value || "").replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
  try {
    return JSON.parse(text);
  } catch (_err) {
    const match = text.match(/\{[\s\S]*\}/) || text.match(/\[[\s\S]*\]/);
    if (!match) return {};
    try {
      return JSON.parse(match[0]);
    } catch (_innerErr) {
      return {};
    }
  }
};

const unwrapCurrentAffairsPayload = (value = {}) => {
  if (Array.isArray(value)) return { news: value, questions: value };
  if (!value || typeof value !== "object") return {};
  const nested = value.currentAffairs || value.current_affairs || value.data || value.content;
  if (Array.isArray(nested)) return { ...value, news: value.news || value.samachar || nested, questions: value.questions || value.mcqs || value.quiz || nested };
  if (nested && typeof nested === "object") return { ...value, ...nested };
  return value;
};

const IST_TIME_ZONE = "Asia/Kolkata";
const dailyCurrentAffairsDate = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
};

const dailyCurrentAffairsDisplayDate = (date = new Date()) => {
  const parsed = typeof date === "string" ? new Date(`${date}T00:00:00+05:30`) : date;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: IST_TIME_ZONE,
    day: "2-digit",
    month: "long",
    year: "numeric"
  }).format(parsed);
};

const getIstClock = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST_TIME_ZONE,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit"
  }).formatToParts(date);
  return {
    hour: Number(parts.find((part) => part.type === "hour")?.value || 0),
    minute: Number(parts.find((part) => part.type === "minute")?.value || 0)
  };
};

const normalizeCurrentAffairsArray = (value) => Array.isArray(value) ? value : (toText(value) ? [toText(value)] : []);

const buildDailyCurrentAffairsPrompt = (dateLabel = "") => [
  `Date: ${dateLabel}`,
  "India aur Rajasthan focused Daily Current Affairs update ke liye factual Hindi content banao.",
  "Output sirf valid JSON do. Markdown/code fence/explanation mat do.",
  "JSON schema:",
  "{",
  '  "news": [{"title":"","category":"","summary":"","importance":"High/Medium/Low","source":""}],',
  '  "questions": [{"question":"","options":["","","",""],"answer":"","explanation":""}],',
  '  "faqs": [{"question":"","answer":""}],',
  '  "shortInfo": "",',
  '  "metaDescription": ""',
  "}",
  "Rules: 8-12 news points, 15-20 MCQ questions, har MCQ me A/B/C/D options, correct answer aur 2-3 line explanation do. 4-5 FAQs bhi do. Facts invent mat karo; uncertain facts ko general exam-revision wording me rakho."
].join("\n");

const normalizeDailyCurrentAffairsJson = (value = {}) => {
  const parsed = unwrapCurrentAffairsPayload(value);
  const content = parsed.content && typeof parsed.content === "object" ? parsed.content : {};
  const news = normalizeCurrentAffairsArray(parsed.news || parsed.samachar || parsed["समाचार"] || content.news || content.samachar || content["समाचार"])
    .map((item) => item && typeof item === "object" ? {
      title: toText(item.title || item["शीर्षक"] || item.heading),
      category: toText(item.category || item["श्रेणी"] || item.topic),
      summary: toText(item.summary || item["सारांश"] || item.description || item.content),
      importance: toText(item.importance || item["महत्व"] || item.importanceLevel),
      source: toText(item.source || item["स्रोत"])
    } : { title: "", category: "", summary: toText(item), importance: "", source: "" })
    .filter((item) => item.title || item.summary);
  const questions = normalizeCurrentAffairsArray(parsed.questions || parsed.mcqs || parsed.quiz || parsed.currentAffairs || parsed.current_affairs || parsed["प्रश्न"] || content.questions || content.mcqs || content.quiz)
    .map((item) => item && typeof item === "object" ? {
      question: toText(item.question || item.q || item.title),
      options: normalizeCurrentAffairsArray(item.options || item.option || item.choices || item["विकल्प"] || [item.optionA || item.a, item.optionB || item.b, item.optionC || item.c, item.optionD || item.d].filter(Boolean)).map(toText).filter(Boolean),
      answer: toText(item.answer || item.correctAnswer || item.correct || item.correct_option || item["उत्तर"]),
      explanation: toText(item.explanation || item.reason || item.solution)
    } : null)
    .filter((item) => item && item.question && item.options.length);
  const faqs = normalizeCurrentAffairsArray(parsed.faqs || parsed.faq || content.faqs || content.faq)
    .map((item) => item && typeof item === "object" ? {
      question: toText(item.question || item.q || item.title),
      answer: toText(item.answer || item.a || item.text || item.content)
    } : null)
    .filter((item) => item && item.question && item.answer);
  return { parsed, news, questions, faqs };
};

const generateDailyCurrentAffairsPayload = async ({ date = new Date(), aiProvider = "", aiModel = "" } = {}) => {
  const dateKey = typeof date === "string" ? date : dailyCurrentAffairsDate(date);
  const dateLabel = dailyCurrentAffairsDisplayDate(dateKey);
  const title = `Daily Current Affairs Update - ${dateLabel}`;
  const prompt = buildDailyCurrentAffairsPrompt(dateLabel);
  const selected = { provider: aiProvider || readAiSettings().provider, model: aiModel || readAiSettings().model };
  const attempts = uniqueAiAttempts(selected);
  let ai = null;
  let parsed = {};
  let news = [];
  let questions = [];
  let faqs = [];
  const failures = [];
  for (const attempt of attempts) {
    try {
      const result = await callAiText({
        provider: attempt.provider,
        model: attempt.model,
        prompt,
        system: "You create concise, factual Hindi daily current affairs study material for Indian competitive exam aspirants.",
        temperature: 0.25,
        maxTokens: 3600
      });
      const normalized = normalizeDailyCurrentAffairsJson(parseJsonFromAiText(result.text));
      if (normalized.news.length || normalized.questions.length) {
        ai = result;
        parsed = normalized.parsed;
        news = normalized.news;
        questions = normalized.questions;
        faqs = normalized.faqs;
        break;
      }
      failures.push(`${attempt.label} ${attempt.model}: invalid current affairs JSON`);
    } catch (err) {
      failures.push(`${attempt.label} ${attempt.model}: ${err.message}`);
    }
  }
  if (!news.length && !questions.length) {
    const error = new Error(`AI response me valid current affairs JSON nahi mila. ${failures.join(" | ")}`);
    error.code = "AI_INVALID_RESPONSE";
    throw error;
  }
  const intro = [
    toText(parsed.shortInfo || parsed.summary || `Aaj ${dateLabel} ke important current affairs, MCQ practice aur FAQs yahan diye gaye hain.`)
  ].filter(Boolean);
  const sections = news.map((item) => ({
    heading: item.title || item.category || "Current Affairs News",
    content: [item.importance ? `महत्व: ${item.importance}` : "", item.category ? `श्रेणी: ${item.category}` : "", item.summary].filter(Boolean).join("\n")
  }));
  const slug = cleanSlug(`daily-current-affairs-update-${dateKey}`) || buildSlug(title);
  const shortInfo = intro[0] || `${dateLabel} current affairs update.`;
  const metaDescription = toText(parsed.metaDescription || shortInfo).slice(0, 160);
  return {
    title,
    slug,
    canonicalUrl: `${SITE_BASE_URL}/post/${encodeURIComponent(slug)}/`,
    category: "Current Affairs",
    type: "Current Affairs",
    postTarget: "currentAffairs",
    postStatus: "published",
    displayOrder: "1",
    postDate: dateLabel,
    dailyCurrentAffairsDate: dateKey,
    autoGenerated: true,
    currentAffairsProvider: ai.provider,
    currentAffairsModel: ai.model || "",
    shortInfo,
    metaDescription,
    seoTitle: `${title} | E-MITRA WALA`,
    news,
    mcqs: questions,
    questions,
    faq: faqs,
    faqs,
    intro,
    overview: [
      { label: "तारीख", value: dateLabel },
      { label: "श्रेणी", value: "Current Affairs" },
      { label: "समाचार", value: `${news.length} updates` },
      { label: "MCQ", value: `${questions.length} questions` }
    ],
    sections,
    content: { intro, news, questions, category: "Current Affairs", date: dateLabel },
    currentAffairsData: { title, date: dateLabel, news, questions, faqs, shortInfo, metaDescription },
    advancedArticleData: {
      title,
      slug,
      postTarget: "currentAffairs",
      shortInfo,
      intro,
      overview: [
        { label: "तारीख", value: dateLabel },
        { label: "श्रेणी", value: "Current Affairs" },
        { label: "समाचार", value: `${news.length} updates` },
        { label: "MCQ", value: `${questions.length} questions` }
      ],
      sections,
      faq: faqs,
      faqs,
      mcqs: questions,
      questions,
      news,
      content: { intro, news, questions, category: "Current Affairs", date: dateLabel },
      seo: { seoTitle: `${title} | E-MITRA WALA`, metaDescription }
    }
  };
};

const findDailyCurrentAffairsPost = async (db, dateKey = "") => {
  const title = `Daily Current Affairs Update - ${dailyCurrentAffairsDisplayDate(dateKey)}`;
  const slug = cleanSlug(`daily-current-affairs-update-${dateKey}`);
  const snapshot = await db.ref("LatestJobs").get();
  if (!snapshot.exists()) return null;
  let match = null;
  snapshot.forEach((child) => {
    if (match) return;
    const data = child.val() || {};
    const target = data.postTarget || data.advancedArticleData?.postTarget;
    if (target !== "currentAffairs") return;
    if (data.dailyCurrentAffairsDate === dateKey || data.slug === slug || data.title === title) {
      match = { id: child.key, data };
    }
  });
  return match;
};

const upsertDailyCurrentAffairs = async (db, options = {}) => {
  const dateKey = options.dateKey || dailyCurrentAffairsDate();
  const payload = await generateDailyCurrentAffairsPayload({ date: dateKey, aiProvider: options.aiProvider, aiModel: options.aiModel });
  const now = nowStamp();
  const existing = await findDailyCurrentAffairsPost(db, dateKey);
  const jobRef = existing ? db.ref(`LatestJobs/${existing.id}`) : db.ref("LatestJobs").push();
  const jobId = existing ? existing.id : jobRef.key;
  const data = {
    ...(existing?.data || {}),
    ...payload,
    canonicalUrl: `${SITE_BASE_URL}/post/${encodeURIComponent(payload.slug)}/`,
    updatedAt: now,
    ...(existing ? {} : { createdAt: now })
  };
  await jobRef.set(data);
  await normalizeLatestJobsSeo(db, jobId).catch(() => null);
  const publish = await triggerSeoPostsWorkflow({ db, jobId, reason: existing ? "daily-current-affairs-update" : "daily-current-affairs-create" }).catch((err) => ({ ok: false, error: err.message }));
  await db.ref("currentAffairsAutoLogs").push({
    dateKey,
    jobId,
    action: existing ? "updated" : "created",
    title: data.title,
    provider: data.currentAffairsProvider || "",
    model: data.currentAffairsModel || "",
    createdAt: now
  }).catch(() => {});
  return { ok: true, action: existing ? "updated" : "created", jobId, title: data.title, slug: data.slug, url: getPublicJobUrl(jobId, data), dateKey, publish };
};

const rewriteQuickPostDraft = async ({ url = "", pageText = "", prompt = "" } = {}) => {
  const fallback = generateJobJsonFromText(pageText || url, {
    title: findFirstMatchLine(pageText, [/recruitment/i, /vacancy/i, /job/i, /news/i, /भर्ती/i, /समाचार/i]) || "Job Update",
    sourceLink: url,
    detailLink: url
  });
  const rewritePrompt = [
    prompt || "Source content ko Hindi me unique, factual job/news article draft me rewrite karo.",
    BILINGUAL_PROMPT_INSTRUCTION,
    "Output sirf valid JSON do. Markdown/code fence/explanation mat do.",
    "JSON keys: title, department, totalPosts, importantDates, applicationFeeManual, qualification, shortInfo, pageContent, postTarget, metaDescription.",
    "Rules: facts invent mat karo, missing data blank rakho, public-friendly Hindi article banao, copied wording avoid karo.",
    JSON.stringify({
      sourceUrl: url,
      content: String(pageText || "").slice(0, 12000)
    })
  ].join("\n");
  let ai = { provider: "local", model: "", text: "" };
  let parsed = {};
  try {
    ai = await callAiText({
      ...readAiSettings(),
      prompt: rewritePrompt,
      system: "You rewrite Indian government job/news source pages into factual Hindi article drafts.",
      temperature: 0.25,
      maxTokens: 1400
    });
    parsed = parseJsonFromAiText(ai.text);
  } catch (err) {
    ai = { provider: "local", model: "", text: "", error: err.message };
  }
  const draft = enrichJobAutomation({
    ...fallback,
    ...parsed,
    title: toText(parsed.title || fallback.title || "Job Update"),
    sourceLink: url,
    detailLink: url,
    officialWebsite: url,
    pageContent: toText(parsed.pageContent || fallback.pageContent || pageText).slice(0, 9000),
    postTarget: normalizeAutoJobCategory(parsed.postTarget || fallback.postTarget) || fallback.postTarget || "latestJob",
    checkerStatus: "draft",
    reviewRequired: true,
    quickPostDraft: true,
    rewriteProvider: ai.provider,
    rewriteModel: ai.model || "",
    rewriteError: ai.error || "",
    createdAt: nowStamp(),
    updatedAt: nowStamp()
  }, url);
  return draft;
};

const generateAiWhatsappPostText = async (job = {}, id = "", options = {}) => {
  const fallback = buildWhatsappPostText(id, job);
  const primaryLink = toText(job[pickJobLinkField(job.postTarget)] || job.sourceLink || job.detailLink || job.applyLink || job.officialWebsite || getPublicJobUrl(id, job));
  const targetLabel = {
    latestJob: "लेटेस्ट जॉब अपडेट",
    admitCard: "एडमिट कार्ड अपडेट",
    result: "रिजल्ट अपडेट",
    answerKey: "आंसर की अपडेट",
    syllabus: "सिलेबस अपडेट"
  }[job.postTarget || "latestJob"] || "लेटेस्ट अपडेट";
  const prompt = [
    `Aap ${EMITRA_BRAND_NAME} (${EMITRA_WEBSITE}) ke WhatsApp channel ke liye ready-to-send Hindi post likhte hain.`,
    "Style bilkul is template jaisa rakho:",
    `📢 *लेटेस्ट जॉब अपडेट - ${EMITRA_BRAND_NAME}*`,
    "📚 *Title*",
    "*Department / Exam name*",
    "🗓️ *आवेदन शुरू:* date",
    "⏳ *अंतिम तिथि:* date",
    "📌 *कुल पद:* total posts",
    "💳 *आवेदन शुल्क:* fee summary",
    "📍 *स्थान:* location",
    "🎓 *योग्यता:*",
    "✅ qualification point",
    "📌 *नोट:* पूरी पात्रता जानकारी के लिए ऑफिशियल नोटिफिकेशन जरूर पढ़ें।",
    "🔗 *Apply / Official Details:*",
    "URL",
    "🌐 *वेबसाइट:*",
    EMITRA_WEBSITE,
    "📲 *WhatsApp Channel Join करें:*",
    WHATSAPP_CHANNEL_URL,
    "⚠️ *नोट:* इच्छुक उम्मीदवार अंतिम तिथि से पहले ऑनलाइन आवेदन जरूर करें।",
    "",
    "Rules:",
    "- Sirf final WhatsApp message do, explanation nahi.",
    "- WhatsApp bold ke liye *text* use karo, markdown link [text](url) mat banao.",
    "- Missing date/location/posts/fee ko invent mat karo; missing line omit kar do.",
    "- Total posts aur application fee data available ho to post me zaroor include karo.",
    "- Qualification ko simple Hindi bullet points me likho, max 6 bullets.",
    "- Official/apply URL exactly wahi rakho jo data me hai.",
    "- 900-1400 characters ke andar rakho.",
    JSON.stringify({
      updateType: targetLabel,
      title: sanitizePortalBranding(job.title),
      department: sanitizePortalBranding(job.department),
      examName: job.examName || job.subTitle,
      totalPosts: job.totalPosts || job.totalVacancy,
      applicationFee: feeSummaryLines(job).join("\n"),
      lastFeeDate: job.lastFeeDate,
      paymentMode: job.paymentMode,
      postDate: job.postDate,
      startDate: job.startDate,
      lastDate: job.lastApplyDate || job.lastDate,
      location: job.location || job.jobLocation,
      qualification: sanitizePortalBranding(job.qualification),
      importantDates: sanitizePortalBranding(job.importantDates),
      summary: sanitizePortalBranding(job.notificationSummary),
      officialLink: primaryLink,
      website: EMITRA_WEBSITE,
      whatsappChannel: WHATSAPP_CHANNEL_URL
    })
  ].join("\n");

  try {
    const result = await callAiText({ ...options, prompt, temperature: 0.25, maxTokens: 700 });
    const text = String(result.text || "")
      .replace(/```(?:text|markdown)?/gi, "")
      .replace(/```/g, "")
      .trim();
    const cleanText = sanitizePortalBranding(text || fallback);
    return { text: cleanText || fallback, provider: text ? result.provider : "local", model: result.model };
  } catch (err) {
    return { text: sanitizePortalBranding(fallback) || fallback, provider: "local", error: err.message };
  }
};

const configuredShareAiOptions = (primary = {}) => {
  const options = [];
  const add = (provider, model = "") => {
    const config = getAiProviderConfig(provider, model);
    const key = `${normalizeAiProvider(provider)}|${config.model}`;
    if (!config.apiKey || !config.model || options.some((item) => item.key === key)) return;
    options.push({ key, provider: normalizeAiProvider(provider), model: config.model, label: `${config.label}${config.model ? ` (${config.model})` : ""}` });
  };
  if (primary.provider) add(primary.provider, primary.model);
  add("gemini", GEMINI_MODEL);
  add("openrouter", OPENROUTER_DEEPSEEK_MODEL);
  add("openrouter", OPENROUTER_QWEN_MODEL);
  add("openai", OPENAI_MODEL);
  return options;
};

const generateShareSuggestions = async (job = {}, id = "", primaryOptions = {}) => {
  const providers = configuredShareAiOptions(primaryOptions).slice(0, 5);
  const suggestions = [];
  for (const option of providers) {
    const result = await generateAiWhatsappPostText(job, id, option);
    suggestions.push({
      label: option.label,
      provider: result.provider || option.provider,
      model: result.model || option.model,
      text: sanitizePortalBranding(result.text || ""),
      error: result.error || ""
    });
  }
  if (!suggestions.length) {
    suggestions.push({ label: "Local Template", provider: "local", model: "", text: sanitizePortalBranding(buildWhatsappPostText(id, job)), error: "" });
  }
  return suggestions;
};

const prepareWhatsappShare = async (item = {}, id = "", options = {}) => {
  const enriched = brandDraftForEmitra(enrichJobAutomation(item, id));
  const ai = await generateAiSummary(enriched, options);
  enriched.notificationSummary = sanitizePortalBranding(ai.summary);
  const whatsappAi = await generateAiWhatsappPostText(enriched, id, options);
  const suggestions = await generateShareSuggestions(enriched, id, options);
  enriched.summaryProvider = ai.provider;
  enriched.whatsappProvider = whatsappAi.provider;
  enriched.whatsappPostText = sanitizePortalBranding(whatsappAi.text);
  enriched.aiShareSuggestions = suggestions.map((item) => ({ ...item, text: sanitizePortalBranding(item.text || "") }));
  enriched.updatedAt = nowStamp();
  return {
    item: brandDraftForEmitra(enriched),
    text: enriched.whatsappPostText,
    ai: {
      provider: whatsappAi.provider,
      summaryProvider: ai.provider,
      whatsappProvider: whatsappAi.provider,
      summaryError: ai.error || "",
      whatsappError: whatsappAi.error || ""
    },
    suggestions
  };
};

const pickShareAutomationFields = (item = {}) => ({
  slug: item.slug || "",
  seoTitle: item.seoTitle || "",
  metaDescription: item.metaDescription || "",
  notificationSummary: item.notificationSummary || "",
  summaryProvider: item.summaryProvider || "",
  whatsappProvider: item.whatsappProvider || "",
  whatsappPostText: item.whatsappPostText || "",
  aiShareSuggestions: Array.isArray(item.aiShareSuggestions) ? item.aiShareSuggestions.slice(0, 5) : [],
  updatedAt: nowStamp()
});

function readSettingsFile() {
  try {
    const raw = fs.readFileSync(SETTINGS_PATH, "utf8");
    return JSON.parse(raw || "{}");
  } catch (err) {
    return {};
  }
}

function writeSettingsFile(obj = {}) {
  try {
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(obj, null, 2), "utf8");
    return true;
  } catch (err) {
    return false;
  }
}

function readFormsFieldsConfigFile() {
  try {
    const raw = fs.readFileSync(FORMS_FIELDS_CONFIG_PATH, "utf8");
    return JSON.parse(raw || "{}");
  } catch (err) {
    return {};
  }
}

function writeFormsFieldsConfigFile(obj = {}) {
  fs.writeFileSync(FORMS_FIELDS_CONFIG_PATH, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

function validateFormsFieldsConfig(config = {}) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error("Config JSON object required");
  }
  if (!config.forms || typeof config.forms !== "object" || Array.isArray(config.forms)) {
    throw new Error("Config me forms object required hai");
  }
  const formEntries = Object.entries(config.forms);
  if (!formEntries.length) throw new Error("Kam se kam ek form required hai");
  for (const [formKey, form] of formEntries) {
    if (!form || typeof form !== "object" || !Array.isArray(form.fields)) {
      throw new Error(`${formKey} form fields missing hain`);
    }
    const configuredPageCount = Number(form.pageCount);
    const maxFieldPage = form.fields.reduce((maxPage, field) => {
      const page = Number(field?.page);
      return Number.isFinite(page) ? Math.max(maxPage, page) : maxPage;
    }, 1);
    const maxAllowedPage = Number.isFinite(configuredPageCount) && configuredPageCount >= 1
      ? Math.max(configuredPageCount, maxFieldPage)
      : maxFieldPage;
    form.fields.forEach((field, index) => {
      if (!field || typeof field !== "object") throw new Error(`${formKey} field ${index + 1} invalid hai`);
      if (!field.id) throw new Error(`${formKey} field ${index + 1} id missing hai`);
      const page = Number(field.page);
      if (!Number.isFinite(page) || page < 1 || page > maxAllowedPage) throw new Error(`${formKey} field ${field.id} page invalid hai`);
      ["xPct", "yPct", "wPct", "hPct", "fontSize"].forEach((key) => {
        if (!Number.isFinite(Number(field[key]))) throw new Error(`${formKey} field ${field.id} ${key} invalid hai`);
      });
    });
  }
}

function sanitizeUploadedPdfName(name = "") {
  const base = path.basename(String(name || "template.pdf")).replace(/\.pdf$/i, "");
  return (base || "template")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "template";
}

function decodePdfBase64(value = "") {
  const text = String(value || "");
  const clean = text.includes(",") ? text.split(",").pop() : text;
  const buffer = Buffer.from(clean, "base64");
  if (buffer.length < 5 || buffer.slice(0, 5).toString("utf8") !== "%PDF-") {
    throw new Error("Valid PDF file required");
  }
  return buffer;
}

fs.mkdirSync(PDF_SIGNATURE_TEMP_DIR, { recursive: true });
fs.mkdirSync(PDF_SIGNATURE_REPORT_DIR, { recursive: true });
fs.mkdirSync(PDF_VERIFICATION_LOCAL_DIR, { recursive: true });

const pdfSignatureReports = new Map();
const PDF_SIGNATURE_MAX_BYTES = 20 * 1024 * 1024;
const PDF_SIGNATURE_TTL_MS = 10 * 60 * 1000;

const pdfSignatureUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, PDF_SIGNATURE_TEMP_DIR),
    filename: (_req, file, cb) => {
      const safeBase = path.basename(file.originalname || "certificate.pdf").replace(/[^a-z0-9._-]+/gi, "-").slice(0, 80);
      cb(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}-${safeBase || "certificate.pdf"}`);
    }
  }),
  limits: { fileSize: PDF_SIGNATURE_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    const name = String(file.originalname || "").toLowerCase();
    const type = String(file.mimetype || "").toLowerCase();
    if (type !== "application/pdf" && !name.endsWith(".pdf")) {
      return cb(new Error("Only PDF files are allowed"));
    }
    return cb(null, true);
  }
});

function scheduleTempDelete(filePath) {
  if (!filePath) return;
  setTimeout(() => {
    fs.promises.unlink(filePath).catch(() => {});
  }, PDF_SIGNATURE_TTL_MS).unref?.();
}

function sanitizeReportText(value = "") {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
}

async function readPdfTextSafe(filePath) {
  if (!pdfParse) {
    return { text: "", error: "pdf-parse dependency not available" };
  }
  try {
    const data = await pdfParse(await fs.promises.readFile(filePath));
    return { text: String(data?.text || ""), error: "" };
  } catch (error) {
    return { text: "", error: error.message || "PDF text extraction failed" };
  }
}

function extractVisiblePdfSignals(text = "") {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  const lineText = String(text || "");
  const visibleSignatureTextFound = /Digitally\s+signed\s+by/i.test(normalized);
  const visibleSignatureStatusText = /Signature\s+Not\s+Verified/i.test(normalized)
    ? "Validity Unknown"
    : /Signature\s+Verified/i.test(normalized)
      ? "Signature Verified"
      : "Unknown";
  const signerName = (
    normalized.match(/Digitally\s+signed\s+by\s*[:\-]?\s*([A-Z0-9 .,'/_-]{3,120}?)(?:\s+(?:Date|Reason|Location|Signature|$))/i)?.[1] ||
    ""
  ).trim();
  const signingDate = (
    normalized.match(/(?:Date|Signing\s+Date)\s*[:\-]?\s*([0-9]{1,2}[\/.-][0-9]{1,2}[\/.-][0-9]{2,4}(?:\s+[0-9:.]+\s*(?:AM|PM|IST|[+-]\d{2}:?\d{2})?)?)/i)?.[1] ||
    ""
  ).trim();
  const reason = (normalized.match(/Reason\s*[:\-]?\s*([^|]{3,100}?)(?:\s+(?:Location|Date|ONLINE|$))/i)?.[1] || "").trim();
  const location = (normalized.match(/Location\s*[:\-]?\s*([^|]{3,100}?)(?:\s+(?:Reason|Date|ONLINE|$))/i)?.[1] || "").trim();
  const verificationNumber = (
    normalized.match(/ONLINE\s+VERIFICATION\s+SECTION.{0,260}?(?:Verification|Certificate|Token|Application|Reference|Registration|Number|No\.?)\s*[:\-]?\s*([A-Z0-9/-]{5,40})/i)?.[1] ||
    normalized.match(/(?:Verification|Certificate|Token|Application|Reference|Registration)\s*(?:Number|No\.?)\s*[:\-]?\s*([A-Z0-9/-]{5,40})/i)?.[1] ||
    lineText.match(/\b[A-Z]{2,6}[\/-]?\d{4,}[A-Z0-9\/-]*\b/i)?.[0] ||
    ""
  ).trim();
  return {
    visibleSignatureTextFound,
    visibleSignatureStatusText,
    reason,
    location,
    visibleSignerName: signerName,
    visibleSigningDate: signingDate,
    qrFound: /QR\s*Code|Scan\s+QR|ONLINE\s+VERIFICATION\s+SECTION/i.test(normalized),
    qrText: "",
    verificationNumber,
    knownPhrases: {
      digitallySignedBy: /Digitally\s+signed\s+by/i.test(normalized),
      signatureVerified: /Signature\s+Verified/i.test(normalized),
      signatureNotVerified: /Signature\s+Not\s+Verified/i.test(normalized),
      reasonApproved: /Reason\s*:\s*Approved/i.test(normalized),
      locationRajasthan: /Location\s*:\s*Rajasthan/i.test(normalized),
      onlineVerificationSection: /ONLINE\s+VERIFICATION\s+SECTION/i.test(normalized)
    }
  };
}

async function runPdfSignatureHelper(filePath) {
  const scriptPath = path.join(__dirname, "tools", "verify_pdf_signature.py");
  const pythonCandidates = [process.env.PYTHON_BIN, "python", "py"].filter(Boolean);
  let lastError = "";
  for (const pythonBin of pythonCandidates) {
    try {
      const { stdout } = await execFileAsync(pythonBin, [scriptPath, filePath], {
        timeout: 45000,
        maxBuffer: 1024 * 1024
      });
      return JSON.parse(stdout || "{}");
    } catch (error) {
      lastError = error.stderr || error.message || String(error);
      if (String(lastError).includes("ENOENT")) continue;
    }
  }
  return {
    embeddedSignatureFound: false,
    signatureStatus: "NOT_VERIFIED",
    documentModifiedAfterSigning: "Unknown",
    signerName: "",
    signingTime: "",
    certificateIssuer: "",
    certificateSubject: "",
    certificateValidFrom: "",
    certificateValidTo: "",
    trustStatus: "Python helper did not run",
    errors: [lastError || "Python helper did not run"]
  };
}

function getFinalPdfSignatureStatus(helper = {}, visible = {}) {
  const signatureStatus = String(helper.signatureStatus || "").toUpperCase();
  const modified = helper.documentModifiedAfterSigning === true || signatureStatus === "MODIFIED";
  const embeddedSignatureFound = Boolean(helper.embeddedSignatureFound);
  if (modified) return "Document Modified After Signing";
  if (signatureStatus === "VALID") return "Digital Signature Valid";
  if (signatureStatus === "INVALID") return "Invalid Signature";
  if (embeddedSignatureFound && signatureStatus === "NOT_VERIFIED") return "Validity Unknown";
  if (embeddedSignatureFound) return "Validity Unknown";
  if (visible.qrFound || visible.verificationNumber) return "Official eMitra Verification Required";
  return "Original PDF Required for Digital Signature Verification";
}

function createPdfSignatureReport(result = {}) {
  const reportId = crypto.randomBytes(16).toString("hex");
  const reportPath = path.join(PDF_SIGNATURE_REPORT_DIR, `${reportId}.pdf`);
  const doc = new PDFDocument({ size: "A4", margin: 44, info: { Title: "PDF Signature Verification Report" } });
  const stream = fs.createWriteStream(reportPath);
  doc.pipe(stream);
  doc.rect(0, 0, doc.page.width, 82).fill("#0057a8");
  doc.fillColor("#ffcf75").fontSize(20).font("Helvetica-Bold").text("E-MITRA WALA", 44, 28);
  doc.fillColor("#ffffff").fontSize(11).font("Helvetica").text("PDF Certificate Signature Verification Report", 44, 53);
  doc.moveDown(3);
  doc.fillColor("#172033").fontSize(11).font("Helvetica-Bold").text("Verification Summary", { underline: true });
  doc.moveDown(0.7);
  const rows = [
    ["File name", result.fileName],
    ["Verification date/time", new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })],
    ["Embedded digital signature", result.embeddedSignatureFound ? "Found" : "Not Found"],
    ["Signature status", result.signatureStatus],
    ["Document modified after signing", result.documentModifiedAfterSigning],
    ["Signer name", result.signerName],
    ["Signing date", result.signingDate],
    ["Reason", result.reason],
    ["Location", result.location],
    ["Certificate issuer", result.certificateIssuer],
    ["Certificate subject", result.certificateSubject],
    ["Certificate valid from", result.certificateValidFrom],
    ["Certificate valid to", result.certificateValidTo],
    ["Trust status", result.trustStatus],
    ["QR code found", result.qrFound ? "Yes" : "No"],
    ["Verification number", result.verificationNumber],
    ["Final recommendation", result.finalStatus]
  ];
  rows.forEach(([label, value]) => {
    doc.fillColor("#03224d").font("Helvetica-Bold").fontSize(9).text(`${label}:`, { continued: true });
    doc.fillColor("#172033").font("Helvetica").text(` ${sanitizeReportText(value || "-")}`);
    doc.moveDown(0.25);
  });
  doc.moveDown(0.8);
  doc.fillColor("#7c2d12").font("Helvetica-Bold").fontSize(10).text("Disclaimer");
  doc.fillColor("#5d6b7f").font("Helvetica").fontSize(9).text("This report is generated from uploaded file analysis. For final government certificate authenticity, verify on official eMitra portal.");
  doc.end();
  return new Promise((resolve, reject) => {
    stream.on("finish", () => {
      pdfSignatureReports.set(reportId, { path: reportPath, createdAt: Date.now() });
      scheduleTempDelete(reportPath);
      resolve(reportId);
    });
    stream.on("error", reject);
  });
}

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
  sourceKind: normalizeSourceKind(value.sourceKind || value.kind),
  sourcePriority: readPositiveInt(value.sourcePriority || value.priority || sourcePriorityValue({ id, ...value }), sourcePriorityValue({ id, ...value }), 100),
  enabled: value.enabled !== false,
  keywords: toText(value.keywords || ""),
  categories: parseAutoJobCategories(value.categories || value.enabledCategories),
  categoryPages: parseAutoJobCategoryPages(value),
  feedUrls: parseAutoJobFeedPages(value),
  maxFetch: readPositiveInt(value.maxFetch, AUTO_JOB_DEFAULT_PER_SOURCE_LIMIT, AUTO_JOB_MAX_PER_SOURCE_LIMIT)
});

const normalizeSourceKind = (value = "") => {
  const key = String(value || "").toLowerCase().replace(/[^a-z]/g, "");
  return key === "aggregator" || key === "portal" || key === "scraped" ? "aggregator" : "official";
};

const readCrawlerSourceConfig = () => {
  try {
    const raw = fs.readFileSync(CRAWLER_SOURCES_PATH, "utf8");
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (_err) {
    return [];
  }
};

const DEFAULT_AUTO_JOB_SOURCES = [
  {
    id: "default_ssc",
    name: "SSC",
    department: "Staff Selection Commission",
    url: "https://ssc.gov.in",
    keywords: "recruitment, admit card, result, vacancy, notification, notice",
    sourceKind: "official"
  },
  {
    id: "default_upsc",
    name: "UPSC",
    department: "Union Public Service Commission",
    url: "https://upsc.gov.in/recruitment/recruitment-test",
    keywords: "recruitment, examination, notification, admit card, result, vacancy",
    sourceKind: "official"
  },
  {
    id: "default_rpsc",
    name: "RPSC",
    department: "Rajasthan Public Service Commission",
    url: "https://rpsc.rajasthan.gov.in",
    keywords: "recruitment, advertisement, result, admit card, answer key, press note",
    sourceKind: "official"
  },
  {
    id: "default_rssb",
    name: "RSSB",
    department: "Rajasthan Staff Selection Board",
    url: "https://rssb.rajasthan.gov.in",
    keywords: "recruitment, advertisement, result, admit card, answer key, notification",
    sourceKind: "official"
  },
  {
    id: "default_rajasthan_recruitment",
    name: "Rajasthan Recruitment Portal",
    department: "Government of Rajasthan",
    url: "https://www.recruitment.rajasthan.gov.in",
    keywords: "notification, recruitment, vacancy, admit card, result, apply online",
    sourceKind: "official"
  },
  {
    id: "default_ibps",
    name: "IBPS",
    department: "Institute of Banking Personnel Selection",
    url: "https://www.ibps.in/index.php/recruitment",
    keywords: "recruitment, CRP, notification, admit card, result, provisional allotment",
    sourceKind: "official"
  },
  {
    id: "default_nta",
    name: "NTA",
    department: "National Testing Agency",
    url: "https://nta.ac.in",
    keywords: "notification, public notice, admit card, result, exam city, recruitment",
    sourceKind: "official"
  },
  {
    id: "default_rrb_apply",
    name: "RRB Apply",
    department: "Railway Recruitment Boards",
    url: "https://www.rrbapply.gov.in",
    keywords: "CEN, recruitment, apply online, admit card, result, notice, railway",
    sourceKind: "official"
  },
  {
    id: "default_rajasthan_police",
    name: "Rajasthan Police",
    department: "Rajasthan Police",
    url: "https://police.rajasthan.gov.in",
    keywords: "recruitment, constable, admit card, result, selection list, important notice",
    sourceKind: "official"
  },
  {
    id: "portal_sarkari_result",
    name: "Sarkari Result",
    department: "Sarkari Result Job Portal",
    url: "https://www.sarkariresult.com/",
    keywords: "online form, recruitment, vacancy, admit card, result, answer key, syllabus, notification, apply online",
    sourceKind: "aggregator",
    categoryPages: {
      latestJob: "https://www.sarkariresult.com/latestjob/",
      admitCard: "https://www.sarkariresult.com/admitcard/",
      result: "https://www.sarkariresult.com/result/",
      answerKey: "https://www.sarkariresult.com/answerkey/",
      syllabus: "https://www.sarkariresult.com/syllabus/"
    },
    feedUrls: ["https://www.sarkariresult.com/feed_rss.xml"],
    maxFetch: 12
  },
  {
    id: "portal_sarkari_exam",
    name: "Sarkari Exam",
    department: "Sarkari Exam Job Portal",
    url: "https://www.sarkariexam.com/",
    keywords: "online form, recruitment, vacancy, admit card, result, answer key, syllabus, notification, posts",
    sourceKind: "aggregator",
    categoryPages: {
      latestJob: "https://www.sarkariexam.com/category/top-online-form/feed/",
      admitCard: "https://www.sarkariexam.com/category/admit-card/feed/",
      result: "https://www.sarkariexam.com/category/exam-result/feed/",
      answerKey: "https://www.sarkariexam.com/category/answer-keys/feed/"
    },
    feedUrls: ["https://www.sarkariexam.com/feed/"],
    maxFetch: 12
  },
  {
    id: "portal_freejobalert",
    name: "FreeJobAlert",
    department: "FreeJobAlert Job Portal",
    url: "https://www.freejobalert.com/",
    keywords: "recruitment, apply online, notification, vacancy, admit card, result, answer key, syllabus, posts",
    sourceKind: "aggregator",
    categoryPages: {
      latestJob: "https://www.freejobalert.com/latest-notifications/",
      admitCard: "https://www.freejobalert.com/admit-card/",
      result: "https://www.freejobalert.com/exam-results/",
      answerKey: "https://www.freejobalert.com/answer-key/",
      syllabus: "https://www.freejobalert.com/syllabus/"
    },
    feedUrls: ["https://www.freejobalert.com/feed/"],
    maxFetch: 12
  }
].concat(readCrawlerSourceConfig()).map((source) => ({
  ...source,
  enabled: true,
  categories: AUTO_JOB_CATEGORY_KEYS,
  categoryPages: source.categoryPages || {},
  feedUrls: parseAutoJobFeedPages(source),
  maxFetch: readPositiveInt(source.maxFetch, AUTO_JOB_DEFAULT_PER_SOURCE_LIMIT, AUTO_JOB_MAX_PER_SOURCE_LIMIT),
  sourceKind: normalizeSourceKind(source.sourceKind),
  sourcePriority: readPositiveInt(source.sourcePriority || source.priority || sourcePriorityValue(source), sourcePriorityValue(source), 100)
}));

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
    sourceKind: normalizeSourceKind(source.sourceKind || source.kind),
    sourcePriority: readPositiveInt(source.sourcePriority || source.priority || sourcePriorityValue(source), sourcePriorityValue(source), 100),
    categories: parseAutoJobCategories(source.categories || source.enabledCategories),
    categoryPages: parseAutoJobCategoryPages(source),
    feedUrls: parseAutoJobFeedPages(source),
    maxFetch: readPositiveInt(source.maxFetch, AUTO_JOB_DEFAULT_PER_SOURCE_LIMIT, AUTO_JOB_MAX_PER_SOURCE_LIMIT),
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
    source: payload.source || payload.sourceName || "",
    title: toText(payload.title || ""),
    url: extractHttpUrl(payload.url || payload.link || "") || toText(payload.url || payload.link || ""),
    detectedAt: payload.detectedAt || createdAt,
    status: payload.status || payload.level || "info",
    error: toText(payload.error || ""),
    createdAt
  });
  return ref.key;
};

const sleep = (ms = 0) => new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));

const canFetchByRobots = async (targetUrl = "") => {
  if (String(process.env.AUTO_JOB_RESPECT_ROBOTS || "true").toLowerCase() === "false") {
    return { ok: true, reason: "disabled" };
  }
  try {
    const parsed = new URL(targetUrl);
    const robotsUrl = `${parsed.origin}/robots.txt`;
    const robots = await fetchText(robotsUrl, 8000).catch(() => null);
    if (!robots?.text) return { ok: true, reason: "missing" };
    const pathName = parsed.pathname || "/";
    let applies = false;
    const disallows = [];
    String(robots.text || "").split(/\r?\n/).forEach((rawLine) => {
      const line = rawLine.replace(/#.*/, "").trim();
      if (!line) return;
      const agent = line.match(/^user-agent\s*:\s*(.+)$/i);
      if (agent) {
        const value = agent[1].trim();
        applies = value === "*" || /emitra|mozilla|bot|crawler/i.test(value);
        return;
      }
      const disallow = line.match(/^disallow\s*:\s*(.*)$/i);
      if (applies && disallow && disallow[1].trim()) {
        disallows.push(disallow[1].trim());
      }
    });
    const blocked = disallows.some((rule) => pathName.startsWith(rule));
    return { ok: !blocked, reason: blocked ? "robots_disallow" : "allowed" };
  } catch (_err) {
    return { ok: true, reason: "parse_failed" };
  }
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
    const targets = sourcePageTargets(source).slice(0, 4);
    const notices = [];
    const errors = [];
    for (const target of targets) {
      try {
        const page = await fetchText(target.url, 20000);
        extractNotices(page.text, target.url, target.keywords, { limit: 10 }).forEach((notice) => {
          notices.push({ ...notice, sourcePage: target.url, pageLabel: target.label });
        });
      } catch (err) {
        errors.push({ target: target.url, ...explainFetchError(err) });
      }
    }
    if (!notices.length && errors.length) {
      const error = new Error(errors[0].detail || errors[0].message);
      error.friendly = errors[0];
      throw error;
    }
    return {
      ok: true,
      sourceId: source.id || "",
      sourceName: source.name || "",
      url: source.url,
      status: notices.length ? "ready" : "no_links",
      message: notices.length
        ? `${targets.length} page/feed check hua. ${notices.length} matching links mile.${errors.length ? ` ${errors.length} blocked/failed target skip hua.` : ""}`
        : "Page open ho raha hai, par matching job links nahi mile. Keywords/category URL check karein.",
      foundCount: notices.length,
      sampleLinks: notices.slice(0, 5),
      checkedAt: nowStamp(),
      durationMs: nowStamp() - startedAt
    };
  } catch (err) {
    const friendly = err.friendly || explainFetchError(err);
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
  "memberFolders",
  "memberCloudLinks",
  "serviceRequests",
  "userServiceRequests",
  "activeServiceRequests",
  "userMessages",
  "autoJobSources",
  "autoJobDrafts",
  "autoJobLogs",
  "autoJobCheckerStatus",
  "autoJobSeen",
  "autoJobUrlCache"
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

const extractXmlNotices = (xml = "", baseUrl = "", keywords = [], options = {}) => {
  const sourceKeywords = keywords.length ? keywords : autoJobKeywords;
  const limit = readPositiveInt(options.limit, 80, 200);
  const rows = [];
  const seen = new Set();
  const addRow = (title = "", link = "") => {
    const cleanLink = decodeHtml(link).trim();
    if (!cleanLink || /^(javascript:|mailto:|tel:|#)/i.test(cleanLink)) return;
    let resolved = "";
    try {
      resolved = new URL(cleanLink, baseUrl).href;
    } catch (err) {
      return;
    }
    const cleanTitle = cleanNoticeTitle(decodeHtml(title || resolved));
    if (!isUsefulNoticeCandidate(cleanTitle, resolved, sourceKeywords)) return;
    const key = resolved.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    rows.push({ title: cleanTitle || resolved, link: resolved });
  };

  const itemRegex = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) && rows.length < limit) {
    const item = match[1] || "";
    const title = item.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "";
    const link = item.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1]
      || item.match(/<guid[^>]*>(https?:\/\/[\s\S]*?)<\/guid>/i)?.[1]
      || "";
    addRow(title, link);
  }

  const entryRegex = /<entry\b[^>]*>([\s\S]*?)<\/entry>/gi;
  while ((match = entryRegex.exec(xml)) && rows.length < limit) {
    const entry = match[1] || "";
    const title = entry.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "";
    const link = entry.match(/<link[^>]*href=["']([^"']+)["'][^>]*>/i)?.[1]
      || entry.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1]
      || "";
    addRow(title, link);
  }

  const locRegex = /<loc[^>]*>([\s\S]*?)<\/loc>/gi;
  while ((match = locRegex.exec(xml)) && rows.length < limit) {
    const link = match[1] || "";
    const urlTitle = link.split("/").filter(Boolean).pop()?.replace(/[-_]+/g, " ") || link;
    addRow(urlTitle, link);
  }

  return rows.slice(0, limit);
};

const extractLinks = (html = "", baseUrl = "", keywords = [], options = {}) => {
  const sourceKeywords = keywords.length ? keywords : autoJobKeywords;
  const limit = readPositiveInt(options.limit, 80, 200);
  const rows = [];
  const seen = new Set();
  const addLink = (href = "", label = "") => {
    const rawHref = String(href || "").trim();
    if (!rawHref || /^(javascript:|mailto:|tel:|#)/i.test(rawHref)) return;
    let link = "";
    try {
      link = new URL(rawHref, baseUrl).href;
    } catch (err) {
      return;
    }
    const title = cleanNoticeTitle(decodeHtml(label || link));
    if (!isUsefulNoticeCandidate(title, link, sourceKeywords)) return;
    const key = link.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    rows.push({ title: title || link, link });
  };

  if (cheerio) {
    const $ = cheerio.load(String(html || ""));
    $("a[href]").each((_, element) => {
      if (rows.length >= limit) return false;
      const node = $(element);
      const title = [
        node.text(),
        node.attr("title"),
        node.attr("aria-label"),
        node.closest("tr").text(),
        node.closest("li").text()
      ].map(toText).find(Boolean);
      addLink(node.attr("href"), title);
      return undefined;
    });
    return rows.slice(0, limit);
  }

  const linkRegex = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = linkRegex.exec(html))) {
    addLink(match[1], match[2]);
    if (rows.length >= limit) break;
  }
  return rows;
};

const extractNotices = (body = "", baseUrl = "", keywords = [], options = {}) => {
  const text = String(body || "");
  const xmlRows = /<(rss|feed|urlset|item|entry)\b/i.test(text)
    ? extractXmlNotices(text, baseUrl, keywords, options)
    : [];
  return xmlRows.length ? xmlRows : extractLinks(text, baseUrl, keywords, options);
};

const isPortalOnlyTitle = (title = "") => {
  const original = toText(title);
  const cleaned = sanitizePortalBranding(original);
  if (!cleaned || cleaned.length < 8) return true;
  return PORTAL_BRAND_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(original);
  }) && cleaned.split(/\s+/).length <= 2;
};

const extractNoticePageDetails = (html = "", url = "") => {
  const body = String(html || "");
  const officialLinkLabels = /(official\s*(website|site|notification)|download\s*notification|advertisement\s*pdf|notice\s*pdf|notice|apply\s*online|advertisement|notification\s*pdf|विज्ञप्ति|ऑफिशियल|आवेदन)/i;
  const details = {
    title: "",
    officialLink: "",
    officialWebsite: "",
    applyLink: "",
    notificationLink: ""
  };
  const addOfficialLink = (href = "", label = "") => {
    if (!href || !officialLinkLabels.test(`${label} ${href}`)) return;
    let resolved = "";
    try {
      resolved = new URL(href, url).href;
    } catch (_err) {
      return;
    }
    if (/apply\s*online|आवेदन/i.test(label) && !details.applyLink) {
      details.applyLink = resolved;
    }
    if (/official\s*(website|site)|ऑफिशियल\s*(वेबसाइट|साइट)/i.test(label) && !details.officialWebsite) {
      details.officialWebsite = resolved;
    }
    if (/(notification|advertisement|pdf|विज्ञप्ति)/i.test(`${label} ${resolved}`) && !details.notificationLink) {
      details.notificationLink = resolved;
    }
    if (!details.officialLink) {
      details.officialLink = resolved;
    }
  };

  if (cheerio) {
    const $ = cheerio.load(body);
    const titleCandidates = [
      $("h1").first().text(),
      $("h2").first().text(),
      $("meta[property='og:title']").attr("content"),
      $("title").first().text()
    ].map((item) => sanitizePortalBranding(toText(item))).filter((item) => item && !isGenericNoticeTitle(item));
    details.title = titleCandidates[0] || "";
    $("a[href]").each((_, element) => {
      const node = $(element);
      const label = toText([node.text(), node.attr("title"), node.attr("aria-label")].filter(Boolean).join(" "));
      addOfficialLink(node.attr("href"), label);
    });
    return details;
  }

  details.title = sanitizePortalBranding(decodeHtml(body.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || ""));
  const linkRegex = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = linkRegex.exec(body))) {
    addOfficialLink(match[1], decodeHtml(match[2]));
  }
  return details;
};

const fetchAggregatorNoticeDetails = async (source = {}, notice = {}, limits = {}) => {
  if (source.sourceKind !== "aggregator" && !isPortalOnlyTitle(notice.title)) {
    return notice;
  }
  const url = notice.link || "";
  if (!/^https?:\/\//i.test(url)) return notice;
  try {
    await sleep(readPositiveInt(limits.rateLimitMs || process.env.AUTO_JOB_RATE_LIMIT_MS, 1500, 10000));
    const page = await fetchText(url, Math.min(limits.fetchTimeoutMs || 16000, 20000));
    const details = extractNoticePageDetails(page.text, url);
    const cleanTitle = sanitizePortalBranding(details.title || notice.title);
    return {
      ...notice,
      title: cleanTitle && !isGenericNoticeTitle(cleanTitle) ? cleanTitle : sanitizePortalBranding(notice.title),
      officialLink: details.officialLink || notice.officialLink || "",
      officialWebsite: details.officialWebsite || notice.officialWebsite || "",
      applyLink: details.applyLink || notice.applyLink || "",
      notificationLink: details.notificationLink || notice.notificationLink || "",
      pageContent: sanitizePortalBranding(decodeHtml(page.text)).slice(0, 9000)
    };
  } catch (_err) {
    return {
      ...notice,
      title: sanitizePortalBranding(notice.title)
    };
  }
};

const noticeOfficialPdfLink = (notice = {}, draft = {}) => {
  const candidates = [notice.notificationLink, notice.officialNotification, notice.officialLink, draft.officialNotification, draft.detailLink, notice.link, draft.sourceLink].filter(Boolean);
  return candidates.find((url) => /\.pdf(?:$|[?#])/i.test(String(url || ""))) || "";
};

const buildCrawlerGeneratedJson = (draft = {}) => {
  const id = draft.duplicateKey || draft.sourceLink || draft.title || "";
  const seo = buildSeoFields(draft, id);
  const officialNotification = draft.officialNotification || draft.notificationLink || draft.detailLink || "";
  const applyOnline = draft.applyOnline || draft.applyLink || "";
  const officialWebsite = draft.officialWebsite || draft.officialLink || "";
  return brandDraftForEmitra({
    title: draft.title || "",
    department: draft.department || "",
    postName: draft.postName || draft.examName || draft.title || "",
    totalPosts: draft.totalPosts || draft.totalVacancy || "",
    importantDates: draft.importantDates || "",
    applicationFee: draft.applicationFee || draft.applicationFees || draft.applicationFeeManual || draft.feeDetails || "",
    ageLimit: draft.ageLimit || draft.ageLimitManual || "",
    qualification: draft.qualification || "",
    vacancyDetails: draft.vacancyDetails || draft.vacancyDetailsManual || "",
    selectionProcess: draft.selectionProcess || "",
    howToApply: draft.howToApply || "",
    officialNotification,
    applyOnline,
    officialWebsite,
    sourceLink: draft.sourceLink || "",
    postTarget: draft.postTarget || "latestJob",
    slug: draft.slug || seo.slug,
    seoTitle: draft.seoTitle || seo.seoTitle,
    metaDescription: draft.metaDescription || seo.metaDescription,
    whatsappPostText: draft.whatsappPostText || buildWhatsappPostText(id, draft)
  });
};

const hasBilingualPair = (value) => Boolean(value && typeof value === "object" && toText(value.hi) && toText(value.en));

const applyBilingualModeToJson = (generated = {}, mode = "") => {
  const normalizedMode = String(mode || "").toLowerCase();
  if (!["hi", "en", "both"].includes(normalizedMode)) return generated;
  const next = { ...generated, bilingualMode: normalizedMode };
  BILINGUAL_PUBLIC_FIELDS.forEach((field) => {
    if (next[field] === undefined || next[field] === null || next[field] === "") return;
    if (next[field] && typeof next[field] === "object" && (next[field].hi || next[field].en)) {
      next[field] = {
        ...(normalizedMode !== "en" ? { hi: toText(next[field].hi || next[field].en) } : {}),
        ...(normalizedMode !== "hi" ? { en: toText(next[field].en || next[field].hi) } : {})
      };
      return;
    }
    const text = toText(next[field]);
    if (!text) return;
    if (normalizedMode === "hi") next[field] = { hi: text };
    else if (normalizedMode === "en") next[field] = { en: text };
    else next[field] = { hi: text, en: text };
  });
  return next;
};

const validateCrawlerDraftQuality = (draft = {}) => {
  const generated = buildCrawlerGeneratedJson(draft);
  const mode = String(draft.bilingualMode || generated.bilingualMode || "").toLowerCase();
  const checkedGenerated = applyBilingualModeToJson(generated, mode);
  const missing = CRAWLER_REQUIRED_FIELDS.filter((field) => !isCrawlerFieldFilled(generated[field]));
  const bilingualMissing = mode === "both"
    ? BILINGUAL_PUBLIC_FIELDS.filter((field) => checkedGenerated[field] !== undefined && checkedGenerated[field] !== "" && !hasBilingualPair(checkedGenerated[field]))
    : [];
  const allMissing = [...missing, ...bilingualMissing.map((field) => `${field}.hi/en`)];
  return {
    generated: checkedGenerated,
    missing: allMissing,
    checkerStatus: allMissing.length ? "needs_review" : "ready_for_review",
    reviewReason: allMissing.length ? `Missing fields: ${allMissing.join(", ")}` : "",
    validationStatus: allMissing.length ? "failed" : "passed"
  };
};

const applyCrawlerValidation = (draft = {}) => {
  const validation = validateCrawlerDraftQuality(draft);
  return brandDraftForEmitra({
    ...draft,
    ...validation.generated,
    officialNotification: validation.generated.officialNotification,
    applyOnline: validation.generated.applyOnline,
    officialWebsite: validation.generated.officialWebsite,
    applicationFee: validation.generated.applicationFee,
    ageLimit: validation.generated.ageLimit,
    vacancyDetails: validation.generated.vacancyDetails,
    selectionProcess: validation.generated.selectionProcess,
    howToApply: validation.generated.howToApply,
    checkerStatus: validation.checkerStatus,
    reviewRequired: true,
    reviewReason: validation.reviewReason,
    missingRequiredFields: validation.missing,
    validationStatus: validation.validationStatus,
    generatedJson: JSON.stringify(validation.generated, null, 2),
    updatedAt: nowStamp()
  });
};

const buildDraftFromNotice = (source, notice, options = {}) => {
  const cleanNoticeTitleText = sanitizePortalBranding(notice.title) || "Job Update";
  const bodyText = `${cleanNoticeTitleText}\n${notice.link}\n${notice.pageContent || ""}`;
  const target = options.postTarget || detectPostTarget(notice.title, notice.link, bodyText);
  const linkField = pickJobLinkField(target);
  const qualification = findFirstMatchLine(bodyText, [
    /qualification/i, /eligibility/i, /education/i, /योग्यता/i, /पात्रता/i, /शैक्षणिक/i
  ]);
  const department = source.department || findFirstMatchLine(bodyText, [/department/i, /board/i, /कार्यालय/i, /विभाग/i]) || source.name;
  const officialNotification = notice.notificationLink || notice.officialNotification || (/\.pdf(?:$|[?#])/i.test(notice.officialLink || "") ? notice.officialLink : "") || notice.link;
  const officialLink = notice.officialWebsite || (!/\.pdf(?:$|[?#])/i.test(notice.officialLink || "") ? notice.officialLink : "") || (source.sourceKind === "aggregator" ? "" : source.url);
  const draft = {
    title: cleanNoticeTitleText,
    department,
    postDate: new Date().toLocaleDateString("en-GB").replace(/\//g, "-"),
    importantDates: extractDatesBlock(bodyText),
    qualification,
    totalPosts: extractTotalPosts(bodyText),
    officialWebsite: officialLink,
    officialLink,
    officialNotification,
    applyOnline: notice.applyLink || "",
    sourceLink: notice.link,
    detailLink: officialNotification,
    applyLink: notice.applyLink || "#",
    type: target === "latestJob" ? "Online Form" : "Update",
    postTarget: target,
    postStatus: "draft",
    displayOrder: "1",
    detailLayout: "table",
    pageContent: sanitizePortalBranding(notice.pageContent || ""),
    rawText: bodyText,
    pdfTextExtracted: false,
    lightweightDraft: true,
    reviewRequired: true,
    checkerStatus: "needs_review",
    sourceId: source.id,
    sourceName: source.name,
    sourceKind: source.sourceKind || "official",
    sourcePriority: noticeOfficialPdfLink(notice) ? 1 : readPositiveInt(source.sourcePriority || sourcePriorityValue(source), sourcePriorityValue(source), 100),
    detectedLink: notice.link,
    scanSourcePage: options.scanSourcePage || source.url,
    scanCategory: target,
    crawlerSummary: {
      source: source.name,
      title: cleanNoticeTitleText,
      url: notice.link,
      detectedType: target,
      detectedAt: nowStamp(),
      isPdf: /\.pdf(?:$|[?#])/i.test(notice.link),
      summaryProvider: "parser",
      summary: buildNotificationSummary({ title: cleanNoticeTitleText, department, postTarget: target, sourceLink: notice.link })
    },
    generatedJson: "",
    createdAt: nowStamp(),
    updatedAt: nowStamp()
  };
  draft[linkField] = notice.link;
  return applyCrawlerValidation(enrichJobAutomation(draft, hashKey(notice.link).slice(0, 8)));
};

const enrichDraftWithPdfText = async (draft = {}, notice = {}, limits = {}) => {
  const link = noticeOfficialPdfLink(notice, draft) || notice.link || draft.sourceLink || "";
  if (!/\.pdf(?:$|[?#])/i.test(link)) {
    return applyCrawlerValidation(draft);
  }
  const pdfText = await fetchPdfText(link, limits.pdfTimeoutMs || 25000);
  if (!pdfText) {
    return applyCrawlerValidation({
      ...draft,
      checkerStatus: "needs_review",
      pdfTextExtracted: false,
      crawlerSummary: {
        ...(draft.crawlerSummary || {}),
        pdfTextExtracted: false
      }
    });
  }
  const enriched = enrichJobAutomation({
    ...draft,
    title: extractPdfTitle(pdfText) || draft.title,
    department: draft.sourceKind === "aggregator" ? (extractPdfDepartment(pdfText) || "") : (draft.department || extractPdfDepartment(pdfText)),
    pageContent: pdfText.slice(0, 9000),
    rawText: `${draft.rawText || ""}\n${pdfText}`.trim(),
    importantDates: draft.importantDates || extractDatesBlock(pdfText),
    applicationFeeManual: draft.applicationFeeManual || extractApplicationFeeBlock(pdfText),
    ageLimitManual: draft.ageLimitManual || extractAgeLimitBlock(pdfText),
    qualification: draft.qualification || findFirstMatchLine(pdfText, [/qualification/i, /eligibility/i, /education/i, /योग्यता/i, /पात्रता/i, /शैक्षणिक/i]),
    totalPosts: draft.totalPosts || extractTotalPosts(pdfText),
    vacancyDetailsManual: draft.vacancyDetailsManual || extractVacancyBlock(pdfText),
    selectionProcess: draft.selectionProcess || extractSelectionProcessBlock(pdfText),
    howToApply: draft.howToApply || extractHowToApplyBlock(pdfText),
    officialNotification: link,
    detailLink: link,
    postTarget: detectPostTarget(draft.title, link, pdfText),
    pdfTextExtracted: true,
    lightweightDraft: false,
    crawlerSummary: {
      ...(draft.crawlerSummary || {}),
      detectedType: detectPostTarget(draft.title, link, pdfText),
      pdfTextExtracted: true,
      extractedTextChars: pdfText.length,
      summaryProvider: "parser",
      summary: buildNotificationSummary({ ...draft, pageContent: pdfText })
    }
  }, draft.duplicateKey || safeKey(link));
  return applyCrawlerValidation(enriched);
};

const sourceKeywordList = (source = {}, category = "") => {
  const sourceKeywords = source.keywords
    ? source.keywords.split(",").map((item) => item.trim()).filter(Boolean)
    : [];
  const categoryKeywords = AUTO_JOB_CATEGORY_CONFIG[category]?.keywords || [];
  return Array.from(new Set([...(categoryKeywords.length ? categoryKeywords : autoJobKeywords), ...sourceKeywords]));
};

const sourcePageTargets = (source = {}) => {
  const categories = parseAutoJobCategories(source.categories);
  const categoryPages = parseAutoJobCategoryPages(source);
  const feedUrls = parseAutoJobFeedPages(source);
  const hasCategoryPages = Object.keys(categoryPages).length > 0;
  const targets = [];
  feedUrls.forEach((url) => {
    targets.push({
      url,
      label: "RSS Feed",
      postTarget: "",
      categories,
      keywords: sourceKeywordList(source)
    });
  });
  if (source.url && !(source.sourceKind === "aggregator" && hasCategoryPages)) {
    targets.push({
      url: source.url,
      label: "Homepage",
      postTarget: "",
      categories,
      keywords: sourceKeywordList(source)
    });
  }
  categories.forEach((category) => {
    const url = categoryPages[category];
    if (!url) return;
    targets.push({
      url,
      label: AUTO_JOB_CATEGORY_CONFIG[category]?.label || category,
      postTarget: category,
      categories: [category],
      keywords: sourceKeywordList(source, category)
    });
  });
  const seen = new Set();
  return targets.filter((target) => {
    const key = normalizeProcessedUrl(target.url);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const draftDuplicateCacheKeys = (draft = {}) => {
  const keys = new Set(duplicateKeysForJob(draft));
  [draft.sourceLink, draft.detailLink, draft.applyLink, draft.officialWebsite]
    .filter(Boolean)
    .forEach((url) => keys.add(autoJobUrlCacheKey(url)));
  return Array.from(keys);
};

const noticeAlreadyProcessed = async (db, draftSeed = {}) => {
  const keys = draftDuplicateCacheKeys(draftSeed);
  if (!keys.length) return false;
  const snapshots = await Promise.all(keys.map((key) => db.ref(`autoJobSeen/${key}`).get()));
  if (snapshots.some((item) => item.exists())) return true;
  const urlKeys = [draftSeed.sourceLink, draftSeed.detailLink, draftSeed.applyLink, draftSeed.officialWebsite]
    .filter(Boolean)
    .map(autoJobUrlCacheKey);
  if (!urlKeys.length) return false;
  const urlSnapshots = await Promise.all(urlKeys.map((key) => db.ref(`autoJobUrlCache/${key}`).get()));
  return urlSnapshots.some((item) => item.exists());
};

const existingPublishedDuplicate = async (db, draft = {}, draftId = "") => {
  const keys = draftDuplicateCacheKeys(draft);
  if (keys.length) {
    const snapshots = await Promise.all(keys.map((key) => db.ref(`autoJobSeen/${key}`).get()));
    const duplicate = snapshots
      .map((snapshot) => snapshot.exists() ? snapshot.val() : null)
      .find((value) => value && value.publishedJobId && value.draftId !== draftId);
    if (duplicate) {
      return { reason: "cache", jobId: duplicate.publishedJobId, title: duplicate.title || "" };
    }
  }

  const draftUrls = [draft.sourceLink, draft.detailLink, draft.applyLink, draft.officialWebsite]
    .map(normalizeProcessedUrl)
    .filter(Boolean);
  const titleKey = toText(`${draft.title || ""}|${draft.department || ""}`).toLowerCase();
  const jobsSnapshot = await db.ref("LatestJobs").get();
  if (!jobsSnapshot.exists()) return null;
  let duplicate = null;
  jobsSnapshot.forEach((child) => {
    if (duplicate) return;
    const job = child.val() || {};
    const jobUrls = [job.sourceLink, job.detailLink, job.applyLink, job.officialWebsite]
      .map(normalizeProcessedUrl)
      .filter(Boolean);
    if (draftUrls.length && jobUrls.some((url) => draftUrls.includes(url))) {
      duplicate = { reason: "url", jobId: child.key, title: job.title || "" };
      return;
    }
    const jobTitleKey = toText(`${job.title || ""}|${job.department || ""}`).toLowerCase();
    if (titleKey && jobTitleKey && titleKey === jobTitleKey) {
      duplicate = { reason: "title", jobId: child.key, title: job.title || "" };
    }
  });
  return duplicate;
};

async function checkOneAutoJobSource(db, source, limits = {}) {
  const startedAt = nowStamp();
  let found = 0;
  let newDrafts = 0;
  let skippedDuplicates = 0;
  let pageFetches = 0;
  let targetErrors = 0;
  const errorMessages = [];
  try {
    const enabledCategories = parseAutoJobCategories(source.categories);
    const pageTargets = sourcePageTargets(source);
    const perSourceLimit = Math.min(
      readPositiveInt(source.maxFetch, limits.perSourceLimit || AUTO_JOB_DEFAULT_PER_SOURCE_LIMIT, AUTO_JOB_MAX_PER_SOURCE_LIMIT),
      limits.remainingDrafts || AUTO_JOB_MAX_DRAFT_LIMIT
    );
    const seenThisSource = new Set();

    for (const target of pageTargets) {
      if (newDrafts >= perSourceLimit || (limits.remainingDrafts || 0) <= 0 || (limits.remainingPages || 0) <= 0) break;
      limits.remainingPages -= 1;
      pageFetches++;
      let page;
      try {
        const robots = await canFetchByRobots(target.url);
        if (!robots.ok) {
          targetErrors++;
          errorMessages.push(`${target.label || "Page"}: robots.txt disallow`);
          await logAutoJob(db, {
            level: "warning",
            sourceId: source.id,
            sourceName: source.name,
            title: target.label || source.name,
            url: target.url,
            status: "robots_skipped",
            error: "robots.txt disallow",
            message: `${source.name}: robots.txt ne scan block kiya`
          });
          continue;
        }
        await sleep(readPositiveInt(limits.rateLimitMs || process.env.AUTO_JOB_RATE_LIMIT_MS, 1500, 10000));
        page = await fetchText(target.url, limits.fetchTimeoutMs || 18000);
      } catch (err) {
        const friendly = explainFetchError(err);
        targetErrors++;
        errorMessages.push(`${target.label || "Page"}: ${friendly.message}`);
        continue;
      }
      const notices = extractNotices(page.text, target.url, target.keywords, {
        limit: Math.max(perSourceLimit * 4, 20)
      });
      found += notices.length;

      for (const rawNotice of notices) {
        if (newDrafts >= perSourceLimit || (limits.remainingDrafts || 0) <= 0) break;
        const notice = await fetchAggregatorNoticeDetails(source, rawNotice, limits);
        const normalizedLink = normalizeProcessedUrl(notice.link);
        if (!normalizedLink || seenThisSource.has(normalizedLink)) continue;
        seenThisSource.add(normalizedLink);

        const detectedTarget = target.postTarget || detectPostTarget(notice.title, notice.link, "");
        if (!enabledCategories.includes(detectedTarget)) continue;

        const draftSeed = {
          title: notice.title,
          department: source.department || source.name,
          sourceLink: notice.link,
          detailLink: notice.link,
          postTarget: detectedTarget,
          sourceId: source.id,
          sourceName: source.name
        };
        if (await noticeAlreadyProcessed(db, draftSeed)) {
          skippedDuplicates++;
          continue;
        }

        const duplicateKeys = draftDuplicateCacheKeys(draftSeed);
        const duplicateId = autoJobUrlCacheKey(notice.link);
        let draft = buildDraftFromNotice(source, notice, {
          postTarget: detectedTarget,
          scanSourcePage: target.url
        });
        draft = await enrichDraftWithPdfText(draft, notice, limits);
        const now = nowStamp();
        const updates = {};
        duplicateKeys.forEach((key) => {
          updates[`autoJobSeen/${key}`] = {
            title: notice.title,
            link: notice.link,
            sourceId: source.id,
            sourceName: source.name,
            sourcePriority: draft.sourcePriority || source.sourcePriority || sourcePriorityValue(source),
            category: detectedTarget,
            status: draft.checkerStatus || "needs_review",
            firstSeenAt: now,
            draftId: duplicateId
          };
        });
        updates[`autoJobUrlCache/${duplicateId}`] = {
          title: notice.title,
          link: notice.link,
          normalizedLink,
          sourceId: source.id,
          sourceName: source.name,
          sourcePriority: draft.sourcePriority || source.sourcePriority || sourcePriorityValue(source),
          category: detectedTarget,
          status: draft.checkerStatus || "needs_review",
          firstSeenAt: now,
          draftId: duplicateId
        };
        updates[`autoJobDrafts/${duplicateId}`] = {
          ...draft,
          duplicateKey: duplicateId,
          duplicateKeys
        };
        await db.ref().update(updates);
        await logAutoJob(db, {
          level: "success",
          sourceId: source.id,
          sourceName: source.name,
          title: draft.title || notice.title,
          url: notice.link,
          detectedAt: now,
          status: "draft",
          message: `New crawler draft saved: ${draft.title || notice.title}`
        });
        newDrafts++;
        limits.remainingDrafts -= 1;
      }
    }
    await db.ref(`autoJobSources/${source.id}`).update({
      lastCheckedAt: nowStamp(),
      lastStatus: "success",
      lastError: "",
      lastErrorHelp: "",
      lastFoundCount: found,
      lastNewCount: newDrafts,
      lastSkippedDuplicates: skippedDuplicates,
      lastPageFetches: pageFetches,
      lastTargetErrors: targetErrors,
      lastErrorHelp: errorMessages.slice(0, 2).join(" | "),
      updatedAt: nowStamp()
    });
    await logAutoJob(db, {
      level: targetErrors ? "warning" : "success",
      sourceId: source.id,
      sourceName: source.name,
      title: source.name,
      url: source.url,
      status: targetErrors ? "warning" : "success",
      error: errorMessages.slice(0, 2).join(" | "),
      message: `${source.name}: ${pageFetches} pages/feeds, ${found} links, ${newDrafts} drafts, ${skippedDuplicates} duplicate skipped${targetErrors ? `, ${targetErrors} target skipped` : ""}`
    });
    return { sourceId: source.id, found, newDrafts, skippedDuplicates, pageFetches, targetErrors, ok: true };
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
      title: source.name,
      url: source.url,
      status: "error",
      error: friendly.message,
      message: `${source.name}: ${friendly.message}`
    });
    return { sourceId: source.id, found, newDrafts, skippedDuplicates, pageFetches, ok: false, error: err.message, errorHelp: friendly.message, errorCode: friendly.code, startedAt };
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
    const limits = {
      remainingDrafts: readPositiveInt(options.limit || options.fetchLimit || process.env.AUTO_JOB_FETCH_LIMIT, AUTO_JOB_DEFAULT_DRAFT_LIMIT, AUTO_JOB_MAX_DRAFT_LIMIT),
      remainingPages: readPositiveInt(options.pageLimit || process.env.AUTO_JOB_PAGE_LIMIT, AUTO_JOB_DEFAULT_PAGE_LIMIT, AUTO_JOB_MAX_PAGE_LIMIT),
      perSourceLimit: readPositiveInt(options.perSourceLimit || process.env.AUTO_JOB_PER_SOURCE_LIMIT, AUTO_JOB_DEFAULT_PER_SOURCE_LIMIT, AUTO_JOB_MAX_PER_SOURCE_LIMIT),
      sourceLimit: readPositiveInt(options.sourceLimit || process.env.AUTO_JOB_SOURCE_LIMIT, 100, 500),
      fetchTimeoutMs: readPositiveInt(options.fetchTimeoutMs || process.env.AUTO_JOB_FETCH_TIMEOUT_MS, 18000, 30000),
      pdfTimeoutMs: readPositiveInt(options.pdfTimeoutMs || process.env.AUTO_JOB_PDF_TIMEOUT_MS, 25000, 30000),
      rateLimitMs: readPositiveInt(options.rateLimitMs || process.env.AUTO_JOB_RATE_LIMIT_MS, 1500, 10000)
    };
    const snapshot = await db.ref("autoJobSources").get();
    const sources = [];
    if (snapshot.exists()) {
      snapshot.forEach((child) => {
        const source = normalizeSource(child.key, child.val() || {});
        if (source.enabled && source.url) sources.push(source);
      });
    }
    sources.sort((a, b) => Number(a.sourcePriority || sourcePriorityValue(a)) - Number(b.sourcePriority || sourcePriorityValue(b)));
    const results = [];
    for (const source of sources.slice(0, limits.sourceLimit)) {
      if (limits.remainingDrafts <= 0 || limits.remainingPages <= 0) break;
      results.push(await checkOneAutoJobSource(db, source, limits));
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
      skippedDuplicateCount: results.reduce((sum, item) => sum + Number(item.skippedDuplicates || 0), 0),
      pageFetchCount: results.reduce((sum, item) => sum + Number(item.pageFetches || 0), 0),
      limits: {
        draftLimit: readPositiveInt(options.limit || options.fetchLimit || process.env.AUTO_JOB_FETCH_LIMIT, AUTO_JOB_DEFAULT_DRAFT_LIMIT, AUTO_JOB_MAX_DRAFT_LIMIT),
        pageLimit: readPositiveInt(options.pageLimit || process.env.AUTO_JOB_PAGE_LIMIT, AUTO_JOB_DEFAULT_PAGE_LIMIT, AUTO_JOB_MAX_PAGE_LIMIT),
        perSourceLimit: limits.perSourceLimit
      },
      errorCount: results.filter((item) => !item.ok).length
    };
    await db.ref("autoJobCheckerStatus").set(summary);
    await logAutoJob(db, {
      level: summary.errorCount ? "warning" : "success",
      message: `Checker finished: ${summary.checkedCount} sources, ${summary.pageFetchCount} pages, ${summary.newDraftCount} new drafts, ${summary.skippedDuplicateCount} duplicates skipped`
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
  const draft = brandDraftForEmitra(enrichJobAutomation({ ...currentDraft, ...(payload.draft || {}) }, draftId));
  if (!toText(draft.title)) {
    const error = new Error("Draft title required");
    error.statusCode = 400;
    throw error;
  }
  if (String(currentDraft.checkerStatus || "").toLowerCase() === "published" && currentDraft.publishedJobId) {
    const error = new Error(`Draft already published: ${currentDraft.publishedJobId}`);
    error.statusCode = 409;
    throw error;
  }
  const validation = validateCrawlerDraftQuality(draft);
  if (validation.missing.length) {
    await db.ref(`autoJobDrafts/${draftId}`).update({
      checkerStatus: "needs_review",
      reviewReason: validation.reviewReason,
      missingRequiredFields: validation.missing,
      validationStatus: validation.validationStatus,
      generatedJson: JSON.stringify(validation.generated, null, 2),
      updatedAt: nowStamp()
    });
    const error = new Error(validation.reviewReason);
    error.statusCode = 409;
    throw error;
  }
  const duplicate = await existingPublishedDuplicate(db, draft, draftId);
  if (duplicate) {
    const error = new Error(`Duplicate live post found: ${duplicate.title || duplicate.jobId}`);
    error.statusCode = 409;
    throw error;
  }
  const target = draft.postTarget || "latestJob";
  const now = nowStamp();
  const jobRef = db.ref("LatestJobs").push();
  const jobId = jobRef.key;
  const seo = buildSeoFields(draft, jobId);
  const seoStorage = buildSeoStorageFields(jobId, { ...draft, ...seo });
  const autoSendChannels = Array.isArray(payload.autoSendChannels)
    ? payload.autoSendChannels.map((item) => String(item || "").toLowerCase()).filter((channel) => channel !== "telegram")
    : [];
  const job = brandDraftForEmitra({
    title: toText(draft.title),
    department: toText(draft.department),
    totalPosts: toText(draft.totalPosts),
    postDate: toText(draft.postDate),
    startDate: toText(draft.startDate || "Update Soon"),
    lastApplyDate: toText(draft.lastApplyDate || draft.lastDate || "Update Soon"),
    lastDate: toText(draft.lastDate || draft.lastApplyDate || "Update Soon"),
    qualification: toText(draft.qualification || "Update Soon"),
    importantDates: toText(draft.importantDates),
    applicationFee: draft.applicationFee || draft.applicationFees || "",
    applicationFees: draft.applicationFees || draft.applicationFee || "",
    applicationFeeManual: toText(draft.applicationFeeManual || draft.feeDetails || draft.feesDetails),
    ageLimit: draft.ageLimit || draft.ageLimitManual || "",
    ageLimitManual: toText(draft.ageLimitManual || ""),
    vacancyDetails: draft.vacancyDetails || "",
    vacancyDetailsManual: toText(draft.vacancyDetailsManual || ""),
    selectionProcess: toText(draft.selectionProcess),
    howToApply: toText(draft.howToApply),
    feeDetails: toText(draft.feeDetails || draft.applicationFeeManual),
    generalObcFee: toText(draft.generalObcFee),
    scStFee: toText(draft.scStFee),
    femaleFee: toText(draft.femaleFee),
    phCandidateFee: toText(draft.phCandidateFee),
    allCandidateFee: toText(draft.allCandidateFee),
    singleExamFee: toText(draft.singleExamFee),
    bothExamFee: toText(draft.bothExamFee),
    paymentMode: toText(draft.paymentMode),
    applyLink: toText(draft.applyLink || "#"),
    applyOnline: toText(draft.applyOnline || draft.applyLink || "#"),
    detailLink: toText(draft.detailLink || draft.sourceLink || "#"),
    officialNotification: toText(draft.officialNotification || draft.detailLink || draft.sourceLink || "#"),
    officialWebsite: isAggregatorPortalUrl(draft.officialWebsite || draft.officialLink) ? "" : toText(draft.officialWebsite || draft.officialLink),
    sourceName: toText(draft.sourceName),
    sourceLink: toText(draft.sourceLink),
    type: toText(draft.type || (target === "currentAffairs" ? "Current Affairs" : "Online Form")),
    postTarget: target,
    postStatus: "published",
    displayOrder: "1",
    ...seoStorage,
    notificationSummary: String(draft.notificationSummary || "").trim() || buildNotificationSummary(draft),
    whatsappPostText: String(draft.whatsappPostText || "").trim(),
    detailLayout: toText(draft.detailLayout || "table"),
    pageContent: toText(draft.pageContent),
    autoCheckerDraftId: draftId,
    createdAt: now,
    updatedAt: now
  });
  job.whatsappPostText = job.whatsappPostText || buildWhatsappPostText(jobId, job);
  ["admitCardLink", "resultLink", "syllabusLink", "answerKeyLink"].forEach((key) => {
    if (draft[key]) job[key] = toText(draft[key]);
  });
  if (autoSendChannels.includes("whatsapp")) {
    const prepared = await prepareWhatsappShare(job, jobId, aiOptionsFromRequest(payload));
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
        if (target !== "latestJob" && target !== "currentAffairs") {
          updates[`portalItems/${target}/job_${child.key}/displayOrder`] = nextOrder;
          updates[`portalItems/${target}/job_${child.key}/updatedAt`] = now;
        }
      }
    });
  }
  updates[`LatestJobs/${jobId}`] = job;
  if (target !== "latestJob" && target !== "currentAffairs") {
    updates[`portalItems/${target}/job_${jobId}`] = {
      source: "LatestJobs",
      sourceJobId: jobId,
      jobTitle: job.title,
      sourceName: job.sourceName,
      sourceLink: job.sourceLink,
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
  draftDuplicateCacheKeys(job).forEach((key) => {
    updates[`autoJobSeen/${key}`] = {
      title: job.title,
      link: job.sourceLink || job.detailLink || "",
      sourceId: draft.sourceId || "",
      sourceName: draft.sourceName || "",
      category: target,
      status: "published",
      firstSeenAt: now,
      draftId,
      publishedJobId: jobId
    };
  });
  [job.sourceLink, job.detailLink, job.applyLink, job.officialWebsite].filter(Boolean).forEach((url) => {
    const key = autoJobUrlCacheKey(url);
    updates[`autoJobUrlCache/${key}`] = {
      title: job.title,
      link: url,
      normalizedLink: normalizeProcessedUrl(url),
      sourceId: draft.sourceId || "",
      sourceName: draft.sourceName || "",
      category: target,
      status: "published",
      firstSeenAt: currentDraft.createdAt || now,
      publishedAt: now,
      draftId,
      publishedJobId: jobId
    };
  });
  await db.ref().update(updates);
  const sent = [];
  for (const channel of autoSendChannels) {
    try {
      if (channel === "telegram") {
        await sendTelegramMessage(buildTelegramPostText(jobId, job));
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

async function requireFirebaseUser(req) {
  const db = getAdminDb();
  if (!admin || !db) {
    const error = new Error("Firebase Admin SDK is not configured");
    error.statusCode = 503;
    throw error;
  }
  const authHeader = String(req.headers.authorization || "");
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) {
    const error = new Error("User token missing");
    error.statusCode = 401;
    throw error;
  }
  const decoded = await admin.auth().verifyIdToken(token);
  if (!decoded.uid) {
    const error = new Error("Valid user login required");
    error.statusCode = 401;
    throw error;
  }
  return { decoded, db };
}

async function requireFirebaseUserApi(req, res, next) {
  try {
    const context = await requireFirebaseUser(req);
    req.firebaseUserContext = context;
    return next();
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      ok: false,
      error: error.message || "User verification failed"
    });
  }
}

async function requireAdminApi(req, res, next) {
  try {
    await requireAdmin(req);
    return next();
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Admin verification failed"
    });
  }
}

function getSupabaseAdminClient() {
  const storageKey = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_PUBLISHABLE_KEY;
  if (!SUPABASE_URL || !storageKey) {
    const error = new Error("PDF upload storage config missing. NEXT_PUBLIC_SUPABASE_URL aur NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY / SUPABASE_SERVICE_ROLE_KEY set karein.");
    error.statusCode = 503;
    throw error;
  }
  if (!supabaseAdminClient) {
    supabaseAdminClient = createSupabaseClient(SUPABASE_URL, storageKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }
  return supabaseAdminClient;
}

function getPdfStorageErrorMessage(error) {
  const message = String(error?.message || error?.error || error || "").trim();
  if (!message) return "PDF upload storage error";
  if (/bucket/i.test(message) && /(not found|does not exist|missing)/i.test(message)) {
    return `PDF upload bucket '${PDF_VERIFICATION_BUCKET}' Supabase me nahi mila. Bucket create karein ya SUPABASE_PDF_VERIFICATION_BUCKET env sahi karein.`;
  }
  if (/(jwt|apikey|api key|unauthorized|forbidden|permission|not allowed|row level security|rls)/i.test(message)) {
    return SUPABASE_SERVICE_ROLE_KEY
      ? "Supabase PDF upload permission fail. SUPABASE_SERVICE_ROLE_KEY aur storage bucket policy check karein."
      : "Supabase PDF upload permission fail. Supabase bucket RLS policy aur publishable key permissions check karein.";
  }
  return `Supabase PDF upload fail: ${message}`;
}

const pdfVerificationRequestUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: PDF_SIGNATURE_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    const name = String(file.originalname || "").toLowerCase();
    const type = String(file.mimetype || "").toLowerCase();
    if (type !== "application/pdf" && !name.endsWith(".pdf")) {
      return cb(new Error("Only PDF files are allowed"));
    }
    return cb(null, true);
  }
});

app.get("/api/health", (req, res) => {
  res.json(buildServerStatus({ message: "Admin API is running" }));
});

app.post("/api/health", (req, res) => {
  res.json(buildServerStatus({ message: "Admin API is running" }));
});

function detectCertificateNumberFromText(text = "") {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  const patterns = [
    /\b(\d{12}|\d{16})\b/,
    /(?:certificate|cert\.?|प्रमाण\s*पत्र)\s*(?:number|no\.?|संख्या|क्रमांक)?\s*[:\-]?\s*([A-Z0-9][A-Z0-9/-]{4,40})/i,
    /(?:verification|reference|receipt|transaction|application|token)\s*(?:number|no\.?|id)?\s*[:\-]?\s*([A-Z0-9][A-Z0-9/-]{4,40})/i,
    /\b([A-Z]{2,6}[/-]?\d{4,}[A-Z0-9/-]*)\b/i,
    /\b(\d{12,16})\b/
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return "";
}

const RAJASTHAN_EMITRA_VERIFICATION_URL = "https://emitra.rajasthan.gov.in/emitra/online-verification";

async function lookupRajasthanEmitraVerification(certificateNumber = "", qrText = "") {
  const number = String(certificateNumber || "").trim();
  const qr = String(qrText || "").trim();
  const verificationUrl = number
    ? `${RAJASTHAN_EMITRA_VERIFICATION_URL}?transactionId=${encodeURIComponent(number)}`
    : RAJASTHAN_EMITRA_VERIFICATION_URL;

  if (/\bSUCCESS\b/i.test(qr) && /(emitra|rajasthan)/i.test(qr)) {
    return {
      verificationStatus: "VERIFIED",
      source: "Rajasthan eMitra Portal",
      verificationUrl
    };
  }

  const apiUrl = String(process.env.EMITRA_VERIFICATION_API_URL || "").trim();
  if (apiUrl && number) {
    try {
      const url = new URL(apiUrl);
      url.searchParams.set("transactionId", number);
      const response = await fetch(url, { headers: { Accept: "application/json,text/plain,*/*" } });
      const bodyText = await response.text();
      let body = null;
      try { body = JSON.parse(bodyText); } catch (_err) {}
      const statusText = String(body?.status || body?.verificationStatus || body?.data?.status || bodyText || "");
      if (/\bSUCCESS\b/i.test(statusText)) {
        return {
          verificationStatus: "VERIFIED",
          source: "Rajasthan eMitra Portal",
          verificationUrl
        };
      }
      if (/\b(FAILED|INVALID|NOT_FOUND|REJECTED)\b/i.test(statusText)) {
        return {
          verificationStatus: "NOT_VERIFIED",
          source: "Rajasthan eMitra Portal",
          verificationUrl
        };
      }
    } catch (_err) {}
  }

  return {
    verificationStatus: "UNKNOWN",
    source: "Rajasthan eMitra Portal",
    verificationUrl
  };
}

function normalizeSignatureStatus(status = "") {
  const value = String(status || "").toUpperCase();
  if (value === "VALID") return "Valid";
  if (value === "INVALID" || value === "MODIFIED") return "Invalid";
  return "UNKNOWN";
}

function detectVisibleSignatureStatus(text = "") {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  if (/validity\s+unknown/i.test(value)) return "UNKNOWN";
  if (/signature\s+valid/i.test(value)) return "VALID";
  if (/signature\s+invalid|signature\s+not\s+verified/i.test(value)) return "INVALID";
  return "";
}

const verifiedPdfDownloads = new Map();

function parsePdfLiteral(value = "") {
  return String(value || "")
    .replace(/\\([()\\])/g, "$1")
    .replace(/\\r/g, "\r")
    .replace(/\\n/g, "\n")
    .trim();
}

function parsePdfDate(value = "") {
  const text = String(value || "").trim();
  const match = text.match(/^D:(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?([+-]\d{2})?'?(\d{2})?/);
  if (!match) return text;
  const [, y, mo, d, h = "00", mi = "00", s = "00", zone = "", zm = ""] = match;
  return `${d}-${mo}-${y} ${h}:${mi}:${s}${zone ? ` ${zone}:${zm || "00"}` : ""}`.trim();
}

function findPdfLiteralValue(source = "", key = "") {
  const index = source.indexOf(`/${key}`);
  if (index < 0) return "";
  const start = source.indexOf("(", index);
  if (start < 0) return "";
  let depth = 0;
  let escaped = false;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === "(") depth += 1;
    if (ch === ")") {
      depth -= 1;
      if (depth === 0) return parsePdfLiteral(source.slice(start + 1, i));
    }
  }
  return "";
}

function extractPdfSignatureFallback(buffer) {
  const source = buffer.toString("latin1");
  const sigIndex = source.indexOf("/Type/Sig");
  const signatureSlice = sigIndex >= 0 ? source.slice(sigIndex, Math.min(source.length, sigIndex + 50000)) : source;
  const result = {
    signerName: findPdfLiteralValue(signatureSlice, "Name"),
    signingTime: parsePdfDate(findPdfLiteralValue(signatureSlice, "M")),
    reason: findPdfLiteralValue(signatureSlice, "Reason"),
    location: findPdfLiteralValue(signatureSlice, "Location"),
    certificateIssuer: "",
    certificateSubject: "",
    certificateValidFrom: "",
    certificateValidTo: ""
  };
  const contentsMatch = signatureSlice.match(/\/Contents\s*<([0-9a-fA-F\s]+)>/);
  if (contentsMatch) {
    try {
      const certText = Buffer.from(contentsMatch[1].replace(/\s+/g, ""), "hex").toString("latin1");
      result.certificateIssuer =
        certText.match(/XtraTrust Sub CA 2022/i)?.[0]
        || certText.match(/XtraTrust DigiSign Private Limited/i)?.[0]
        || "";
      result.certificateSubject = result.signerName || "";
      const validityMatch = certText.match(/(\d{12})Z[\s\S]{0,80}?(\d{12})Z/);
      if (validityMatch) {
        const fmt = (value) => `${value.slice(4, 6)}-${value.slice(2, 4)}-20${value.slice(0, 2)}`;
        result.certificateValidFrom = fmt(validityMatch[1]);
        result.certificateValidTo = fmt(validityMatch[2]);
      }
    } catch (_err) {}
  }
  return result;
}

function verifyLegacyAdobePkcs7Sha1(buffer) {
  const source = buffer.toString("latin1");
  const byteRangeMatch = source.match(/\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/);
  const contentsMatch = source.match(/\/Contents\s*<([0-9a-fA-F\s]+)>/);
  if (!byteRangeMatch || !contentsMatch) {
    return { verified: false, modified: "Unknown", reason: "Signature byte range not found" };
  }
  try {
    const [start1, len1, start2, len2] = byteRangeMatch.slice(1).map(Number);
    const signedBytes = Buffer.concat([
      buffer.slice(start1, start1 + len1),
      buffer.slice(start2, start2 + len2)
    ]);
    const byteRangeCoversWholeFile = start1 === 0 && (start2 + len2) === buffer.length;
    const signatureBytes = Buffer.from(contentsMatch[1].replace(/\s+/g, ""), "hex");
    const asn1 = forge.asn1.fromDer(forge.util.createBuffer(signatureBytes.toString("binary")), {
      strict: false,
      parseAllBytes: false,
      decodeBitStrings: true
    });
    const message = forge.pkcs7.messageFromAsn1(asn1);
    const signedDigest = message.rawCapture?.content?.value?.[0]?.value || "";
    const expectedDigestHex = crypto.createHash("sha1").update(signedBytes).digest("hex");
    const actualDigestHex = Buffer.from(signedDigest, "binary").toString("hex");
    const digestMatches = expectedDigestHex === actualDigestHex;
    const signerCert = message.certificates?.[0];
    const signature = message.rawCapture?.signature || "";
    let signatureMatches = false;
    if (signerCert && signature) {
      const md = forge.md.sha256.create();
      md.update(signedDigest);
      signatureMatches = signerCert.publicKey.verify(md.digest().bytes(), signature);
    }
    return {
      verified: digestMatches && signatureMatches && byteRangeCoversWholeFile,
      modified: !byteRangeCoversWholeFile || !digestMatches,
      digestMatches,
      signatureMatches,
      byteRangeCoversWholeFile,
      reason: digestMatches && signatureMatches ? "" : "PKCS#7 digest/signature mismatch"
    };
  } catch (error) {
    return { verified: false, modified: "Unknown", reason: error.message || "Legacy PKCS#7 validation failed" };
  }
}

function storeVerifiedPdfDownload(pdfBuffer, fileName = "verified-certificate.pdf") {
  const id = crypto.randomBytes(16).toString("hex");
  const safeName = path.basename(fileName).replace(/[^a-z0-9._-]+/gi, "-") || "verified-certificate.pdf";
  verifiedPdfDownloads.set(id, {
    buffer: Buffer.from(pdfBuffer),
    fileName: safeName,
    createdAt: Date.now()
  });
  setTimeout(() => verifiedPdfDownloads.delete(id), PDF_SIGNATURE_TTL_MS).unref?.();
  return `/download/verified-pdf/${id}`;
}

async function createVerifiedPdfBuffer(originalPdfBuffer, signatureData = {}) {
  const pdfDoc = await LibPdfDocument.load(originalPdfBuffer, { ignoreEncryption: true });
  const pages = pdfDoc.getPages();
  if (!pages.length) {
    throw new Error("PDF page not found");
  }
  const firstPage = pages[0];
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const stampX = 24;
  const stampY = 26;
  const stampW = 235;
  const stampH = 92;
  const signerName = String(signatureData.signerName || "").trim();
  const signDate = String(signatureData.signDate || signatureData.signingDate || "").trim();
  const reason = String(signatureData.reason || "").trim();
  const location = String(signatureData.location || "").trim();

  firstPage.drawRectangle({
    x: stampX,
    y: stampY,
    width: stampW,
    height: stampH,
    borderColor: rgb(0.05, 0.55, 0.21),
    borderWidth: 1.6,
    color: rgb(0.93, 0.99, 0.95),
    opacity: 0.96
  });
  firstPage.drawCircle({
    x: stampX + 24,
    y: stampY + stampH - 25,
    size: 13,
    color: rgb(0.05, 0.55, 0.21)
  });
  firstPage.drawLine({
    start: { x: stampX + 15, y: stampY + stampH - 27 },
    end: { x: stampX + 22, y: stampY + stampH - 36 },
    thickness: 3,
    color: rgb(1, 1, 1)
  });
  firstPage.drawLine({
    start: { x: stampX + 22, y: stampY + stampH - 36 },
    end: { x: stampX + 36, y: stampY + stampH - 14 },
    thickness: 3,
    color: rgb(1, 1, 1)
  });

  const textX = stampX + 46;
  const topY = stampY + stampH - 22;
  firstPage.drawText("Signature valid", {
    x: textX,
    y: topY,
    size: 12,
    font: boldFont,
    color: rgb(0.02, 0.42, 0.16)
  });
  [
    `Digitally signed by ${signerName}`,
    `Date: ${signDate}`,
    `Reason: ${reason}`,
    `Location: ${location}`
  ].forEach((line, index) => {
    firstPage.drawText(line, {
      x: textX,
      y: topY - 17 - (index * 13),
      size: 9,
      font: regularFont,
      color: rgb(0.02, 0.18, 0.10)
    });
  });

  const bytes = await pdfDoc.save({ useObjectStreams: false });
  return Buffer.from(bytes);
}

const renderPdfVerifyUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const name = String(file.originalname || "").toLowerCase();
    const type = String(file.mimetype || "").toLowerCase();
    if (type !== "application/pdf" && !name.endsWith(".pdf")) {
      return cb(new Error("Only PDF files are allowed"));
    }
    return cb(null, true);
  }
});

app.post("/verify-pdf", renderPdfVerifyUpload.single("pdf"), async (req, res) => {
  let tempPath = "";
  try {
    const buffer = req.file?.buffer;
    if (!buffer) {
      return res.status(400).json({
        valid: false,
        message: "PDF file is required",
        certificateNumber: "",
        signatureStatus: "UNKNOWN",
        qrStatus: "",
        trustStatus: "Pending Verification"
      });
    }
    if (buffer.length < 5 || buffer.slice(0, 5).toString("utf8") !== "%PDF-") {
      return res.status(400).json({
        valid: false,
        message: "Invalid PDF file",
        certificateNumber: "",
        signatureStatus: "UNKNOWN",
        qrStatus: "",
        trustStatus: "Pending Verification"
      });
    }
    if (!pdfParse) {
      return res.status(503).json({
        valid: false,
        message: "PDF parser not available",
        certificateNumber: "",
        signatureStatus: "UNKNOWN",
        qrStatus: "",
        trustStatus: "Pending Verification"
      });
    }
    fs.mkdirSync(PDF_SIGNATURE_TEMP_DIR, { recursive: true });
    tempPath = path.join(PDF_SIGNATURE_TEMP_DIR, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}.pdf`);
    await fs.promises.writeFile(tempPath, buffer);

    const signatureResult = await runPdfSignatureHelper(tempPath);
    const signatureFallback = extractPdfSignatureFallback(buffer);
    ["signerName", "signingTime", "reason", "location", "certificateIssuer", "certificateSubject", "certificateValidFrom", "certificateValidTo"].forEach((key) => {
      if (!signatureResult[key] && signatureFallback[key]) signatureResult[key] = signatureFallback[key];
    });
    const legacyValidation = verifyLegacyAdobePkcs7Sha1(buffer);
    if (legacyValidation.verified) {
      signatureResult.documentModifiedAfterSigning = false;
      signatureResult.cryptographicSignatureValid = true;
    } else if (legacyValidation.modified === true) {
      signatureResult.signatureStatus = "MODIFIED";
      signatureResult.documentModifiedAfterSigning = true;
    }
    const qrText = String(signatureResult.qrText || "").trim();
    const qrDetected = Boolean(signatureResult.qrFound && qrText);
    let text = "";
    try {
      const parsed = await pdfParse(buffer);
      text = String(parsed?.text || "");
    } catch (_err) {
      text = "";
    }
    const visibleSignatureStatus = detectVisibleSignatureStatus(text);
    if (legacyValidation.verified) {
      if (visibleSignatureStatus) {
        signatureResult.signatureStatus = visibleSignatureStatus;
      } else if (String(signatureResult.signatureStatus || "").toUpperCase() !== "VALID") {
        signatureResult.signatureStatus = "UNKNOWN";
      }
    }
    const certificateNumber = detectCertificateNumberFromText(`${qrText} ${text}`);
    const certificateIssuer = String(signatureResult.certificateIssuer || "").trim();
    const signatureStatus = normalizeSignatureStatus(signatureResult.signatureStatus);
    const emitraLookup = await lookupRajasthanEmitraVerification(certificateNumber, qrText);
    const certificateVerified = emitraLookup.verificationStatus === "VERIFIED";
    const certificateVerificationStatus = certificateVerified
      ? "VERIFIED"
      : certificateNumber
        ? "PENDING / CHECK VIA EMITRA"
        : emitraLookup.verificationStatus;
    const modifiedConfirmed = signatureResult.documentModifiedAfterSigning === true || String(signatureResult.signatureStatus || "").toUpperCase() === "MODIFIED";
    const trustStatus = certificateVerified && signatureStatus === "Valid" && /trusted/i.test(String(signatureResult.trustStatus || ""))
      ? "Trusted"
      : emitraLookup.verificationStatus === "NOT_VERIFIED" || modifiedConfirmed
        ? "Unknown"
        : "Pending Verification";

    let message = "Validity Unknown";
    if (signatureStatus === "Valid") {
      message = "Signature Valid";
    } else if (certificateVerified) {
      message = "Certificate Verified via Rajasthan eMitra";
    } else if (certificateNumber) {
      message = "Check via Official eMitra";
    } else if (!certificateNumber) {
      message = "Validity Unknown";
    }

    let signatureMessage = `Digital Signature Status: ${signatureStatus}`;
    if (signatureStatus === "Invalid") {
      signatureMessage = "Digital Signature Status: Invalid";
    } else if (signatureStatus === "UNKNOWN") {
      signatureMessage = "Digital Signature Status: UNKNOWN";
    }

    const issuerStatus = certificateIssuer ? "Detected" : "Not Detected";
    const canGenerateVerifiedPdf = Boolean(certificateNumber) && signatureStatus === "Valid";
    // Do not draw on an already signed PDF. Any post-signing visual stamp changes
    // the signed byte range and Foxit/Adobe will mark the original signature invalid.
    const verifiedPdfBuffer = canGenerateVerifiedPdf ? Buffer.from(buffer) : null;
    const relativeDownloadUrl = verifiedPdfBuffer
      ? storeVerifiedPdfDownload(verifiedPdfBuffer, `verified-${path.basename(req.file.originalname || "certificate.pdf")}`)
      : "";
    const requestBaseUrl = `${req.protocol}://${req.get("host")}`;
    const downloadUrl = relativeDownloadUrl ? `${requestBaseUrl}${relativeDownloadUrl}` : "";

    return res.json({
      valid: signatureStatus === "Valid",
      message,
      certificateNumber,
      verificationStatus: emitraLookup.verificationStatus,
      certificateVerificationStatus,
      source: emitraLookup.source,
      verificationUrl: emitraLookup.verificationUrl,
      officialVerifyUrl: emitraLookup.verificationUrl,
      signatureStatus,
      signatureMessage,
      cryptographicSignatureValid: legacyValidation.verified || signatureResult.cryptographicSignatureValid === true,
      visibleSignatureStatus,
      qrStatus: qrDetected ? "QR Detected" : "",
      trustStatus,
      issuerStatus,
      certificateIssuer,
      certificateSubject: signatureResult.certificateSubject || "",
      signerName: signatureResult.signerName || "",
      signingDate: signatureResult.signingTime || "",
      signDate: signatureResult.signingTime || "",
      reason: signatureResult.reason || "",
      location: signatureResult.location || "",
      documentModifiedAfterSigning: signatureResult.documentModifiedAfterSigning ?? "Unknown",
      qrText,
      downloadUrl,
      verifiedPdfUrl: downloadUrl,
      verifiedPdfBase64: verifiedPdfBuffer ? verifiedPdfBuffer.toString("base64") : "",
      verifiedPdfFileName: downloadUrl ? `verified-${path.basename(req.file.originalname || "certificate.pdf")}` : "",
      verifiedPdfNote: verifiedPdfBuffer ? "Original signed PDF copy. No extra stamp added because editing a signed PDF invalidates its signature." : ""
    });
  } catch (error) {
    const status = error.code === "LIMIT_FILE_SIZE" ? 413 : 500;
    return res.status(status).json({
      valid: false,
      message: error.code === "LIMIT_FILE_SIZE" ? "PDF 20MB se chhoti honi chahiye" : (error.message || "PDF verification failed"),
      certificateNumber: "",
      signatureStatus: "UNKNOWN",
      qrStatus: "",
      trustStatus: "Pending Verification"
    });
  } finally {
    if (tempPath) fs.promises.unlink(tempPath).catch(() => {});
  }
});

app.post("/api/verify-pdf-signature", requireAdminApi, pdfSignatureUpload.single("pdf"), async (req, res) => {
  const uploadedPath = req.file?.path || "";
  try {
    if (!req.file || !uploadedPath) {
      return res.status(400).json({ success: false, message: "PDF file required" });
    }
    const headerBuffer = await fs.promises.readFile(uploadedPath);
    if (headerBuffer.length < 5 || headerBuffer.slice(0, 5).toString("utf8") !== "%PDF-") {
      return res.status(400).json({ success: false, message: "Valid PDF file required" });
    }
    const [helperResult, textResult] = await Promise.all([
      runPdfSignatureHelper(uploadedPath),
      readPdfTextSafe(uploadedPath)
    ]);
    const visibleSignals = extractVisiblePdfSignals(textResult.text);
    const signatureStatus = helperResult.signatureStatus || (helperResult.embeddedSignatureFound ? "NOT_VERIFIED" : "NO_SIGNATURE");
    const finalStatus = getFinalPdfSignatureStatus(helperResult, visibleSignals);
    const response = {
      success: true,
      fileName: req.file.originalname || "certificate.pdf",
      fileType: req.file.mimetype || "application/pdf",
      embeddedSignatureFound: Boolean(helperResult.embeddedSignatureFound),
      signatureStatus,
      documentModifiedAfterSigning: helperResult.documentModifiedAfterSigning ?? "Unknown",
      signerName: helperResult.signerName || visibleSignals.visibleSignerName || "",
      signingDate: helperResult.signingTime || visibleSignals.visibleSigningDate || "",
      reason: helperResult.reason || visibleSignals.reason || "",
      location: helperResult.location || visibleSignals.location || "",
      certificateIssuer: helperResult.certificateIssuer || "",
      certificateSubject: helperResult.certificateSubject || "",
      certificateValidFrom: helperResult.certificateValidFrom || "",
      certificateValidTo: helperResult.certificateValidTo || "",
      trustStatus: helperResult.trustStatus || "",
      visibleSignatureTextFound: visibleSignals.visibleSignatureTextFound,
      visibleSignatureStatusText: visibleSignals.visibleSignatureStatusText,
      visiblePhrases: visibleSignals.knownPhrases,
      qrFound: Boolean(helperResult.qrFound || visibleSignals.qrFound),
      qrText: helperResult.qrText || visibleSignals.qrText,
      verificationNumber: visibleSignals.verificationNumber || helperResult.qrText || "",
      finalStatus,
      message: finalStatus,
      errors: [...(helperResult.errors || []), ...(textResult.error ? [textResult.error] : [])].filter(Boolean),
      reportDownloadUrl: ""
    };
    const reportId = await createPdfSignatureReport(response);
    response.reportDownloadUrl = `/api/verification-report/${reportId}`;
    return res.json(response);
  } catch (error) {
    const status = error.code === "LIMIT_FILE_SIZE" ? 413 : 500;
    return res.status(status).json({
      success: false,
      message: error.code === "LIMIT_FILE_SIZE" ? "PDF 20MB se chhoti honi chahiye" : (error.message || "PDF verification failed")
    });
  } finally {
    if (uploadedPath) fs.promises.unlink(uploadedPath).catch(() => {});
  }
});

app.get("/api/verification-report/:id", (req, res) => {
  const id = String(req.params.id || "").replace(/[^a-f0-9]/gi, "");
  const record = pdfSignatureReports.get(id);
  if (!record || !record.path || Date.now() - Number(record.createdAt || 0) > PDF_SIGNATURE_TTL_MS) {
    return res.status(404).send("Report expired or not found");
  }
  return res.download(record.path, "emitra-pdf-signature-verification-report.pdf");
});

app.get("/download/verified-pdf/:id", (req, res) => {
  const id = String(req.params.id || "").replace(/[^a-f0-9]/gi, "");
  const record = verifiedPdfDownloads.get(id);
  if (!record || Date.now() - Number(record.createdAt || 0) > PDF_SIGNATURE_TTL_MS) {
    return res.status(404).send("Verified PDF expired or not found");
  }
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${record.fileName}"`);
  return res.send(record.buffer);
});

function cleanStorageFileName(name = "certificate.pdf") {
  return path.basename(String(name || "certificate.pdf"))
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/-+/g, "-")
    .slice(0, 90) || "certificate.pdf";
}

function buildLocalPdfStoragePath(storagePath = "") {
  const relative = String(storagePath || "")
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean)
    .map((part) => part.replace(/[^a-z0-9._-]+/gi, "-").replace(/-+/g, "-").slice(0, 80))
    .join("/");
  const fallbackName = relative || `pdf-${Date.now()}.pdf`;
  return path.join(PDF_VERIFICATION_LOCAL_DIR, fallbackName);
}

async function ensurePdfVerificationBucket(supabase) {
  if (!SUPABASE_SERVICE_ROLE_KEY) return true;
  try {
    const { error } = await supabase.storage.createBucket(PDF_VERIFICATION_BUCKET, { public: true });
    if (error && !/(already|exists|exist)/i.test(error.message || "")) {
      console.warn("Supabase bucket ensure failed", error.message);
    }
  } catch (error) {
    console.warn("Supabase bucket ensure warning", error.message);
  }
  return true;
}

async function uploadPdfToStorage(buffer, storagePath = "", originalName = "certificate.pdf") {
  const safeStoragePath = String(storagePath || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "") || `upload-${Date.now()}-${cleanStorageFileName(originalName)}`;
  try {
    const supabase = getSupabaseAdminClient();
    await ensurePdfVerificationBucket(supabase);
    const { error } = await supabase.storage
      .from(PDF_VERIFICATION_BUCKET)
      .upload(safeStoragePath, Buffer.from(buffer), {
        contentType: "application/pdf",
        upsert: false
      });
    if (!error) {
      return {
        storageKind: "supabase",
        storagePath: safeStoragePath,
        downloadUrl: ""
      };
    }
    throw error;
  } catch (uploadError) {
    const localFilePath = buildLocalPdfStoragePath(safeStoragePath);
    fs.mkdirSync(path.dirname(localFilePath), { recursive: true });
    await fs.promises.writeFile(localFilePath, Buffer.from(buffer));
    return {
      storageKind: "local",
      storagePath: path.relative(PDF_VERIFICATION_LOCAL_DIR, localFilePath).split(path.sep).join("/"),
      localFilePath,
      downloadUrl: `/api/pdf-verification/file/${encodeURIComponent(path.relative(PDF_VERIFICATION_LOCAL_DIR, localFilePath).split(path.sep).join("/"))}`
    };
  }
}

async function resolvePdfVerificationDownloadUrl(record = {}, fileKind = "verified") {
  const storagePath = fileKind === "original" ? record.originalPath : record.verifiedPath;
  const storageKind = fileKind === "original" ? record.originalStorageProvider : record.verifiedStorageProvider;
  const downloadUrl = fileKind === "original" ? record.originalDownloadUrl : record.verifiedDownloadUrl;
  if (downloadUrl) return downloadUrl;
  if (storageKind === "local") {
    const localPath = fileKind === "original" ? record.originalLocalPath : record.verifiedLocalPath;
    if (localPath) {
      return `/api/pdf-verification/file/${encodeURIComponent(localPath)}`;
    }
  }
  if (!storagePath) return "";
  try {
    const supabase = getSupabaseAdminClient();
    const { data: publicData } = supabase.storage.from(PDF_VERIFICATION_BUCKET).getPublicUrl(storagePath);
    if (publicData?.publicUrl) return publicData.publicUrl;
    const { data, error } = await supabase.storage.from(PDF_VERIFICATION_BUCKET).createSignedUrl(storagePath, 60 * 10);
    if (!error && data?.signedUrl) return data.signedUrl;
  } catch (_error) {}
  return "";
}

app.get("/api/pdf-verification/file/:storagePath(*)", (req, res) => {
  try {
    const storagePath = decodeURIComponent(String(req.params.storagePath || ""));
    const normalizedPath = String(storagePath || "")
      .replace(/\\/g, "/")
      .split("/")
      .filter(Boolean)
      .join("/");
    const filePath = path.resolve(PDF_VERIFICATION_LOCAL_DIR, normalizedPath);
    const relativePath = path.relative(PDF_VERIFICATION_LOCAL_DIR, filePath);
    if (!normalizedPath || relativePath.startsWith("..") || path.isAbsolute(relativePath) || !fs.existsSync(filePath)) {
      return res.status(404).send("File not found");
    }
    return res.download(filePath, path.basename(filePath));
  } catch (_error) {
    return res.status(404).send("File not found");
  }
});

app.post("/api/pdf-verification/request", requireFirebaseUserApi, pdfVerificationRequestUpload.single("pdf"), async (req, res) => {
  try {
    const { decoded, db } = req.firebaseUserContext || await requireFirebaseUser(req);
    if (!req.file?.buffer?.length) {
      return res.status(400).json({ ok: false, error: "PDF file required" });
    }
    if (req.file.buffer.slice(0, 5).toString("utf8") !== "%PDF-") {
      return res.status(400).json({ ok: false, error: "Valid PDF file required" });
    }

    const now = Date.now();
    const uid = decoded.uid;
    const requestRef = db.ref("pdfVerificationRequests").push();
    const requestId = requestRef.key;
    const originalName = cleanStorageFileName(req.file.originalname || "certificate.pdf");
    const originalPath = `${uid}/${requestId}/original-${originalName}`;
    const uploadResult = await uploadPdfToStorage(req.file.buffer, originalPath, originalName);

    const record = {
      requestId,
      userUid: uid,
      userEmail: decoded.email || "",
      fileName: originalName,
      fileSize: req.file.size || req.file.buffer.length,
      originalPath: uploadResult.storagePath,
      originalStorageProvider: uploadResult.storageKind,
      originalLocalPath: uploadResult.storageKind === "local" ? uploadResult.storagePath : "",
      originalDownloadUrl: uploadResult.downloadUrl || "",
      verifiedPath: "",
      verifiedStorageProvider: "",
      verifiedLocalPath: "",
      verifiedDownloadUrl: "",
      bucket: PDF_VERIFICATION_BUCKET,
      status: "Pending",
      adminNote: "Admin PDF download karke manual verification karega.",
      createdAt: now,
      updatedAt: now
    };
    await Promise.all([
      requestRef.set(record),
      db.ref(`userPdfVerificationRequests/${uid}/${requestId}`).set(record)
    ]);

    return res.json({ ok: true, requestId, message: "PDF verification request submit ho gayi." });
  } catch (err) {
    const status = err.code === "LIMIT_FILE_SIZE" ? 413 : (err.statusCode || 500);
    return res.status(status).json({ ok: false, error: err.code === "LIMIT_FILE_SIZE" ? "PDF 20MB se chhoti honi chahiye" : (err.message || "PDF upload nahi hua") });
  }
});

app.post("/api/pdf-verification/download-url", async (req, res) => {
  try {
    const { decoded, db } = await requireFirebaseUser(req);
    const requestId = String(req.body?.requestId || "").trim();
    const fileKind = String(req.body?.fileKind || "verified").trim().toLowerCase();
    if (!requestId) return res.status(400).json({ ok: false, error: "Request ID required" });
    const snapshot = await db.ref(`pdfVerificationRequests/${requestId}`).get();
    if (!snapshot.exists()) return res.status(404).json({ ok: false, error: "Request not found" });
    const record = snapshot.val() || {};
    const isAdminUser = decoded.email === ADMIN_EMAIL;
    if (!isAdminUser && record.userUid !== decoded.uid) {
      return res.status(403).json({ ok: false, error: "Access denied" });
    }
    const storagePath = fileKind === "original" ? record.originalPath : record.verifiedPath;
    if (!storagePath) return res.status(404).json({ ok: false, error: "PDF not available" });
    const signedUrl = await resolvePdfVerificationDownloadUrl(record, fileKind);
    if (!signedUrl) return res.status(404).json({ ok: false, error: "PDF download URL not available" });
    return res.json({ ok: true, signedUrl, fileName: fileKind === "original" ? record.fileName : `verified-${record.fileName || "certificate.pdf"}` });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ ok: false, error: err.message });
  }
});

app.post("/admin/pdf-verification/verified-upload", requireAdminApi, pdfVerificationRequestUpload.single("pdf"), async (req, res) => {
  try {
    const { db, decoded } = await requireAdmin(req);
    const requestId = String(req.body?.requestId || "").trim();
    const adminNote = String(req.body?.adminNote || "Verified PDF uploaded by admin.").trim();
    if (!requestId) return res.status(400).json({ ok: false, error: "Request ID required" });
    if (!req.file?.buffer?.length) return res.status(400).json({ ok: false, error: "Verified PDF required" });
    if (req.file.buffer.slice(0, 5).toString("utf8") !== "%PDF-") {
      return res.status(400).json({ ok: false, error: "Valid PDF file required" });
    }
    const snapshot = await db.ref(`pdfVerificationRequests/${requestId}`).get();
    if (!snapshot.exists()) return res.status(404).json({ ok: false, error: "Request not found" });
    const oldRecord = snapshot.val() || {};
    const uid = oldRecord.userUid || "";
    const verifiedName = cleanStorageFileName(req.file.originalname || `verified-${oldRecord.fileName || "certificate.pdf"}`);
    const verifiedPath = `${uid}/${requestId}/verified-${Date.now()}-${verifiedName}`;
    const uploadResult = await uploadPdfToStorage(req.file.buffer, verifiedPath, verifiedName);
    const updates = {
      verifiedPath: uploadResult.storagePath,
      verifiedStorageProvider: uploadResult.storageKind,
      verifiedLocalPath: uploadResult.storageKind === "local" ? uploadResult.storagePath : "",
      verifiedDownloadUrl: uploadResult.downloadUrl || "",
      verifiedFileName: verifiedName,
      verifiedSize: req.file.size || req.file.buffer.length,
      status: "Verified",
      adminNote,
      verifiedAt: Date.now(),
      verifiedBy: decoded.email || ADMIN_EMAIL,
      updatedAt: Date.now()
    };
    await Promise.all([
      db.ref(`pdfVerificationRequests/${requestId}`).update(updates),
      db.ref(`userPdfVerificationRequests/${uid}/${requestId}`).update(updates)
    ]);
    return res.json({ ok: true, message: "Verified PDF user ke liye ready hai." });
  } catch (err) {
    const status = err.code === "LIMIT_FILE_SIZE" ? 413 : (err.statusCode || 500);
    return res.status(status).json({ ok: false, error: err.code === "LIMIT_FILE_SIZE" ? "PDF 20MB se chhoti honi chahiye" : (err.message || "Verified PDF upload nahi hua") });
  }
});

app.get("/sitemap.xml", async (req, res) => {
  try {
    const xml = await buildCombinedSitemap();
    res.type("application/xml").send(xml);
  } catch (err) {
    res.type("application/xml").send(readStaticSitemap());
  }
});

app.get("/sitemap-jobs.xml", async (req, res) => {
  try {
    const jobEntries = await getLiveJobSitemapEntries();
    if (!jobEntries.length) {
      res.type("application/xml").send(readStaticJobSitemap());
      return;
    }
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${jobEntries.join("\n")}
</urlset>`;
    res.type("application/xml").send(xml);
  } catch (err) {
    res.type("application/xml").send(readStaticJobSitemap());
  }
});

// Public API to read settings (no auth required for reading)
app.get("/api/settings", (req, res) => {
  try {
    const settings = readSettingsFile();
    const db = getAdminDb();
    if (!db) return res.json({ ok: true, settings });
    Promise.all([
      db.ref("quickPostSettings").get(),
      db.ref("publicSettings/visitorCounterVisibility").get()
    ])
      .then(([quickSnapshot, visitorSnapshot]) => res.json({
        ok: true,
        settings: {
          ...settings,
          quickPost: quickSnapshot.exists() ? quickSnapshot.val() : settings.quickPost,
          visitorCounterVisibility: visitorSnapshot.exists() ? visitorSnapshot.val() : settings.visitorCounterVisibility
        }
      }))
      .catch(() => res.json({ ok: true, settings }));
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err.message || err) });
  }
});

// Admin API to update settings (requires admin auth)
app.post("/api/settings", async (req, res) => {
  try {
    const { db } = await requireAdmin(req);
    const incoming = req.body && typeof req.body === "object" ? req.body : {};
    if (Object.prototype.hasOwnProperty.call(incoming, "aiProvider")) {
      incoming.aiProvider = normalizeAiProvider(incoming.aiProvider);
    }
    if (Object.prototype.hasOwnProperty.call(incoming, "aiModel")) {
      const requestedProvider = normalizeAiProvider(incoming.aiProvider || readAiSettings().provider);
      const model = String(incoming.aiModel || "").trim();
      incoming.aiModel = requestedProvider === "openrouter" ? (model || OPENROUTER_DEEPSEEK_MODEL) : "";
    }
    if (Object.prototype.hasOwnProperty.call(incoming, "openRouterModel")) {
      const model = String(incoming.openRouterModel || "").trim();
      incoming.openRouterModel = model || "";
    }
    if (Object.prototype.hasOwnProperty.call(incoming, "siteTheme")) {
      incoming.siteTheme = String(incoming.siteTheme || "premium").toLowerCase() === "classic" ? "classic" : "premium";
    }
    if (Object.prototype.hasOwnProperty.call(incoming, "toolVisibility")) {
      const visibility = incoming.toolVisibility && typeof incoming.toolVisibility === "object" && !Array.isArray(incoming.toolVisibility)
        ? incoming.toolVisibility
        : {};
      incoming.toolVisibility = Object.fromEntries(Object.entries(visibility)
        .map(([key, value]) => [
          String(key || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, ""),
          String(value || "visible").toLowerCase() === "hidden" ? "hidden" : "visible"
        ])
        .filter(([key]) => key));
    }
    const current = readSettingsFile();
    const updated = { ...current, ...incoming };
    const ok = writeSettingsFile(updated);
    if (!ok) throw new Error("Failed to write settings file");
    if (incoming.quickPost && typeof incoming.quickPost === "object") {
      await db.ref("quickPostSettings").set({ ...incoming.quickPost, updatedAt: nowStamp() }).catch(() => {});
    }
    if (Object.prototype.hasOwnProperty.call(incoming, "visitorCounterVisibility")) {
      const visibility = String(incoming.visitorCounterVisibility || "public").toLowerCase() === "private" ? "private" : "public";
      updated.visitorCounterVisibility = visibility;
      await db.ref("publicSettings/visitorCounterVisibility").set(visibility).catch(() => {});
    }
    return res.json({ ok: true, settings: updated });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ ok: false, error: String(err.message || err) });
  }
});

app.get("/api/forms-config", (req, res) => {
  try {
    return res.json({ ok: true, config: readFormsFieldsConfigFile() });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err.message || err) });
  }
});

app.post("/admin/forms-config/save", async (req, res) => {
  try {
    await requireAdmin(req);
    const incoming = req.body && typeof req.body === "object" ? req.body.config : null;
    validateFormsFieldsConfig(incoming);
    const current = readFormsFieldsConfigFile();
    const updated = {
      ...current,
      ...incoming,
      version: incoming.version || current.version || "1.0",
      updatedAt: nowStamp()
    };
    writeFormsFieldsConfigFile(updated);
    return res.json({ ok: true, config: updated });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ ok: false, error: String(err.message || err) });
  }
});

app.post("/admin/forms-template/upload", async (req, res) => {
  try {
    await requireAdmin(req);
    const requestedKey = String(req.body?.formKey || "").trim();
    const formTitle = String(req.body?.formTitle || "").trim();
    const formKey = String(req.body?.newFormKey || requestedKey).trim();
    if (!formKey || !/^[a-zA-Z0-9_-]+$/.test(formKey)) {
      return res.status(400).json({ ok: false, error: "Valid formKey required" });
    }
    const pdfBuffer = decodePdfBase64(req.body?.pdfBase64 || "");
    if (pdfBuffer.length > 15 * 1024 * 1024) {
      return res.status(400).json({ ok: false, error: "PDF 15MB se chhoti honi chahiye" });
    }
    fs.mkdirSync(FORMS_TEMPLATE_UPLOAD_DIR, { recursive: true });
    const safeName = sanitizeUploadedPdfName(req.body?.fileName || `${formKey}-template.pdf`);
    const fileName = `${formKey}-${Date.now()}-${safeName}.pdf`;
    const filePath = path.join(FORMS_TEMPLATE_UPLOAD_DIR, fileName);
    fs.writeFileSync(filePath, pdfBuffer);
    const templatePath = `/emitra-offline-form-fill/assets/uploaded-templates/${fileName}`;
    const current = readFormsFieldsConfigFile();
    if (!current.forms || typeof current.forms !== "object") current.forms = {};
    if (!current.forms[formKey] || typeof current.forms[formKey] !== "object") current.forms[formKey] = { fields: [] };
    current.forms[formKey] = {
      ...current.forms[formKey],
      title: formTitle || current.forms[formKey].title || formKey,
      downloadName: current.forms[formKey].downloadName || `${formKey}-filled.pdf`,
      template: templatePath,
      templateUpdatedAt: nowStamp()
    };
    current.updatedAt = nowStamp();
    validateFormsFieldsConfig(current);
    writeFormsFieldsConfigFile(current);
    return res.json({ ok: true, template: templatePath, config: current });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ ok: false, error: String(err.message || err) });
  }
});

app.post("/api/quick-post/fetch-links", async (req, res) => {
  try {
    await requireAdmin(req);
    const url = extractHttpUrl(req.body?.url || "");
    if (!url) return res.status(400).json({ ok: false, error: "Valid URL required" });
    const limit = readPositiveInt(req.body?.limit, 25, 80);
    const page = await fetchText(url, 22000);
    const notices = extractNotices(page.text, url, autoJobKeywords, { limit: Math.max(limit, 10) })
      .slice(0, limit)
      .map((notice) => ({ title: notice.title, url: notice.link }));
    return res.json({ ok: true, url, count: notices.length, links: notices });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ ok: false, error: err.message });
  }
});

const saveQuickPostDraft = async (db, draft = {}) => {
  draft = applyCrawlerValidation(draft);
  const sourceLink = toText(draft.sourceLink || draft.detailLink || draft.officialWebsite);
  const duplicateId = autoJobUrlCacheKey(sourceLink || draft.title);
  if (await noticeAlreadyProcessed(db, { ...draft, sourceLink })) {
    return { ok: true, skipped: true, reason: "duplicate", draftId: duplicateId };
  }
  const duplicateKeys = draftDuplicateCacheKeys({ ...draft, sourceLink });
  const now = nowStamp();
  const updates = {};
  duplicateKeys.forEach((key) => {
    updates[`autoJobSeen/${key}`] = {
      title: draft.title || "",
      link: sourceLink,
      sourceName: "Quick Post",
      category: draft.postTarget || "latestJob",
      status: draft.checkerStatus || "needs_review",
      firstSeenAt: now,
      draftId: duplicateId
    };
  });
  updates[`autoJobUrlCache/${duplicateId}`] = {
    title: draft.title || "",
    link: sourceLink,
    normalizedLink: normalizeProcessedUrl(sourceLink),
    sourceName: "Quick Post",
    category: draft.postTarget || "latestJob",
    status: draft.checkerStatus || "needs_review",
    firstSeenAt: now,
    draftId: duplicateId
  };
  updates[`autoJobDrafts/${duplicateId}`] = {
    ...draft,
    duplicateKey: duplicateId,
    duplicateKeys,
    sourceName: draft.sourceName || "Quick Post",
    updatedAt: now
  };
  await db.ref().update(updates);
  return { ok: true, skipped: false, draftId: duplicateId, title: draft.title || "" };
};

app.post("/api/quick-post/rewrite-single", async (req, res) => {
  try {
    const { db } = await requireAdmin(req);
    const url = extractHttpUrl(req.body?.url || "");
    if (!url) return res.status(400).json({ ok: false, error: "Valid URL required" });
    const existingSeed = { title: url, sourceLink: url, detailLink: url };
    if (await noticeAlreadyProcessed(db, existingSeed)) {
      return res.json({ ok: true, skipped: true, reason: "duplicate", draftId: autoJobUrlCacheKey(url) });
    }
    const page = await fetchText(url, 24000);
    const draft = await rewriteQuickPostDraft({ url, pageText: page.text, prompt: req.body?.prompt || "" });
    const saved = await saveQuickPostDraft(db, draft);
    await logAutoJob(db, { level: saved.skipped ? "info" : "success", sourceName: "Quick Post", message: saved.skipped ? `Quick Post duplicate skipped: ${url}` : `Quick Post draft saved: ${draft.title}` });
    return res.json({ ok: true, ...saved, draft });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ ok: false, error: err.message });
  }
});

const runQuickPostBatch = async ({ batchId, db, links = [], prompt = "", delaySeconds = 2 }) => {
  const batch = quickPostBatches.get(batchId);
  if (!batch) return;
  batch.status = "running";
  for (const item of batch.items) {
    if (batch.status === "cancelled") break;
    item.status = "running";
    try {
      const url = item.url;
      if (await noticeAlreadyProcessed(db, { title: item.title || url, sourceLink: url, detailLink: url })) {
        item.status = "skipped";
        item.message = "Duplicate URL/title";
      } else {
        const page = await fetchText(url, 24000);
        const draft = await rewriteQuickPostDraft({ url, pageText: page.text, prompt });
        const saved = await saveQuickPostDraft(db, { ...draft, title: draft.title || item.title });
        item.status = saved.skipped ? "skipped" : "done";
        item.draftId = saved.draftId || "";
        item.title = saved.title || draft.title || item.title;
        item.message = saved.skipped ? "Duplicate URL/title" : "Draft saved";
      }
    } catch (err) {
      item.status = "failed";
      item.message = err.message;
    }
    batch.updatedAt = nowStamp();
    if (delaySeconds > 0) {
      await new Promise((resolve) => setTimeout(resolve, Math.min(delaySeconds, 20) * 1000));
    }
  }
  batch.status = batch.items.some((item) => item.status === "running") ? "running" : "done";
  batch.finishedAt = nowStamp();
};

app.post("/api/quick-post/batch-start", async (req, res) => {
  try {
    const { db } = await requireAdmin(req);
    const maxPosts = readPositiveInt(req.body?.maxPosts, 5, 50);
    const delaySeconds = Math.max(0, Math.min(60, Math.floor(Number(req.body?.delaySeconds ?? 2) || 0)));
    let links = Array.isArray(req.body?.links) ? req.body.links : [];
    if (!links.length && req.body?.url) {
      const page = await fetchText(extractHttpUrl(req.body.url), 22000);
      links = extractNotices(page.text, req.body.url, autoJobKeywords, { limit: maxPosts }).map((notice) => ({ title: notice.title, url: notice.link }));
    }
    const normalized = links
      .map((item) => ({ title: toText(item.title || item.url), url: extractHttpUrl(item.url || item.link || "") }))
      .filter((item) => item.url)
      .slice(0, maxPosts);
    if (!normalized.length) return res.status(400).json({ ok: false, error: "No links found" });
    const batchId = `qp_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
    const batch = {
      ok: true,
      batchId,
      status: "queued",
      createdAt: nowStamp(),
      updatedAt: nowStamp(),
      total: normalized.length,
      items: normalized.map((item) => ({ ...item, status: "queued", message: "" }))
    };
    quickPostBatches.set(batchId, batch);
    runQuickPostBatch({ batchId, db, links: normalized, prompt: req.body?.prompt || "", delaySeconds }).catch((err) => {
      const current = quickPostBatches.get(batchId);
      if (current) {
        current.status = "failed";
        current.error = err.message;
        current.updatedAt = nowStamp();
      }
    });
    return res.json({ ok: true, batchId, batch });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ ok: false, error: err.message });
  }
});

app.post("/api/quick-post/status", async (req, res) => {
  try {
    await requireAdmin(req);
    const batchId = String(req.body?.batchId || "").trim();
    const batch = quickPostBatches.get(batchId);
    if (!batch) return res.status(404).json({ ok: false, error: "Batch not found" });
    return res.json({ ok: true, batch });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ ok: false, error: err.message });
  }
});

app.get("/robots.txt", (req, res) => {
  const robots = fs.readFileSync(path.join(__dirname, "robots.txt"), "utf8");
  res.type("text/plain").send(robots);
});

app.get("/job-form.html", (_req, res) => {
  return res.redirect(301, "/#homePortalLatestJobs");
});

app.get("/job-detail.html", async (req, res, next) => {
  const id = toText(req.query?.id);
  const slug = toText(req.query?.post || req.query?.slug);
  if (!id && slug) {
    try {
      const found = await findPublishedJobBySlug(slug);
      if (!found) {
        return next();
      }
      return res.redirect(301, getPublicJobUrl(found.id, found.job));
    } catch (err) {
      return next();
    }
  }
  if (!id) {
    return next();
  }
  try {
    const found = await getPublishedJobById(id);
    if (!found) {
      return next();
    }
    return res.redirect(301, getPublicJobUrl(found.id, found.job));
  } catch (err) {
    return next();
  }
});

app.get("/post/:slug", async (req, res, next) => {
  try {
    const found = await findPublishedJobBySlug(req.params.slug);
    if (!found) {
      const slug = String(req.params.slug || "");
      if (/^[a-z0-9-]+$/i.test(slug)) {
        const staticPostPath = path.join(__dirname, "post", slug, "index.html");
        if (fs.existsSync(staticPostPath)) {
          return res.sendFile(staticPostPath);
        }
      }
      return next();
    }
    const canonicalPath = new URL(getPublicJobUrl(found.id, found.job)).pathname;
    if (req.path !== canonicalPath || Object.keys(req.query || {}).length) {
      return res.redirect(301, canonicalPath);
    }
    return res.type("html").send(renderPrerenderedJobDetail(found.id, found.job));
  } catch (err) {
    return next();
  }
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

app.post("/admin/seo/normalize", async (req, res) => {
  try {
    const { db } = await requireAdmin(req);
    const jobId = toText(req.body?.jobId);
    const result = await normalizeLatestJobsSeo(db, jobId);
    const sitemap = await buildCombinedSitemap();
    const shouldPublish = req.body?.publishStatic !== false && Boolean(jobId || req.body?.publishStatic);
    const publish = shouldPublish
      ? await triggerSeoPostsWorkflow({ db, jobId, reason: "admin-seo-normalize" })
      : { ok: true, configured: Boolean(GITHUB_TOKEN && GITHUB_REPOSITORY), skipped: true, reason: "Static publish not requested" };
    return res.json({
      ...result,
      jobId: jobId || "",
      sitemapUrl: `${SITE_BASE_URL}/sitemap.xml`,
      sitemapBytes: Buffer.byteLength(sitemap, "utf8"),
      publish
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ ok: false, error: err.message });
  }
});

app.post("/admin/jobs/delete", async (req, res) => {
  try {
    const { db } = await requireAdmin(req);
    const jobId = toText(req.body?.jobId);
    if (!jobId) {
      return res.status(400).json({ ok: false, error: "jobId required" });
    }
    const snapshot = await db.ref(`LatestJobs/${jobId}`).get();
    if (!snapshot.exists()) {
      return res.status(404).json({ ok: false, error: "Job not found" });
    }
    const job = snapshot.val() || {};
    const seo = buildSeoFields(job, jobId);
    const slug = toText(job.slug || seo.slug || buildSlug(job.title, jobId));
    const updates = { [`LatestJobs/${jobId}`]: null };
    ["notification", "admitCard", "result", "syllabus", "answerKey", "admission"].forEach((category) => {
      updates[`portalItems/${category}/job_${jobId}`] = null;
    });
    await db.ref().update(updates);
    const staticPost = await deleteStaticPostFolder(slug);
    const sitemap = await execFileAsync(process.execPath, ["scripts/generate-sitemap.js"], {
      cwd: __dirname,
      timeout: 60000,
      env: process.env
    }).then((result) => ({ ok: true, stdout: result.stdout })).catch((error) => ({ ok: false, error: error.message, stdout: error.stdout || "", stderr: error.stderr || "" }));
    const publish = await triggerSeoPostsWorkflow({ db, jobId, reason: "admin-delete", deletedSlug: slug }).catch((err) => ({ ok: false, error: err.message }));
    return res.json({ ok: true, jobId, slug, staticPost, sitemap, publish });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ ok: false, error: err.message });
  }
});

app.post("/admin/seo/debug", async (req, res) => {
  try {
    const { db } = await requireAdmin(req);
    const jobId = toText(req.body?.jobId);
    const runDispatch = req.body?.dispatch === true;
    const result = {
      ok: true,
      github: {
        tokenPresent: Boolean(GITHUB_TOKEN),
        tokenLength: GITHUB_TOKEN ? GITHUB_TOKEN.length : 0,
        repository: GITHUB_REPOSITORY,
        event: GITHUB_DISPATCH_EVENT
      },
      staticPost: null,
      repoAccess: null,
      workflowAccess: null,
      dispatch: null,
      recentLogs: []
    };

    if (jobId) {
      const snapshot = await db.ref(`LatestJobs/${jobId}`).get();
      if (snapshot.exists()) {
        const job = snapshot.val() || {};
        const slug = toText(job.slug) || buildSlug(job.title || "job-update", jobId);
        result.staticPost = {
          jobId,
          slug,
          publicUrl: getPublicJobUrl(jobId, { ...job, slug }),
          fallbackUrl: `${SITE_BASE_URL}/job-detail.html?id=${encodeURIComponent(jobId)}`,
          repoPath: `post/${slug}/index.html`
        };
      } else {
        result.staticPost = { jobId, error: "LatestJobs record not found" };
      }
    }

    if (GITHUB_TOKEN && GITHUB_REPOSITORY) {
      result.repoAccess = await githubApi(`/repos/${GITHUB_REPOSITORY}`, { method: "GET" });
      result.workflowAccess = await githubApi(`/repos/${GITHUB_REPOSITORY}/actions/workflows/update-seo-posts.yml`, { method: "GET" });
      if (runDispatch) {
        result.dispatch = await triggerSeoPostsWorkflow({ db, jobId, reason: "admin-debug-dispatch" });
      }
    }

    const logsSnapshot = await db.ref("seoPublishLogs").orderByChild("createdAt").limitToLast(5).get();
    if (logsSnapshot.exists()) {
      logsSnapshot.forEach((child) => {
        result.recentLogs.push({ id: child.key, ...(child.val() || {}) });
      });
    }
    return res.json(result);
  } catch (err) {
    return res.status(err.statusCode || 500).json({ ok: false, error: err.message });
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
      [`memberFolders/${uid}`]: null,
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
    const result = await runAutoJobChecker({ ...(req.body || {}), manual: true });
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
    const requestedKind = req.body?.sourceKind || req.body?.kind;
    const seedSources = requestedKind
      ? DEFAULT_AUTO_JOB_SOURCES.filter((source) => source.sourceKind === normalizeSourceKind(requestedKind))
      : DEFAULT_AUTO_JOB_SOURCES;
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
    for (const source of seedSources) {
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

    return res.json({ ok: true, added, updated, total: seedSources.length });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ ok: false, error: err.message });
  }
});

app.post("/admin/auto-job-checker/draft/save", async (req, res) => {
  try {
    const { db } = await requireAdmin(req);
    const draftId = String(req.body?.draftId || "").trim();
    const draft = applyCrawlerValidation(req.body?.draft && typeof req.body.draft === "object" ? req.body.draft : {});
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
    const bilingualMode = String(req.body?.bilingualMode || draft.bilingualMode || "").trim();
    const generated = applyCrawlerValidation(enrichJobAutomation(generateJobJsonFromText(text || draft.pageContent || draft.rawText || draft.title || "", { ...draft, bilingualMode }), safeKey(draft.sourceLink || draft.title || text)));
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
    let enriched = brandDraftForEmitra(enrichJobAutomation({ ...current, ...incoming, bilingualMode: req.body?.bilingualMode || incoming.bilingualMode || current.bilingualMode || "" }, draftId));
    const aiOptions = aiOptionsFromRequest(req.body || {});
    const ai = await generateAiSummary(enriched, aiOptions);
    enriched.notificationSummary = sanitizePortalBranding(ai.summary);
    enriched.summaryProvider = ai.provider;
    const whatsappAi = await generateAiWhatsappPostText(enriched, draftId, aiOptions);
    const suggestions = await generateShareSuggestions(enriched, draftId, aiOptions);
    enriched.whatsappProvider = whatsappAi.provider;
    enriched.whatsappPostText = sanitizePortalBranding(whatsappAi.text);
    enriched.aiShareSuggestions = suggestions.map((item) => ({ ...item, text: sanitizePortalBranding(item.text || "") }));
    enriched = applyCrawlerValidation(enriched);
    if (draftId) {
      await db.ref(`autoJobDrafts/${draftId}`).update(enriched);
    }
    return res.json({
      ok: true,
      draft: enriched,
      ai: {
        provider: whatsappAi.provider,
        summaryProvider: ai.provider,
        whatsappProvider: whatsappAi.provider,
        summaryError: ai.error || "",
        whatsappError: whatsappAi.error || ""
      },
      suggestions
    });
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
    const snapshot = await db.ref(`autoJobDrafts/${draftId}`).get();
    const draft = snapshot.exists() ? (snapshot.val() || {}) : {};
    const updates = {};
    draftDuplicateCacheKeys({ ...draft, sourceLink: draft.sourceLink || draft.detailLink }).forEach((key) => {
      updates[`autoJobSeen/${key}/status`] = "deleted";
      updates[`autoJobSeen/${key}/deletedAt`] = nowStamp();
    });
    updates[`autoJobUrlCache/${draftId}/status`] = "deleted";
    updates[`autoJobUrlCache/${draftId}/deletedAt`] = nowStamp();
    if (Object.keys(updates).length) {
      await db.ref().update(updates);
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
    const snapshot = await db.ref(`autoJobDrafts/${draftId}`).get();
    const draft = snapshot.exists() ? (snapshot.val() || {}) : {};
    const now = nowStamp();
    const updates = {
      [`autoJobDrafts/${draftId}/checkerStatus`]: "ignored",
      [`autoJobDrafts/${draftId}/ignoredAt`]: now,
      [`autoJobDrafts/${draftId}/updatedAt`]: now,
      [`autoJobUrlCache/${draftId}/status`]: "ignored",
      [`autoJobUrlCache/${draftId}/ignoredAt`]: now
    };
    draftDuplicateCacheKeys({ ...draft, sourceLink: draft.sourceLink || draft.detailLink }).forEach((key) => {
      updates[`autoJobSeen/${key}/status`] = "ignored";
      updates[`autoJobSeen/${key}/ignoredAt`] = now;
    });
    await db.ref().update(updates);
    await db.ref(`autoJobDrafts/${draftId}`).update({
      checkerStatus: "ignored",
      ignoredAt: now,
      updatedAt: now
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

app.post("/admin/auto-job-checker/draft/reject", async (req, res) => {
  try {
    const { db } = await requireAdmin(req);
    const draftId = String(req.body?.draftId || "").trim();
    if (!draftId) {
      return res.status(400).json({ ok: false, error: "Draft ID required" });
    }
    const snapshot = await db.ref(`autoJobDrafts/${draftId}`).get();
    const draft = snapshot.exists() ? (snapshot.val() || {}) : {};
    const now = nowStamp();
    const updates = {
      [`autoJobDrafts/${draftId}/checkerStatus`]: "ignored",
      [`autoJobDrafts/${draftId}/rejectedAt`]: now,
      [`autoJobDrafts/${draftId}/updatedAt`]: now,
      [`autoJobUrlCache/${draftId}/status`]: "ignored",
      [`autoJobUrlCache/${draftId}/rejectedAt`]: now
    };
    draftDuplicateCacheKeys({ ...draft, sourceLink: draft.sourceLink || draft.detailLink }).forEach((key) => {
      updates[`autoJobSeen/${key}/status`] = "ignored";
      updates[`autoJobSeen/${key}/rejectedAt`] = now;
    });
    await db.ref().update(updates);
    await logAutoJob(db, {
      level: "info",
      message: `Draft rejected: ${draftId}`
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
    const prepared = await prepareWhatsappShare(item, shareId, aiOptionsFromRequest(req.body || {}));
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
      ai: prepared.ai,
      suggestions: prepared.suggestions || []
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
      prepared = await prepareWhatsappShare(item, shareId, aiOptionsFromRequest(req.body || {}));
      item = prepared.item;
      text = prepared.text;
      const updateFields = pickShareAutomationFields(item);
      if (draftId) {
        await db.ref(`autoJobDrafts/${draftId}`).update(updateFields);
      } else if (jobId) {
        await db.ref(`LatestJobs/${jobId}`).update(updateFields);
      }
    }
    const enrichedShareItem = enrichJobAutomation(item, shareId);
    text = channel === "telegram"
      ? buildTelegramPostText(shareId, enrichedShareItem)
      : (text || item.whatsappPostText || buildWhatsappPostText(shareId, enrichedShareItem));
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
    const publish = await triggerSeoPostsWorkflow({ db, jobId: result.jobId || "", reason: "auto-checker-publish" });
    return res.json({ ...result, publish });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ ok: false, error: err.message });
  }
});

app.post("/admin/auto-job-checker/bulk-publish", async (req, res) => {
  try {
    const { db } = await requireAdmin(req);
    const draftIds = Array.isArray(req.body?.draftIds)
      ? req.body.draftIds.map((id) => String(id || "").trim()).filter(Boolean)
      : [];
    if (!draftIds.length) {
      return res.status(400).json({ ok: false, error: "Draft IDs required" });
    }
    const autoSendChannels = Array.isArray(req.body?.autoSendChannels) ? req.body.autoSendChannels : [];
    const forcedTarget = normalizeAutoJobCategory(req.body?.postTarget || "");
    const results = [];
    for (const draftId of draftIds.slice(0, 40)) {
      try {
        const draft = {};
        if (forcedTarget) draft.postTarget = forcedTarget;
        const result = await publishAutoJobDraft(db, draftId, {
          draft,
          autoSendChannels
        });
        results.push({ draftId, ok: true, jobId: result.jobId, sent: result.sent || [] });
      } catch (err) {
        results.push({ draftId, ok: false, error: err.message, statusCode: err.statusCode || 500 });
      }
    }
    const published = results.filter((item) => item.ok).length;
    await logAutoJob(db, {
      level: published === results.length ? "success" : "warning",
      message: `Bulk approve: ${published}/${results.length} drafts published`
    });
    const publish = published ? await triggerSeoPostsWorkflow({ db, reason: "auto-checker-bulk-publish" }) : null;
    return res.json({
      ok: true,
      published,
      failed: results.length - published,
      results,
      publish
    });
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

app.post("/admin/current-affairs/generate-today", async (req, res) => {
  try {
    const { db } = await requireAdmin(req);
    const result = await upsertDailyCurrentAffairs(db, {
      dateKey: toText(req.body?.dateKey) || dailyCurrentAffairsDate(),
      aiProvider: req.body?.aiProvider,
      aiModel: req.body?.aiModel
    });
    return res.json(result);
  } catch (err) {
    const message = err.code === "AI_NOT_CONFIGURED"
      ? `${err.message}. Render/server env me GEMINI_API_KEY/OPENROUTER_API_KEY/OPENAI_API_KEY aur model configure karein.`
      : err.message;
    return res.status(err.statusCode || (err.code === "AI_NOT_CONFIGURED" ? 503 : 500)).json({ ok: false, error: message });
  }
});

const runCronDailyCurrentAffairs = async (req, res) => {
  try {
    requireCronSecret(req);
    const db = getAdminDb();
    if (!db) {
      return res.status(503).json({ ok: false, error: "Firebase Admin SDK is not configured" });
    }
    const result = await upsertDailyCurrentAffairs(db, { dateKey: toText(req.query?.date || req.body?.dateKey) || dailyCurrentAffairsDate() });
    return res.json({ ...result, scheduled: true });
  } catch (err) {
    const message = err.code === "AI_NOT_CONFIGURED"
      ? `${err.message}. AI/API key missing hai. Server env me AI key aur model configure karein.`
      : err.message;
    return res.status(err.statusCode || (err.code === "AI_NOT_CONFIGURED" ? 503 : 500)).json({ ok: false, error: message });
  }
};

const runCronAutoJobChecker = async (req, res) => {
  try {
    requireCronSecret(req);
    const result = await runAutoJobChecker({ scheduled: true });
    return res.json(result);
  } catch (err) {
    return res.status(err.statusCode || 500).json({ ok: false, error: err.message });
  }
};

app.get("/cron/daily-current-affairs", runCronDailyCurrentAffairs);
app.post("/cron/daily-current-affairs", runCronDailyCurrentAffairs);
app.get("/cron/auto-job-checker", runCronAutoJobChecker);
app.post("/cron/auto-job-checker", runCronAutoJobChecker);

let lastDailyCurrentAffairsRunDate = "";
const maybeRunDailyCurrentAffairsSchedule = async () => {
  const enabled = String(process.env.DAILY_CURRENT_AFFAIRS_AUTO || "true").toLowerCase() !== "false";
  if (!enabled || !isAdminSdkConfigured()) return;
  const dateKey = dailyCurrentAffairsDate();
  const { hour, minute } = getIstClock();
  if (hour < 7 || lastDailyCurrentAffairsRunDate === dateKey) return;
  lastDailyCurrentAffairsRunDate = dateKey;
  try {
    const db = getAdminDb();
    if (!db) return;
    const result = await upsertDailyCurrentAffairs(db, { dateKey });
    console.log(`Daily current affairs ${result.action}: ${result.title}`);
  } catch (err) {
    console.error("Daily current affairs failed:", err.message);
  }
};

app.use((err, _req, res, _next) => {
  if (err && (err.code === "LIMIT_FILE_SIZE" || err.message === "Only PDF files are allowed")) {
    return res.status(err.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({
      success: false,
      message: err.code === "LIMIT_FILE_SIZE" ? "PDF 20MB se chhoti honi chahiye" : err.message
    });
  }
  return res.status(500).json({ success: false, message: err?.message || "Server error" });
});

app.listen(PORT, () => {
  console.log(`Admin API running on port ${PORT}`);
  setInterval(() => {
    maybeRunDailyCurrentAffairsSchedule().catch((err) => {
      console.error("Daily current affairs scheduler failed:", err.message);
    });
  }, 60 * 1000);
  maybeRunDailyCurrentAffairsSchedule().catch(() => {});
  if (cron && CHECKER_CRON) {
    cron.schedule(CHECKER_CRON, () => {
      runAutoJobChecker({ scheduled: true }).catch((err) => {
        console.error("Auto job checker failed:", err.message);
      });
    }, { timezone: "Asia/Kolkata" });
    console.log(`Auto job crawler scheduled with cron: ${CHECKER_CRON}`);
  } else if (CHECKER_INTERVAL_MS > 0) {
    setInterval(() => {
      runAutoJobChecker({ scheduled: true }).catch((err) => {
        console.error("Auto job checker failed:", err.message);
      });
    }, CHECKER_INTERVAL_MS);
    console.log(`Auto job crawler scheduled every ${CHECKER_INTERVAL_MS}ms`);
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
