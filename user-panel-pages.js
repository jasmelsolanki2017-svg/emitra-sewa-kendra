import { initializeApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import { getDatabase, ref, onValue, push, set, update, remove } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-database.js";
import { createClient as createSupabaseClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

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
const auth = getAuth(app);
const db = getDatabase(app);
const supabase = createSupabaseClient(
  "https://wjzutgwmdrtlhmgebmua.supabase.co",
  "sb_publishable_MbH1WNIeOHFkVqI13peLpg_TFgzfFjW"
);

const supabaseBucket = "user-files";
const sessionKey = "loginTime";
const sessionLimitMs = 60 * 60 * 1000;
let sessionIntervalId = null;
let currentUser = null;
let currentMember = {};
let currentFiles = [];
let currentFolders = [];
let activeFolderId = "__all";
let currentRequestNotifications = [];
let storageFallbackToken = 0;
const selectedFileIds = new Set();

const pageType = document.body.dataset.page || "";
const allFolderId = "__all";
const generalFolderId = "__general";
const unlockedFolderIds = new Set([allFolderId, generalFolderId]);

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

const formatBytes = (bytes = 0) => {
  const size = Number(bytes || 0);
  if(size >= 1024 * 1024){ return (size / (1024 * 1024)).toFixed(2) + " MB"; }
  if(size >= 1024){ return (size / 1024).toFixed(1) + " KB"; }
  return size + " B";
};

const cleanFileName = (name = "file") => String(name)
  .replace(/[^a-zA-Z0-9._-]+/g, "-")
  .replace(/-+/g, "-")
  .slice(0, 90) || "file";

const cleanFolderName = (name = "") => String(name || "")
  .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, " ")
  .replace(/\s+/g, " ")
  .trim()
  .slice(0, 40);

const hashFolderPassword = async (password = "") => {
  const text = String(password || "");
  if(!text){ return ""; }
  const bytes = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const getFolderRows = () => [
  { id:allFolderId, folder:{ name:"All", system:true, createdAt:-1 } },
  { id:generalFolderId, folder:{ name:"General", system:true, createdAt:0 } },
  ...currentFolders
];

const getUploadFolderRows = () => getFolderRows().filter((item) => item.id !== allFolderId);

const getFolderName = (folderId = generalFolderId) => {
  if(folderId === allFolderId){ return "All"; }
  const row = getFolderRows().find((item) => item.id === folderId);
  return row?.folder?.name || "General";
};

const getFolderRow = (folderId = generalFolderId) => getFolderRows().find((item) => item.id === folderId);

const isFolderLocked = (folderId = generalFolderId) => {
  const row = getFolderRow(folderId);
  return Boolean(row?.folder?.passwordHash && !unlockedFolderIds.has(folderId));
};

const getFileFolderId = (file = {}) => {
  const folderId = String(file.folderId || "").trim();
  return folderId || generalFolderId;
};

const getFolderPathSegment = (folderId, folderName) => {
  if(folderId === generalFolderId){ return "general"; }
  const name = cleanFileName(folderName || "folder").replace(/\.+$/g, "") || "folder";
  return `${folderId}-${name}`.slice(0, 80);
};

const getStorageLimitBytes = () => {
  const direct = Number(currentMember.storageLimitBytes || 0);
  if(direct > 0){ return direct; }
  const mb = Number(currentMember.freeStorageLimitMb || 0);
  return (mb > 0 ? mb : 50) * 1024 * 1024;
};

const getSupabasePublicUrl = (path) => {
  if(!path){ return ""; }
  const { data } = supabase.storage.from(supabaseBucket).getPublicUrl(path);
  return data?.publicUrl || "";
};

const getFileBucket = (file = {}) => {
  return !file.bucket || file.bucket === "user-uploads" ? supabaseBucket : file.bucket;
};

const getFileUrl = (file = {}) => {
  return file.storageProvider === "supabase"
    ? getSupabasePublicUrl(file.path)
    : file.downloadUrl || getSupabasePublicUrl(file.path);
};

const getFileEntry = (id = "") => currentFiles.find((entry) => entry.id === id);

const safeFileRowId = (path = "") => `storage_${btoa(unescape(encodeURIComponent(path))).replace(/=+$/g, "").replace(/[^a-zA-Z0-9_-]/g, "_")}`;

const cleanDisplayFileName = (name = "") => {
  const fileName = String(name || "").split("/").pop() || "Document";
  return fileName.replace(/^[-_A-Za-z0-9]{16,24}-/, "") || fileName;
};

const inferFolderFromPath = (path = "") => {
  const parts = String(path || "").split("/");
  const segment = parts[1] || "general";
  if(segment === "general"){ return { folderId:generalFolderId, folderName:"General" }; }
  const match = currentFolders.find((item) => segment === item.id || segment.startsWith(`${item.id}-`));
  if(match){ return { folderId:match.id, folderName:match.folder.name || "Folder" }; }
  return { folderId:generalFolderId, folderName:"General" };
};

async function listSupabaseUserFiles(prefix, output = []){
  const { data, error } = await supabase.storage.from(supabaseBucket).list(prefix, {
    limit:100,
    offset:0,
    sortBy:{ column:"created_at", order:"desc" }
  });
  if(error){ throw error; }
  for(const item of data || []){
    const path = `${prefix}/${item.name}`.replace(/\/+/g, "/");
    if(item.id || item.metadata?.size){
      output.push({ path, item });
    }else{
      await listSupabaseUserFiles(path, output);
    }
  }
  return output;
}

async function loadStorageFallbackFiles(user){
  const token = ++storageFallbackToken;
  try{
    const rows = await listSupabaseUserFiles(user.uid);
    if(token !== storageFallbackToken){ return; }
    const knownPaths = new Set(currentFiles.map((entry) => String(entry.file.path || "")));
    const fallbackRows = rows
      .filter(({ path }) => path && !knownPaths.has(path))
      .map(({ path, item }) => {
        const folder = inferFolderFromPath(path);
        return {
          id:safeFileRowId(path),
          file:{
            name:cleanDisplayFileName(item.name || path),
            size:Number(item.metadata?.size || 0),
            type:item.metadata?.mimetype || "",
            ...folder,
            path,
            storageProvider:"supabase",
            bucket:supabaseBucket,
            uploadedAt:item.created_at ? new Date(item.created_at).getTime() : 0,
            storageOnly:true
          }
        };
      });
    if(!fallbackRows.length){ return; }
    currentFiles = [...currentFiles, ...fallbackRows]
      .sort((a, b) => Number(b.file.uploadedAt || 0) - Number(a.file.uploadedAt || 0));
    renderUserFiles();
  }catch(error){
    console.warn("Supabase storage fallback list failed", error);
  }
}

const getPreviewKind = (file = {}) => {
  const type = String(file.type || "").toLowerCase();
  const name = String(file.name || file.path || "").toLowerCase();
  if(type.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name)){ return "image"; }
  if(type === "application/pdf" || /\.pdf$/i.test(name)){ return "pdf"; }
  if(type.startsWith("video/") || /\.(mp4|webm|ogg)$/i.test(name)){ return "video"; }
  if(type.startsWith("audio/") || /\.(mp3|wav|ogg|m4a)$/i.test(name)){ return "audio"; }
  if(type.startsWith("text/") || /\.(txt|csv|json|log)$/i.test(name)){ return "text"; }
  return "";
};

const renderFileThumbnail = (file = {}) => {
  const url = getFileUrl(file);
  const name = escapeHTML(cleanDisplayFileName(file.name || "Document"));
  const kind = getPreviewKind(file);
  if(kind === "image" && url){
    return `<button type="button" class="file-thumb image-thumb" onclick="previewUserFileByPath('${escapeHTML(file.path || "")}')" aria-label="Preview ${name}"><img src="${url.replace(/"/g, "&quot;")}" alt="${name}" loading="lazy"></button>`;
  }
  if(kind === "pdf" && url){
    return `<button type="button" class="file-thumb pdf-thumb" onclick="previewUserFileByPath('${escapeHTML(file.path || "")}')" aria-label="Preview ${name}"><iframe src="${url.replace(/"/g, "&quot;")}#toolbar=0&navpanes=0&scrollbar=0" title="${name}" loading="lazy"></iframe><span>PDF</span></button>`;
  }
  const label = kind ? kind.toUpperCase() : "FILE";
  const icon = kind === "video" ? "fa-file-video" : kind === "audio" ? "fa-file-audio" : kind === "text" ? "fa-file-lines" : "fa-file";
  return `<button type="button" class="file-thumb icon-thumb" onclick="previewUserFileByPath('${escapeHTML(file.path || "")}')" aria-label="Preview ${name}"><i class="fa-solid ${icon}"></i><span>${escapeHTML(label)}</span></button>`;
};

const getVisibleExplorerFiles = () => currentFiles.filter((item) => !isFolderLocked(getFileFolderId(item.file)));

const updateFileSelectionStatus = () => {
  const status = document.getElementById("fileSelectionStatus");
  if(status){ status.innerText = `${selectedFileIds.size} file selected`; }
};

function renderAllFilesExplorer(){
  const grid = document.getElementById("allUserFilesGrid");
  if(!grid){ return; }
  const files = getVisibleExplorerFiles();
  const validIds = new Set(files.map((item) => item.id));
  Array.from(selectedFileIds).forEach((id) => {
    if(!validIds.has(id)){ selectedFileIds.delete(id); }
  });
  updateFileSelectionStatus();
  if(!files.length){
    grid.innerHTML = `<div class="message">Abhi koi file upload nahi hai.</div>`;
    return;
  }
  grid.innerHTML = files.map((item) => {
    const id = escapeHTML(item.id);
    const name = cleanDisplayFileName(item.file.name || "Document");
    const selected = selectedFileIds.has(item.id);
    return `
      <div class="explorer-file-card${selected ? " selected" : ""}" data-file-card="${id}">
        <input class="file-select-check" type="checkbox" ${selected ? "checked" : ""} aria-label="Select ${escapeHTML(name)}" onchange="toggleUserFileSelection('${id}', this.checked)">
        <button type="button" class="file-menu-btn" aria-label="File menu" onclick="toggleUserFileMenu('${id}', event)"><i class="fa-solid fa-ellipsis-vertical"></i></button>
        ${renderFileThumbnail(item.file)}
        <strong class="file-name-label" title="${escapeHTML(item.file.name || "Document")}">${escapeHTML(name)}</strong>
        <span class="file-folder-label">${escapeHTML(getFolderName(getFileFolderId(item.file)))}</span>
        <div class="file-menu-panel">
          <button type="button" onclick="previewUserFile('${id}')">Preview</button>
          <button type="button" onclick="downloadUserFile('${id}')">Download</button>
          <button type="button" onclick="renameUserFile('${id}')">Rename</button>
          <button type="button" onclick="moveUserFile('${id}')">Move</button>
          <button type="button" onclick="copyUserFile('${id}')">Copy</button>
          <button type="button" class="danger-btn" onclick="deleteUserFile('${id}')">Delete</button>
        </div>
      </div>
    `;
  }).join("");
}

const closeFileMenus = () => document.querySelectorAll(".explorer-file-card.menu-open").forEach((card) => card.classList.remove("menu-open"));

document.addEventListener("click", (event) => {
  if(!event.target.closest?.(".explorer-file-card")){ closeFileMenus(); }
});

const fileTypeIcon = (file = {}) => {
  const kind = getPreviewKind(file);
  const icon = kind === "image" ? "fa-image" : kind === "pdf" ? "fa-file-pdf" : kind === "video" ? "fa-file-video" : kind === "audio" ? "fa-file-audio" : kind === "text" ? "fa-file-lines" : "fa-file";
  return `<i class="fa-solid ${icon}"></i>`;
};

const ensurePreviewModal = () => {
  let modal = document.getElementById("filePreviewModal");
  if(modal){ return modal; }
  modal = document.createElement("div");
  modal.id = "filePreviewModal";
  modal.className = "preview-modal";
  modal.innerHTML = `
    <div class="preview-dialog" role="dialog" aria-modal="true" aria-labelledby="filePreviewTitle">
      <div class="preview-head">
        <strong id="filePreviewTitle">Document Preview</strong>
        <button type="button" onclick="closeFilePreview()">Close</button>
      </div>
      <div class="preview-body" id="filePreviewBody"></div>
    </div>
  `;
  modal.addEventListener("click", (event) => {
    if(event.target === modal){ window.closeFilePreview(); }
  });
  document.body.appendChild(modal);
  return modal;
};

const openFilePreview = (file = {}) => {
  const url = getFileUrl(file);
  if(!url){
    alert("Preview link nahi mila.");
    return;
  }
  const modal = ensurePreviewModal();
  const title = document.getElementById("filePreviewTitle");
  const body = document.getElementById("filePreviewBody");
  const name = file.name || "Document Preview";
  const safeName = escapeHTML(name);
  const safePreviewUrl = url.replace(/"/g, "&quot;");
  const safeDownloadUrl = safeUrl(url);
  title.innerText = name;
  const kind = getPreviewKind(file);
  if(kind === "image"){
    body.innerHTML = `<img src="${safePreviewUrl}" alt="${safeName}">`;
  }else if(kind === "pdf" || kind === "text"){
    body.innerHTML = `<iframe src="${safePreviewUrl}" title="${safeName}"></iframe>`;
  }else if(kind === "video"){
    body.innerHTML = `<video src="${safePreviewUrl}" controls></video>`;
  }else if(kind === "audio"){
    body.innerHTML = `<audio src="${safePreviewUrl}" controls></audio>`;
  }else{
    body.innerHTML = `<div class="preview-empty"><p>Is file ka browser preview available nahi hai.</p><a class="preview-download" href="${safeDownloadUrl}" target="_blank" rel="noopener noreferrer">Download</a></div>`;
  }
  modal.classList.add("open");
};

const setText = (id, value) => {
  const el = document.getElementById(id);
  if(el){ el.innerText = value; }
};

function ensureNotificationBell(){
  let bell = document.getElementById("requestNotificationBell");
  if(bell){ return bell; }
  bell = document.createElement("button");
  bell.type = "button";
  bell.id = "requestNotificationBell";
  bell.className = "notify-bell";
  bell.title = "Request notifications";
  bell.innerHTML = '<i class="fa-solid fa-bell"></i><span id="requestNotifyCount">0</span>';
  bell.addEventListener("click", () => {
    if(pageType === "requests"){
      window.markRequestNotificationsRead();
    } else {
      window.location.href = "user-my-requests.html";
    }
  });
  document.body.appendChild(bell);
  return bell;
}

function renderRequestNotificationCount(){
  const bell = ensureNotificationBell();
  const count = currentRequestNotifications.filter((item) => item.userUnread === true).length;
  const countBox = document.getElementById("requestNotifyCount");
  if(countBox){ countBox.innerText = String(count); }
  bell.classList.toggle("has-unread", count > 0);
  bell.setAttribute("aria-label", count > 0 ? `${count} new request update` : "No new request update");
}

function loadRequestNotifications(user){
  ensureNotificationBell();
  onValue(ref(db, "userServiceRequests/" + user.uid), (snapshot) => {
    currentRequestNotifications = [];
    if(snapshot.exists()){
      snapshot.forEach((child) => {
        currentRequestNotifications.push({ id:child.key, ...(child.val() || {}) });
      });
    }
    renderRequestNotificationCount();
  });
}

window.markRequestNotificationsRead = async () => {
  if(!currentUser){ return; }
  const unreadRows = currentRequestNotifications.filter((item) => item.userUnread === true);
  if(!unreadRows.length){
    alert("Koi new request notification nahi hai.");
    return;
  }
  try{
    const seenAt = Date.now();
    await Promise.all(unreadRows.map((item) => update(ref(db, "userServiceRequests/" + currentUser.uid + "/" + item.id), {
      userUnread:false,
      userSeenAt:seenAt
    })));
    alert("Request notifications read mark ho gayi.");
  } catch(error){
    alert("Notification read mark nahi hui: " + error.message);
  }
};

const renderMessage = (element, text) => {
  if(element){ element.innerHTML = `<p class="message">${escapeHTML(text)}</p>`; }
};

function updateLiveTime(){
  setText("liveTime", new Date().toLocaleString("hi-IN"));
}

function startSessionTimer(){
  const timerBox = document.getElementById("sessionTimer");
  let loginTime = Number(localStorage.getItem(sessionKey));

  if(sessionIntervalId){ clearInterval(sessionIntervalId); }
  if(!loginTime){
    loginTime = Date.now();
    localStorage.setItem(sessionKey, String(loginTime));
  }

  const updateTimer = () => {
    const remainingMs = sessionLimitMs - (Date.now() - loginTime);
    if(remainingMs <= 0){
      if(timerBox){ timerBox.innerText = "Session Expired"; }
      localStorage.removeItem(sessionKey);
      clearInterval(sessionIntervalId);
      signOut(auth).then(() => { window.location.href = "index.html"; });
      return;
    }

    const totalSeconds = Math.floor(remainingMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if(timerBox){ timerBox.innerText = `Logout in: ${minutes}:${seconds.toString().padStart(2,"0")}`; }
  };

  updateTimer();
  sessionIntervalId = setInterval(updateTimer, 1000);
}

const normalizeUpdate = (value) => {
  if(typeof value === "string"){ return { text:value, createdAt:0 }; }
  return value && typeof value === "object" ? value : {};
};

const getUpdateRows = (snapshot) => {
  const rows = [];
  if(!snapshot.exists()){ return rows; }
  const value = snapshot.val();
  if(value && typeof value === "object" && "text" in value){
    return [normalizeUpdate(value)];
  }
  snapshot.forEach((child) => rows.push(normalizeUpdate(child.val())));
  return rows
    .filter((item) => String(item.text || "").trim() !== "")
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
};

const normalizeJob = (value) => {
  if(typeof value === "string"){ return { title:value, type:"Online Form", createdAt:0 }; }
  return value && typeof value === "object" ? value : {};
};

const getJobRows = (snapshot) => {
  const rows = [];
  if(!snapshot.exists()){ return rows; }
  snapshot.forEach((child) => {
    const job = normalizeJob(child.val());
    if(String(job.title || job.text || "").trim() && String(job.postStatus || "published").toLowerCase() !== "draft"){
      rows.push({ id:child.key, job:job });
    }
  });
  return rows.sort((a, b) => Number(b.job.createdAt || 0) - Number(a.job.createdAt || 0));
};

function loadUpdates(){
  const box = document.getElementById("updatesList");
  onValue(ref(db, "latestUpdates"), (snapshot) => {
    const rows = getUpdateRows(snapshot);
    if(!rows.length){
      renderMessage(box, "Abhi koi update nahi hai.");
      return;
    }
    box.innerHTML = rows.map((data) => `
      <div class="row"><strong>${escapeHTML(data.text)}</strong></div>
    `).join("");
  }, (error) => renderMessage(box, "Updates load nahi ho payi: " + error.message));
}

function loadLinks(){
  const box = document.getElementById("importantLinksList");
  onValue(ref(db, "importantLinks"), (snapshot) => {
    if(!snapshot.exists()){
      renderMessage(box, "Abhi koi important link nahi hai.");
      return;
    }
    const rows = [];
    snapshot.forEach((child) => {
      const data = child.val() || {};
      rows.push(`
        <div class="row">
          <strong>${escapeHTML(data.title || "Important Link")}</strong><br>
          <a href="${safeUrl(data.url)}" target="_blank" rel="noopener noreferrer">Open Link</a>
        </div>
      `);
    });
    box.innerHTML = rows.join("");
  }, (error) => renderMessage(box, "Important links load nahi ho paye: " + error.message));
}

function filterJobs(){
  const input = document.getElementById("jobSearch");
  const noResult = document.getElementById("jobNoResult");
  if(!input || !noResult){ return; }
  const query = input.value.trim().toLowerCase();
  const cards = document.querySelectorAll(".job-card");
  let visibleCount = 0;
  cards.forEach((card) => {
    const isMatch = card.innerText.toLowerCase().includes(query);
    card.style.display = isMatch ? "" : "none";
    if(isMatch){ visibleCount += 1; }
  });
  noResult.style.display = cards.length > 0 && visibleCount === 0 ? "block" : "none";
}

function loadJobs(){
  const box = document.getElementById("jobsList");
  onValue(ref(db, "LatestJobs"), (snapshot) => {
    const rows = getJobRows(snapshot);
    if(!rows.length){
      renderMessage(box, "Abhi koi job available nahi hai.");
      return;
    }
    box.innerHTML = rows.map(({ id, job }) => `
      <div class="job-card">
        <h3>${escapeHTML(job.title || job.text || "Job Update")}</h3>
        <p><b>Type:</b> ${escapeHTML(job.type || "Online Form")}</p>
        <p><b>Start Date:</b> ${escapeHTML(job.startDate || "Update Soon")}</p>
        <p><b>Last Date:</b> <span class="last-date">${escapeHTML(job.lastDate || job.lastApplyDate || "Update Soon")}</span></p>
        <p><b>Qualification:</b> ${escapeHTML(job.qualification || "Update Soon")}</p>
        <p><b>Location:</b> ${escapeHTML(job.location || "All India")}</p>
        <a href="${safeUrl(job.applyLink)}" target="_blank" rel="noopener noreferrer">Apply Now</a>
        <a class="detail-link" href="post/${encodeURIComponent((job.slug || String(job.title || job.text || "job-update").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/['"]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90) || "job-update"))}/">View Details</a>
      </div>
    `).join("");
    filterJobs();
  }, (error) => renderMessage(box, "Jobs load nahi ho payi: " + error.message));

  const search = document.getElementById("jobSearch");
  if(search){ search.addEventListener("input", filterJobs); }
}

function loadMyRequests(user){
  const box = document.getElementById("myRequestsList");
  if(!box){ return; }
  const normalizeStatus = (status = "") => {
    const value = String(status || "").trim().toLowerCase();
    if(value === "done" || value === "completed"){ return "Completed"; }
    if(value === "working" || value === "replied" || value === "in process" || value === "in-process"){ return "In Process"; }
    if(value === "rejected" || value === "reject"){ return "Rejected"; }
    return "Pending";
  };
  const getStatusClass = (status) => {
    const value = normalizeStatus(status);
    if(value === "Completed"){ return "done"; }
    if(value === "In Process"){ return "process"; }
    if(value === "Rejected"){ return "rejected"; }
    return "";
  };
  const formatRequestTime = (value) => {
    const time = Number(value || 0);
    return time ? new Date(time).toLocaleString("hi-IN") : "Not available";
  };
  onValue(ref(db, "userServiceRequests/" + user.uid), (snapshot) => {
    const rows = [];
    if(snapshot.exists()){
      snapshot.forEach((child) => {
        const data = child.val() || {};
        rows.push({ id:child.key, ...data });
      });
    }
    rows.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
    if(!rows.length){
      renderMessage(box, "Aapki logged-in request abhi save nahi hai. User Dashboard se service enquiry bhej sakte hain.");
      return;
    }
    box.innerHTML = rows.map((item) => {
      const status = normalizeStatus(item.status);
      const statusClass = getStatusClass(status);
      const adminReplyReady = Boolean(String(item.adminNote || "").trim());
      const canUserReply = adminReplyReady && status !== "Completed" && status !== "Rejected";
      return `
        <article class="request-card ${statusClass}">
          <h3>${escapeHTML(item.service || "Service Request")}</h3>
          <span class="request-badge ${statusClass}">${escapeHTML(status)}</span>
          ${item.userUnread === true ? '<span class="request-new-badge">New Update</span>' : ""}
          <small><b>Tracking ID:</b> ${escapeHTML(item.requestToken || item.requestId || item.id)}</small>
          <small>Date: ${formatRequestTime(item.createdAt)}</small>
          <small>Last Update: ${formatRequestTime(item.statusUpdatedAt || item.updatedAt || item.createdAt)}</small>
          <small>Name: ${escapeHTML(item.name || "Not added")} | Mobile: ${escapeHTML(item.mobile || "Not added")}</small>
          <p>${escapeHTML(item.message || "No message")}</p>
          ${item.adminNote ? `<small><b>Admin Note:</b> ${escapeHTML(item.adminNote)}</small>` : ""}
          ${item.userReply ? `<small><b>Your Reply:</b> ${escapeHTML(item.userReply)}</small>` : ""}
          ${canUserReply ? `
            <div class="request-reply-box">
              <textarea id="userReply_${escapeHTML(item.id)}" placeholder="Admin ko reply likhein...">${escapeHTML(item.userReply || "")}</textarea>
              <button type="button" onclick="sendUserRequestReply('${escapeHTML(item.id)}','${escapeHTML(item.requestId || item.id)}')">Send Reply</button>
            </div>
          ` : `<small><b>Reply:</b> ${adminReplyReady ? "Ye request close ho chuki hai." : "Admin reply ke baad reply box show hoga."}</small>`}
          <div class="request-track">
            <span class="active">Pending</span>
            <span class="${status === "In Process" || status === "Completed" ? "active" : ""}">In Process</span>
            <span class="${status === "Completed" ? "active" : ""}">Completed</span>
            ${status === "Rejected" ? '<span class="active rejected">Rejected</span>' : ""}
          </div>
        </article>
      `;
    }).join("");
  }, (error) => renderMessage(box, "Requests load nahi ho payi: " + error.message));
}

window.sendUserRequestReply = async (localId, requestId = "") => {
  if(!currentUser){
    alert("Login required.");
    return;
  }
  const field = document.getElementById("userReply_" + localId);
  const userReply = field ? field.value.trim() : "";
  const targetId = requestId || localId;
  const requestData = currentRequestNotifications.find((item) => item.id === localId || item.requestId === targetId);
  if(!requestData || !String(requestData.adminNote || "").trim()){
    alert("Admin ka reply aane ke baad hi aap reply bhej sakte hain.");
    return;
  }
  if(!userReply){
    alert("Reply message likhein.");
    return;
  }
  const data = {
    userReply,
    userReplyAt:Date.now(),
    adminUnread:true,
    userUnread:false,
    updatedAt:Date.now()
  };
  try{
    await update(ref(db, "userServiceRequests/" + currentUser.uid + "/" + localId), data);
    await update(ref(db, "serviceRequests/" + targetId), {
      userReply,
      userReplyAt:data.userReplyAt,
      adminUnread:true,
      updatedAt:data.updatedAt
    });
    alert("Reply admin ko send ho gaya.");
  } catch(error){
    alert("Reply send nahi hua: " + error.message);
  }
};

function renderStorageInfo(){
  const used = Number(currentMember.storageUsedBytes || 0);
  const limit = getStorageLimitBytes();
  const percent = Math.min(100, Math.round((used / limit) * 100));
  const approved = currentMember.uploadApproved === true;
  setText("storageInfo", `${formatBytes(used)} used / ${formatBytes(limit)} available`);
  const bar = document.getElementById("storageBar");
  if(bar){ bar.style.width = percent + "%"; }
  const tools = document.getElementById("uploadTools");
  if(tools){ tools.classList.toggle("locked", !approved); }
  setText("uploadStatus", approved
    ? "Aap apni files yahan upload karke baad me download kar sakte hain."
    : "Upload ke liye admin approval pending hai. Approval milne ke baad upload button show hoga.");
}

function renderFolderControls(){
  const folderList = document.getElementById("userFolderList");
  const folderSelect = document.getElementById("uploadFolderSelect");
  if(!folderList && !folderSelect){ return; }

  const rows = getFolderRows();
  const validIds = rows.map((item) => item.id);
  if(!validIds.includes(activeFolderId)){
    activeFolderId = generalFolderId;
  }

  const counts = {};
  counts[allFolderId] = currentFiles.length;
  currentFiles.forEach((item) => {
    const folderId = getFileFolderId(item.file);
    counts[folderId] = (counts[folderId] || 0) + 1;
  });

  if(folderList){
    folderList.innerHTML = rows.map(({ id, folder }) => {
      const count = counts[id] || 0;
      const activeClass = id === activeFolderId ? " active" : "";
      const locked = Boolean(folder.passwordHash);
      const lockIcon = locked ? `<i class="fa-solid ${isFolderLocked(id) ? "fa-lock" : "fa-lock-open"}"></i>` : "";
      const deleteButton = folder.system ? "" : `<button type="button" class="delete-folder" title="Delete folder" onclick="deleteUserFolder('${escapeHTML(id)}', event)">x</button>`;
      return `<span class="folder-pill${activeClass}"><button type="button" class="folder-open" onclick="setUserFolder('${escapeHTML(id)}')">${lockIcon}<span>${escapeHTML(folder.name || "Folder")}</span><span class="folder-count">${count}</span></button>${deleteButton}</span>`;
    }).join("");
  }

  if(folderSelect){
    const uploadRows = getUploadFolderRows().filter(({ id }) => !isFolderLocked(id));
    const uploadIds = uploadRows.map((item) => item.id);
    const selected = folderSelect.value || (activeFolderId === allFolderId ? generalFolderId : activeFolderId);
    folderSelect.innerHTML = uploadRows.map(({ id, folder }) => `<option value="${escapeHTML(id)}">${escapeHTML(folder.name || "Folder")}</option>`).join("");
    folderSelect.value = uploadIds.includes(selected) ? selected : generalFolderId;
  }
}

function renderUserFiles(){
  const list = document.getElementById("userFilesList");
  renderStorageInfo();
  renderFolderControls();
  renderAllFilesExplorer();
  if(!list){ return; }
  const folderFiles = activeFolderId === allFolderId
    ? currentFiles.filter((item) => !isFolderLocked(getFileFolderId(item.file)))
    : currentFiles.filter((item) => getFileFolderId(item.file) === activeFolderId);
  if(isFolderLocked(activeFolderId)){
    list.innerHTML = `<div class="message locked-folder-message"><i class="fa-solid fa-lock"></i> ${escapeHTML(getFolderName(activeFolderId))} folder locked hai. Open karne ke liye password lagayein.</div>`;
    return;
  }
  if(!folderFiles.length){
    list.innerHTML = `<div class="message">${escapeHTML(getFolderName(activeFolderId))} folder me abhi koi file upload nahi hai.</div>`;
    return;
  }
  list.innerHTML = folderFiles.map((item) => `
    <div class="file-row">
      <div class="file-card-head">
        <span class="file-type-icon">${fileTypeIcon(item.file)}</span>
        <strong title="${escapeHTML(item.file.name || "Document")}">${escapeHTML(cleanDisplayFileName(item.file.name || "Document"))}</strong>
        <button type="button" class="file-menu-btn" aria-label="File actions"><i class="fa-solid fa-ellipsis-vertical"></i></button>
      </div>
      ${renderFileThumbnail(item.file)}
      <strong class="file-name-label" title="${escapeHTML(item.file.name || "Document")}">${escapeHTML(cleanDisplayFileName(item.file.name || "Document"))}</strong>
      <small>${formatBytes(item.file.size)} - ${item.file.uploadedAt ? new Date(item.file.uploadedAt).toLocaleString("hi-IN") : "Recently uploaded"}</small>
      <span class="file-folder-label">${escapeHTML(getFolderName(getFileFolderId(item.file)))}</span>
      <div class="file-actions">
        <button class="preview-file" onclick="previewUserFile('${escapeHTML(item.id)}')">Preview</button>
        <button onclick="downloadUserFile('${escapeHTML(item.id)}')">Download</button>
        <button class="delete-file" onclick="deleteUserFile('${escapeHTML(item.id)}')">Delete</button>
      </div>
    </div>
  `).join("");
}

window.setUserFolder = async (folderId = generalFolderId) => {
  if(isFolderLocked(folderId)){
    const password = prompt(`${getFolderName(folderId)} folder password डालें`);
    if(password === null){ return; }
    const inputHash = await hashFolderPassword(password);
    const expectedHash = getFolderRow(folderId)?.folder?.passwordHash || "";
    if(inputHash !== expectedHash){
      alert("Password galat hai.");
      return;
    }
    unlockedFolderIds.add(folderId);
  }
  activeFolderId = folderId;
  const folderSelect = document.getElementById("uploadFolderSelect");
  if(folderSelect && folderId !== allFolderId){ folderSelect.value = folderId; }
  renderUserFiles();
};

window.createUserFolder = async () => {
  if(!currentUser){
    alert("Login required.");
    return;
  }
  const input = document.getElementById("folderNameInput");
  const passwordInput = document.getElementById("folderPasswordInput");
  const name = cleanFolderName(input?.value || "");
  if(!name){
    alert("Folder name likhein.");
    return;
  }
  const exists = currentFolders.some((item) => String(item.folder.name || "").trim().toLowerCase() === name.toLowerCase());
  if(exists || name.toLowerCase() === "general"){
    alert("Ye folder name pehle se hai.");
    return;
  }
  const passwordHash = await hashFolderPassword(passwordInput?.value || "");
  try{
    const folderRef = push(ref(db, "memberFolders/" + currentUser.uid));
    const folderData = {
      name,
      createdAt:Date.now(),
      updatedAt:Date.now()
    };
    if(passwordHash){
      folderData.passwordHash = passwordHash;
      folderData.locked = true;
    }
    await set(folderRef, folderData);
    if(passwordHash){ unlockedFolderIds.add(folderRef.key); }
    if(!currentFolders.some((item) => item.id === folderRef.key)){
      currentFolders.push({ id:folderRef.key, folder:folderData });
    }
    activeFolderId = folderRef.key;
    if(input){ input.value = ""; }
    if(passwordInput){ passwordInput.value = ""; }
    setText("uploadStatus", `${name} folder ban gaya. Ab upload ke time ye folder select kar sakte hain.`);
    renderFolderControls();
  }catch(error){
    alert("Folder create nahi hua: " + error.message);
  }
};

window.deleteUserFolder = async (folderId, event) => {
  if(event){ event.stopPropagation(); }
  if(!currentUser || !folderId || folderId === generalFolderId){ return; }
  const folder = currentFolders.find((item) => item.id === folderId);
  if(!folder){
    alert("Folder data nahi mila.");
    return;
  }
  const filesInFolder = currentFiles.filter((item) => getFileFolderId(item.file) === folderId);
  if(filesInFolder.length){
    alert("Is folder me files hain. Pehle files delete ya download karke remove karein.");
    return;
  }
  if(!confirm(`${folder.folder.name || "Folder"} folder delete karna hai?`)){ return; }
  try{
    await remove(ref(db, "memberFolders/" + currentUser.uid + "/" + folderId));
    currentFolders = currentFolders.filter((item) => item.id !== folderId);
    if(activeFolderId === folderId){ activeFolderId = generalFolderId; }
    setText("uploadStatus", "Folder delete ho gaya.");
    renderUserFiles();
  }catch(error){
    alert("Folder delete nahi hua: " + error.message);
  }
};

function loadDataFolder(user){
  onValue(ref(db, "members/" + user.uid), (snapshot) => {
    currentMember = snapshot.exists() ? snapshot.val() || {} : {};
    if(currentMember.status === "Deleted" || currentMember.status === "Blocked"){
      alert("Your account access is blocked. Please contact admin.");
      localStorage.removeItem(sessionKey);
      signOut(auth).then(() => { window.location.href = "index.html"; });
      return;
    }
    renderStorageInfo();
  });

  onValue(ref(db, "memberFolders/" + user.uid), (snapshot) => {
    currentFolders = [];
    if(snapshot.exists()){
      snapshot.forEach((child) => {
        const folder = child.val() || {};
        if(String(folder.name || "").trim()){
          currentFolders.push({ id:child.key, folder });
        }
      });
    }
    currentFolders.sort((a, b) => Number(a.folder.createdAt || 0) - Number(b.folder.createdAt || 0));
    renderUserFiles();
  });

  onValue(ref(db, "memberFiles/" + user.uid), (snapshot) => {
    currentFiles = [];
    if(snapshot.exists()){
      snapshot.forEach((child) => currentFiles.push({ id:child.key, file:child.val() || {} }));
    }
    currentFiles.sort((a, b) => Number(b.file.uploadedAt || 0) - Number(a.file.uploadedAt || 0));
    renderUserFiles();
    loadStorageFallbackFiles(user);
  });

  onValue(ref(db, "memberCloudLinks/" + user.uid), (snapshot) => {
    const list = document.getElementById("cloudLinksList");
    const links = [];
    if(snapshot.exists()){
      snapshot.forEach((child) => {
        const link = child.val() || {};
        if(link.url){ links.push({ id:child.key, link:link }); }
      });
    }
    links.sort((a, b) => Number(b.link.createdAt || 0) - Number(a.link.createdAt || 0));
    if(!links.length){
      renderMessage(list, "Admin ne abhi koi data link add nahi kiya hai.");
      return;
    }
    list.innerHTML = links.map((entry) => `
      <div class="cloud-link">
        <div>
          <strong>${escapeHTML(entry.link.title || "My Data")}</strong>
          <small>${escapeHTML(entry.link.url || "")}</small>
        </div>
        <a href="${safeUrl(entry.link.url)}" target="_blank" rel="noopener noreferrer">Open</a>
      </div>
    `).join("");
  });
}

window.uploadUserFile = async () => {
  if(!currentUser){
    alert("Login required.");
    return;
  }
  if(currentMember.uploadApproved !== true){
    alert("Upload ke liye admin approval zaroori hai.");
    return;
  }
  const input = document.getElementById("userFileInput");
  const files = Array.from(input?.files || []);
  if(!files.length){
    alert("Upload ke liye file select karein.");
    return;
  }
  const status = document.getElementById("uploadStatus");
  const used = Number(currentMember.storageUsedBytes || 0);
  const limit = getStorageLimitBytes();
  const totalSize = files.reduce((sum, file) => sum + Number(file.size || 0), 0);
  if(used + totalSize > limit){
    status.innerText = `Storage limit full hai. Selected files ${formatBytes(totalSize)} hain. ${formatBytes(limit)} tak free allowed hai.`;
    return;
  }

  let uploadedBytes = 0;
  let uploadedCount = 0;
  const failed = [];
  const folderSelect = document.getElementById("uploadFolderSelect");
  const selectedFolderId = folderSelect?.value || activeFolderId || generalFolderId;
  const validFolderIds = getUploadFolderRows().map((item) => item.id);
  const folderId = validFolderIds.includes(selectedFolderId) ? selectedFolderId : generalFolderId;
  const folderName = getFolderName(folderId);
  activeFolderId = folderId;

  for(let index = 0; index < files.length; index += 1){
    const file = files[index];
    const fileRecordRef = push(ref(db, "memberFiles/" + currentUser.uid));
    const folderSegment = getFolderPathSegment(folderId, folderName);
    const path = `${currentUser.uid}/${folderSegment}/${fileRecordRef.key}-${cleanFileName(file.name)}`;
    status.innerText = `Supabase par upload ho raha hai... ${index + 1}/${files.length}`;

    try{
      const { error } = await supabase.storage.from(supabaseBucket).upload(path, file, {
        cacheControl:"3600",
        contentType:file.type || "application/octet-stream",
        upsert:false
      });
      if(error){ throw error; }

      uploadedBytes += Number(file.size || 0);
      uploadedCount += 1;
      const fileRecord = {
        name:file.name,
        size:file.size,
        type:file.type || "",
        folderId,
        folderName,
        path:path,
        storageProvider:"supabase",
        bucket:supabaseBucket,
        downloadUrl:getSupabasePublicUrl(path),
        uploadedAt:Date.now()
      };
      await set(fileRecordRef, fileRecord);
      if(!currentFiles.some((item) => item.id === fileRecordRef.key)){
        currentFiles.unshift({ id:fileRecordRef.key, file:fileRecord });
      }
    }catch(error){
      failed.push(`${file.name}: ${error.message}`);
    }
  }

  if(uploadedCount > 0){
    const nextUsed = used + uploadedBytes;
    await update(ref(db, "members/" + currentUser.uid), {
      storageUsedBytes:nextUsed,
      storageLimitBytes:limit,
      updatedAt:Date.now()
    });
    input.value = "";
    currentFiles.sort((a, b) => Number(b.file.uploadedAt || 0) - Number(a.file.uploadedAt || 0));
    renderUserFiles();
  }

  status.innerText = failed.length
    ? `Uploaded: ${uploadedCount}, Failed: ${failed.length}. ${failed.slice(0, 2).join(" | ")}`
    : `${uploadedCount} file ${folderName} folder me upload ho gayi.`;
};

window.downloadUserFile = (id) => {
  const item = currentFiles.find((entry) => entry.id === id);
  if(!item){
    alert("Download link nahi mila.");
    return;
  }
  const url = getFileUrl(item.file);
  if(!url){
    alert("Download link nahi mila.");
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
};

window.previewUserFile = (id) => {
  const item = currentFiles.find((entry) => entry.id === id);
  if(!item){
    alert("Preview link nahi mila.");
    return;
  }
  openFilePreview(item.file);
};

window.previewUserFileByPath = (path) => {
  const item = currentFiles.find((entry) => String(entry.file.path || "") === String(path || ""));
  if(!item){
    alert("Preview link nahi mila.");
    return;
  }
  openFilePreview(item.file);
};

window.toggleUserFileMenu = (id, event) => {
  if(event){ event.stopPropagation(); }
  const card = document.querySelector(`[data-file-card="${CSS.escape(id)}"]`);
  const shouldOpen = card && !card.classList.contains("menu-open");
  closeFileMenus();
  if(card && shouldOpen){ card.classList.add("menu-open"); }
};

window.toggleUserFileSelection = (id, checked) => {
  if(checked){ selectedFileIds.add(id); }
  else{ selectedFileIds.delete(id); }
  renderAllFilesExplorer();
};

window.toggleSelectAllUserFiles = () => {
  const files = getVisibleExplorerFiles();
  if(selectedFileIds.size && selectedFileIds.size === files.length){
    selectedFileIds.clear();
  }else{
    files.forEach((item) => selectedFileIds.add(item.id));
  }
  renderAllFilesExplorer();
};

const getSelectedFileEntries = () => Array.from(selectedFileIds).map(getFileEntry).filter(Boolean);

const promptTargetFolderId = (message = "Folder name likhein") => {
  const rows = getUploadFolderRows().filter(({ id }) => !isFolderLocked(id));
  const names = rows.map(({ folder }) => folder.name || "Folder").join(", ");
  const input = prompt(`${message}\nAvailable: ${names}\nBlank = General`);
  if(input === null){ return ""; }
  const name = String(input || "").trim();
  if(!name){ return generalFolderId; }
  const match = rows.find(({ folder }) => String(folder.name || "").trim().toLowerCase() === name.toLowerCase());
  if(!match){
    alert("Folder name match nahi hua.");
    return "";
  }
  return match.id;
};

const upsertUserFileRecord = async (id, file) => {
  if(!currentUser){ throw new Error("Login required."); }
  const record = { ...file, storageOnly:false, updatedAt:Date.now() };
  await set(ref(db, "memberFiles/" + currentUser.uid + "/" + id), record);
  const index = currentFiles.findIndex((entry) => entry.id === id);
  if(index >= 0){ currentFiles[index] = { id, file:record }; }
  else{ currentFiles.unshift({ id, file:record }); }
};

window.renameUserFile = async (id) => {
  closeFileMenus();
  const item = getFileEntry(id);
  if(!item){ alert("File data nahi mila."); return; }
  const currentName = cleanDisplayFileName(item.file.name || "Document");
  const nextName = prompt("New file name likhein", currentName);
  if(nextName === null){ return; }
  const name = String(nextName || "").trim();
  if(!name){ alert("File name blank nahi ho sakta."); return; }
  try{
    await upsertUserFileRecord(id, { ...item.file, name });
    setText("uploadStatus", "File rename ho gayi.");
    renderUserFiles();
  }catch(error){
    alert("Rename nahi hua: " + error.message);
  }
};

const moveFileRecordToFolder = async (id, folderId) => {
  const item = getFileEntry(id);
  if(!item){ throw new Error("File data nahi mila."); }
  const folderName = getFolderName(folderId);
  await upsertUserFileRecord(id, { ...item.file, folderId, folderName });
};

window.moveUserFile = async (id) => {
  closeFileMenus();
  const folderId = promptTargetFolderId("Move ke liye folder name likhein");
  if(!folderId){ return; }
  try{
    await moveFileRecordToFolder(id, folderId);
    setText("uploadStatus", "File move ho gayi.");
    renderUserFiles();
  }catch(error){
    alert("Move nahi hua: " + error.message);
  }
};

const copyFileToFolder = async (id, folderId) => {
  if(!currentUser){ throw new Error("Login required."); }
  const item = getFileEntry(id);
  if(!item?.file?.path){ throw new Error("File path nahi mila."); }
  if(!String(item.file.path).startsWith(currentUser.uid + "/")){ throw new Error("Ye file aapke account folder ki nahi hai."); }
  const used = Number(currentMember.storageUsedBytes || 0);
  const limit = getStorageLimitBytes();
  const size = Number(item.file.size || 0);
  if(used + size > limit){ throw new Error("Storage limit full hai."); }
  const folderName = getFolderName(folderId);
  const fileRecordRef = push(ref(db, "memberFiles/" + currentUser.uid));
  const folderSegment = getFolderPathSegment(folderId, folderName);
  const cleanName = cleanFileName(item.file.name || "file");
  const nextPath = `${currentUser.uid}/${folderSegment}/${fileRecordRef.key}-${cleanName}`;
  const { error } = await supabase.storage.from(getFileBucket(item.file)).copy(item.file.path, nextPath);
  if(error){ throw error; }
  const fileRecord = {
    ...item.file,
    folderId,
    folderName,
    path:nextPath,
    storageProvider:"supabase",
    bucket:getFileBucket(item.file),
    downloadUrl:getSupabasePublicUrl(nextPath),
    storageOnly:false,
    copiedFrom:id,
    uploadedAt:Date.now()
  };
  await set(fileRecordRef, fileRecord);
  currentFiles.unshift({ id:fileRecordRef.key, file:fileRecord });
  await update(ref(db, "members/" + currentUser.uid), {
    storageUsedBytes:used + size,
    storageLimitBytes:limit,
    updatedAt:Date.now()
  });
  currentMember.storageUsedBytes = used + size;
  currentMember.storageLimitBytes = limit;
};

window.copyUserFile = async (id) => {
  closeFileMenus();
  const folderId = promptTargetFolderId("Copy ke liye folder name likhein");
  if(!folderId){ return; }
  try{
    await copyFileToFolder(id, folderId);
    setText("uploadStatus", "File copy ho gayi.");
    renderUserFiles();
  }catch(error){
    alert("Copy nahi hua: " + error.message);
  }
};

window.bulkMoveUserFiles = async () => {
  const entries = getSelectedFileEntries();
  if(!entries.length){ alert("Pehle files select karein."); return; }
  const folderId = promptTargetFolderId("Selected files move karne ke liye folder name likhein");
  if(!folderId){ return; }
  try{
    for(const entry of entries){ await moveFileRecordToFolder(entry.id, folderId); }
    selectedFileIds.clear();
    setText("uploadStatus", `${entries.length} file move ho gayi.`);
    renderUserFiles();
  }catch(error){
    alert("Bulk move nahi hua: " + error.message);
  }
};

window.bulkCopyUserFiles = async () => {
  const entries = getSelectedFileEntries();
  if(!entries.length){ alert("Pehle files select karein."); return; }
  const folderId = promptTargetFolderId("Selected files copy karne ke liye folder name likhein");
  if(!folderId){ return; }
  try{
    for(const entry of entries){ await copyFileToFolder(entry.id, folderId); }
    selectedFileIds.clear();
    setText("uploadStatus", `${entries.length} file copy ho gayi.`);
    renderUserFiles();
  }catch(error){
    alert("Bulk copy nahi hua: " + error.message);
  }
};

window.bulkDeleteUserFiles = async () => {
  const entries = getSelectedFileEntries();
  if(!entries.length){ alert("Pehle files select karein."); return; }
  if(!confirm(`${entries.length} selected files delete karni hain?`)){ return; }
  try{
    for(const entry of entries){ await deleteUserFileEntry(entry.id); }
    selectedFileIds.clear();
    setText("uploadStatus", `${entries.length} file delete ho gayi.`);
    renderUserFiles();
  }catch(error){
    alert("Bulk delete nahi hua: " + error.message);
  }
};

window.closeFilePreview = () => {
  const modal = document.getElementById("filePreviewModal");
  const body = document.getElementById("filePreviewBody");
  if(body){ body.innerHTML = ""; }
  if(modal){ modal.classList.remove("open"); }
};

const deleteUserFileEntry = async (id) => {
  if(!currentUser){
    throw new Error("Login required.");
  }
  const item = currentFiles.find((entry) => entry.id === id);
  if(!item){
    throw new Error("File data nahi mila.");
  }
  if(item.file.path){
    if(!String(item.file.path).startsWith(currentUser.uid + "/")){
      throw new Error("Ye file aapke account folder ki nahi hai.");
    }
    const { error } = await supabase.storage.from(getFileBucket(item.file)).remove([item.file.path]);
    if(error){ throw error; }
  }
  if(!item.file.storageOnly){
    await remove(ref(db, "memberFiles/" + currentUser.uid + "/" + id));
  }
  currentFiles = currentFiles.filter((entry) => entry.id !== id);
  selectedFileIds.delete(id);
  const used = Math.max(0, Number(currentMember.storageUsedBytes || 0) - Number(item.file.size || 0));
  await update(ref(db, "members/" + currentUser.uid), {
    storageUsedBytes:used,
    updatedAt:Date.now()
  });
  currentMember.storageUsedBytes = used;
};

window.deleteUserFile = async (id) => {
  if(!confirm("Ye file delete karni hai?")){ return; }
  try{
    await deleteUserFileEntry(id);
    setText("uploadStatus", "File delete ho gayi.");
    renderUserFiles();
  } catch(error){
    alert("File delete nahi hui: " + error.message);
  }
};

window.logoutUser = () => {
  localStorage.removeItem(sessionKey);
  signOut(auth).then(() => { window.location.href = "index.html"; });
};

window.toggleDarkMode = () => {
  const next = document.body.classList.contains("dark-mode") ? "light" : "dark";
  localStorage.setItem("emitraTheme", next);
  applyTheme(next);
};

function applyTheme(theme){
  const isDark = theme === "dark";
  document.body.classList.toggle("dark-mode", isDark);
  const icon = document.querySelector(".theme-symbol");
  if(icon){ icon.textContent = isDark ? "☀" : "☾"; }
}

updateLiveTime();
setInterval(updateLiveTime, 1000);
applyTheme(localStorage.getItem("emitraTheme") || "light");

onAuthStateChanged(auth, (user) => {
  if(!user){
    window.location.href = "index.html";
    return;
  }
  if(!user.emailVerified){
    alert("Email verification pending hai. Gmail verify karke login karein.");
    localStorage.removeItem(sessionKey);
    signOut(auth).then(() => { window.location.href = "index.html"; });
    return;
  }

  currentUser = user;
  setText("userEmail", user.email);
  loadRequestNotifications(user);
  if(!localStorage.getItem(sessionKey)){
    localStorage.setItem(sessionKey, String(Date.now()));
  }
  startSessionTimer();

  if(pageType !== "data-folder"){
    onValue(ref(db, "members/" + user.uid), (snapshot) => {
      const member = snapshot.exists() ? snapshot.val() || {} : {};
      if(member.status === "Deleted" || member.status === "Blocked"){
        alert("Your account access is blocked. Please contact admin.");
        localStorage.removeItem(sessionKey);
        signOut(auth).then(() => { window.location.href = "index.html"; });
      }
    });
  }

  if(pageType === "updates"){ loadUpdates(); }
  if(pageType === "links"){ loadLinks(); }
  if(pageType === "jobs"){ loadJobs(); }
  if(pageType === "requests"){ loadMyRequests(user); }
  if(pageType === "data-folder"){ loadDataFolder(user); }
});
