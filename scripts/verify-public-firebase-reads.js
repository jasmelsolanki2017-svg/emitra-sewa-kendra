const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const required = [
  "index.html","latest-jobs.html","admit-card.html","result.html","answer-key.html",
  "syllabus.html","important-links.html","current-affairs.html","constitution.html",
  "category-posts.js"
];
const sitemap = fs.readFileSync(path.join(root,"sitemap-jobs.xml"),"utf8");
const postFiles = [...sitemap.matchAll(/<loc>https:\/\/emitrawala\.online\/post\/([^<]+)\/<\/loc>/g)]
  .map((match)=>path.join("post",decodeURIComponent(match[1]),"index.html"));
const files = [...required, ...postFiles];
const databasePatterns = [
  /\bonValue\s*\(/,
  /\bgetDocs\s*\(/,
  /\bonSnapshot\s*\(/,
  /\bfirebase\.database\s*\(/,
  /fetch\s*\(\s*[^)]*(?:firebaseio|firebasedatabase)/i,
  /\bget\s*\(\s*ref\s*\(/,
  /\bupdate\s*\(\s*ref\s*\(/
];
const failures = [];
for (const file of files) {
  const full = path.join(root,file);
  if (!fs.existsSync(full)) { failures.push(`${file}: missing`); continue; }
  const text = fs.readFileSync(full,"utf8");
  databasePatterns.forEach((pattern)=>{ if(pattern.test(text)) failures.push(`${file}: ${pattern}`); });
  if (/\bgetDatabase\s*\(/.test(text) && (/\bonValue\s*\(|\bget\s*\(\s*ref\s*\(|fetch\s*\(\s*[^)]*(?:firebaseio|firebasedatabase)/i.test(text))) {
    failures.push(`${file}: public Realtime Database read`);
  }
  if (/Constitution data load ho raha hai|Current affairs posts load ho rahe hain|Posts load nahi hui/i.test(text)) failures.push(`${file}: public content loading placeholder`);
}
if (failures.length) {
  console.error("Public Firebase/static verification failed:\n"+failures.join("\n"));
  process.exit(1);
}
console.log(`Public Firebase verification passed: ${files.length} files, zero direct Firebase reads.`);
