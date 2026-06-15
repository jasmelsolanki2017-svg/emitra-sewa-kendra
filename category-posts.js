const CATEGORY_CONFIG = {
  notification: { title: "All Notification - Sarkari Result", source: "portal", key: "notification" },
  result: { title: "All Result - Sarkari Result", source: "portal", key: "result" },
  "admit-card": { title: "All Admit Card - Sarkari Result", source: "portal", key: "admitCard" },
  "answer-key": { title: "All Answer Key - Sarkari Result", source: "portal", key: "answerKey" },
  syllabus: { title: "All Syllabus - Sarkari Result", source: "portal", key: "syllabus" },
  admission: { title: "All Admission Form - Sarkari Result", source: "portal", key: "admission" },
  "top-online-form": { title: "All Latest Jobs - Sarkari Result", source: "jobs", key: "latestJob" }
};

const firebaseDbBaseUrl = "https://my-website-73785-default-rtdb.asia-southeast1.firebasedatabase.app";
const params = new URLSearchParams(location.search);
const pageType = document.body.dataset.categoryType || params.get("type") || "top-online-form";
const config = CATEGORY_CONFIG[pageType] || CATEGORY_CONFIG["top-online-form"];
const list = document.getElementById("categoryPostList");
const title = document.getElementById("categoryTitle");
const desc = document.getElementById("categoryDesc");
const count = document.getElementById("categoryCount");
const search = document.getElementById("categorySearch");

const escapeHTML = (value = "") => String(value)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#039;");

const safeUrl = (value = "#") => {
  const url = String(value || "#").trim();
  return /^(https?:|\/|post\/)/i.test(url) ? url : "#";
};

const firebaseRestGet = async (path) => {
  const response = await fetch(`${firebaseDbBaseUrl}/${String(path).replace(/^\/+/, "")}.json`, { cache: "no-store" });
  if(!response.ok){ throw new Error(`Firebase ${response.status}`); }
  return response.json();
};

const buildCanonicalSlug = (id, job = {}) => {
  const storedSlug = String(job.slug || "").trim();
  if(storedSlug){ return storedSlug; }
  const base = String(job.title || job.text || "job-update").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/['"]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90) || "job-update";
  const suffix = String(id || "").replace(/[^a-zA-Z0-9]/g, "").slice(-6).toLowerCase();
  return suffix ? `${base}-${suffix}` : base;
};

const premiumPostHref = (job = {}) => {
  const slug = String(job.premiumPostSlug || (job.isPremiumPost ? job.slug : "") || "").trim();
  return slug ? `post/${encodeURIComponent(slug)}/` : "";
};

const canonicalPostHref = (id, job = {}) => `post/${encodeURIComponent(buildCanonicalSlug(id, job))}/`;
const itemHref = (item = {}) => premiumPostHref(item) || (item.sourceJobId ? canonicalPostHref(item.sourceJobId, item) : canonicalPostHref(item.id, item));

const getTime = (item = {}) => Number(item.displayOrder || 0);
const getCreated = (item = {}) => Number(item.createdAt || item.publishedAt || item.postedAt || item.updatedAt || 0);
const isVisible = (item = {}) => {
  const status = String(item.status || item.postStatus || "active").toLowerCase();
  return item.visible !== false && item.hidden !== true && status !== "hidden" && status !== "draft" && status !== "deleted";
};

const normalizeJob = (value = {}) => ({ ...value, title: value.title || value.text || value.name || "Job Update" });
const isLatestJobTarget = (job = {}) => !job.postTarget || job.postTarget === "latestJob" || (job.postTarget === "admission" && !job.isPremiumPost);

const parseDate = (value = "") => {
  if(typeof value === "number"){ return new Date(value); }
  const text = String(value || "").trim();
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatDate = (item = {}) => {
  const value = item.postDate || item.resultDate || item.admitCardDate || item.answerKeyDate || item.createdAt || item.updatedAt || "";
  const date = parseDate(value);
  if(!date){ return ""; }
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }).replace(/ /g, " ");
};

const getLastDateText = (item = {}) => {
  const value = item.lastDate || item.lastApplyDate || item.applicationLastDate || item.formLastDate || "";
  const text = String(value || "").trim();
  return text ? ` | Last Date : ${text}` : "";
};

let allItems = [];

const render = () => {
  const query = String(search?.value || "").trim().toLowerCase();
  const filtered = allItems.filter((item) => !query || [item.title, item.text, item.type, item.location].join(" ").toLowerCase().includes(query));
  if(count){ count.innerText = `${filtered.length} Posts`; }
  if(!filtered.length){
    list.innerHTML = '<div class="empty">Is category me abhi koi post nahi mili.</div>';
    return;
  }
  list.innerHTML = `<ul>${filtered.map((item) => {
    const date = config.source === "jobs" ? getLastDateText(item) : "";
    return `<li><a href="${safeUrl(itemHref(item))}" target="_blank" rel="noopener noreferrer">${escapeHTML(item.title || "Update")}</a>${date ? `<span class="last-date-text">${escapeHTML(date)}</span>` : ""}</li>`;
  }).join("")}</ul>`;
};

const load = async () => {
  title.innerText = config.title;
  desc.innerText = "";
  document.title = `${config.title} | E-MITRA WALA`;
  try{
    if(config.source === "portal"){
      const data = await firebaseRestGet(`portalItems/${config.key}`);
      allItems = data && typeof data === "object"
        ? Object.entries(data).map(([id, item]) => ({ ...(item || {}), id })).filter((item) => item.title && isVisible(item))
        : [];
    }else{
      const data = await firebaseRestGet("LatestJobs");
      allItems = data && typeof data === "object"
        ? Object.entries(data).map(([id, item]) => ({ ...normalizeJob(item || {}), id })).filter((item) => item.title && isVisible(item) && isLatestJobTarget(item))
        : [];
    }
    allItems.sort((a, b) => getTime(a) - getTime(b) || getCreated(b) - getCreated(a));
    render();
  }catch(error){
    list.innerHTML = `<div class="empty">Posts load nahi hui: ${escapeHTML(error.message)}</div>`;
  }
};

if(search){ search.addEventListener("input", render); }
load();
