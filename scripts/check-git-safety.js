const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const asJson = process.argv.includes("--json");
const root = process.cwd();
const findings = [];

function git(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" });
}

function add(message) {
  if (!findings.includes(message)) {
    findings.push(message);
  }
}

function isTextFile(file) {
  return /\.(html?|js|json|md|ya?ml|txt|env|example|rules|css)$/i.test(file)
    || path.basename(file).startsWith(".env");
}

let tracked = [];
try {
  tracked = git(["ls-files", "-z"]).split("\0").filter(Boolean);
} catch (error) {
  add("Git repository read nahi ho payi: " + error.message);
}

const forbiddenTracked = tracked.filter((file) => /^\.env($|\.local$|\.)/i.test(file) && file !== ".env.example");
forbiddenTracked.forEach((file) => add(`${file} tracked hai. Isko commit se hatao: git rm --cached ${file}`));

const patterns = [
  { re: /FIREBASE_SERVICE_ACCOUNT(?:_BASE64)?\s*=\s*(?!your_|change_|$)[A-Za-z0-9+/=._-]{40,}/i, label: "Firebase service account real value" },
  { re: /-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/i, label: "Private key" },
  { re: /CRON_SECRET\s*=\s*(?!change_this_secret|your_|$)[^\s#]{12,}/i, label: "Real cron secret" },
  { re: /GEMINI_API_KEY\s*=\s*(?!your_|$)AIza[A-Za-z0-9_-]{20,}/i, label: "Gemini API key" },
  { re: /OPENAI_API_KEY\s*=\s*(?!your_|$)sk-[A-Za-z0-9_-]{20,}/i, label: "OpenAI API key" },
  { re: /TELEGRAM_BOT_TOKEN\s*=\s*(?!your_|$)\d+:[A-Za-z0-9_-]{20,}/i, label: "Telegram bot token" },
  { re: /WHATSAPP_ACCESS_TOKEN\s*=\s*(?!your_|$)[A-Za-z0-9._-]{40,}/i, label: "WhatsApp access token" },
  { re: /(SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE_KEY)\s*=\s*[^\s#]{20,}/i, label: "Supabase service role key" },
  { re: /sb_secret_[A-Za-z0-9._-]{20,}/i, label: "Supabase secret key" }
];

tracked.filter(isTextFile).forEach((file) => {
  if (file === "package-lock.json") {
    return;
  }
  const fullPath = path.join(root, file);
  let text = "";
  try {
    text = fs.readFileSync(fullPath, "utf8");
  } catch {
    return;
  }
  patterns.forEach((pattern) => {
    if (pattern.re.test(text)) {
      add(`${pattern.label} mila: ${file}`);
    }
  });
});

const safe = findings.length === 0;
const result = {
  safe,
  summary: safe ? "Commit me private .env ya service secret nahi mila." : `${findings.length} safety warning mili.`,
  findings
};

if (asJson) {
  process.stdout.write(JSON.stringify(result));
} else {
  console.log(result.summary);
  findings.forEach((item) => console.log("- " + item));
  process.exitCode = safe ? 0 : 1;
}
