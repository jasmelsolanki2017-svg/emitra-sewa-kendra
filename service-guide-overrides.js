import { initializeApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getDatabase, ref, get } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyCOAV-Dk_ZryXEawLxtcqMlRU6CPhPzpe8",
  authDomain: "my-website-73785.firebaseapp.com",
  databaseURL: "https://my-website-73785-default-rtdb.asia-southeast1.firebasedatabase.app/",
  projectId: "my-website-73785",
  storageBucket: "my-website-73785.firebasestorage.app",
  messagingSenderId: "854088341990",
  appId: "1:854088341990:web:3211d4ef9fe4b78d025e27"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const escapeHTML = (value = "") => String(value)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#039;");

const safeUrl = (value = "#") => {
  const url = String(value || "#").trim();
  return /^https?:\/\//i.test(url) ? url : "#";
};

const slug = (location.pathname.split("/").pop() || "").replace(/\.html$/i, "");
const mountId = "adminServiceGuidePanel";

function ensureStyle(){
  if(document.getElementById("serviceGuideOverrideStyle")){ return; }
  const style = document.createElement("style");
  style.id = "serviceGuideOverrideStyle";
  style.textContent = `
    .admin-service-panel{background:#fff7ed;border:1px solid #ffd2a4;border-left:5px solid #ff7a00;border-radius:8px;padding:16px;margin:18px auto;box-shadow:0 6px 18px rgba(8,31,74,.08);}
    .admin-service-panel h2{color:#0057a8;margin-bottom:8px;}
    .admin-service-panel p{color:#334155;line-height:1.6;}
    .admin-service-panel ul{margin:10px 0 0 20px;}
    .admin-service-panel li{margin:4px 0;}
    .admin-service-panel a{display:inline-block;background:#0057a8;color:white;text-decoration:none;padding:9px 13px;border-radius:7px;font-weight:800;margin-top:12px;}
  `;
  document.head.appendChild(style);
}

function renderGuide(data = {}){
  let panel = document.getElementById(mountId);
  const hasContent = data.title || data.summary || data.link || (Array.isArray(data.documents) && data.documents.length);
  if(!hasContent){
    if(panel){ panel.remove(); }
    return;
  }
  ensureStyle();
  if(!panel){
    panel = document.createElement("section");
    panel.id = mountId;
    panel.className = "panel admin-service-panel";
    const firstPanel = document.querySelector("main .panel, .layout article .panel, section.panel");
    if(firstPanel && firstPanel.parentNode){
      firstPanel.insertAdjacentElement("afterend", panel);
    }else{
      document.body.insertBefore(panel, document.body.querySelector("footer"));
    }
  }
  const docs = Array.isArray(data.documents) ? data.documents.filter(Boolean) : [];
  panel.innerHTML = `
    <h2>${escapeHTML(data.title || "Service Update")}</h2>
    ${data.summary ? `<p>${escapeHTML(data.summary)}</p>` : ""}
    ${docs.length ? `<ul>${docs.map((doc) => `<li>${escapeHTML(doc)}</li>`).join("")}</ul>` : ""}
    ${data.link ? `<a href="${safeUrl(data.link)}" target="_blank" rel="noopener noreferrer">Open Service Link</a>` : ""}
  `;
}

if(slug){
  get(ref(db, "serviceGuides/" + slug)).then((snapshot) => {
    renderGuide(snapshot.exists() ? (snapshot.val() || {}) : {});
  }).catch(() => {});
}
