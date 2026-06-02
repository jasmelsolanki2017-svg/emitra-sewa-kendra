const fs = require("fs");
const path = require("path");
const https = require("https");

const SITE_BASE_URL = (process.env.SITE_BASE_URL || "https://emitrawala.online").replace(/\/+$/, "");
const FIREBASE_URL = (process.env.FIREBASE_URL || "https://my-website-73785-default-rtdb.asia-southeast1.firebasedatabase.app").replace(/\/+$/, "");
const SITEMAP_PATH = path.join(__dirname, "..", "sitemap.xml");
const JOB_SITEMAP_PATH = path.join(__dirname, "..", "sitemap-jobs.xml");
const INDEX_PATH = path.join(__dirname, "..", "index.html");
const JOB_DETAIL_PATH = path.join(__dirname, "..", "job-detail.html");
const NOT_FOUND_PATH = path.join(__dirname, "..", "404.html");
const POST_ROOT = path.join(__dirname, "..", "post");

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
  return [job.postTarget, job.postType, article.postTarget, article.postType, job.category, job.type]
    .some((value) => normalizePostTarget(value) === "currentAffairs");
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

const sitemapEntry = ({ loc, lastmod, changefreq = "daily", priority = "0.8" }) => `  <url>
    <loc>${xmlEscape(loc)}</loc>
    <lastmod>${xmlEscape(lastmod)}</lastmod>
    <changefreq>${xmlEscape(changefreq)}</changefreq>
    <priority>${xmlEscape(priority)}</priority>
  </url>`;

const parseLooseDate = (value = "") => {
  const text = String(value || "").trim();
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

const buildSeoFields = (job = {}, id = "") => {
  const seoData = job.seo && typeof job.seo === "object" ? job.seo : {};
  const title = String(job.title || seoData.title || job.text || "Job Update").replace(/\s+/g, " ").trim();
  const slug = String(job.slug || seoData.slug || buildSlug(title, id)).trim();
  const descParts = [
    title,
    job.department,
    job.totalPosts ? `${job.totalPosts} posts` : "",
    job.lastApplyDate || job.lastDate ? `Last date ${job.lastApplyDate || job.lastDate}` : "",
    "apply link, qualification and important dates"
  ].filter(Boolean);
  return {
    title,
    slug,
    canonicalUrl: String(job.canonicalUrl || jobUrl(id, { ...job, slug })).trim(),
    seoTitle: String(job.seoTitle || seoData.seoTitle || seoData.title || `${title} | E-MITRA WALA`).replace(/\s+/g, " ").trim().slice(0, 70),
    metaDescription: String(job.metaDescription || seoData.metaDescription || seoData.description || job.notificationSummary || job.shortInfo || descParts.join(", ")).replace(/\s+/g, " ").trim().slice(0, 160)
  };
};

const normalizeFaqItems = (items = []) => (Array.isArray(items) ? items : [])
  .map((item) => {
    if (!item || typeof item === "string") {
      return null;
    }
    const question = String(item.question || item.q || item.title || "").trim();
    const answer = String(item.answer || item.a || item.text || item.content || "").trim();
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
    "@type": currentAffairs ? "Article" : ["Article", "JobPosting"],
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
  if (!currentAffairs) {
    article.employmentType = job.type || "Online Form";
    article.datePosted = schemaDateOrUndefined(job.postDate) || schemaDateOrUndefined(job.createdAt);
    article.validThrough = schemaDateOrUndefined(job.lastApplyDate || job.lastDate);
    article.hiringOrganization = job.department ? { "@type": "Organization", "name": job.department } : publisher;
  }
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        "@id": `${canonicalUrl}#breadcrumb`,
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Home", "item": `${SITE_BASE_URL}/` },
          { "@type": "ListItem", "position": 2, "name": "Latest Jobs", "item": `${SITE_BASE_URL}/job-form.html` },
          { "@type": "ListItem", "position": 3, "name": seo.title, "item": canonicalUrl }
        ]
      },
      article,
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
    return question && options.length ? { question, options, answer, explanation } : null;
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
  const faqs = normalizeCurrentAffairsFaqItems(job.faq);
  const questionHtml = questions.map((item, index) => `<article class="mcq-card">
                <div class="mcq-question">Q${index + 1}. ${htmlEscape(item.question)}</div>
                <div class="mcq-options">${item.options.map((option, optionIndex) => `<div class="mcq-option">${String.fromCharCode(65 + optionIndex)}. ${htmlEscape(option)}</div>`).join("")}</div>
                ${item.answer ? `<div class="mcq-answer"><span class="manual-label">Correct Answer:</span> ${htmlEscape(item.answer)}</div>` : ""}
                ${item.explanation ? `<div class="mcq-explanation"><span class="manual-label">Explanation:</span> ${htmlEscape(item.explanation)}</div>` : ""}
              </article>`).join("");
  const faqHtml = faqs.length ? `<section class="panel">
              <h2>FAQ</h2>
              <div class="content-box">${faqs.map((item) => `<div class="content-section"><h2 class="sarkari-section-title">${htmlEscape(item.question)}</h2><p>${htmlEscape(item.answer)}</p></div>`).join("")}</div>
            </section>` : "";
  return `<h2>${htmlEscape(title)}</h2>
            <div class="content-box">
              ${intro ? `<p>${htmlEscape(intro)}</p>` : ""}
              ${dateText || categoryText ? `<table class="detail-table"><tbody>${dateText ? `<tr><th>Date</th><td>${htmlEscape(dateText)}</td></tr>` : ""}${categoryText ? `<tr><th>Category</th><td>${htmlEscape(categoryText)}</td></tr>` : ""}</tbody></table>` : ""}
            </div>
            ${newsItems.length ? `<section class="panel">
              <h2>समाचार</h2>
              <div class="content-box">${renderCurrentAffairsNewsHtml(newsItems)}</div>
            </section>` : ""}
            <section class="panel">
              <h2>Questions</h2>
              <div class="content-box"><div class="mcq-list">${questionHtml}</div></div>
            </section>
            ${faqHtml}`;
};

const renderStaticPostHtml = (id = "", job = {}) => {
  const seo = buildSeoFields(job, id);
  const canonicalUrl = seo.canonicalUrl || jobUrl(id, { ...job, slug: seo.slug });
  const currentAffairs = isCurrentAffairsPost(job);
  const summaryRows = [
    ["Department", job.department],
    ["Post Name", job.postName || seo.title],
    ["Total Posts", job.totalPosts || job.totalVacancy],
    ["Last Date", job.lastApplyDate || job.lastDate],
    ["Qualification", job.qualification],
    ["Location", job.location || job.jobLocation]
  ].filter(([, value]) => String(value || "").trim());
  const fallbackHtml = currentAffairs ? renderCurrentAffairsFallbackHtml(job, seo.title, seo.metaDescription) : `<h2>${htmlEscape(seo.title)}</h2>
            <div class="content-box">
              <p>${htmlEscape(seo.metaDescription)}</p>
              <table class="detail-table"><tbody>${summaryRows.map(([label, value]) => `<tr><th>${htmlEscape(label)}</th><td>${htmlEscape(value)}</td></tr>`).join("")}</tbody></table>
              <p><a class="auto-link" href="${htmlEscape(canonicalUrl)}">Canonical job detail link</a> | <a class="auto-link" href="../../job-form.html">All Latest Jobs</a></p>
            </div>`;
  const staticPayload = `<script>window.__EMITRA_STATIC_POST__=${JSON.stringify({ id, job: { ...job, slug: seo.slug, canonicalUrl } }).replace(/</g, "\\u003c")};</script>`;
  return fs.readFileSync(JOB_DETAIL_PATH, "utf8")
    .replace(/<head>/i, "<head>\n<base href=\"../../\">")
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${htmlEscape(seo.seoTitle)}</title>`)
    .replace(/<meta name="description" content="[^"]*">/i, `<meta name="description" content="${htmlEscape(seo.metaDescription)}">`)
    .replace(/<meta property="og:title" content="[^"]*">/i, `<meta property="og:title" content="${htmlEscape(seo.seoTitle)}">`)
    .replace(/<meta property="og:description" content="[^"]*">/i, `<meta property="og:description" content="${htmlEscape(seo.metaDescription)}">`)
    .replace(/<meta property="og:url" content="[^"]*">/i, `<meta property="og:url" content="${htmlEscape(canonicalUrl)}">`)
    .replace(/<link rel="canonical" href="[^"]*">/i, `<link rel="canonical" href="${htmlEscape(canonicalUrl)}">`)
    .replace(/<script type="application\/ld\+json" id="jobSchemaJsonLd">[\s\S]*?<\/script>/i, `<script type="application/ld+json" id="jobSchemaJsonLd">\n${JSON.stringify(buildSchemaGraph({ id, job, canonicalUrl }), null, 2)}\n</script>`)
    .replace(/<h1 id="jobTitle">[\s\S]*?<\/h1>/i, `<h1 id="jobTitle">${htmlEscape(seo.title)}</h1>`)
    .replace(/<p id="jobIntro">[\s\S]*?<\/p>/i, `<p id="jobIntro">${htmlEscape(seo.metaDescription)}</p>`)
    .replace(/<aside class="detail-sidebar"/i, currentAffairs ? `<aside class="detail-sidebar" style="display:none;"` : `<aside class="detail-sidebar"`)
    .replace(/<script type="module">/i, `${staticPayload}\n<script type="module">`)
    .replace(/<section class="panel" id="seoFallbackPanel">[\s\S]*?<\/section>/i, `<section class="panel" id="seoFallbackPanel">\n          ${fallbackHtml}\n        </section>`);
};

const removeDynamicJobEntries = (xml = "") => String(xml || "")
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
      if (!row || !isPublishedJob(row.job)) return;
      const slug = buildSeoFields(row.job, row.id).slug.toLowerCase();
      if (latestSlugs.has(slug)) return;
      latestSlugs.add(slug);
      rows.push(row);
    });
  });
  return rows;
};

const buildHomeFallbackHtml = (rows = []) => {
  const topRows = dedupeJobRows(sortJobs(rows.filter(({ job }) => isPublishedJob(job) && isLatestJobTarget(job)))).slice(0, 9);
  if (!topRows.length) {
    return `    <article class="home-job-card">
      <span>Latest Jobs</span>
      <h3><a href="job-form.html" target="_blank" rel="noopener noreferrer">Latest government job updates</a></h3>
      <p>Latest online form, admit card, result aur answer key updates yahan milenge.</p>
      <a href="job-form.html" target="_blank" rel="noopener noreferrer">View Details</a>
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
  rows.forEach(({ id, job }) => {
    const seo = buildSeoFields(job, id);
    const dir = path.join(POST_ROOT, seo.slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "index.html"), renderStaticPostHtml(id, { ...job, slug: seo.slug }), "utf8");
  });
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
  const portalData = await fetchJson(`${FIREBASE_URL}/portalItems.json`).catch(() => ({}));
  const latestRows = Object.entries(jobs || {})
    .map(([id, value]) => ({ id, job: normalizeJob(value) }))
    .filter(({ job }) => isPublishedJob(job));
  const rows = buildAllStaticRows(latestRows, portalData);
  const entries = rows
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
  updateIndexFallback(rows);
  updateStaticPostPages(rows);
  update404PostRedirects(rows);
  patch404SlugMatching();
  console.log(`sitemap.xml, sitemap-jobs.xml, index.html fallback, 404 redirects and post pages updated with ${entries.length} dynamic LatestJobs URLs`);
}

main().catch((error) => {
  console.error(`sitemap generation failed: ${error.message}`);
  process.exitCode = 1;
});
