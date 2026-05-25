const fs = require("fs");
const path = require("path");
const https = require("https");

const SITE_BASE_URL = (process.env.SITE_BASE_URL || "https://emitrawala.online").replace(/\/+$/, "");
const FIREBASE_URL = (process.env.FIREBASE_URL || "https://my-website-73785-default-rtdb.asia-southeast1.firebasedatabase.app").replace(/\/+$/, "");
const SITEMAP_PATH = path.join(__dirname, "..", "sitemap.xml");
const JOB_SITEMAP_PATH = path.join(__dirname, "..", "sitemap-jobs.xml");
const INDEX_PATH = path.join(__dirname, "..", "index.html");

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
  const params = new URLSearchParams();
  params.set("id", id);
  params.set("slug", String(job.slug || buildSlug(job.title, id)).trim());
  return `${SITE_BASE_URL}/job-detail.html?${params.toString()}`;
};

const sitemapEntry = ({ loc, lastmod, changefreq = "daily", priority = "0.8" }) => `  <url>
    <loc>${xmlEscape(loc)}</loc>
    <lastmod>${xmlEscape(lastmod)}</lastmod>
    <changefreq>${xmlEscape(changefreq)}</changefreq>
    <priority>${xmlEscape(priority)}</priority>
  </url>`;

const removeDynamicJobEntries = (xml = "") => String(xml || "")
  .replace(/\s*<url>\s*<loc>https?:\/\/[^<]+\/job-detail\.html\?id=[\s\S]*?<\/url>/g, "");

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

const buildHomeFallbackHtml = (rows = []) => {
  const topRows = sortJobs(rows.filter(({ job }) => isPublishedJob(job) && isLatestJobTarget(job))).slice(0, 9);
  if (!topRows.length) {
    return `    <article class="home-job-card">
      <span>Latest Jobs</span>
      <h3><a href="job-form.html">Latest government job updates</a></h3>
      <p>Latest online form, admit card, result aur answer key updates yahan milenge.</p>
      <a href="job-form.html">View Details</a>
    </article>`;
  }
  return topRows.map(({ id, job }) => {
    const url = jobUrl(id, job).replace(`${SITE_BASE_URL}/`, "");
    const lastDate = job.lastApplyDate || job.lastDate || "Update Soon";
    const location = job.location || job.jobLocation || "All India";
    return `    <article class="home-job-card">
      <span>${htmlEscape(job.type || "Online Form")}</span>
      <h3><a href="${htmlEscape(url)}">${htmlEscape(job.title || job.text || "Job Update")}</a></h3>
      <p>Last Date: <span class="last-date">${htmlEscape(lastDate)}</span></p>
      <p>Location: ${htmlEscape(location)}</p>
      <a href="${htmlEscape(url)}">View Details</a>
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

async function main() {
  const sitemapXml = removeDynamicJobEntries(fs.readFileSync(SITEMAP_PATH, "utf8")).trim();
  const jobs = await fetchJson(`${FIREBASE_URL}/LatestJobs.json`);
  const rows = Object.entries(jobs || {})
    .map(([id, value]) => ({ id, job: normalizeJob(value) }))
    .filter(({ job }) => isPublishedJob(job));
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
  console.log(`sitemap.xml, sitemap-jobs.xml and index.html fallback updated with ${entries.length} dynamic LatestJobs URLs`);
}

main().catch((error) => {
  console.error(`sitemap generation failed: ${error.message}`);
  process.exitCode = 1;
});
