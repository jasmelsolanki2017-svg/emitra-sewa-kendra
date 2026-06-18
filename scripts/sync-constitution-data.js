const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const htmlPath = path.join(root, "constitution.html");
const jsonPath = path.join(root, "data", "constitution.json");

const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
if (!Array.isArray(data.articles)) {
  throw new Error("data/constitution.json me articles array missing hai.");
}

const compactJson = JSON.stringify(data).replace(/</g, "\\u003c");
const html = fs.readFileSync(htmlPath, "utf8");
const pattern = /(<script id="constitutionData" type="application\/json">)[\s\S]*?(<\/script>)/;
if (!pattern.test(html)) {
  throw new Error("constitution.html me constitutionData script tag missing hai.");
}

const nextHtml = html.replace(pattern, `$1${compactJson}$2`);
fs.writeFileSync(htmlPath, nextHtml, "utf8");
console.log(`constitution.html inline data synced: ${data.articles.length} article records`);
