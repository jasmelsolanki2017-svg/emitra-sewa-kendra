require("dotenv").config();

const express = require("express");
const axios = require("axios");

const app = express();

const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN;
const FIREBASE_URL = (process.env.FIREBASE_URL || "").replace(/\/+$/, "");
const JOBS_PATH = process.env.JOBS_PATH || "LatestJobs";

app.use(express.json({ limit: "1mb" }));

function getTelegramPost(update) {
  return update.message || update.channel_post || update.edited_message || update.edited_channel_post || null;
}

function getText(post) {
  return String(post?.text || post?.caption || "").trim();
}

function pickField(lines, labels) {
  const labelPattern = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const regex = new RegExp(`^\\s*(?:${labelPattern})\\s*[:\\-]\\s*(.+)$`, "i");
  const match = lines.map((line) => line.match(regex)).find(Boolean);
  return match ? match[1].trim() : "";
}

function firstUrl(value) {
  const match = String(value || "").match(/https?:\/\/\S+/i);
  return match ? match[0].replace(/[),.]+$/, "") : "";
}

function buildJobData(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const title =
    pickField(lines, ["title", "job", "job title", "post"]) ||
    lines[0] ||
    "Job Update";

  const applyLine = pickField(lines, ["apply", "apply link", "online apply", "form link"]);
  const detailLine = pickField(lines, ["detail", "details", "notification", "official", "official link"]);

  return {
    title,
    type: pickField(lines, ["type", "category"]) || "Online Form",
    startDate: pickField(lines, ["start", "start date", "starting date"]) || "Update Soon",
    lastDate: pickField(lines, ["last", "last date", "closing date", "end date"]) || "Update Soon",
    qualification: pickField(lines, ["qualification", "eligibility"]) || "Update Soon",
    location: pickField(lines, ["location", "job location"]) || "All India",
    applyLink: firstUrl(applyLine) || firstUrl(text) || "#",
    detailLink: firstUrl(detailLine) || "#",
    pageContent: lines.length > 1 ? lines.slice(1).join("\n") : "",
    source: "telegram",
    createdAt: Date.now()
  };
}

async function saveJob(jobData) {
  if (!FIREBASE_URL) {
    throw new Error("FIREBASE_URL env variable missing");
  }

  const response = await axios.post(`${FIREBASE_URL}/${JOBS_PATH}.json`, jobData);
  return response.data;
}

app.get("/", (req, res) => {
  res.json({
    ok: true,
    message: "Telegram job bot is running",
    firebasePath: JOBS_PATH,
    botConfigured: Boolean(BOT_TOKEN),
    firebaseConfigured: Boolean(FIREBASE_URL)
  });
});

app.post("/", async (req, res) => {
  try {
    const post = getTelegramPost(req.body);
    const text = getText(post);

    if (!text) {
      return res.status(200).send("No text found");
    }

    const jobData = buildJobData(text);
    const saved = await saveJob(jobData);

    return res.status(200).json({
      ok: true,
      message: "Job Added",
      id: saved.name,
      path: JOBS_PATH,
      title: jobData.title
    });
  } catch (err) {
    console.error("Webhook error:", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Bot Running on port ${PORT}`);
});
