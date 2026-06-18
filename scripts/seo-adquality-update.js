const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SITE = "https://emitrawala.online";

const privatePages = new Set([
  "dashboard.html",
  "admin-links.html",
  "admin-updates.html",
  "admin-ads.html",
  "premium-admin.html",
  "admin-mock-tests.html",
  "admin-auto-checker.html",
  "admin-requests.html",
  "admin-services.html",
  "admin-current-affairs.html",
  "admin-pdf-verification.html",
  "admin-useful-pages.html",
  "all-members.html",
  "user-dashboard.html",
  "user-latest-updates.html",
  "user-important-links.html",
  "user-latest-jobs.html",
  "user-download-center.html",
  "user-data-folder.html",
  "user-my-requests.html"
]);

const thinRedirectPages = new Set([
  "emitra-offline-form.html",
  "pdf-form.html",
  "resume-builder.html",
  "sarkari-kaam.html"
]);

const titleOverrides = {
  "index.html": "E-MITRA WALA | Rajasthan Jobs, Forms, Tools and E-Mitra Services",
  "tools.html": "Free Online Tools | E-MITRA WALA",
  "job-form.html": "Latest Jobs, Admit Card, Result and Notifications | E-MITRA WALA",
  "current-affairs.html": "Current Affairs and Daily Mock Test | E-MITRA WALA",
  "about.html": "About E-MITRA WALA | E-Mitra and Stationery Services",
  "contact.html": "Contact E-MITRA WALA | Help and Support",
  "privacy-policy.html": "Privacy Policy | E-MITRA WALA",
  "terms-and-conditions.html": "Terms and Conditions | E-MITRA WALA",
  "disclaimer.html": "Disclaimer | E-MITRA WALA",
  "cookie-policy.html": "Cookie Policy | E-MITRA WALA",
  "editorial-policy.html": "Editorial Policy | E-MITRA WALA",
  "correction-policy.html": "Correction Policy | E-MITRA WALA",
  "advertising-policy.html": "Advertising Policy | E-MITRA WALA",
  "dmca.html": "DMCA Policy | E-MITRA WALA"
};

const descriptionOverrides = {
  "index.html": "E-MITRA WALA provides Rajasthan job updates, online forms, admit card, results, useful document guides and free browser-based tools.",
  "tools.html": "Use E-MITRA WALA free browser-based image, PDF, QR code, photo resize, signature resize and age calculator tools with internal tool links.",
  "job-form.html": "Find latest jobs, admit cards, results, answer keys, admission forms and official notification links on E-MITRA WALA.",
  "current-affairs.html": "Read current affairs updates and practice daily mock test questions for exam preparation on E-MITRA WALA.",
  "about.html": "Learn about E-MITRA WALA services including e-Mitra support, online forms, documents, jobs, printing and stationery help.",
  "contact.html": "Contact E-MITRA WALA for support related to online forms, tools, documents, job updates and website policies.",
  "privacy-policy.html": "Read how E-MITRA WALA handles user information, cookies, Google AdSense ads, third-party vendors and contact details.",
  "terms-and-conditions.html": "Read the terms and conditions for using E-MITRA WALA website, tools, content and services.",
  "disclaimer.html": "Read the E-MITRA WALA disclaimer about job updates, official sources, external links and user responsibility.",
  "cookie-policy.html": "Read how E-MITRA WALA uses cookies for essential site features, analytics, advertising and user preferences.",
  "editorial-policy.html": "Read the E-MITRA WALA editorial policy for publishing job updates, document guides, tools and public information.",
  "correction-policy.html": "Read how E-MITRA WALA reviews correction requests and updates inaccurate or outdated public information.",
  "advertising-policy.html": "Read the E-MITRA WALA advertising policy for Google AdSense, sponsored placements and ad quality standards.",
  "dmca.html": "Read the E-MITRA WALA DMCA policy and copyright complaint process for content removal requests."
};

const labelFromFile = (file) => {
  if (file === "index.html") return "E-MITRA WALA";
  return file.replace(/\.html$/i, "").replace(/-/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
};

const escapeAttr = (value = "") => String(value)
  .replace(/&/g, "&amp;")
  .replace(/"/g, "&quot;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;");

const textFromTitle = (html, file) => {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return (match ? match[1] : titleOverrides[file] || `${labelFromFile(file)} | E-MITRA WALA`)
    .replace(/\s+/g, " ")
    .trim();
};

const descFromHtml = (html, file) => {
  const match = html.match(/<meta\s+name=["']description["'][^>]*content=["']([^"']*)["'][^>]*>/i)
    || html.match(/<meta\s+content=["']([^"']*)["'][^>]*name=["']description["'][^>]*>/i);
  const fallback = `${labelFromFile(file)} page on E-MITRA WALA with useful public information, services, tools and updates.`;
  return (descriptionOverrides[file] || (match ? match[1] : fallback)).replace(/\s+/g, " ").trim().slice(0, 165);
};

const canonicalFor = (file) => file === "index.html" ? `${SITE}/` : `${SITE}/${file}`;

const upsertTitle = (head, title) => {
  const tag = `<title>${escapeAttr(title)}</title>`;
  return /<title[^>]*>[\s\S]*?<\/title>/i.test(head) ? head.replace(/<title[^>]*>[\s\S]*?<\/title>/i, tag) : `${tag}\n${head}`;
};

const upsertMetaName = (head, name, content) => {
  const tag = `<meta name="${name}" content="${escapeAttr(content)}">`;
  const pattern = new RegExp(`<meta\\s+name=["']${name}["'][^>]*>`, "i");
  const reverse = new RegExp(`<meta\\s+content=["'][^"']*["'][^>]*name=["']${name}["'][^>]*>`, "i");
  if (pattern.test(head)) return head.replace(pattern, tag);
  if (reverse.test(head)) return head.replace(reverse, tag);
  const viewport = head.match(/<meta\s+name=["']viewport["'][^>]*>/i);
  return viewport ? head.replace(viewport[0], `${viewport[0]}\n${tag}`) : `${tag}\n${head}`;
};

const upsertProperty = (head, property, content) => {
  const tag = `<meta property="${property}" content="${escapeAttr(content)}">`;
  const pattern = new RegExp(`<meta\\s+property=["']${property}["'][^>]*>`, "i");
  return pattern.test(head) ? head.replace(pattern, tag) : `${head.trimEnd()}\n${tag}\n`;
};

const upsertCanonical = (head, href) => {
  const tag = `<link rel="canonical" href="${escapeAttr(href)}">`;
  return /<link\s+rel=["']canonical["'][^>]*>/i.test(head)
    ? head.replace(/<link\s+rel=["']canonical["'][^>]*>/i, tag)
    : `${head.trimEnd()}\n${tag}\n`;
};

const normalizeHead = (html, file) => {
  const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  if (!headMatch) return html;
  let head = headMatch[1];
  const title = titleOverrides[file] || textFromTitle(html, file);
  const desc = descFromHtml(html, file);
  const robots = file === "404.html"
    ? "noindex,follow"
    : (privatePages.has(file) ? "noindex,nofollow" : (thinRedirectPages.has(file) ? "noindex,follow" : "index,follow"));
  const canonical = canonicalFor(file);
  head = upsertTitle(head, title);
  head = upsertMetaName(head, "description", desc);
  head = upsertMetaName(head, "robots", robots);
  head = upsertCanonical(head, canonical);
  if (!privatePages.has(file)) {
    head = upsertProperty(head, "og:title", title);
    head = upsertProperty(head, "og:description", desc);
    head = upsertProperty(head, "og:url", canonical);
    head = upsertProperty(head, "og:type", file === "index.html" ? "website" : "article");
  }
  return html.replace(headMatch[1], head);
};

const files = fs.readdirSync(ROOT).filter((file) => /\.html$/i.test(file));
files.forEach((file) => {
  const fullPath = path.join(ROOT, file);
  const html = fs.readFileSync(fullPath, "utf8");
  const next = normalizeHead(html, file);
  if (next !== html) fs.writeFileSync(fullPath, next, "utf8");
});

console.log(`SEO head tags normalized for ${files.length} root HTML files.`);
