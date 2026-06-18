const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const SITE_BASE_URL = (process.env.SITE_BASE_URL || "https://emitrawala.online").replace(/\/+$/, "");

const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const fail = (message) => {
  throw new Error(message);
};
const ok = (message) => console.log(`ok - ${message}`);

const extractLocs = (xml) => Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g)).map((match) => match[1].trim());
const extractCanonical = (html) => {
  const match = html.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i);
  return match ? match[1] : "";
};
const extractJsonLdBlocks = (html) => Array.from(html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi))
  .map((match) => match[1].trim())
  .filter(Boolean);

const sitemap = read("sitemap.xml");
const jobSitemap = read("sitemap-jobs.xml");
if (!/^<\?xml[\s\S]+<urlset[\s\S]+<\/urlset>\s*$/i.test(sitemap.trim())) {
  fail("sitemap.xml is not a valid urlset shape");
}
if (!/^<\?xml[\s\S]+<urlset[\s\S]+<\/urlset>\s*$/i.test(jobSitemap.trim())) {
  fail("sitemap-jobs.xml is not a valid urlset shape");
}
ok("sitemap XML shape valid");

const locs = extractLocs(sitemap);
const jobLocs = extractLocs(jobSitemap);
const postLocs = locs.filter((loc) => loc.startsWith(`${SITE_BASE_URL}/post/`));
if (!postLocs.length) {
  fail("no /post/<slug> URLs found in sitemap.xml");
}
if (locs.some((loc) => /[?&](id|slug|post)=/i.test(loc))) {
  fail("query URL found in sitemap.xml");
}
if (jobLocs.some((loc) => /[?&](id|slug|post)=/i.test(loc))) {
  fail("query URL found in sitemap-jobs.xml");
}
ok("sitemaps contain canonical /post URLs only");

const duplicatePostLocs = postLocs.filter((loc, index) => postLocs.indexOf(loc) !== index);
if (duplicatePostLocs.length) {
  fail(`duplicate post URLs found in sitemap.xml: ${[...new Set(duplicatePostLocs)].join(", ")}`);
}
const sitemapPostSet = new Set(postLocs);
const missingJobLocs = jobLocs.filter((loc) => loc.startsWith(`${SITE_BASE_URL}/post/`) && !sitemapPostSet.has(loc));
if (missingJobLocs.length) {
  fail(`sitemap-jobs.xml URLs missing from sitemap.xml: ${missingJobLocs.join(", ")}`);
}

postLocs.forEach((postUrl) => {
  const slug = decodeURIComponent(new URL(postUrl).pathname.replace(/^\/post\//, "").replace(/\/$/, ""));
  if (!slug || slug.includes("/") || slug.includes("\\") || slug.includes("..")) {
    fail(`unsafe or invalid post slug in sitemap: ${slug}`);
  }
  const postFile = path.join(root, "post", slug, "index.html");
  if (!fs.existsSync(postFile)) {
    fail(`/post/${slug}/index.html missing`);
  }
  const html = fs.readFileSync(postFile, "utf8");
  if (extractCanonical(html) !== postUrl) {
    fail(`canonical mismatch for ${slug}`);
  }
  const currentAffairsLayout = /<body[^>]+class=["'][^"']*current-affairs-static/i.test(html);
  const premiumLayout = /window\.__EMITRA_STATIC_PREMIUM_POST__=/.test(html)
    && /<main[^>]+class=["'][^"']*premium-shell/i.test(html);
  if (!currentAffairsLayout && !premiumLayout) {
    fail(`premium static layout missing for ${slug}`);
  }
  const blocks = extractJsonLdBlocks(html);
  if (!blocks.length) {
    fail(`JSON-LD missing for ${slug}`);
  }
  blocks.forEach((block, index) => {
    try {
      JSON.parse(block);
    } catch (error) {
      fail(`JSON-LD block ${index + 1} invalid for ${slug}: ${error.message}`);
    }
  });
});
ok(`${postLocs.length} sitemap post pages exist with canonical, premium layout, and valid JSON-LD`);

const indexHtml = read("index.html");
if (!/<h1[^>]*id=["']homeMainHeading["'][^>]*>[\s\S]+<\/h1>/i.test(indexHtml)) {
  fail("homepage strong H1 missing");
}
if (extractCanonical(indexHtml) !== `${SITE_BASE_URL}/`) {
  fail("homepage canonical mismatch");
}
if (!/SEO_LATEST_JOBS_START[\s\S]+href=["']post\//i.test(indexHtml)) {
  fail("homepage crawlable latest post links missing");
}
extractJsonLdBlocks(indexHtml).forEach((block, index) => {
  try {
    JSON.parse(block);
  } catch (error) {
    fail(`homepage JSON-LD block ${index + 1} invalid: ${error.message}`);
  }
});
ok("homepage H1, canonical, crawlable post links, and schema valid");

const notFoundHtml = read("404.html");
if (!/<meta\s+name=["']robots["']\s+content=["']noindex,follow["']/i.test(notFoundHtml)) {
  fail("404.html noindex missing");
}
if (/job-detail\.html\?(id|slug|post)=/i.test(notFoundHtml)) {
  fail("404.html still creates duplicate query URL fallback");
}
ok("404 fallback is noindex and does not create query duplicate");

const serverJs = read("server.js");
if (!/app\.get\("\/job-detail\.html"[\s\S]+res\.redirect\(301,\s*getPublicJobUrl/.test(serverJs)) {
  fail("old job-detail.html?id redirect route missing");
}
if (!/app\.get\("\/post\/:slug"[\s\S]+Object\.keys\(req\.query \|\| \{\}\)\.length[\s\S]+res\.redirect\(301,\s*canonicalPath/.test(serverJs)) {
  fail("/post/<slug>?query duplicate redirect route missing");
}
ok("server redirects old URLs and duplicate query URLs");

console.log("SEO smoke test passed");
