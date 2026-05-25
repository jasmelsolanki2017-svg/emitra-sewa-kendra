const fs = require("fs");
const path = require("path");
const https = require("https");

const SITE_BASE_URL = (process.env.SITE_BASE_URL || "https://emitrawala.online").replace(/\/+$/, "");
const FIREBASE_URL = (process.env.FIREBASE_URL || "https://my-website-73785-default-rtdb.asia-southeast1.firebasedatabase.app").replace(/\/+$/, "");
const SITEMAP_PATH = path.join(__dirname, "..", "sitemap.xml");
const JOB_SITEMAP_PATH = path.join(__dirname, "..", "sitemap-jobs.xml");

const xmlEscape = (value = "") => String(value || "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&apos;");

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
  .replace(/\s*<url>\s*<loc>https:\/\/emitrawala\.online\/job-detail\.html\?id=[\s\S]*?<\/url>/g, "");

async function main() {
  const sitemapXml = removeDynamicJobEntries(fs.readFileSync(SITEMAP_PATH, "utf8")).trim();
  const jobs = await fetchJson(`${FIREBASE_URL}/LatestJobs.json`);
  const entries = Object.entries(jobs || {})
    .filter(([, job]) => job && typeof job === "object" && String(job.postStatus || "published").toLowerCase() !== "draft")
    .map(([id, job]) => sitemapEntry({
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
  console.log(`sitemap.xml and sitemap-jobs.xml updated with ${entries.length} dynamic LatestJobs URLs`);
}

main().catch((error) => {
  console.error(`sitemap generation failed: ${error.message}`);
  process.exitCode = 1;
});
