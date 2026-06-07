const express = require("express");
const cors = require("cors");
const multer = require("multer");
const pdfParse = require("pdf-parse");

const app = express();
const PORT = process.env.PORT || 10000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || "https://emitrawala.online";
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 20);

app.use(cors({
  origin: CORS_ORIGIN,
  methods: ["GET", "POST", "OPTIONS"],
  credentials: false
}));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_UPLOAD_MB * 1024 * 1024,
    files: 1
  },
  fileFilter: (_req, file, cb) => {
    const name = String(file.originalname || "").toLowerCase();
    const type = String(file.mimetype || "").toLowerCase();
    if (type !== "application/pdf" && !name.endsWith(".pdf")) {
      return cb(new Error("Only PDF files are allowed"));
    }
    return cb(null, true);
  }
});

function isPdfBuffer(buffer) {
  return Buffer.isBuffer(buffer) && buffer.length >= 5 && buffer.slice(0, 5).toString("utf8") === "%PDF-";
}

function cleanText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function detectCertificateNumber(text = "") {
  const normalized = cleanText(text);
  const patterns = [
    /(?:certificate|cert\.?|प्रमाण\s*पत्र)\s*(?:number|no\.?|संख्या|क्रमांक)?\s*[:\-]?\s*([A-Z0-9][A-Z0-9/-]{4,40})/i,
    /(?:verification|reference|receipt|transaction|application|token)\s*(?:number|no\.?|id)?\s*[:\-]?\s*([A-Z0-9][A-Z0-9/-]{4,40})/i,
    /\b([A-Z]{2,6}[/-]?\d{4,}[A-Z0-9/-]*)\b/i,
    /\b(\d{12,16})\b/
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return "";
}

function hasSignatureFields(buffer) {
  const pdfSource = buffer.toString("latin1");
  return /\/FT\s*\/Sig\b/.test(pdfSource)
    || /\/Type\s*\/Sig\b/.test(pdfSource)
    || /\/ByteRange\s*\[/.test(pdfSource)
    || /\/SubFilter\s*\/(?:adbe\.pkcs7\.detached|ETSI\.CAdES\.detached)/.test(pdfSource);
}

app.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "E-MITRA WALA PDF Verification Backend",
    endpoint: "POST /verify-pdf"
  });
});

app.post("/verify-pdf", upload.single("pdf"), async (req, res) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({
        valid: false,
        message: "PDF file is required",
        certificateNumber: "",
        signatureStatus: "Signature Not Verified",
        qrStatus: "QR Not Detected",
        trustStatus: "Unknown"
      });
    }

    if (!isPdfBuffer(req.file.buffer)) {
      return res.status(400).json({
        valid: false,
        message: "Invalid PDF file",
        certificateNumber: "",
        signatureStatus: "Signature Not Verified",
        qrStatus: "QR Not Detected",
        trustStatus: "Unknown"
      });
    }

    let text = "";
    try {
      const parsed = await pdfParse(req.file.buffer);
      text = parsed?.text || "";
    } catch (_error) {
      text = "";
    }
    const certificateNumber = detectCertificateNumber(text);
    return res.json({
      valid: false,
      message: "Signature Not Verified",
      certificateNumber,
      signatureStatus: "Signature Not Verified",
      qrStatus: "QR Not Detected",
      trustStatus: "Unknown"
    });
  } catch (error) {
    return res.status(500).json({
      valid: false,
      message: error.message || "PDF verification failed",
      certificateNumber: "",
      signatureStatus: "Signature Not Verified",
      qrStatus: "QR Not Detected",
      trustStatus: "Unknown"
    });
  }
});

app.use((error, _req, res, _next) => {
  const isSizeError = error?.code === "LIMIT_FILE_SIZE";
  return res.status(isSizeError ? 413 : 400).json({
    valid: false,
    message: isSizeError ? `PDF must be smaller than ${MAX_UPLOAD_MB}MB` : (error.message || "Upload failed"),
    certificateNumber: "",
    signatureStatus: "Signature Not Verified",
    qrStatus: "QR Not Detected",
    trustStatus: "Unknown"
  });
});

app.listen(PORT, () => {
  console.log(`PDF verification backend running on port ${PORT}`);
});
