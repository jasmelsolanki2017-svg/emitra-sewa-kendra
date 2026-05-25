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
const staticMiddleware = express.static(__dirname);
app.use((req, res, next) => {
  const publicPath = String(req.path || "").toLowerCase();
  if (publicPath === "/sitemap.xml" || publicPath === "/sitemap-jobs.xml" || publicPath === "/robots.txt") {
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
  }
};

const AUTO_JOB_CATEGORY_KEYS = Object.keys(AUTO_JOB_CATEGORY_CONFIG);
const AUTO_JOB_DEFAULT_DRAFT_LIMIT = 12;
const AUTO_JOB_DEFAULT_PAGE_LIMIT = 20;
const AUTO_JOB_DEFAULT_PER_SOURCE_LIMIT = 4;
const AUTO_JOB_MAX_DRAFT_LIMIT = 120;
const AUTO_JOB_MAX_PAGE_LIMIT = 80;
const AUTO_JOB_MAX_PER_SOURCE_LIMIT = 40;

const readPositiveInt = (value, fallback, max) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.min(Math.floor(number), max);
};

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
    syllabus: "syllabus"
  };
  return map[key] || "";
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
  const slug = toText(job.slug) || buildSlug(job.title || "job-update", id);
  return `${SITE_BASE_URL}/post/${encodeURIComponent(slug)}`;
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

const isoDateOrUndefined = (value = "") => {
  const text = toText(value);
  if (!text) {
    return undefined;
  }
  const number = Number(text);
  const date = number ? new Date(number) : new Date(text);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
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

const buildDefaultFaqItems = (job = {}, title = "Job Update") => {
  const targetLabel = ({
    latestJob: "online form",
    notification: "notification",
    admitCard: "admit card",
    result: "result",
    syllabus: "syllabus",
    answerKey: "answer key",
    admission: "admission form"
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
  const manualFaqs = normalizeFaqItems(job.faq);
  const faqItems = manualFaqs.length ? manualFaqs : buildDefaultFaqItems(job, title);
  const publisher = { "@type": "Organization", name: "E-MITRA WALA", url: `${SITE_BASE_URL}/` };
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        "@id": `${canonicalUrl}#breadcrumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_BASE_URL}/` },
          { "@type": "ListItem", position: 2, name: "Latest Jobs", item: `${SITE_BASE_URL}/job-form.html` },
          { "@type": "ListItem", position: 3, name: title, item: canonicalUrl }
        ]
      },
      {
        "@type": ["Article", "JobPosting"],
        "@id": `${canonicalUrl}#article`,
        headline: job.seoTitle || title,
        title,
        description,
        url: canonicalUrl,
        mainEntityOfPage: canonicalUrl,
        employmentType: job.type || "Online Form",
        datePosted: job.postDate || undefined,
        validThrough: job.lastApplyDate || job.lastDate || undefined,
        hiringOrganization: job.department ? { "@type": "Organization", name: job.department } : publisher,
        datePublished: isoDateOrUndefined(job.createdAt),
        dateModified: isoDateOrUndefined(job.updatedAt) || isoDateOrUndefined(job.createdAt),
        publisher
      },
      {
        "@type": "FAQPage",
        "@id": `${canonicalUrl}#faq`,
        mainEntity: faqItems.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: { "@type": "Answer", text: item.answer }
        }))
      }
    ]
  };
};

const buildSeoStorageFields = (id = "", job = {}) => {
  const seo = buildSeoFields(job, id);
  const title = toText(job.title || "Job Update");
  const canonicalUrl = seo.canonicalUrl || getPublicJobUrl(id, { ...job, slug: seo.slug });
  const faq = normalizeFaqItems(job.faq);
  const faqItems = faq.length ? faq : buildDefaultFaqItems(job, title);
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

const renderPrerenderedJobDetail = (id = "", job = {}) => {
  const seo = buildSeoFields(job, id);
  const title = toText(job.title || "Job Update");
  const description = seo.metaDescription;
  const canonicalUrl = seo.canonicalUrl || getPublicJobUrl(id, { ...job, slug: seo.slug });
  const html = fs.readFileSync(path.join(__dirname, "job-detail.html"), "utf8");
  const summaryRows = [
    ["Department", job.department],
    ["Post Name", job.postName || title],
    ["Total Posts", job.totalPosts || job.totalVacancy],
    ["Last Date", job.lastApplyDate || job.lastDate],
    ["Qualification", job.qualification],
    ["Location", job.location || job.jobLocation]
  ].filter(([, value]) => toText(value));
  const fallbackHtml = `<h2>${htmlEscape(title)}</h2>
            <div class="content-box">
              <p>${htmlEscape(description)}</p>
              <table class="detail-table"><tbody>${summaryRows.map(([label, value]) => `<tr><th>${htmlEscape(label)}</th><td>${htmlEscape(value)}</td></tr>`).join("")}</tbody></table>
              <p><a class="auto-link" href="${htmlEscape(canonicalUrl)}">Canonical job detail link</a> | <a class="auto-link" href="job-form.html">All Latest Jobs</a></p>
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
    .replace(/<section class="panel" id="seoFallbackPanel">[\s\S]*?<\/section>/i, `<section class="panel" id="seoFallbackPanel">\n          ${fallbackHtml}\n        </section>`);
};

const findPublishedJobBySlug = async (slug = "") => {
  const targetSlug = toText(decodeURIComponent(slug)).toLowerCase();
  if (!targetSlug) {
    return null;
  }
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
    if (canonicalSlug.toLowerCase() === targetSlug) {
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
    canonicalUrl: toText(job.canonicalUrl) || getPublicJobUrl(id, { ...job, slug: toText(job.slug) || buildSlug(title, id) }),
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
    syllabus: "सिलेबस अपडेट"
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
    `📢 *${label} - EmitraWala.online*`,
    "",
    `📚 *${toText(job.title || "Job Update")}*`,
    toText(job.department) ? `*${toText(job.department)}*` : "",
    "",
    compactLine("🗓️ आवेदन शुरू", job.startDate || job.postDate),
    compactLine("⏳ अंतिम तिथि", job.lastApplyDate || job.lastDate),
    compactLine("📌 कुल पद", job.totalPosts || job.totalVacancy),
    compactLine("📍 स्थान", job.location || job.jobLocation),
    qualificationLines.length ? ["", "🎓 *योग्यता:*", ...qualificationLines].join("\n") : "",
    "",
    "📌 *नोट:* पूरी पात्रता जानकारी के लिए ऑफिशियल नोटिफिकेशन जरूर पढ़ें।",
    "",
    "🔗 *Apply / Official Details:*",
    officialLink || detailsLink,
    "",
    "🌐 *वेबसाइट:*",
    SITE_BASE_URL,
    "",
    "📲 *WhatsApp Channel Join करें:*",
    WHATSAPP_CHANNEL_URL,
    "",
    "⚠️ *नोट:* इच्छुक उम्मीदवार अंतिम तिथि से पहले ऑनलाइन आवेदन जरूर करें।"
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

const generateAiWhatsappPostText = async (job = {}, id = "") => {
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
    "Aap EmitraWala.online ke WhatsApp channel ke liye ready-to-send Hindi post likhte hain.",
    "Style bilkul is template jaisa rakho:",
    "📢 *लेटेस्ट जॉब अपडेट - EmitraWala.online*",
    "📚 *Title*",
    "*Department / Exam name*",
    "🗓️ *आवेदन शुरू:* date",
    "⏳ *अंतिम तिथि:* date",
    "📍 *स्थान:* location",
    "🎓 *योग्यता:*",
    "✅ qualification point",
    "📌 *नोट:* पूरी पात्रता जानकारी के लिए ऑफिशियल नोटिफिकेशन जरूर पढ़ें।",
    "🔗 *Apply / Official Details:*",
    "URL",
    "🌐 *वेबसाइट:*",
    SITE_BASE_URL,
    "📲 *WhatsApp Channel Join करें:*",
    WHATSAPP_CHANNEL_URL,
    "⚠️ *नोट:* इच्छुक उम्मीदवार अंतिम तिथि से पहले ऑनलाइन आवेदन जरूर करें।",
    "",
    "Rules:",
    "- Sirf final WhatsApp message do, explanation nahi.",
    "- WhatsApp bold ke liye *text* use karo, markdown link [text](url) mat banao.",
    "- Missing date/location/posts ko invent mat karo; missing line omit kar do.",
    "- Qualification ko simple Hindi bullet points me likho, max 6 bullets.",
    "- Official/apply URL exactly wahi rakho jo data me hai.",
    "- 900-1400 characters ke andar rakho.",
    JSON.stringify({
      updateType: targetLabel,
      title: job.title,
      department: job.department,
      examName: job.examName || job.subTitle,
      totalPosts: job.totalPosts || job.totalVacancy,
      postDate: job.postDate,
      startDate: job.startDate,
      lastDate: job.lastApplyDate || job.lastDate,
      location: job.location || job.jobLocation,
      qualification: job.qualification,
      importantDates: job.importantDates,
      summary: job.notificationSummary,
      officialLink: primaryLink,
      website: SITE_BASE_URL,
      whatsappChannel: WHATSAPP_CHANNEL_URL
    })
  ].join("\n");

  if (GEMINI_API_KEY && GEMINI_MODEL && typeof fetch === "function") {
    try {
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
            temperature: 0.25,
            maxOutputTokens: 700
          }
        })
      });
      if (!response.ok) {
        throw new Error(`Gemini HTTP ${response.status}`);
      }
      const data = await response.json();
      const text = (data?.candidates?.[0]?.content?.parts || [])
        .map((part) => part.text || "")
        .join("\n")
        .replace(/```(?:text|markdown)?/gi, "")
        .replace(/```/g, "")
        .trim();
      return { text: text || fallback, provider: text ? "gemini" : "local" };
    } catch (err) {
      return { text: fallback, provider: "local", error: err.message };
    }
  }

  return { text: fallback, provider: "local" };
};

const prepareWhatsappShare = async (item = {}, id = "") => {
  const enriched = enrichJobAutomation(item, id);
  const ai = await generateAiSummary(enriched);
  enriched.notificationSummary = ai.summary;
  const whatsappAi = await generateAiWhatsappPostText(enriched, id);
  enriched.summaryProvider = ai.provider;
  enriched.whatsappProvider = whatsappAi.provider;
  enriched.whatsappPostText = whatsappAi.text;
  enriched.updatedAt = nowStamp();
  return {
    item: enriched,
    text: enriched.whatsappPostText,
    ai: {
      provider: whatsappAi.provider,
      summaryProvider: ai.provider,
      whatsappProvider: whatsappAi.provider,
      summaryError: ai.error || "",
      whatsappError: whatsappAi.error || ""
    }
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
  sourceKind: normalizeSourceKind(value.sourceKind || value.kind),
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
].map((source) => ({
  ...source,
  enabled: true,
  categories: AUTO_JOB_CATEGORY_KEYS,
  categoryPages: source.categoryPages || {},
  feedUrls: parseAutoJobFeedPages(source),
  maxFetch: readPositiveInt(source.maxFetch, AUTO_JOB_DEFAULT_PER_SOURCE_LIMIT, AUTO_JOB_MAX_PER_SOURCE_LIMIT),
  sourceKind: normalizeSourceKind(source.sourceKind)
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
  const linkRegex = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const sourceKeywords = keywords.length ? keywords : autoJobKeywords;
  const limit = readPositiveInt(options.limit, 80, 200);
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
    const title = cleanNoticeTitle(decodeHtml(match[2] || link));
    if (!isUsefulNoticeCandidate(title, link, sourceKeywords)) continue;
    const key = link.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ title: title || link, link });
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

const buildDraftFromNotice = (source, notice, options = {}) => {
  const bodyText = `${notice.title}\n${notice.link}`;
  const target = options.postTarget || detectPostTarget(notice.title, notice.link, bodyText);
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
    pageContent: "",
    rawText: bodyText,
    pdfTextExtracted: false,
    lightweightDraft: true,
    reviewRequired: true,
    checkerStatus: "draft",
    sourceId: source.id,
    sourceName: source.name,
    sourceKind: source.sourceKind || "official",
    detectedLink: notice.link,
    scanSourcePage: options.scanSourcePage || source.url,
    scanCategory: target,
    createdAt: nowStamp(),
    updatedAt: nowStamp()
  };
  draft[linkField] = notice.link;
  return enrichJobAutomation(draft, hashKey(notice.link).slice(0, 8));
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

      for (const notice of notices) {
        if (newDrafts >= perSourceLimit || (limits.remainingDrafts || 0) <= 0) break;
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
        const draft = buildDraftFromNotice(source, notice, {
          postTarget: detectedTarget,
          scanSourcePage: target.url
        });
        const now = nowStamp();
        const updates = {};
        duplicateKeys.forEach((key) => {
          updates[`autoJobSeen/${key}`] = {
            title: notice.title,
            link: notice.link,
            sourceId: source.id,
            sourceName: source.name,
            category: detectedTarget,
            status: "draft",
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
          category: detectedTarget,
          status: "draft",
          firstSeenAt: now,
          draftId: duplicateId
        };
        updates[`autoJobDrafts/${duplicateId}`] = {
          ...draft,
          duplicateKey: duplicateId,
          duplicateKeys
        };
        await db.ref().update(updates);
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
      fetchTimeoutMs: readPositiveInt(options.fetchTimeoutMs || process.env.AUTO_JOB_FETCH_TIMEOUT_MS, 18000, 30000)
    };
    const snapshot = await db.ref("autoJobSources").get();
    const sources = [];
    if (snapshot.exists()) {
      snapshot.forEach((child) => {
        const source = normalizeSource(child.key, child.val() || {});
        if (source.enabled && source.url) sources.push(source);
      });
    }
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
  const draft = enrichJobAutomation({ ...currentDraft, ...(payload.draft || {}) }, draftId);
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
    sourceName: toText(draft.sourceName),
    sourceLink: toText(draft.sourceLink),
    type: toText(draft.type || "Online Form"),
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

app.get("/robots.txt", (req, res) => {
  const robots = fs.readFileSync(path.join(__dirname, "robots.txt"), "utf8");
  res.type("text/plain").send(robots);
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
    return res.json({
      ...result,
      jobId: jobId || "",
      sitemapUrl: `${SITE_BASE_URL}/sitemap.xml`,
      sitemapBytes: Buffer.byteLength(sitemap, "utf8")
    });
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
    const whatsappAi = await generateAiWhatsappPostText(enriched, draftId);
    enriched.whatsappProvider = whatsappAi.provider;
    enriched.whatsappPostText = whatsappAi.text;
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
      }
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
    return res.json({
      ok: true,
      published,
      failed: results.length - published,
      results
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
