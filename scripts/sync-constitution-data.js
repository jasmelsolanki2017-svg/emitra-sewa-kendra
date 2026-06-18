const fs = require("fs");
const path = require("path");
const https = require("https");

const root = path.join(__dirname, "..");
const siteUrl = (process.env.SITE_BASE_URL || "https://emitrawala.online").replace(/\/+$/, "");
const firebaseUrl = (process.env.FIREBASE_URL || "https://my-website-73785-default-rtdb.asia-southeast1.firebasedatabase.app").replace(/\/+$/, "");
const outputRoot = path.join(root, "constitution");
const sitemapPath = path.join(root, "sitemap-constitution.xml");
const mainSitemapPath = path.join(root, "sitemap.xml");
const localCandidates = [
  process.env.CONSTITUTION_JSON,
  path.join(root, "constitution-articles.json"),
  path.join(process.env.USERPROFILE || "", "Downloads", "constitution_articles_2_to_50.json")
].filter(Boolean);

const esc = (value = "") => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
const xml = (value = "") => esc(value).replace(/&#039;/g, "&apos;");
const text = (value = "") => String(value ?? "").replace(/\s+/g, " ").trim();
const numberOf = (item = {}) => text(item.articleNo || item.number || item.articleNumber || item.article);
const hindiTitle = (item = {}) => text(item.titleHi || item.hindiTitle || item.titleHindi || item.title);
const englishTitle = (item = {}) => text(item.titleEn || item.englishTitle || item.titleEnglish);
const summary = (item = {}) => text(item.shortSummaryHi || item.summaryHi || item.summary || item.articleTextHi);
const arrayOf = (value) => Array.isArray(value) ? value : (value ? String(value).split(/\r?\n|,/).map(text).filter(Boolean) : []);
const cleanSlug = (value = "") => String(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 75);
const slugOf = (item = {}) => `article-${cleanSlug(numberOf(item))}-${cleanSlug(englishTitle(item)) || "constitution-of-india"}`;
const dateOf = (value) => {
  const raw = text(value);
  let match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  match = raw.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (match) {
    const months = { january:"01",february:"02",march:"03",april:"04",may:"05",june:"06",july:"07",august:"08",september:"09",october:"10",november:"11",december:"12" };
    const month = months[match[2].toLowerCase()];
    if (month) return `${match[3]}-${month}-${String(match[1]).padStart(2, "0")}`;
  }
  const parsed = new Date(value || Date.now());
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString().slice(0, 10) : parsed.toISOString().slice(0, 10);
};
const schemaJson = (value) => JSON.stringify(value).replace(/</g, "\\u003c");

const fetchJson = (url) => new Promise((resolve, reject) => {
  https.get(url, (response) => {
    let body = "";
    response.setEncoding("utf8");
    response.on("data", (chunk) => { body += chunk; });
    response.on("end", () => {
      if (response.statusCode < 200 || response.statusCode >= 300) return reject(new Error(`HTTP ${response.statusCode}`));
      try { resolve(body ? JSON.parse(body) : {}); } catch (error) { reject(error); }
    });
  }).on("error", reject);
});

const normalize = (data) => {
  const source = Array.isArray(data) ? data
    : Array.isArray(data?.constitutionArticles) ? data.constitutionArticles
      : Array.isArray(data?.articles) ? data.articles : Object.values(data || {});
  return source.filter((item) => item && typeof item === "object" && String(item.status || "published").toLowerCase() === "published")
    .sort((a, b) => Number(a.displayOrder || numberOf(a)) - Number(b.displayOrder || numberOf(b))
      || numberOf(a).localeCompare(numberOf(b), undefined, { numeric: true }));
};

const listSection = (heading, values) => {
  const rows = arrayOf(values);
  return rows.length ? `<section class="section"><h2>${esc(heading)}</h2><ul>${rows.map((row) =>
    `<li>${esc(typeof row === "object" ? row.text || row.point || row.title || JSON.stringify(row) : row)}</li>`).join("")}</ul></section>` : "";
};

const buildPage = (article, previous, next) => {
  const number = numberOf(article);
  const hi = hindiTitle(article) || `अनुच्छेद ${number}`;
  const en = englishTitle(article);
  const description = summary(article).slice(0, 155) || `भारतीय संविधान के अनुच्छेद ${number} की हिंदी और English जानकारी।`;
  const canonical = `${siteUrl}/constitution/${slugOf(article)}/`;
  const faqs = Array.isArray(article.faq) ? article.faq.filter((item) => item && (item.question || item.q)) : [];
  const articleSchema = {
    "@context": "https://schema.org", "@type": "Article", headline: `Article ${number}: ${hi}`,
    alternativeHeadline: en || undefined, description, inLanguage: ["hi-IN", "en-IN"], mainEntityOfPage: canonical,
    datePublished: dateOf(article.date || article.createdAt), dateModified: dateOf(article.updatedAt || article.date),
    author: { "@type": "Organization", name: "E-MITRA WALA" },
    publisher: { "@type": "Organization", name: "E-MITRA WALA", logo: { "@type": "ImageObject", url: `${siteUrl}/site-logo.png` } }
  };
  const faqSchema = faqs.length ? {
    "@context": "https://schema.org", "@type": "FAQPage",
    mainEntity: faqs.map((item) => ({ "@type": "Question", name: text(item.question || item.q),
      acceptedAnswer: { "@type": "Answer", text: text(item.answer || item.a) } }))
  } : null;
  const source = article.source && typeof article.source === "object" ? article.source : {};
  return `<!DOCTYPE html>
<html lang="hi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><script src="/site-theme-init.js"></script>
<title>Article ${esc(number)}: ${esc(hi)} | भारतीय संविधान</title>
<meta name="description" content="${esc(description)}"><meta name="robots" content="index,follow,max-image-preview:large">
<link rel="canonical" href="${esc(canonical)}"><link rel="icon" href="../../favicon.png">
<meta property="og:type" content="article"><meta property="og:title" content="Article ${esc(number)}: ${esc(hi)}">
<meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${esc(canonical)}">
<meta property="og:site_name" content="E-MITRA WALA"><meta property="og:image" content="${siteUrl}/site-logo.png">
<meta name="twitter:card" content="summary"><script type="application/ld+json">${schemaJson(articleSchema)}</script>
${faqSchema ? `<script type="application/ld+json">${schemaJson(faqSchema)}</script>` : ""}
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
<style>:root{--blue:#0057a8;--deep:#03224d;--orange:#ff7a00;--page:#f7fbff;--line:#d9e7f7;--text:#202738;--gold:#ffcf75}*{box-sizing:border-box}body{margin:0;background:var(--page);color:var(--text);font-family:Arial,"Noto Sans Devanagari",sans-serif;line-height:1.72}.nav{background:linear-gradient(135deg,#063b78,#061a3a);border-bottom:2px solid var(--orange)}.nav-in{width:min(1100px,94%);margin:auto;min-height:68px;display:flex;align-items:center;justify-content:space-between;gap:20px}.logo{color:#fff;text-decoration:none;font-size:22px;font-weight:900}.logo span{color:#ffb15c}.nav-links{display:flex;gap:16px}.nav-links a{color:#fff;text-decoration:none;font-weight:700}.hero{background:linear-gradient(135deg,var(--blue),var(--deep));color:#fff;padding:30px 5%;border-bottom:4px solid var(--orange)}.hero-in,main{max-width:1050px;margin:auto}.badge{display:inline-block;background:var(--orange);color:var(--deep);padding:6px 12px;border-radius:6px;font-weight:900}.hero h1{color:var(--gold);font-size:clamp(25px,4vw,40px);line-height:1.25;margin:12px 0 5px}.english{font-size:18px;font-weight:700}.meta{display:flex;gap:8px;flex-wrap:wrap;margin-top:13px}.meta span{background:#ffffff1f;border:1px solid #ffffff33;border-radius:99px;padding:5px 10px;font-size:13px;font-weight:700}main{padding:22px 3% 45px}.back{display:inline-block;color:var(--blue);font-weight:800;text-decoration:none;margin-bottom:14px}.section{background:#fff;border:1px solid var(--line);border-top:4px solid var(--blue);border-radius:9px;padding:19px;margin-bottom:14px;box-shadow:0 8px 22px #03224d12}.section h2{color:var(--blue);font-size:21px;margin:0 0 10px}.section p{margin:0;white-space:pre-line}.section ul{margin:0;padding-left:23px}.section li+li{margin-top:7px}.faq{border:1px solid var(--line);border-radius:7px;padding:12px;margin-top:9px}.faq strong{display:block;color:var(--deep)}.pager{display:flex;justify-content:space-between;gap:12px;margin-top:20px}.pager a{background:var(--blue);color:#fff;text-decoration:none;padding:10px 14px;border-radius:7px;font-weight:800}.source{font-size:13px;color:#53627a}footer{background:var(--blue);color:#fff;text-align:center;padding:22px}footer a{color:var(--gold)}@media(max-width:700px){.nav-in{padding:10px 3%;display:block}.nav-links{margin-top:8px;overflow:auto}.hero{padding:24px 4%}.section{padding:15px}.pager{flex-direction:column}}</style>
<link rel="stylesheet" href="../../mobile-responsive-fix.css"><link rel="stylesheet" href="../../site-theme.css"></head><body>
<nav class="nav"><div class="nav-in"><a class="logo" href="../../index.html">E-MITRA <span>WALA</span></a><div class="nav-links"><a href="../../index.html">Home</a><a href="../../current-affairs.html">Current Affairs</a><a href="../../constitution.html">भारतीय संविधान</a></div></div></nav>
<header class="hero"><div class="hero-in"><span class="badge">Article ${esc(number)}</span><h1>${esc(hi)}</h1>${en ? `<div class="english">${esc(en)}</div>` : ""}<div class="meta">${[article.partNo, article.partNameHi, article.partNameEn, article.date].filter(Boolean).map((value) => `<span>${esc(value)}</span>`).join("")}</div></div></header>
<main><a class="back" href="../../constitution.html"><i class="fa-solid fa-arrow-left"></i> सभी संविधान अनुच्छेद</a>
${summary(article) ? `<section class="section"><h2>संक्षिप्त सार</h2><p>${esc(summary(article))}</p></section>` : ""}
${article.articleTextHi ? `<section class="section"><h2>अनुच्छेद की हिंदी में व्याख्या</h2><p>${esc(article.articleTextHi)}</p></section>` : ""}
${article.articleTextEn ? `<section class="section"><h2>Article in English</h2><p>${esc(article.articleTextEn)}</p></section>` : ""}
${listSection("मुख्य बिंदु", article.keyPoints)}${listSection("Exam Useful Points", article.examUseful)}
${faqs.length ? `<section class="section"><h2>अक्सर पूछे जाने वाले प्रश्न</h2>${faqs.map((item) => `<div class="faq"><strong>${esc(item.question || item.q)}</strong><div>${esc(item.answer || item.a)}</div></div>`).join("")}</section>` : ""}
${source.sourceName || source.verifiedFrom ? `<section class="section source"><h2>स्रोत और सूचना</h2><p><strong>${esc(source.sourceName || "Constitution of India")}</strong><br>${esc(source.verifiedFrom || "")}<br>${esc(source.note || "")}</p></section>` : ""}
<nav class="pager" aria-label="Article navigation">${previous ? `<a href="../${slugOf(previous)}/">← Article ${esc(numberOf(previous))}</a>` : "<span></span>"}${next ? `<a href="../${slugOf(next)}/">Article ${esc(numberOf(next))} →</a>` : ""}</nav>
</main><footer>© 2026 E-MITRA WALA | <a href="../../constitution.html">भारतीय संविधान</a></footer><script src="../../site-theme.js" defer></script></body></html>`;
};

const sitemapEntry = (article) => `  <url><loc>${xml(`${siteUrl}/constitution/${slugOf(article)}/`)}</loc><lastmod>${dateOf(article.updatedAt || article.date)}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>`;
const stripEntries = (value) => String(value).replace(/\s*<url>\s*<loc>https?:\/\/[^<]+\/constitution\/[^<]*<\/loc>[\s\S]*?<\/url>/g, "");

async function loadData() {
  if (!process.env.CONSTITUTION_JSON) {
    try {
      console.log("constitution source: Firebase");
      return await fetchJson(`${firebaseUrl}/constitutionArticles.json`);
    } catch (error) {
      console.warn(`Firebase constitution fetch failed, using local fallback: ${error.message}`);
    }
  }
  for (const candidate of localCandidates) {
    if (fs.existsSync(candidate)) {
      console.log(`constitution source: ${candidate}`);
      return JSON.parse(fs.readFileSync(candidate, "utf8"));
    }
  }
  throw new Error("Constitution data source unavailable.");
}

async function main() {
  const articles = normalize(await loadData());
  if (!articles.length) throw new Error("No published constitution articles found.");
  fs.mkdirSync(outputRoot, { recursive: true });
  const expectedSlugs = new Set(articles.map(slugOf));
  fs.readdirSync(outputRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !expectedSlugs.has(entry.name))
    .forEach((entry) => fs.rmSync(path.join(outputRoot, entry.name), { recursive: true, force: true }));
  articles.forEach((article, index) => {
    const directory = path.join(outputRoot, slugOf(article));
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, "index.html"), buildPage(article, articles[index - 1], articles[index + 1]), "utf8");
  });
  const entries = articles.map(sitemapEntry);
  fs.writeFileSync(sitemapPath, `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join("\n")}\n</urlset>\n`, "utf8");
  if (fs.existsSync(mainSitemapPath)) {
    const current = stripEntries(fs.readFileSync(mainSitemapPath, "utf8")).trim();
    fs.writeFileSync(mainSitemapPath, current.replace("</urlset>", `${entries.join("\n")}\n</urlset>\n`), "utf8");
  }
  console.log(`${articles.length} constitution pages generated.`);
}

main().catch((error) => {
  console.error(`constitution sync failed: ${error.message}`);
  process.exitCode = 1;
});
