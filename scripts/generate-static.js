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
const sortRows = (rows) => rows.sort((a,b) => Number(a.displayOrder || 999999) - Number(b.displayOrder || 999999) || Number(b.createdAt || b.updatedAt || 0) - Number(a.createdAt || a.updatedAt || 0));

const categoryMeta = {
  latestJob:["latest-jobs.html","All Latest Jobs"],
  admitCard:["admit-card.html","All Admit Card"],
  result:["result.html","All Result"],
  answerKey:["answer-key.html","All Answer Key"],
  syllabus:["syllabus.html","All Syllabus"],
  notification:["notification.html","All Notification"],
  admission:["admission.html","All Admission Form"]
};

const categoryHtml = (target, title, rows) => `<!DOCTYPE html><html lang="hi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="index,follow"><title>${esc(title)} | E-MITRA WALA</title><meta name="description" content="${esc(title)} की latest static list."><link rel="canonical" href="${SITE}/${categoryMeta[target][0]}"><link rel="icon" href="favicon.png"><link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800;900&family=Noto+Sans+Devanagari:wght@400;600;700;800&display=swap" rel="stylesheet"><link rel="stylesheet" href="category-posts.css?v=20260618-static"><link rel="stylesheet" href="/site-theme.css"></head><body data-category-type="${esc(target)}"><div class="topbar"><div>E-MITRA WALA</div><div>${esc(title)}</div></div><header><h1 id="categoryTitle">${esc(title)}</h1><p id="categoryDesc">${rows.length} published posts</p></header><nav><a href="index.html">Home</a><a href="latest-jobs.html">Latest Jobs</a><a href="result.html">Result</a><a href="admit-card.html">Admit Card</a><a href="answer-key.html">Answer Key</a></nav><main><div class="toolbar"><input id="categorySearch" type="search" placeholder="Search posts..."><span class="count" id="categoryCount">${rows.length} Posts</span></div><section class="post-list" id="categoryPostList"><ul>${rows.map((item)=>`<li data-search="${esc(`${item.title} ${item.type || ""} ${item.location || ""}`.toLowerCase())}"><a href="${href(item)}">${esc(item.title)}</a>${item.lastDate || item.lastApplyDate ? `<span class="last-date-text"> | Last Date : ${esc(item.lastDate || item.lastApplyDate)}</span>` : ""}</li>`).join("")}</ul></section></main><footer>© 2026 E-MITRA WALA</footer><script src="category-posts.js?v=20260618-static"></script><script src="/site-theme.js" defer></script></body></html>`;

const currentAffairsHtml = (rows) => {
  const cards = rows.map((item) => `<article class="card" data-search="${esc(`${item.title} ${item.shortInfo || ""}`.toLowerCase())}"><div class="meta"><span>${esc(item.type || "Current Affairs")}</span>${item.postDate ? `<span>${esc(item.postDate)}</span>` : ""}</div><h2><a href="${href(item)}">${esc(item.title)}</a></h2><p>${esc(item.shortInfo || item.metaDescription || "Important facts, questions, answers and explanations.")}</p><a class="read" href="${href(item)}">Read Article</a></article>`).join("");
  const source = fs.readFileSync(path.join(root, "current-affairs.html"), "utf8");
  return source
    .replace(/<div id="postList" class="grid">[\s\S]*?<\/div>\s*<\/main>/, `<div id="postList" class="grid">${cards || '<div class="message">Abhi koi current affairs post available nahi hai.</div>'}</div></main>`)
    .replace(/<script type="module">[\s\S]*?<\/script>/, `<script>(function(){const input=document.getElementById("searchInput"),cards=[...document.querySelectorAll("#postList .card")];if(!input)return;input.addEventListener("input",()=>{const q=input.value.trim().toLowerCase();cards.forEach(card=>card.hidden=!!q&&!card.dataset.search.includes(q));});})();</script>`);
};

const stripHomepageFirebase = () => {
  const file = path.join(root, "index.html");
  let html = fs.readFileSync(file, "utf8");
  html = html.replace(/\s*<link rel="preconnect" href="https:\/\/my-website-73785-default-rtdb[^>]+>\s*/i, "\n");
  html = html.replace(/<!-- FIREBASE -->[\s\S]*?<button class="theme-toggle"/, `<!-- PUBLIC_STATIC_DATA: Firebase runtime disabled; content generated at build time. -->\n<button class="theme-toggle"`);
  fs.writeFileSync(file, html, "utf8");
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
    const rows = [...new Map(sortRows(sourceRows).map((item) => [slug(item.sourceJobId || item.id,item),item])).values()].slice(0,10);
    const listHtml = rows.length
      ? rows.map((item) => `<li><span class="post-title-line"><a href="${href(item)}">${esc(item.title)}</a></span></li>`).join("")
      : `<li class="home-portal-message">Abhi koi update nahi hai.</li>`;
    html = html.replace(new RegExp(`(<ul class="home-portal-list" id="${listId}">)[\\s\\S]*?(<\\/ul>)`), `$1${listHtml}$2`);
  });
  fs.writeFileSync(file, html, "utf8");
};

const injectHomepageNews = (jobs) => {
  const file = path.join(root, "index.html");
  let html = fs.readFileSync(file, "utf8");
  const rows = sortRows([...jobs]).slice(0,9);
  const groups = [rows.slice(0,3), rows.slice(3,6), rows.slice(6,9)];
  const tickerHtml = groups.map((group) => {
    const items = group.length ? group : rows.slice(0,3);
    return `<div class="news-line"><span class="news-track">${items.map((item)=>`<a href="${href(item)}">${esc(item.title)}</a>`).join('<span aria-hidden="true"> • </span>')}</span></div>`;
  }).join("");
  const modalHtml = rows.length
    ? rows.map((item)=>`<a class="news-item" href="${href(item)}">${esc(item.title)}</a>`).join("")
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
  const [jobsData, portalData, linksData] = await Promise.all([fetchJson("LatestJobs"), fetchJson("portalItems").catch(()=>({})), fetchJson("importantLinks").catch(()=>({}))]);
  const jobs = rowsFrom(jobsData);
  const portal = portalData || {};
  for (const [target, [file, title]] of Object.entries(categoryMeta)) {
    const rows = target === "latestJob"
      ? jobs.filter((item) => !item.postTarget || item.postTarget === "latestJob")
      : rowsFrom(portal[target] || {}).concat(jobs.filter((item) => item.postTarget === target));
    const deduped = [...new Map(sortRows(rows).map((item) => [slug(item.sourceJobId || item.id, item), item])).values()];
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
  stripHomepageFirebase();
  injectHomepageLists(jobs, portal);
  injectHomepageNews(jobs);
  execFileSync(process.execPath, [path.join(__dirname, "sync-constitution-data.js")], { cwd: root, stdio: "inherit" });
  console.log("Static public pages generated.");
}
main().catch((error) => { console.error(error); process.exit(1); });
