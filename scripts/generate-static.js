const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.join(__dirname, "..");
const DB = (process.env.FIREBASE_URL || "https://my-website-73785-default-rtdb.asia-southeast1.firebasedatabase.app").replace(/\/+$/, "");
const SITE = "https://emitrawala.online";
const esc = (v = "") => String(v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");
const slug = (id, item = {}) => String(item.premiumPostSlug || item.slug || "").trim() || `${String(item.title || "update").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,80)}-${String(id).replace(/[^a-z0-9]/gi,"").slice(-6).toLowerCase()}`;
const visible = (item = {}) => !["draft","hidden","deleted"].includes(String(item.postStatus || item.status || "published").toLowerCase()) && item.visible !== false;
const fetchJson = async (key) => {
  const response = await fetch(`${DB}/${key}.json`);
  if (!response.ok) throw new Error(`${key}: HTTP ${response.status}`);
  return response.json();
};
const rowsFrom = (data = {}) => Object.entries(data || {}).map(([id, item]) => ({ id, ...(item || {}) })).filter((item) => item.title && visible(item));
const href = (item) => `post/${encodeURIComponent(slug(item.sourceJobId || item.id, item))}/`;
const postTime = (item = {}) => {
  const raw = item.createdAt || item.publishedAt || item.updatedAt || 0;
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const parsed = new Date(raw).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};
const isNewPost = (item = {}) => {
  const createdTime = postTime({ createdAt:item.createdAt || item.publishedAt });
  return createdTime > 0 && createdTime <= Date.now() && Date.now() - createdTime < 3 * 24 * 60 * 60 * 1000;
};
const sortRows = (rows) => rows.sort((a,b) =>
  postTime(b) - postTime(a)
  || Number(a.displayOrder || 999999) - Number(b.displayOrder || 999999)
);
const DAY_MS = 24 * 60 * 60 * 1000;
const parsePostLastDate = (value = "") => {
  const text = String(value || "").trim();
  let match = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:\b|$)/);
  if (match) {
    const day = Number(match[1]), month = Number(match[2]), year = Number(match[3]);
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
  }
  match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:\b|$)/);
  if (match) {
    const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
  }
  match = text.match(/^(\d{1,2})\s+([a-z]+)\s+(\d{4})(?:\b|$)/i);
  if (!match) return null;
  const months = {january:0,jan:0,february:1,feb:1,march:2,mar:2,april:3,apr:3,may:4,june:5,jun:5,july:6,jul:6,august:7,aug:7,september:8,sep:8,sept:8,october:9,oct:9,november:10,nov:10,december:11,dec:11};
  const day = Number(match[1]), month = months[match[2].toLowerCase()], year = Number(match[3]);
  if (month === undefined) return null;
  const date = new Date(year, month, day);
  return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day ? date : null;
};
const getPostLastDate = (item = {}) => {
  const importantDates = item.importantDates;
  const arrayLastDate = Array.isArray(importantDates)
    ? importantDates.find((row) => {
        const label = String(row?.label || row?.title || row?.name || "").toLowerCase();
        return /last\s*date/.test(label) && /(apply|application|online|form)/.test(label) && !/(fee|payment|correction)/.test(label);
      })?.value
    : "";
  const candidates = [
    item.lastDate,
    item.formLastDate,
    !Array.isArray(importantDates) && importantDates?.lastDate,
    !Array.isArray(importantDates) && importantDates?.applicationLastDate,
    item.applyLastDate,
    item.lastApplyDate,
    arrayLastDate
  ];
  return candidates.find((value) => parsePostLastDate(value)) || "";
};
const getLastDateUrgency = (item = {}, now = new Date()) => {
  const date = parsePostLastDate(getPostLastDate(item));
  if (!date) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((date - today) / DAY_MS);
  return diffDays >= 0 && diffDays <= 2 ? { date, diffDays } : null;
};
const sortPostsByLastDateUrgency = (posts, now = new Date()) => {
  const urgent = [], normal = [];
  sortRows([...posts]).forEach((item) => {
    const urgency = getLastDateUrgency(item, now);
    if (urgency) urgent.push({ item, urgency }); else normal.push(item);
  });
  urgent.sort((a,b) => a.urgency.date - b.urgency.date);
  return [...urgent.map(({ item }) => item), ...normal];
};
const urgencyBadge = (item) => {
  const urgency = getLastDateUrgency(item);
  if (!urgency) return "";
  return `<span class="last-date-urgent-badge">${urgency.diffDays === 0 ? "Last Date Today" : "Last Date Soon"}</span>`;
};

const categoryMeta = {
  latestJob:["latest-jobs.html","All Latest Jobs"],
  admitCard:["admit-card.html","All Admit Card"],
  result:["result.html","All Result"],
  answerKey:["answer-key.html","All Answer Key"],
  syllabus:["syllabus.html","All Syllabus"],
  notification:["notification.html","All Notification"],
  admission:["admission.html","All Admission Form"]
};

const categoryHtml = (target, title, rows) => `<!DOCTYPE html><html lang="hi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><script src="/site-theme-init.js"></script><meta name="robots" content="index,follow"><title>${esc(title)} | E-MITRA WALA</title><meta name="description" content="${esc(title)} की latest static list."><link rel="canonical" href="${SITE}/${categoryMeta[target][0]}"><link rel="icon" href="favicon.png"><link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800;900&family=Noto+Sans+Devanagari:wght@400;600;700;800&display=swap" rel="stylesheet"><link rel="stylesheet" href="category-posts.css?v=20260622-urgent"><link rel="stylesheet" href="/site-theme.css"></head><body data-category-type="${esc(target)}"><div class="topbar"><div>E-MITRA WALA</div><div>${esc(title)}</div></div><header><h1 id="categoryTitle">${esc(title)}</h1><p id="categoryDesc">${rows.length} published posts</p></header><nav><a href="index.html">Home</a><a href="latest-jobs.html">Latest Jobs</a><a href="result.html">Result</a><a href="admit-card.html">Admit Card</a><a href="answer-key.html">Answer Key</a></nav><main><div class="toolbar"><input id="categorySearch" type="search" placeholder="Search posts..."><span class="count" id="categoryCount">${rows.length} Posts</span></div><section class="post-list" id="categoryPostList"><ul>${rows.map((item)=>`<li data-search="${esc(`${item.title} ${item.type || ""} ${item.location || ""}`.toLowerCase())}"><a href="${href(item)}">${esc(item.title)}</a>${target === "latestJob" ? urgencyBadge(item) : ""}${getPostLastDate(item) ? `<span class="last-date-text"> | Last Date : ${esc(getPostLastDate(item))}</span>` : ""}</li>`).join("")}</ul></section></main><footer>© 2026 E-MITRA WALA</footer><script src="category-posts.js?v=20260618-static"></script><script src="/site-theme.js" defer></script></body></html>`;

const currentAffairsHtml = (rows) => {
  const cards = rows.map((item) => `<article class="card" data-search="${esc(`${item.title} ${item.shortInfo || ""}`.toLowerCase())}"><div class="meta"><span>${esc(item.type || "Current Affairs")}</span>${item.postDate ? `<span>${esc(item.postDate)}</span>` : ""}</div><h2><a href="${href(item)}">${esc(item.title)}</a></h2><p>${esc(item.shortInfo || item.metaDescription || "Important facts, questions, answers and explanations.")}</p><a class="read" href="${href(item)}">Read Article</a></article>`).join("");
  const source = fs.readFileSync(path.join(root, "current-affairs.html"), "utf8");
  return source
    .replace(/<div id="postList" class="grid">[\s\S]*?<\/div>\s*<\/main>/, `<div id="postList" class="grid">${cards || '<div class="message">Abhi koi current affairs post available nahi hai.</div>'}</div></main>`)
    .replace(/<script type="module">[\s\S]*?<\/script>/, `<script>(function(){const input=document.getElementById("searchInput"),cards=[...document.querySelectorAll("#postList .card")];if(!input)return;input.addEventListener("input",()=>{const q=input.value.trim().toLowerCase();cards.forEach(card=>card.hidden=!!q&&!card.dataset.search.includes(q));});})();</script>`);
};

const injectHomepageLists = (jobs, portal) => {
  const file = path.join(root, "index.html");
  let html = fs.readFileSync(file, "utf8");
  const configs = [
    ["homePortalNotificationList","notification"],
    ["homePortalAdmitCardList","admitCard"],
    ["homePortalResultList","result"],
    ["homePortalJobList","latestJob"],
    ["homePortalAnswerKeyList","answerKey"],
    ["homePortalSyllabusList","syllabus"],
    ["homePortalAdmissionList","admission"],
    ["homePortalCurrentAffairsList","currentAffairs"]
  ];
  configs.forEach(([listId,target]) => {
    const sourceRows = target === "latestJob"
      ? jobs.filter((item) => !item.postTarget || item.postTarget === "latestJob")
      : target === "currentAffairs"
        ? jobs.filter((item) => String(item.postTarget || item.advancedArticleData?.postTarget || "").toLowerCase().replace(/[^a-z]/g,"") === "currentaffairs")
        : rowsFrom(portal[target] || {}).concat(jobs.filter((item) => item.postTarget === target));
    const sortedRows = target === "latestJob" ? sortPostsByLastDateUrgency(sourceRows) : sortRows(sourceRows);
    const rows = [...new Map(sortedRows.map((item) => [slug(item.sourceJobId || item.id,item),item])).values()].slice(0,10);
    const listHtml = rows.length
      ? rows.map((item) => `<li><span class="post-title-line"><a href="${href(item)}">${esc(item.title)}</a>${target === "latestJob" ? urgencyBadge(item) : ""}${isNewPost(item) ? '<span class="home-new-post-badge">NEW</span>' : ""}</span></li>`).join("")
      : `<li class="home-portal-message">Abhi koi update nahi hai.</li>`;
    html = html.replace(new RegExp(`(<ul class="home-portal-list" id="${listId}">)[\\s\\S]*?(<\\/ul>)`), `$1${listHtml}$2`);
  });
  fs.writeFileSync(file, html, "utf8");
};

const injectHomepageNews = (updates) => {
  const file = path.join(root, "index.html");
  let html = fs.readFileSync(file, "utf8");
  const visibleRows = sortRows(rowsFrom(updates).filter((item) => item.visible === true && String(item.status || "published").toLowerCase() === "published"));
  const postRows = visibleRows.filter((item) => item.manual !== true).slice(0,3);
  const rows = postRows;
  const updateHref = (item) => {
    const raw = String(item.url || item.link || item.postUrl || "").trim();
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw) return `/${raw.replace(/^\/+/, "")}`;
    return href(item);
  };
  const tickerRows = postRows.map((item) => `<div class="news-line"><span class="news-track"><a href="${esc(updateHref(item))}">${esc(item.text || item.title)}</a></span></div>`);
  while (tickerRows.length < 3) tickerRows.push(`<div class="news-line news-placeholder" aria-hidden="true"></div>`);
  const tickerHtml = tickerRows.join("");
  const modalHtml = rows.length
    ? rows.map((item)=>`<a class="news-item" href="${esc(updateHref(item))}">${esc(item.text || item.title)}</a>`).join("")
    : `<p>Abhi koi latest update available nahi hai.</p>`;
  html = html
    .replace(/(<div class="news-ticker-rows" id="newsTickerRows">)[\s\S]*?(<\/div>\s*<\/div>\s*<\/section>)/,
      `$1${tickerHtml}$2`)
    .replace(/(<div id="newsModalList">)[\s\S]*?(<\/div>\s*<\/section>\s*<\/div>)/,
      `$1${modalHtml}$2`);
  fs.writeFileSync(file, html, "utf8");
};

async function main() {
  execFileSync(process.execPath, [path.join(__dirname, "generate-sitemap.js")], { cwd: root, stdio: "inherit" });
  const [jobsData, portalData, linksData, updatesData] = await Promise.all([fetchJson("LatestJobs"), fetchJson("portalItems").catch(()=>({})), fetchJson("importantLinks").catch(()=>({})), fetchJson("latestUpdates").catch(()=>({}))]);
  const jobs = rowsFrom(jobsData);
  const portal = portalData || {};
  for (const [target, [file, title]] of Object.entries(categoryMeta)) {
    const rows = target === "latestJob"
      ? jobs.filter((item) => !item.postTarget || item.postTarget === "latestJob")
      : rowsFrom(portal[target] || {}).concat(jobs.filter((item) => item.postTarget === target));
    const sorted = target === "latestJob" ? sortPostsByLastDateUrgency(rows) : sortRows(rows);
    const deduped = [...new Map(sorted.map((item) => [slug(item.sourceJobId || item.id, item), item])).values()];
    fs.writeFileSync(path.join(root, file), categoryHtml(target, title, deduped), "utf8");
    if (target === "latestJob") fs.writeFileSync(path.join(root, "top-online-form.html"), categoryHtml(target, title, deduped), "utf8");
  }
  const caRows = sortRows(jobs.filter((item) => String(item.postTarget || item.advancedArticleData?.postTarget || "").toLowerCase().replace(/[^a-z]/g,"") === "currentaffairs"));
  fs.writeFileSync(path.join(root, "current-affairs.html"), currentAffairsHtml(caRows), "utf8");
  const importantRows = rowsFrom(linksData).map((item) => ({...item, url:item.url || item.link || "#"}));
  const linksHtml = categoryHtml("latestJob", "Important Links", importantRows)
    .replace(/<section class="post-list" id="categoryPostList">[\s\S]*?<\/section>/,
      `<section class="post-list" id="categoryPostList"><ul>${importantRows.map((item)=>`<li data-search="${esc(item.title.toLowerCase())}"><a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">${esc(item.title)}</a></li>`).join("")}</ul></section>`);
  fs.writeFileSync(path.join(root, "important-links.html"), linksHtml, "utf8");
  injectHomepageLists(jobs, portal);
  injectHomepageNews(updatesData);
  execFileSync(process.execPath, [path.join(__dirname, "sync-constitution-data.js")], { cwd: root, stdio: "inherit" });
  console.log("Static public pages generated.");
}
main().catch((error) => { console.error(error); process.exit(1); });
