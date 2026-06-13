const fs = require("fs");
const path = require("path");
const https = require("https");

const SITE_BASE_URL = (process.env.SITE_BASE_URL || "https://emitrawala.online").replace(/\/+$/, "");
const FIREBASE_URL = (process.env.FIREBASE_URL || "https://my-website-73785-default-rtdb.asia-southeast1.firebasedatabase.app").replace(/\/+$/, "");
const SITEMAP_PATH = path.join(__dirname, "..", "sitemap.xml");
const JOB_SITEMAP_PATH = path.join(__dirname, "..", "sitemap-jobs.xml");
const LEGAL_SITEMAP_PATH = path.join(__dirname, "..", "sitemap-legal.xml");
const INDEX_PATH = path.join(__dirname, "..", "index.html");
const JOB_DETAIL_PATH = path.join(__dirname, "..", "job-detail.html");
const PREMIUM_POST_PATH = path.join(__dirname, "..", "premium-post.html");
const NOT_FOUND_PATH = path.join(__dirname, "..", "404.html");
const POST_ROOT = path.join(__dirname, "..", "post");
const LEGAL_SITEMAP_URLS = [
  "about.html",
  "contact.html",
  "privacy-policy.html",
  "terms-and-conditions.html",
  "disclaimer.html",
  "cookie-policy.html",
  "editorial-policy.html",
  "correction-policy.html",
  "advertising-policy.html",
  "dmca.html"
];

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

const textValue = (value = "", lang = "hi") => {
  const translated = translateValue(value, lang);
  if (translated && typeof translated === "object") return "";
  return String(translated || "").replace(/\s+/g, " ").trim();
};

const resolveMergeConflictMarkers = (value = "") => String(value || "")
  .replace(/^<<<<<<<[^\n]*\n([\s\S]*?)^=======\n[\s\S]*?^>>>>>>>[^\n]*(?:\n|$)/gm, "$1");

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

const normalizePostTarget = (value = "") => {
  const key = String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const map = {
    latestjob: "latestJob",
    latestjobs: "latestJob",
    job: "latestJob",
    jobs: "latestJob",
    onlineform: "latestJob",
    notification: "notification",
    admitcard: "admitCard",
    result: "result",
    syllabus: "syllabus",
    answerkey: "answerKey",
    admission: "admission",
    currentaffairs: "currentAffairs",
    currentaffair: "currentAffairs",
    current: "currentAffairs",
    ca: "currentAffairs"
  };
  return map[key] || "latestJob";
};

const isCurrentAffairsPost = (job = {}) => {
  const article = job.advancedArticleData && typeof job.advancedArticleData === "object" ? job.advancedArticleData : {};
  const currentText = [job.title, job.slug, article.title, article.slug, job.category, article.category]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");
  return [job.postTarget, job.postType, article.postTarget, article.postType, job.type, article.type]
    .some((value) => normalizePostTarget(value) === "currentAffairs")
    || /current[-\s]*affairs|करेंट\s*अफेयर्स|करंट\s*अफेयर्स/.test(currentText)
    || Array.isArray(job.currentAffairs)
    || Array.isArray(article.currentAffairs)
    || Array.isArray(job.currentAffairsData)
    || Array.isArray(job.currentAffairsData?.currentAffairs);
};

const sitemapDate = (value = "") => {
  const number = Number(value || 0);
  const date = number ? new Date(number) : new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? new Date().toISOString().slice(0, 10) : date.toISOString().slice(0, 10);
};

const fetchJson = (url) => new Promise((resolve, reject) => {
  https.get(url, (res) => {
    let body = "";
    res.setEncoding("utf8");
    res.on("data", (chunk) => { body += chunk; });
    res.on("end", () => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        reject(new Error(`Firebase returned ${res.statusCode}`));
        return;
      }
      resolve(body ? JSON.parse(body) : null);
    });
  }).on("error", reject);
});

const jobUrl = (id, job = {}) => {
  const slug = String(job.slug || buildSlug(job.title, id)).trim();
  return `${SITE_BASE_URL}/post/${encodeURIComponent(slug)}/`;
};

const isPremiumPost = (job = {}) => Boolean(job.isPremiumPost || job.premiumPostSlug || job.premiumPostData);

const sitemapEntry = ({ loc, lastmod, changefreq = "daily", priority = "0.8" }) => `  <url>
    <loc>${xmlEscape(loc)}</loc>
    <lastmod>${xmlEscape(lastmod)}</lastmod>
    <changefreq>${xmlEscape(changefreq)}</changefreq>
    <priority>${xmlEscape(priority)}</priority>
  </url>`;

const buildLegalSitemapXml = () => `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${LEGAL_SITEMAP_URLS.map((page) => sitemapEntry({
  loc: `${SITE_BASE_URL}/${page}`,
  lastmod: sitemapDate(Date.now()),
  changefreq: "monthly",
  priority: "0.6"
})).join("\n")}
</urlset>
`;

const parseLooseDate = (value = "") => {
  const text = String(value || "").replace(/\bup to\b.*$/i, "").trim();
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
  if (!date) {
    return undefined;
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getRowValue = (row = {}) => row.value ?? row.date ?? row.lastDate ?? row.lastApplyDate ?? row.applicationLastDate ?? row.endDate ?? "";

const findApplicationLastDate = (job = {}) => {
  const direct = job.applicationLastDate || job.lastApplyDate || job.lastDate;
  if (direct) {
    return direct;
  }
  const rows = Array.isArray(job.importantDates) ? job.importantDates
    : (Array.isArray(job.important_dates) ? job.important_dates : []);
  const match = rows.find((row) => {
    if (!row || typeof row !== "object") {
      return false;
    }
    const label = String(row.label || row.title || row.name || row.key || row.event || "").toLowerCase();
    return /(last|end|close|apply\s*online|apply\s*date|fee\s*payment)/i.test(label);
  });
  return match ? getRowValue(match) : "";
};

const isJobPostingCategory = (job = {}) => {
  const text = [
    job.category,
    job.postTarget,
    job.postType,
    job.type,
    job.title,
    job.slug
  ].filter(Boolean).join(" ").toLowerCase();
  return /\b(latest\s*jobs?|recruitment|online\s*form|apprentice|admission)\b/i.test(text)
    || /latestjob|onlineform/.test(text);
};

const buildJobPostingSchema = ({ job = {}, title = "", description = "", canonicalUrl = "" }) => {
  if (!isJobPostingCategory(job)) {
    return null;
  }
  const applicationLastDate = findApplicationLastDate(job);
  return {
    "@type": "JobPosting",
    "@id": `${canonicalUrl}#jobposting`,
    "title": title || textValue(job.title || "Recruitment Update", "hi"),
    "description": textValue(job.shortInfo || job.description || description || job.notificationSummary || title || "Recruitment details", "hi"),
    "datePosted": schemaDateOrUndefined(job.createdAt || job.postDate),
    "validThrough": schemaDateOrUndefined(applicationLastDate),
    "employmentType": "FULL_TIME",
    "hiringOrganization": {
      "@type": "Organization",
      "name": textValue(job.organization || job.department || "E-MITRA WALA", "hi")
    },
    "jobLocation": {
      "@type": "Place",
      "address": {
        "@type": "PostalAddress",
        "addressCountry": "IN"
      }
    },
    "baseSalary": {
      "@type": "MonetaryAmount",
      "currency": "INR"
    }
  };
};

const buildSeoFields = (job = {}, id = "") => {
  const seoData = job.seo && typeof job.seo === "object" ? job.seo : {};
  const title = textValue(job.title || seoData.title || job.text || "Job Update", "hi");
  const slug = String(job.slug || seoData.slug || buildSlug(title, id)).trim();
  const descParts = [
    title,
    textValue(job.department, "hi"),
    job.totalPosts ? `${job.totalPosts} posts` : "",
    job.lastApplyDate || job.lastDate ? `Last date ${job.lastApplyDate || job.lastDate}` : "",
    "apply link, qualification and important dates"
  ].filter(Boolean);
  return {
    title,
    slug,
    canonicalUrl: String(job.canonicalUrl || jobUrl(id, { ...job, slug })).trim(),
    seoTitle: textValue(job.seoTitle || seoData.seoTitle || seoData.title || `${title} | E-MITRA WALA`, "hi").slice(0, 70),
    metaDescription: textValue(job.metaDescription || seoData.metaDescription || seoData.description || job.notificationSummary || job.shortInfo || descParts.join(", "), "hi").slice(0, 160)
  };
};

const normalizeFaqItems = (items = []) => (Array.isArray(items) ? items : [])
  .map((item) => {
    if (!item || typeof item === "string") {
      return null;
    }
    const question = textValue(item.question || item.q || item.title || "", "hi");
    const answer = textValue(item.answer || item.a || item.text || item.content || "", "hi");
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
    { question: `${title} ki last date kya hai?`, answer: String(job.lastApplyDate || job.lastDate || "Official notification ke according check karein.") },
    { question: `${title} kis department se related hai?`, answer: `Ye update ${String(job.department || "official department")} se related hai.` },
    { question: `${title} ka apply link kahan milega?`, answer: job.applyLink && job.applyLink !== "#" ? "Apply Online link Important Links section me diya gaya hai." : "Apply link update hone par Important Links section me show hoga." },
    { question: `${title} ka official notification kahan milega?`, answer: job.detailLink && job.detailLink !== "#" ? "Official notification/detail link Important Links section me available hai." : "Official detail link update hone par isi page par add kiya jayega." },
    { question: `${title} kis category ka update hai?`, answer: `Ye ${targetLabel} category ka update hai.` }
  ];
};

const buildSchemaGraph = ({ id = "", job = {}, canonicalUrl = "" }) => {
  const seo = buildSeoFields(job, id);
  const publisher = { "@type": "Organization", "name": "E-MITRA WALA", "url": `${SITE_BASE_URL}/` };
  const currentAffairs = isCurrentAffairsPost(job);
  const manualFaqs = currentAffairs ? normalizeCurrentAffairsFaqItems(job.faq) : normalizeFaqItems(job.faq);
  const faqItems = manualFaqs.length ? manualFaqs : (currentAffairs ? [] : buildDefaultFaqItems(job, seo.title));
  const article = {
    "@type": "Article",
    "@id": `${canonicalUrl}#article`,
    "headline": job.seoTitle || seo.title,
    "title": seo.title,
    "description": seo.metaDescription,
    "url": canonicalUrl,
    "mainEntityOfPage": canonicalUrl,
    "datePublished": isoDateOrUndefined(job.createdAt),
    "dateModified": isoDateOrUndefined(job.updatedAt) || isoDateOrUndefined(job.createdAt),
    "publisher": publisher
  };
  const jobPosting = currentAffairs ? null : buildJobPostingSchema({ job, title: seo.title, description: seo.metaDescription, canonicalUrl });
  const breadcrumbSecond = currentAffairs
    ? { name: "Current Affairs", item: `${SITE_BASE_URL}/current-affairs.html` }
    : { name: "Latest Jobs", item: `${SITE_BASE_URL}/#homePortalLatestJobs` };
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        "@id": `${canonicalUrl}#breadcrumb`,
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Home", "item": `${SITE_BASE_URL}/` },
          { "@type": "ListItem", "position": 2, "name": breadcrumbSecond.name, "item": breadcrumbSecond.item },
          { "@type": "ListItem", "position": 3, "name": seo.title, "item": canonicalUrl }
        ]
      },
      article,
      jobPosting,
      faqItems.length ? {
        "@type": "FAQPage",
        "@id": `${canonicalUrl}#faq`,
        "mainEntity": faqItems.map((item) => ({
          "@type": "Question",
          "name": item.question,
          "acceptedAnswer": { "@type": "Answer", "text": item.answer }
        }))
      } : null
    ].filter(Boolean)
  };
};

const normalizePremiumFaqItems = (job = {}) => normalizeFaqItems(job.faqs || job.faq);

const buildPremiumSchemaGraph = ({ id = "", job = {}, canonicalUrl = "" }) => {
  const seo = buildSeoFields(job, id);
  const publisher = { "@type": "Organization", "name": "E-MITRA WALA", "url": `${SITE_BASE_URL}/` };
  const faqItems = normalizePremiumFaqItems(job);
  const graph = [
    {
      "@type": "BreadcrumbList",
      "@id": `${canonicalUrl}#breadcrumb`,
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": `${SITE_BASE_URL}/` },
        { "@type": "ListItem", "position": 2, "name": "Latest Jobs", "item": `${SITE_BASE_URL}/#homePortalLatestJobs` },
        { "@type": "ListItem", "position": 3, "name": seo.title, "item": canonicalUrl }
      ]
    },
    {
      "@type": "Article",
      "@id": `${canonicalUrl}#article`,
      "headline": seo.title,
      "description": seo.metaDescription,
      "url": canonicalUrl,
      "mainEntityOfPage": canonicalUrl,
      "datePublished": isoDateOrUndefined(job.createdAt),
      "dateModified": isoDateOrUndefined(job.updatedAt) || isoDateOrUndefined(job.createdAt),
      "publisher": publisher
    }
  ];
  const jobPosting = buildJobPostingSchema({ job, title: seo.title, description: seo.metaDescription, canonicalUrl });
  if (jobPosting) {
    graph.push(jobPosting);
  }
  if (faqItems.length) {
    graph.push({
      "@type": "FAQPage",
      "@id": `${canonicalUrl}#faq`,
      "mainEntity": faqItems.map((item) => ({
        "@type": "Question",
        "name": item.question,
        "acceptedAnswer": { "@type": "Answer", "text": item.answer }
      }))
    });
  }
  return { "@context": "https://schema.org", "@graph": graph };
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
    const question = String(item.question || item.q || item.title || "").trim();
    const options = (Array.isArray(item.options) ? item.options : [item.optionA || item.a, item.optionB || item.b, item.optionC || item.c, item.optionD || item.d])
      .map((option) => String(option || "").trim())
      .filter(Boolean);
    const answer = String(item.correctAnswer || item.answer || item.correct || item.correct_option || "").trim();
    const explanation = String(item.explanation || item.reason || item.solution || "").trim();
    const category = String(item.category || item.topic || item.subject || item.tag || "").trim();
    const image = String(item.image || item.imageUrl || item.thumbnail || item.photo || "").trim();
    return question && options.length ? { question, options, answer, explanation, category, image } : null;
  }).filter(Boolean);
};

const getCurrentAffairsIntro = (job = {}, description = "") => {
  const article = job.advancedArticleData && typeof job.advancedArticleData === "object" ? job.advancedArticleData : {};
  const content = job.content && typeof job.content === "object" ? job.content : (article.content && typeof article.content === "object" ? article.content : {});
  const intro = Array.isArray(job.intro) ? job.intro : (Array.isArray(article.intro) ? article.intro : (Array.isArray(content.intro) ? content.intro : []));
  return intro.map((item) => String(item || "").trim()).filter(Boolean).join("\n\n") || String(job.shortInfo || description || "").trim();
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
    const importance = String(item["महत्व"] || item.importance || item.importanceLevel || "").trim();
    const title = String(item["शीर्षक"] || item.title || item.heading || item.headline || "").trim();
    const category = String(item["श्रेणी"] || item.category || item.topic || "").trim();
    const summary = String(item["सारांश"] || item.summary || item.description || item.content || item.text || "").trim();
    const source = String(item["स्रोत"] || item.source || "").trim();
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
  const dateText = String(job.postDate || job.date || job.content?.date || job["तारीख"] || job.currentAffairsData?.["तारीख"] || "").trim();
  const categoryText = String(job.category || job.content?.category || job["श्रेणी"] || job.currentAffairsData?.["श्रेणी"] || "").trim();
  const newsItems = getCurrentAffairsNewsItems(job);
  const questions = getCurrentAffairsQuestions(job);
  const pdfUrl = String(job.pdfLink || job.pdfUrl || job.currentAffairsPdf || job.content?.pdfLink || job.advancedArticleData?.pdfLink || "").trim();
  const sourceNames = Array.from(new Set(newsItems.map((item) => item.source).filter(Boolean))).slice(0, 4);
  const sourceDateNote = [
    sourceNames.length ? `Source: ${sourceNames.join(", ")}` : "Source: Official news updates and exam-oriented current affairs references",
    dateText ? `Updated: ${dateText}` : ""
  ].filter(Boolean).join(" | ");
  const questionHtml = questions.map((item, index) => `<article class="mcq-card ca-mcq-card">
                <div class="mcq-question"><span class="ca-q-badge">Q${index + 1}</span><strong>${htmlEscape(item.question)}</strong></div>
                <div class="mcq-options">${item.options.map((option, optionIndex) => {
                  const optionLabel = String.fromCharCode(65 + optionIndex);
                  const correct = item.answer.toLowerCase();
                  const isCorrect = correct && (option.toLowerCase() === correct || optionLabel.toLowerCase() === correct || `${optionLabel}. ${option}`.toLowerCase() === correct);
                  return `<div class="mcq-option ${isCorrect ? "correct" : ""}"><span>${optionLabel}</span>${htmlEscape(option)}</div>`;
                }).join("")}</div>
                ${item.answer ? `<div class="mcq-answer"><span class="manual-label">Correct Answer:</span> ${htmlEscape(item.answer)}</div>` : ""}
                ${item.explanation ? `<div class="mcq-explanation"><span class="manual-label">Explanation:</span> ${htmlEscape(item.explanation)}</div>` : ""}
              </article>`).join("");
  return `<div class="ca-article-title">
              <span>Daily Current Affairs Quiz</span>
              <h2>${htmlEscape(title)}</h2>
              <p>${htmlEscape([dateText, `${questions.length || 0} Questions`].filter(Boolean).join(" | "))}</p>
            </div>
            <div class="ca-quiz-summary">
              <div><strong>${questions.length || 0}</strong><span>Total Questions</span></div>
              <div><strong>${questions.length || 0}</strong><span>Total Marks</span></div>
              <div><strong>15 Min</strong><span>Time</span></div>
              <div><strong>Hindi/English</strong><span>Language</span></div>
              <a class="btn apply" href="#questionsPanel">Start Quiz</a>
              <a class="btn notification" href="../../current-affairs.html">Current Affairs List</a>
            </div>
            ${intro || categoryText || sourceDateNote ? `<div class="content-box ca-intro-box">
              ${intro ? `<p>${htmlEscape(intro)}</p>` : ""}
              ${categoryText ? `<p><strong class="manual-label">Category:</strong> ${htmlEscape(categoryText)}</p>` : ""}
              <p><strong class="manual-label">Source/Date Note:</strong> ${htmlEscape(sourceDateNote)}</p>
            </div>` : ""}
            ${newsItems.length ? `<section class="panel">
              <h2>समाचार</h2>
              <div class="content-box">${renderCurrentAffairsNewsHtml(newsItems)}</div>
            </section>` : ""}
            ${questions.length ? `<section class="panel" id="questionsPanel">
              <h2>Questions</h2>
              <div class="content-box"><div class="mcq-list">${questionHtml}</div></div>
            </section>` : ""}
            <div class="ca-static-sidebar-seed" data-pdf="${htmlEscape(pdfUrl)}"></div>`;
};

const isAdmissionPost = (job = {}) => {
  const article = job.advancedArticleData && typeof job.advancedArticleData === "object" ? job.advancedArticleData : {};
  return [job.postTarget, job.postType, article.postTarget, article.postType, job.category, article.category, job.type, article.type]
    .some((value) => normalizePostTarget(value) === "admission" || /^admissions?$/i.test(String(value || "").trim()));
};

const staticAdmissionField = (job = {}, key = "") => {
  const article = job.advancedArticleData && typeof job.advancedArticleData === "object" ? job.advancedArticleData : {};
  return job[key] !== undefined && job[key] !== null ? job[key] : article[key];
};

const staticIsFilled = (value) => {
  if(value === null || value === undefined) return false;
  if(Array.isArray(value)) return value.some(staticIsFilled);
  if(typeof value === "object") return Object.values(value).some(staticIsFilled);
  return String(value || "").trim() !== "" && !/^(update\s*soon|all\s*india|#)$/i.test(String(value || "").trim());
};

const staticAdmissionRows = (items = [], fallbackLabel = "Details") => (Array.isArray(items) ? items : [])
  .map((item, index) => {
    if(typeof item === "string"){
      const match = item.match(/^([^:]+):\s*(.+)$/);
      return match ? { label:match[1], value:match[2] } : { label:`${fallbackLabel} ${index + 1}`, value:item };
    }
    if(item && typeof item === "object"){
      return {
        label:item.label || item.event || item.title || item.name || item.key || `${fallbackLabel} ${index + 1}`,
        value:item.value || item.date || item.text || item.description || item.detail || item.content || ""
      };
    }
    return null;
  })
  .filter((row) => row && staticIsFilled(row.label) && staticIsFilled(row.value));

const renderStaticRowsTable = (rows = []) => rows.length
  ? `<table class="detail-table"><tbody>${rows.map((row) => `<tr><th>${htmlEscape(row.label)}</th><td>${htmlEscape(row.value)}</td></tr>`).join("")}</tbody></table>`
  : "";

const renderStaticList = (items = [], ordered = false) => {
  const clean = (Array.isArray(items) ? items : (staticIsFilled(items) ? [items] : [])).filter(staticIsFilled);
  if(!clean.length) return "";
  const tag = ordered ? "ol" : "ul";
  return `<${tag}>${clean.map((item) => `<li>${htmlEscape(typeof item === "object" ? JSON.stringify(item) : item)}</li>`).join("")}</${tag}>`;
};

const staticAdmissionOverviewValue = (job = {}, matcher) => {
  const row = staticAdmissionRows(staticAdmissionField(job, "overview"), "Overview")
    .find((item) => matcher.test(String(item.label || "")));
  return row ? row.value : "";
};

const renderAdmissionFallbackHtml = (job = {}, title = "Admission Update", description = "", canonicalUrl = "") => {
  const overviewRows = staticAdmissionRows(staticAdmissionField(job, "overview"), "Overview");
  const importantRows = staticAdmissionRows(staticAdmissionField(job, "importantDates"), "Date");
  const feeValue = staticAdmissionField(job, "applicationFee");
  const feeRows = feeValue && typeof feeValue === "object" && !Array.isArray(feeValue)
    ? Object.entries(feeValue).map(([label, value]) => ({ label:label.replace(/([a-z])([A-Z])/g, "$1 $2"), value })).filter((row) => staticIsFilled(row.value))
    : [];
  const basis = staticAdmissionOverviewValue(job, /प्रवेश आधार|admission basis|basis/i);
  const course = staticAdmissionOverviewValue(job, /कोर्स|course/i);
  const eligibility = (Array.isArray(staticAdmissionField(job, "eligibility")) ? staticAdmissionField(job, "eligibility") : [])
    .concat(course ? [`${course} admission ke liye merit list status check karein.`] : [], basis ? [`Admission basis: ${basis}`] : []);
  const documents = Array.isArray(staticAdmissionField(job, "documentsRequired")) ? staticAdmissionField(job, "documentsRequired") : [
    "Merit status / application form print",
    "10th / 12th marksheet",
    "Photo ID proof",
    "Category / reservation certificate if applicable",
    "College ya DCE portal par mange gaye anya documents"
  ];
  const links = (Array.isArray(staticAdmissionField(job, "importantLinks")) ? staticAdmissionField(job, "importantLinks") : [])
    .filter((item) => item && item.url)
    .map((item) => `<a class="btn" href="${htmlEscape(item.url)}" target="_blank" rel="noopener noreferrer">${htmlEscape(item.label || item.title || "Important Link")}</a>`)
    .join("");
  const how = Array.isArray(staticAdmissionField(job, "howToCheck")) ? staticAdmissionField(job, "howToCheck") : [
    "Official DCE Rajasthan admission portal open karein.",
    "Merit List / Waiting List Status Check link par click karein.",
    "Application Number, Date of Birth aur captcha fill karein.",
    "Status check karke application form / merit status print kar lein."
  ];
  const faq = (Array.isArray(staticAdmissionField(job, "faq")) ? staticAdmissionField(job, "faq") : [])
    .map((item) => item && (item.question || item.answer) ? `<details class="faq-item"><summary>${htmlEscape(item.question || "Question")}</summary><p>${htmlEscape(item.answer || "")}</p></details>` : "")
    .join("");
  return `<h2>${htmlEscape(title)}</h2>
            <div class="content-box">
              <p>${htmlEscape(description)}</p>
              <p><strong class="manual-label">Department:</strong> ${htmlEscape(job.department || "")}</p>
              <p><strong class="manual-label">Location:</strong> Rajasthan</p>
            </div>
            ${overviewRows.length ? `<section class="panel"><h2>Overview</h2>${renderStaticRowsTable(overviewRows)}</section>` : ""}
            ${importantRows.length ? `<section class="panel"><h2>Important Dates</h2>${renderStaticRowsTable(importantRows)}</section>` : ""}
            ${feeRows.length ? `<section class="panel"><h2>Application Fee</h2>${renderStaticRowsTable(feeRows)}</section>` : ""}
            ${eligibility.length ? `<section class="panel"><h2>Eligibility / Qualification</h2><div class="content-box">${renderStaticList(eligibility)}</div></section>` : ""}
            ${documents.length ? `<section class="panel"><h2>Documents Required</h2><div class="content-box">${renderStaticList(documents)}</div></section>` : ""}
            ${how.length ? `<section class="panel"><h2>How to Check</h2><div class="content-box">${renderStaticList(how, true)}</div></section>` : ""}
            ${links ? `<section class="panel"><h2>Important Links</h2><div class="post-wise-links">${links}</div></section>` : ""}
            ${faq ? `<section class="panel"><h2>FAQ</h2><div class="content-box">${faq}</div></section>` : ""}
            <p><a class="auto-link" href="${htmlEscape(canonicalUrl)}">Canonical admission detail link</a> | <a class="auto-link" href="../../#homePortalLatestJobs">All Updates</a></p>`;
};

const currentAffairsPdfUrl = (job = {}) => {
  const article = job.advancedArticleData && typeof job.advancedArticleData === "object" ? job.advancedArticleData : {};
  const content = job.content && typeof job.content === "object" && !Array.isArray(job.content) ? job.content : {};
  const direct = [
    job.pdfLink, job.pdfUrl, job.currentAffairsPdf, job.currentAffairsPdfUrl, job.dailyPdf, job.dailyPdfUrl,
    job.downloadPdf, job.downloadPdfUrl, job.pdfDownloadUrl, content.pdfLink, content.pdfUrl,
    article.pdfLink, article.pdfUrl, article.currentAffairsPdf, article.dailyPdf, article.downloadPdfUrl
  ].map((value) => String(value || "").trim()).find((value) => /^https?:\/\//i.test(value) || /\.pdf(?:$|[?#])/i.test(value));
  if (direct) return direct;
  const links = [job.importantLinks, job.links, content.importantLinks, content.links, article.importantLinks, article.links]
    .flatMap((items) => Array.isArray(items) ? items : []);
  const match = links.find((item) => {
    if (!item || typeof item !== "object") return false;
    const label = String(item.label || item.title || item.name || item.text || "").toLowerCase();
    const url = String(item.url || item.href || item.link || "").trim();
    return url && (/pdf|download|डाउनलोड/.test(label) || /\.pdf(?:$|[?#])/i.test(url));
  });
  return match ? String(match.url || match.href || match.link || "").trim() : "";
};

const renderCurrentAffairsPremiumHtml = ({ id = "", job = {}, seo = {}, canonicalUrl = "" }) => {
  const title = seo.title || textValue(job.title, "hi") || "Today Current Affairs";
  const description = seo.metaDescription || "Daily current affairs questions, answers and explanations.";
  const dateText = String(job.postDate || job.date || job.content?.date || job.currentAffairsData?.date || job.currentAffairsData?.["तारीख"] || "").trim();
  const displayDate = (dateText || title.replace(/.*?(\d{1,2}\s+[A-Za-z]+\s+\d{4}).*/i, "$1") || "").toUpperCase();
  const questions = getCurrentAffairsQuestions(job);
  const pdfUrl = currentAffairsPdfUrl(job);
  const pdfButton = pdfUrl
    ? `<a class="ca-yellow-btn" href="${htmlEscape(pdfUrl)}" download target="_blank" rel="noopener noreferrer">DOWNLOAD PDF <i class="fa-solid fa-download"></i></a>`
    : `<button class="ca-yellow-btn" type="button" onclick="window.print()">DOWNLOAD PDF <i class="fa-solid fa-download"></i></button>`;
  const categories = ["All", "National", "International", "Rajasthan", "Sports", "Awards", "Science & Tech", "Economy"];
  const categoryColor = (category = "") => {
    const key = category.toLowerCase();
    if (/sport/.test(key)) return "sports";
    if (/science|tech/.test(key)) return "science";
    if (/international/.test(key)) return "international";
    return "national";
  };
  const categoryIcon = (category = "") => {
    const key = String(category || "").toLowerCase();
    if (/sport/.test(key)) return "fa-solid fa-trophy";
    if (/science|tech/.test(key)) return "fa-solid fa-microscope";
    if (/international|world/.test(key)) return "fa-solid fa-globe";
    if (/rajasthan|state/.test(key)) return "fa-solid fa-location-dot";
    if (/award/.test(key)) return "fa-solid fa-medal";
    if (/economy|business|bank/.test(key)) return "fa-solid fa-indian-rupee-sign";
    return "fa-solid fa-landmark";
  };
  const questionCards = questions.map((item, index) => {
    const category = item.category || (index % 4 === 1 ? "Sports" : index % 4 === 2 ? "International" : index % 4 === 3 ? "Science & Tech" : "National");
    const colorClass = categoryColor(category);
    return `<article class="ca-question-card" data-category="${htmlEscape(category)}">
      <div class="ca-qnum">Q${index + 1}</div>
      <div class="ca-question-body">
        <div class="ca-card-head"><h2>${htmlEscape(item.question)}</h2><span class="ca-badge ${colorClass}">${htmlEscape(category)}</span></div>
        ${[item.answer ? `<p class="ca-answer">उत्तर: ${htmlEscape(item.answer)}</p>` : "", item.explanation ? `<p class="ca-explain">${htmlEscape(item.explanation)}</p>` : ""].filter(Boolean).join("")}
      </div>
      <div class="ca-thumb ca-thumb-${colorClass}">${item.image ? `<img src="${htmlEscape(item.image)}" alt="" loading="lazy">` : `<div class="ca-thumb-placeholder"><i class="${categoryIcon(category)}"></i><span>${htmlEscape(category)}</span></div>`}</div>
    </article>`;
  }).join("");
  const monthRows = [dateText || "Today", "11 June 2026", "10 June 2026", "09 June 2026", "08 June 2026"];
  const schema = JSON.stringify(buildSchemaGraph({ id, job, canonicalUrl }), null, 2);
  return `<!DOCTYPE html>
<html lang="hi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${htmlEscape(seo.seoTitle || `${title} | EMITRAWALA.ONLINE`)}</title>
<meta name="description" content="${htmlEscape(description)}">
<meta name="robots" content="index,follow">
<meta property="og:type" content="article">
<meta property="og:title" content="${htmlEscape(seo.seoTitle || title)}">
<meta property="og:description" content="${htmlEscape(description)}">
<meta property="og:url" content="${htmlEscape(canonicalUrl)}">
<meta name="twitter:card" content="summary">
<link rel="canonical" href="${htmlEscape(canonicalUrl)}">
<link rel="icon" type="image/png" sizes="512x512" href="../../favicon.png">
<link rel="icon" type="image/svg+xml" href="../../favicon.svg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800;900&family=Noto+Sans+Devanagari:wght@400;600;700;800;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
<script type="application/ld+json" id="jobSchemaJsonLd">
${schema}
</script>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body.current-affairs-static{font-family:'Poppins','Noto Sans Devanagari',sans-serif;background:#fffdf7;color:#111827;line-height:1.55}
a{text-decoration:none;color:inherit}
.ca-top{background:#05295d;color:#fff}
.ca-top-inner{max-width:1220px;margin:auto;display:grid;grid-template-columns:330px 1fr 210px;gap:24px;align-items:center;padding:20px 24px}
.ca-logo{font-size:32px;font-weight:900;line-height:1}.ca-logo span{color:#ffc400}.ca-tagline{font-size:13px;font-weight:600;margin-top:4px}
.ca-search{display:flex}.ca-search input{width:100%;height:46px;border:0;border-radius:7px 0 0 7px;padding:0 18px;font-size:14px}.ca-search button{width:96px;border:0;background:#ffc400;color:#061b3a;border-radius:0 7px 7px 0;font-weight:900}
.ca-telegram{display:flex;align-items:center;gap:12px;font-weight:800}.ca-telegram i{width:48px;height:48px;border-radius:50%;display:grid;place-items:center;background:#1da1f2;font-size:23px}.ca-telegram small{display:block;font-weight:600}
.ca-menu{background:#05245a;border-top:1px solid rgba(255,255,255,.12);border-bottom:3px solid #ffc400}.ca-menu ul{max-width:1220px;margin:auto;display:flex;list-style:none}.ca-menu a{display:block;color:#fff;padding:16px 22px;font-weight:800;font-size:14px}.ca-menu .active a{background:#ffc400;color:#061b3a}
.ca-wrap{max-width:1220px;margin:auto;padding:22px 24px 0}.ca-grid{display:grid;grid-template-columns:minmax(0,70%) minmax(280px,30%);gap:22px;align-items:start}
.ca-hero{text-align:center;margin-bottom:20px}.ca-hero h1{font-size:40px;line-height:1.15;color:#072b61;font-weight:900}.ca-hero .date{display:block;color:#c5161d;font-size:36px}.ca-hero p{font-size:16px;margin-top:8px}
.ca-content-search{display:flex;margin:18px auto 20px;max-width:680px}.ca-content-search input{height:48px;border:1px solid #cbd5e1;border-radius:8px 0 0 8px;padding:0 18px;font-size:16px;flex:1}.ca-content-search button{width:110px;border:0;border-radius:0 8px 8px 0;background:#072b61;color:#fff;font-weight:900}
.ca-tabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:20px}.ca-tabs span{border:1px solid #f3c747;background:#fff9df;border-radius:8px;padding:9px 13px;font-size:13px;font-weight:800;color:#061b3a;cursor:pointer;user-select:none}.ca-tabs span.active,.ca-tabs span:first-child{background:#072b61;color:#fff;border-color:#072b61}
.ca-question-list{display:grid;gap:14px}.ca-question-card{position:relative;display:grid;grid-template-columns:58px minmax(0,1fr) 170px;gap:12px;align-items:start;background:#fff;border:1px solid #d7dee8;border-radius:9px;padding:16px;box-shadow:0 8px 22px rgba(7,43,97,.10)}
.ca-qnum{width:50px;height:50px;border-radius:50%;background:#072b61;color:#fff;display:grid;place-items:center;font-size:18px;font-weight:900}.ca-card-head{display:flex;gap:10px;justify-content:space-between;align-items:flex-start}.ca-card-head h2{font-size:20px;line-height:1.35;color:#172033;font-weight:900}
.ca-answer{display:inline-block;background:#e9fff0;border-left:4px solid #149540;color:#137433;font-weight:900;margin:15px 0 8px;padding:8px 12px;border-radius:6px}.ca-explain{font-size:15px;color:#111827;white-space:pre-line;background:#fff8d9;border:1px solid #ffe28a;border-radius:7px;padding:10px 12px;margin-top:8px}.ca-badge{position:absolute;right:16px;top:16px;border-radius:6px;padding:5px 9px;font-size:12px;font-weight:900;white-space:nowrap}.ca-badge.national{background:#e6f6df;color:#1f6a28}.ca-badge.sports{background:#ffe9d8;color:#e23519}.ca-badge.international{background:#e4f0ff;color:#0642a3}.ca-badge.science{background:#f0dcff;color:#5d1580}
.ca-thumb{width:170px;height:100px;border-radius:7px;overflow:hidden;align-self:center;background:#eef4fb}.ca-thumb img{width:100%;height:100%;object-fit:cover}.ca-thumb-placeholder{height:100%;display:grid;place-items:center;text-align:center;gap:5px;color:#fff;font-size:34px;background:linear-gradient(135deg,#072b61,#0b9444)}.ca-thumb-placeholder span{font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.02em}.ca-thumb-sports .ca-thumb-placeholder{background:linear-gradient(135deg,#ff7a00,#e23519)}.ca-thumb-international .ca-thumb-placeholder{background:linear-gradient(135deg,#075dcc,#1da1f2)}.ca-thumb-science .ca-thumb-placeholder{background:linear-gradient(135deg,#6735b8,#d946ef)}.ca-thumb-national .ca-thumb-placeholder{background:linear-gradient(135deg,#0b9444,#072b61)}
.ca-more{display:flex;justify-content:center;margin:16px 0 24px}.ca-blue-btn,.ca-yellow-btn{border:0;border-radius:7px;font-weight:900;display:inline-flex;align-items:center;justify-content:center;gap:10px;cursor:pointer}.ca-blue-btn{background:#072b61;color:#fff;padding:12px 34px}.ca-yellow-btn{background:#ffc400;color:#061b3a;padding:12px 26px}
.ca-side{display:grid;gap:16px}.ca-side-box{border:1px solid #cbd5e1;border-radius:9px;background:#fff;overflow:hidden}.ca-side-box h3{background:#072b61;color:#fff;text-align:center;padding:11px 12px;font-size:18px}.quiz-body{display:grid;grid-template-columns:72px 1fr;gap:18px;align-items:center;padding:22px 28px}.quiz-icon{font-size:58px;color:#072b61}.quiz-meta p{display:flex;justify-content:space-between;font-weight:700;margin:4px 0}.quiz-action{padding:0 28px 20px}.quiz-action .ca-yellow-btn{width:100%;font-size:20px}
.pdf-body{display:grid;grid-template-columns:76px 1fr;gap:18px;align-items:center;padding:20px 28px}.pdf-icon{font-size:58px;color:#e52525}.pdf-body strong{color:#072b61;text-transform:uppercase}.pdf-body .ca-yellow-btn{grid-column:1/3;width:100%;margin-top:6px}
.month-list a,.important-list a{display:flex;align-items:center;gap:12px;border-bottom:1px solid #edf0f4;padding:11px 22px;font-size:14px;font-weight:700}.month-list a i,.important-list a i{color:#072b61;width:20px;text-align:center}.month-title{text-align:center;background:#f7f7f7;color:#072b61;font-weight:900;padding:11px}
.view-all{display:flex;justify-content:center;padding:12px}.features{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:24px 0 18px}.feature{display:grid;grid-template-columns:58px 1fr;gap:12px;align-items:center;background:#fff8dd;border:1px solid #f3c747;border-radius:7px;padding:14px}.feature i{font-size:34px;color:#072b61;text-align:center}.feature h4{color:#072b61;font-size:16px}.feature p{font-size:12px}
.ca-footer{background:#05295d;color:#fff;margin-top:0}.footer-grid{max-width:1220px;margin:auto;display:grid;grid-template-columns:1.4fr 1fr 1fr 1fr;gap:30px;padding:28px 24px}.ca-footer h2,.ca-footer h3{margin-bottom:12px}.ca-footer h2 span{color:#ffc400}.ca-footer a{display:block;color:#fff;margin:6px 0;font-size:14px}.telegram-btn{display:inline-flex!important;align-items:center;gap:10px;background:#1da1f2;border-radius:24px;padding:10px 22px!important;font-weight:900}.copyright{text-align:center;border-top:1px solid rgba(255,255,255,.15);padding:14px}
@media(max-width:900px){.ca-top-inner{grid-template-columns:1fr;gap:14px}.ca-menu ul{overflow-x:auto}.ca-menu a{white-space:nowrap;padding:13px 15px}.ca-grid{grid-template-columns:1fr}.ca-side{order:2}.ca-hero h1{font-size:30px}.ca-hero .date{font-size:28px}.ca-question-card{grid-template-columns:48px 1fr}.ca-badge{position:static;display:inline-flex;margin-left:auto}.ca-card-head{flex-wrap:wrap}.ca-thumb{grid-column:1/3;width:100%;height:150px}.features,.footer-grid{grid-template-columns:1fr}.quiz-body,.pdf-body{grid-template-columns:64px 1fr}}
@media print{.ca-top,.ca-menu,.ca-side,.features,.ca-footer,.ca-content-search,.ca-tabs,.ca-more{display:none!important}.ca-wrap{padding:0}.ca-grid{display:block}.ca-question-card{break-inside:avoid}}
</style>
</head>
<body class="current-affairs-static">
<header class="ca-top"><div class="ca-top-inner"><div><div class="ca-logo">EMITRAWALA.<span>ONLINE</span></div><div class="ca-tagline">SARKARI RESULT, ADMIT CARD, JOBS & MORE</div></div><form class="ca-search" action="../../index.html"><input type="search" placeholder="Search for Jobs, Results, Admit Card...."><button>Search</button></form><a class="ca-telegram" href="https://t.me/emitrawalaonline" target="_blank" rel="noopener noreferrer"><i class="fa-brands fa-telegram"></i><span>Join Telegram<small>Stay Updated</small></span></a></div><nav class="ca-menu"><ul><li><a href="../../index.html">HOME</a></li><li><a href="../../#homePortalLatestJobs">LATEST JOBS</a></li><li><a href="../../#homePortalLatestJobs">ADMIT CARD</a></li><li><a href="../../#homePortalLatestJobs">RESULT</a></li><li><a href="../../#homePortalLatestJobs">ANSWER KEY</a></li><li class="active"><a href="../../current-affairs.html">CURRENT AFFAIRS</a></li><li><a href="../../#homePortalLatestJobs">SYLLABUS</a></li><li><a href="../../contact.html">CONTACT US</a></li></ul></nav></header>
<main class="ca-wrap"><div class="ca-grid"><section><div class="ca-hero"><h1>TODAY'S CURRENT AFFAIRS <span class="date">${htmlEscape(displayDate || "DAILY UPDATE")}</span></h1><p>Stay Updated with Daily Current Affairs for All Competitive Exams</p></div><form class="ca-content-search"><input type="search" placeholder="Search in Current Affairs..."><button>Search</button></form><div class="ca-tabs">${categories.map((cat) => `<span>${htmlEscape(cat)}</span>`).join("")}</div><div class="ca-question-list">${questionCards || `<div class="ca-question-card"><div class="ca-qnum">Q1</div><div class="ca-question-body"><div class="ca-card-head"><h2>${htmlEscape(title)}</h2></div><p class="ca-explain">${htmlEscape(description)}</p></div></div>`}</div><div class="ca-more"><a class="ca-blue-btn" href="../../current-affairs.html">View More Current Affairs <i class="fa-solid fa-chevron-down"></i></a></div></section><aside class="ca-side"><div class="ca-side-box"><h3>DAILY CURRENT AFFAIRS QUIZ</h3><div class="quiz-body"><div class="quiz-icon"><i class="fa-regular fa-clipboard"></i></div><div class="quiz-meta"><p><span>Questions</span><b>: ${questions.length || 0}</b></p><p><span>Marks</span><b>: ${questions.length || 0}</b></p><p><span>Time</span><b>: 15 Min</b></p></div></div><div class="quiz-action"><a class="ca-yellow-btn" href="#quiz">START QUIZ <i class="fa-solid fa-chevron-right"></i></a></div></div><div class="ca-side-box"><h3>DAILY CURRENT AFFAIRS PDF</h3><div class="pdf-body"><div class="pdf-icon"><i class="fa-solid fa-file-pdf"></i></div><strong>${htmlEscape(displayDate || "Daily")}<br>Current Affairs PDF</strong>${pdfButton}</div></div><div class="ca-side-box"><h3>CURRENT AFFAIRS BY MONTH</h3><div class="month-title">JUNE 2026</div><div class="month-list">${monthRows.map((row) => `<a href="../../current-affairs.html"><i class="fa-regular fa-calendar-days"></i>${htmlEscape(row)} <span style="margin-left:auto">›</span></a>`).join("")}</div><div class="view-all"><a class="ca-yellow-btn" href="../../current-affairs.html">VIEW ALL</a></div></div><div class="ca-side-box"><h3>IMPORTANT LINKS</h3><div class="important-list"><a href="../../#homePortalLatestJobs"><i class="fa-solid fa-briefcase"></i>Latest Jobs</a><a href="../../#homePortalLatestJobs"><i class="fa-regular fa-id-card"></i>Admit Card</a><a href="../../#homePortalLatestJobs"><i class="fa-solid fa-chart-simple"></i>Results</a><a href="../../#homePortalLatestJobs"><i class="fa-solid fa-key"></i>Answer Key</a><a href="../../#homePortalLatestJobs"><i class="fa-solid fa-book-open"></i>Syllabus</a><a href="../../tools.html"><i class="fa-solid fa-screwdriver-wrench"></i>Important Tools</a><a href="https://whatsapp.com/channel/0029Vb7y0JL9Bb67psBzxG1Q" target="_blank" rel="noopener noreferrer"><i class="fa-brands fa-whatsapp"></i>WhatsApp Channel</a><a href="../../contact.html"><i class="fa-solid fa-phone"></i>Contact Us</a></div></div></aside></div><section class="features"><div class="feature"><i class="fa-solid fa-circle-question"></i><div><h4>DAILY QUIZ</h4><p>Participate in Daily Quiz and Test Your Knowledge</p></div></div><div class="feature"><i class="fa-regular fa-file-pdf"></i><div><h4>MONTHLY PDF</h4><p>Download Monthly Current Affairs PDF</p></div></div><a class="feature" href="../../tools.html"><i class="fa-solid fa-screwdriver-wrench"></i><div><h4>IMPORTANT TOOLS</h4><p>Use free tools for forms, photos and PDFs</p></div></a><a class="feature" href="https://whatsapp.com/channel/0029Vb7y0JL9Bb67psBzxG1Q" target="_blank" rel="noopener noreferrer"><i class="fa-brands fa-whatsapp"></i><div><h4>WHATSAPP CHANNEL</h4><p>Join for daily updates and alerts</p></div></a></section></main><footer class="ca-footer"><div class="footer-grid"><div><h2>EMITRAWALA.<span>ONLINE</span></h2><p>Your Trusted Source for Sarkari Result, Admit Card, Jobs & More.</p></div><div><h3>QUICK LINKS</h3><a href="../../index.html">Home</a><a href="../../about.html">About Us</a><a href="../../privacy-policy.html">Privacy Policy</a><a href="../../terms-and-conditions.html">Terms & Conditions</a></div><div><h3>USEFUL LINKS</h3><a href="../../#homePortalLatestJobs">Latest Jobs</a><a href="../../#homePortalLatestJobs">Admit Card</a><a href="../../#homePortalLatestJobs">Results</a><a href="../../current-affairs.html">Current Affairs</a><a href="../../tools.html">Important Tools</a></div><div><h3>FOLLOW US</h3><p>Join our WhatsApp Channel for Latest Updates</p><a class="telegram-btn" href="https://whatsapp.com/channel/0029Vb7y0JL9Bb67psBzxG1Q" target="_blank" rel="noopener noreferrer"><i class="fa-brands fa-whatsapp"></i> Join WhatsApp</a></div></div><div class="copyright">© 2026 Emitrawala.online | All Rights Reserved.</div></footer><script>(function(){const tabs=[...document.querySelectorAll(".ca-tabs span")],cards=[...document.querySelectorAll(".ca-question-card")],form=document.querySelector(".ca-content-search"),input=document.querySelector(".ca-content-search input");let active="all";function apply(){const q=(input&&input.value||"").toLowerCase().trim();cards.forEach(card=>{const cat=(card.dataset.category||"").toLowerCase();const text=card.innerText.toLowerCase();const okCat=active==="all"||cat===active;const okText=!q||text.includes(q);card.style.display=okCat&&okText?"":"none"})}tabs.forEach((tab,index)=>{if(index===0)tab.classList.add("active");tab.addEventListener("click",()=>{tabs.forEach(t=>t.classList.remove("active"));tab.classList.add("active");active=tab.innerText.toLowerCase().trim();apply()})});if(form)form.addEventListener("submit",event=>{event.preventDefault();apply()});if(input)input.addEventListener("input",apply);})();</script></body></html>`;
};

const renderStaticPostHtml = (id = "", job = {}) => {
  const seo = buildSeoFields(job, id);
  const canonicalUrl = seo.canonicalUrl || jobUrl(id, { ...job, slug: seo.slug });
  if (isPremiumPost(job)) {
    return renderPremiumStaticPostHtml(id, { ...job, slug: seo.slug, canonicalUrl });
  }
  const currentAffairs = isCurrentAffairsPost(job);
  if (currentAffairs) {
    return resolveMergeConflictMarkers(renderCurrentAffairsPremiumHtml({ id, job: { ...job, slug: seo.slug, canonicalUrl }, seo, canonicalUrl }));
  }
  const admissionPost = isAdmissionPost(job);
  const summaryRows = [
    ["Department", job.department],
    ["Post Name", job.postName || seo.title],
    ["Total Posts", job.totalPosts || job.totalVacancy],
    ["Last Date", job.lastApplyDate || job.lastDate],
    ["Qualification", job.qualification],
    ["Location", job.location || job.jobLocation]
  ].filter(([, value]) => String(value || "").trim());
  const fallbackHtml = currentAffairs
    ? renderCurrentAffairsFallbackHtml(job, seo.title, seo.metaDescription)
    : admissionPost
      ? renderAdmissionFallbackHtml(job, seo.title, seo.metaDescription, canonicalUrl)
      : `<h2>${htmlEscape(seo.title)}</h2>
            <div class="content-box">
              <p>${htmlEscape(seo.metaDescription)}</p>
              <table class="detail-table"><tbody>${summaryRows.map(([label, value]) => `<tr><th>${htmlEscape(label)}</th><td>${htmlEscape(value)}</td></tr>`).join("")}</tbody></table>
              <p><a class="auto-link" href="${htmlEscape(canonicalUrl)}">Canonical job detail link</a> | <a class="auto-link" href="../../#homePortalLatestJobs">All Latest Jobs</a></p>
            </div>`;
  const staticPayload = `<script>window.__EMITRA_STATIC_POST__=${JSON.stringify({ id, job: { ...job, slug: seo.slug, canonicalUrl } }).replace(/</g, "\\u003c")};</script>`;
  let html = fs.readFileSync(JOB_DETAIL_PATH, "utf8")
    .replace(/<head>/i, "<head>\n<base href=\"../../\">")
    .replace(/<body>/i, currentAffairs ? `<body class="current-affairs-static">` : "<body>")
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${htmlEscape(seo.seoTitle)}</title>`)
    .replace(/<meta name="description" content="[^"]*">/i, `<meta name="description" content="${htmlEscape(seo.metaDescription)}">`)
    .replace(/<meta property="og:title" content="[^"]*">/i, `<meta property="og:title" content="${htmlEscape(seo.seoTitle)}">`)
    .replace(/<meta property="og:description" content="[^"]*">/i, `<meta property="og:description" content="${htmlEscape(seo.metaDescription)}">`)
    .replace(/<meta property="og:url" content="[^"]*">/i, `<meta property="og:url" content="${htmlEscape(canonicalUrl)}">`)
    .replace(/<link rel="canonical" href="[^"]*">/i, `<link rel="canonical" href="${htmlEscape(canonicalUrl)}">`)
    .replace(/<script type="application\/ld\+json" id="jobSchemaJsonLd">[\s\S]*?<\/script>/i, `<script type="application/ld+json" id="jobSchemaJsonLd">\n${JSON.stringify(buildSchemaGraph({ id, job, canonicalUrl }), null, 2)}\n</script>`)
    .replace(/<span class="tag" id="jobType">[\s\S]*?<\/span>/i, currentAffairs ? `<span class="tag" id="jobType">Current Affairs</span>` : (admissionPost ? `<span class="tag" id="jobType">Admission Details</span>` : `<span class="tag" id="jobType">Job Details</span>`))
    .replace(/<h2 id="sheetTitle">[\s\S]*?<\/h2>/i, admissionPost ? `<h2 id="sheetTitle">Admission Update</h2>` : `<h2 id="sheetTitle">${currentAffairs ? "Current Affairs" : "Job Update"}</h2>`)
    .replace(/<h1 id="jobTitle">[\s\S]*?<\/h1>/i, `<h1 id="jobTitle">${htmlEscape(seo.title)}</h1>`)
    .replace(/<p id="jobIntro">[\s\S]*?<\/p>/i, `<p id="jobIntro">${htmlEscape(seo.metaDescription)}</p>`)
    .replace(/<div id="jobMessage" class="message">[\s\S]*?<\/div>/i, `<div id="jobMessage" class="message" style="display:none;"></div>`)
    .replace(/<div id="jobDetailWrap" class="layout" style="display:none;">/i, `<div id="jobDetailWrap" class="layout" style="display:grid;">`)
    .replace(/<p>© 2026 E-MITRA WALA \| Job Details<\/p>/i, currentAffairs ? `<p>© 2026 E-MITRA WALA | Current Affairs</p>` : `<p>© 2026 E-MITRA WALA | Job Details</p>`)
    .replace(/<aside class="detail-sidebar"/i, `<aside class="detail-sidebar"`)
    .replace(/<script type="module">/i, `${staticPayload}\n<script type="module">`)
    .replace(/<section class="panel" id="seoFallbackPanel">[\s\S]*?<\/section>/i, `<section class="panel" id="seoFallbackPanel">\n          ${fallbackHtml}\n        </section>`);
  if (currentAffairs) {
    [
      "featurePanel", "shortInfoPanel", "importantPanel", "jobInfoPanel", "feePanel", "agePanel",
      "vacancyPanel", "eligibilityPanel", "selectionPanel", "applyProcessPanel", "extraPanel",
      "linksPanel", "faqPanel", "mcqPanel", "authorPanel", "jobToolsPanel"
    ].forEach((panelId) => {
      html = html.replace(new RegExp(`\\n\\s*<section class="panel" id="${panelId}"[\\s\\S]*?<\\/section>`, "i"), "");
    });
    html = html.replace(/<aside class="detail-sidebar" aria-label="Job quick links">[\s\S]*?<\/aside>/i, `<aside class="detail-sidebar" aria-label="Current Affairs quick links">
      <div class="sidebar-card">
        <h3>Daily Current Affairs PDF</h3>
        <div class="ca-sidebar-actions">
          <button class="btn pdf" type="button" onclick="downloadCurrentAffairsPdf('${htmlEscape(seo.slug)}.pdf')"><i class="fa-solid fa-file-pdf"></i> Daily PDF Download</button>
        </div>
      </div>
      <div class="sidebar-card">
        <h3>Join WhatsApp Channel</h3>
        <div class="ca-sidebar-actions">
          <a class="btn whatsapp" href="https://whatsapp.com/channel/0029Vb7y0JL9Bb67psBzxG1Q" target="_blank" rel="noopener noreferrer"><i class="fa-brands fa-whatsapp"></i> Join WhatsApp Channel</a>
        </div>
      </div>
      <div class="sidebar-card">
        <h3>More Current Affairs</h3>
        <div class="related-list"><a href="../../current-affairs.html">View All Current Affairs</a></div>
      </div>
      <div class="sidebar-card">
        <h3>Mock Test</h3>
        <div class="ca-sidebar-actions"><a class="btn dark" href="../../mock-test.html"><i class="fa-solid fa-clipboard-check"></i> Mock Test</a></div>
      </div>
    </aside>`);
  }
  return resolveMergeConflictMarkers(html);
};

const renderPremiumStaticPostHtml = (id = "", job = {}) => {
  const seo = buildSeoFields(job, id);
  const canonicalUrl = seo.canonicalUrl || jobUrl(id, { ...job, slug: seo.slug });
  const payload = {
    ...job,
    slug: seo.slug,
    canonicalUrl,
    seo: {
      ...(job.seo && typeof job.seo === "object" ? job.seo : {}),
      metaTitle: seo.seoTitle,
      metaDescription: seo.metaDescription
    }
  };
  const staticPayload = `<script>window.__EMITRA_STATIC_PREMIUM_POST__=${JSON.stringify(payload).replace(/</g, "\\u003c")};</script>`;
  const schema = `<script type="application/ld+json" data-schema="premium-static">\n${JSON.stringify(buildPremiumSchemaGraph({ id, job: payload, canonicalUrl }), null, 2)}\n</script>`;
  return resolveMergeConflictMarkers(fs.readFileSync(PREMIUM_POST_PATH, "utf8")
    .replace(/<head>/i, "<head>\n<base href=\"../../\">")
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${htmlEscape(seo.seoTitle)}</title>`)
    .replace(/<meta name="description" content="[^"]*">/i, `<meta name="description" content="${htmlEscape(seo.metaDescription)}">`)
    .replace(/<link rel="canonical" href="[^"]*">/i, `<link rel="canonical" href="${htmlEscape(canonicalUrl)}">`)
    .replace(/<script type="module">/i, `${schema}\n${staticPayload}\n<script type="module">`));
};

const removeDynamicJobEntries = (xml = "") => String(xml || "")
  .replace(/\s*<url>\s*<loc>https?:\/\/[^<]+\/job-form\.html<\/loc>[\s\S]*?<\/url>/g, "")
  .replace(/\s*<url>\s*<loc>https?:\/\/[^<]+\/job-detail\.html<\/loc>[\s\S]*?<\/url>/g, "")
  .replace(/\s*<url>\s*<loc>https?:\/\/[^<]+\/job-detail\.html\?id=[\s\S]*?<\/url>/g, "")
  .replace(/\s*<url>\s*<loc>https?:\/\/[^<]+\/post\/[\s\S]*?<\/url>/g, "");

const normalizeJob = (value) => {
  if (typeof value === "string") {
    return { title: value, type: "Online Form", createdAt: 0 };
  }
  return value && typeof value === "object" ? value : {};
};

const isPublishedJob = (job = {}) => String(job.postStatus || "published").toLowerCase() !== "draft";

const isLatestJobTarget = (job = {}) => !job.postTarget || job.postTarget === "latestJob";

const visibleText = (value = "") => String(value || "")
  .replace(/<script[\s\S]*?<\/script>/gi, " ")
  .replace(/<style[\s\S]*?<\/style>/gi, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const wordCount = (value = "") => visibleText(value).split(/\s+/).filter((word) => word.length > 1).length;

const lowValuePattern = /\b(?:dummy|sample|test|testing|demo|empty|untitled|lorem|fgf|asdf|qwerty)\b|^job-\d+$/i;

const qualityValueText = (value = "") => {
  if (Array.isArray(value)) return value.map(qualityValueText).join(" ");
  if (value && typeof value === "object") return Object.values(value).map(qualityValueText).join(" ");
  return String(value || "");
};

const postQualityText = (job = {}) => [
  job.title,
  job.seoTitle,
  job.shortInfo,
  job.metaDescription,
  job.department,
  job.postName,
  job.qualification,
  job.howToApply,
  job.importantDatesManual,
  job.applicationFeeManual,
  job.ageLimitManual,
  job.vacancyDetailsManual,
  job.vacancyDetails,
  job.vacancy,
  job.eligibilityManual,
  job.eligibility,
  job.overview,
  job.applicationFee,
  job.ageLimit,
  job.selectionProcess,
  job.examPattern,
  job.documentsRequired,
  job.howToApply,
  job.importantLinks,
  job.pageContent,
  job.contentText,
  job.faqs,
  job.sections,
  job.intro,
  job.mcqs
].filter(Boolean).map(qualityValueText).join(" ");

const getPostQuality = (id = "", job = {}) => {
  const seo = buildSeoFields(job, id);
  const title = String(job.title || seo.title || "").trim();
  const slug = String(job.slug || seo.slug || id || "").trim();
  const text = postQualityText(job);
  const currentAffairs = isCurrentAffairsPost(job);
  const questionCount = getCurrentAffairsQuestions(job).length;
  const hasRealTitle = title.length >= 8 && !lowValuePattern.test(title) && !lowValuePattern.test(slug);
  const hasUsefulJobStructure = [
    job.shortInfo || job.metaDescription,
    job.lastApplyDate || job.lastDate || job.importantDatesManual || job.importantDates,
    job.qualification || job.eligibilityManual || job.eligibility,
    job.applyLink || job.detailLink || job.officialWebsite || job.importantLinks,
    job.overview || job.vacancyDetails || job.vacancy,
    job.faq || job.faqs
  ].filter((value) => {
    if (Array.isArray(value)) return value.length > 0;
    return String(value || "").trim() && !/^#?$/.test(String(value || "").trim());
  }).length;
  const useful = isPublishedJob(job)
    && hasRealTitle
    && (currentAffairs
      ? questionCount >= 8 || wordCount(text) >= 250
      : hasUsefulJobStructure >= 3 || wordCount(text) >= 300);
  return {
    useful,
    currentAffairs,
    questionCount,
    words: wordCount(text),
    slug,
    reason: useful ? "" : "thin-or-dummy-content"
  };
};

const isUsefulPublishedPost = ({ id = "", job = {} } = {}) => getPostQuality(id, job).useful;

const displayOrder = (job = {}) => {
  const number = Number(job.displayOrder || 0);
  return number > 0 ? number : Number.POSITIVE_INFINITY;
};

const sortJobs = (rows = []) => rows.sort((a, b) => {
  const orderDiff = displayOrder(a.job) - displayOrder(b.job);
  return orderDiff || Number(b.job.createdAt || 0) - Number(a.job.createdAt || 0);
});

const dedupeJobRows = (rows = []) => {
  const seen = new Set();
  return rows.filter(({ id, job }) => {
    const seo = buildSeoFields(job, id);
    const key = (seo.slug || cleanSlug(seo.title) || id).toLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

const portalCategoryLabels = {
  admitCard: "Admit Card",
  result: "Result",
  answerKey: "Answer Key",
  syllabus: "Syllabus",
  admission: "Admission",
  notification: "Notification"
};

const portalItemToJobRow = (category = "", id = "", item = {}) => {
  const title = String(item.title || item.jobTitle || item.text || "Update").trim();
  if (!title) return null;
  const target = normalizePostTarget(category || item.postTarget || item.category);
  const slug = String(item.slug || buildSlug(title, `${category}-${id}`)).trim();
  const url = String(item.url || item.sourceLink || item.detailLink || "").trim();
  const now = item.updatedAt || item.createdAt || Date.now();
  return {
    id: `portal-${target}-${id}`,
    job: {
      ...item,
      title,
      slug,
      postTarget: target,
      type: portalCategoryLabels[target] || "Update",
      postStatus: item.postStatus || "published",
      detailLink: item.detailLink || url || "#",
      sourceLink: item.sourceLink || url || "#",
      shortInfo: item.shortInfo || `${title} ${portalCategoryLabels[target] || "update"} details.`,
      metaDescription: item.metaDescription || `${title} ${portalCategoryLabels[target] || "update"} details, link and latest information.`,
      createdAt: item.createdAt || now,
      updatedAt: now
    }
  };
};

const normalizePremiumPostMap = (premiumPosts = {}) => {
  const map = new Map();
  Object.entries(premiumPosts || {}).forEach(([key, value]) => {
    if (!value || typeof value !== "object") return;
    const slug = String(value.slug || key || "").trim();
    if (!slug) return;
    map.set(slug.toLowerCase(), { ...value, slug });
  });
  return map;
};

const enrichPremiumRows = (rows = [], premiumPosts = {}) => {
  const premiumBySlug = normalizePremiumPostMap(premiumPosts);
  return rows.map((row) => {
    const job = row.job || {};
    if (!isPremiumPost(job)) return row;
    const slug = String(job.premiumPostSlug || job.slug || "").trim();
    const premium = premiumBySlug.get(slug.toLowerCase());
    if (!premium) return row;
    return {
      id: row.id,
      job: {
        ...premium,
        slug: premium.slug || slug,
        title: premium.title || job.title,
        postTarget: job.postTarget || premium.postTarget,
        postStatus: job.postStatus || premium.status || "published",
        status: premium.status || job.postStatus || "published",
        displayOrder: job.displayOrder || premium.displayOrder,
        createdAt: premium.createdAt || job.createdAt,
        updatedAt: premium.updatedAt || job.updatedAt,
        isPremiumPost: true,
        premiumPostSlug: premium.slug || slug,
        canonicalUrl: jobUrl(row.id, { ...job, slug: premium.slug || slug }),
        detailLink: jobUrl(row.id, { ...job, slug: premium.slug || slug })
      }
    };
  });
};

const buildAllStaticRows = (latestRows = [], portalData = {}) => {
  const rows = [...latestRows];
  const latestIds = new Set(latestRows.map(({ id }) => String(id)));
  const latestSlugs = new Set(latestRows.map(({ id, job }) => buildSeoFields(job, id).slug.toLowerCase()));
  Object.entries(portalData || {}).forEach(([category, items]) => {
    if (!items || typeof items !== "object") return;
    Object.entries(items).forEach(([id, item]) => {
      item = item || {};
      if (item.sourceJobId && latestIds.has(String(item.sourceJobId))) return;
      const row = portalItemToJobRow(category, id, item);
      if (!row || !isPublishedJob(row.job) || !isUsefulPublishedPost(row)) return;
      const slug = buildSeoFields(row.job, row.id).slug.toLowerCase();
      if (latestSlugs.has(slug)) return;
      latestSlugs.add(slug);
      rows.push(row);
    });
  });
  return rows;
};

const buildHomeFallbackHtml = (rows = []) => {
  const topRows = dedupeJobRows(sortJobs(rows.filter((row) => isPublishedJob(row.job) && isUsefulPublishedPost(row) && isLatestJobTarget(row.job)))).slice(0, 9);
  if (!topRows.length) {
    return `    <article class="home-job-card">
      <span>Latest Jobs</span>
      <h3><a href="/#homePortalLatestJobs" target="_blank" rel="noopener noreferrer">Latest government job updates</a></h3>
      <p>Latest online form, admit card, result aur answer key updates yahan milenge.</p>
      <a href="/#homePortalLatestJobs" target="_blank" rel="noopener noreferrer">View Details</a>
    </article>`;
  }
  return topRows.map(({ id, job }) => {
    const url = jobUrl(id, job).replace(`${SITE_BASE_URL}/`, "");
    const lastDate = job.lastApplyDate || job.lastDate || "Update Soon";
    const location = job.location || job.jobLocation || "All India";
    return `    <article class="home-job-card">
      <span>${htmlEscape(job.type || "Online Form")}</span>
      <h3><a href="${htmlEscape(url)}" target="_blank" rel="noopener noreferrer">${htmlEscape(job.title || job.text || "Job Update")}</a></h3>
      <p>Last Date: <span class="last-date">${htmlEscape(lastDate)}</span></p>
      <p>Location: ${htmlEscape(location)}</p>
      <a href="${htmlEscape(url)}" target="_blank" rel="noopener noreferrer">View Details</a>
    </article>`;
  }).join("\n");
};

const updateIndexFallback = (rows = []) => {
  const html = fs.readFileSync(INDEX_PATH, "utf8");
  const start = "<!-- SEO_LATEST_JOBS_START -->";
  const end = "<!-- SEO_LATEST_JOBS_END -->";
  const startIndex = html.indexOf(start);
  const endIndex = html.indexOf(end);
  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    throw new Error("SEO latest jobs markers not found in index.html");
  }
  const before = html.slice(0, startIndex + start.length);
  const after = html.slice(endIndex);
  fs.writeFileSync(INDEX_PATH, `${before}\n${buildHomeFallbackHtml(rows)}\n    ${after}`, "utf8");
};

const updateStaticPostPages = (rows = []) => {
  fs.mkdirSync(POST_ROOT, { recursive: true });
  rows.filter(isUsefulPublishedPost).forEach(({ id, job }) => {
    const seo = buildSeoFields(job, id);
    const dir = path.join(POST_ROOT, seo.slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "index.html"), renderStaticPostHtml(id, { ...job, slug: seo.slug }), "utf8");
  });
};

const readExistingStaticPostRows = (rows = []) => {
  if (!fs.existsSync(POST_ROOT)) return [];
  const knownSlugs = new Set(rows.map(({ id, job }) => buildSeoFields(job, id).slug.toLowerCase()));
  return fs.readdirSync(POST_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const slug = entry.name;
      if (knownSlugs.has(slug.toLowerCase())) return null;
      const filePath = path.join(POST_ROOT, slug, "index.html");
      if (!fs.existsSync(filePath)) return null;
      const html = fs.readFileSync(filePath, "utf8");
      const title = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]
        || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
        || slug.replace(/-/g, " ");
      const stat = fs.statSync(filePath);
      return {
        id: `static-${slug}`,
        job: {
          title: title.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim(),
          slug,
          postStatus: "published",
          pageContent: visibleText(html),
          updatedAt: stat.mtimeMs
        }
      };
    })
    .filter(Boolean)
    .filter(isUsefulPublishedPost);
};

const withNoindexMeta = (html = "") => {
  if (/<meta\s+name=["']robots["'][^>]*>/i.test(html)) {
    return html.replace(/<meta\s+name=["']robots["'][^>]*>/i, '<meta name="robots" content="noindex,follow">');
  }
  return html.replace(/<head>/i, '<head>\n<meta name="robots" content="noindex,follow">');
};

const noindexExcludedStaticPages = (usefulRows = []) => {
  if (!fs.existsSync(POST_ROOT)) return 0;
  const usefulSlugs = new Set(usefulRows.map(({ id, job }) => buildSeoFields(job, id).slug.toLowerCase()));
  let updated = 0;
  fs.readdirSync(POST_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .forEach((entry) => {
      const slug = entry.name.toLowerCase();
      if (usefulSlugs.has(slug)) return;
      const filePath = path.join(POST_ROOT, entry.name, "index.html");
      if (!fs.existsSync(filePath)) return;
      const html = fs.readFileSync(filePath, "utf8");
      let refreshedHtml = html;
      const payloadMatch = html.match(/window\.__EMITRA_STATIC_POST__=([\s\S]*?);<\/script>/);
      if (payloadMatch) {
        try {
          const payload = JSON.parse(payloadMatch[1]);
          if (payload && payload.job) {
            refreshedHtml = renderStaticPostHtml(payload.id || `static-${entry.name}`, { ...payload.job, slug:entry.name });
          }
        } catch (_error) {
          refreshedHtml = html;
        }
      }
      const nextHtml = withNoindexMeta(refreshedHtml);
      if (nextHtml !== html) {
        fs.writeFileSync(filePath, nextHtml, "utf8");
        updated += 1;
      }
    });
  return updated;
};

const update404PostRedirects = (rows = []) => {
  const html = fs.readFileSync(NOT_FOUND_PATH, "utf8");
  const slugs = rows
    .map(({ id, job }) => buildSeoFields(job, id).slug)
    .filter(Boolean)
    .sort();
  const replacement = `var knownPostSlugs = [\n${slugs.map((slug) => `      ${JSON.stringify(slug)}`).join(",\n")}\n    ];`;
  const pattern = /var knownPostSlugs = \[[\s\S]*?\n    \];/;
  if (!pattern.test(html)) {
    throw new Error("404.html knownPostSlugs block not found");
  }
  const nextHtml = html.replace(pattern, replacement);
  fs.writeFileSync(NOT_FOUND_PATH, nextHtml, "utf8");
};

const patch404SlugMatching = () => {
  const html = fs.readFileSync(NOT_FOUND_PATH, "utf8");
  const nextHtml = html.replace(
    "return slug === requestedSlug || slug.indexOf(requestedSlug + \"-\") === 0;",
    "return slug === requestedSlug || slug.indexOf(requestedSlug + \"-\") === 0 || requestedSlug.indexOf(slug + \"-\") === 0;"
  );
  if (nextHtml !== html) {
    fs.writeFileSync(NOT_FOUND_PATH, nextHtml, "utf8");
  }
};

async function main() {
  const sitemapXml = removeDynamicJobEntries(fs.readFileSync(SITEMAP_PATH, "utf8")).trim();
  const jobs = await fetchJson(`${FIREBASE_URL}/LatestJobs.json`);
  const premiumPosts = await fetchJson(`${FIREBASE_URL}/premiumPosts.json`).catch(() => ({}));
  const portalData = await fetchJson(`${FIREBASE_URL}/portalItems.json`).catch(() => ({}));
  const latestRows = Object.entries(jobs || {})
    .map(([id, value]) => ({ id, job: normalizeJob(value) }))
    .map((row) => enrichPremiumRows([row], premiumPosts)[0])
    .filter((row) => isPublishedJob(row.job) && isUsefulPublishedPost(row));
  const rows = buildAllStaticRows(latestRows, portalData);
  const sitemapRows = [...rows, ...readExistingStaticPostRows(rows)].filter(isUsefulPublishedPost);
  const entries = sitemapRows
    .map(({ id, job }) => sitemapEntry({
      loc: jobUrl(id, job),
      lastmod: sitemapDate(job.updatedAt || job.createdAt || job.postDate),
      changefreq: "daily",
      priority: "0.8"
    }));

  const nextXml = sitemapXml.replace("</urlset>", `${entries.length ? `${entries.join("\n")}\n` : ""}</urlset>\n`);
  const jobSitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join("\n")}
</urlset>
`;
  fs.writeFileSync(SITEMAP_PATH, nextXml, "utf8");
  fs.writeFileSync(JOB_SITEMAP_PATH, jobSitemapXml, "utf8");
  fs.writeFileSync(LEGAL_SITEMAP_PATH, buildLegalSitemapXml(), "utf8");
  updateIndexFallback(rows);
  updateStaticPostPages(rows);
  const noindexedCount = noindexExcludedStaticPages(sitemapRows);
  update404PostRedirects(sitemapRows);
  patch404SlugMatching();
  console.log(`sitemap.xml, sitemap-jobs.xml, index.html fallback, 404 redirects and post pages updated with ${rows.length} useful dynamic URLs, ${sitemapRows.length - rows.length} preserved static URLs, ${noindexedCount} excluded static pages noindexed`);
}

main().catch((error) => {
  console.error(`sitemap generation failed: ${error.message}`);
  process.exitCode = 1;
});
