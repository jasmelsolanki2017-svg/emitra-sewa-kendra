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

const pageType = document.body.dataset.page || "";

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

const setText = (id, value) => {
  const el = document.getElementById(id);
  if(el){ el.innerText = value; }
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
    if(String(job.title || job.text || "").trim()){
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
        <p><b>Last Date:</b> <span class="last-date">${escapeHTML(job.lastDate || "Update Soon")}</span></p>
        <p><b>Qualification:</b> ${escapeHTML(job.qualification || "Update Soon")}</p>
        <p><b>Location:</b> ${escapeHTML(job.location || "All India")}</p>
        <a href="${safeUrl(job.applyLink)}" target="_blank" rel="noopener noreferrer">Apply Now</a>
        <a class="detail-link" href="job-detail.html?id=${encodeURIComponent(id)}">View Details</a>
      </div>
    `).join("");
    filterJobs();
  }, (error) => renderMessage(box, "Jobs load nahi ho payi: " + error.message));

  const search = document.getElementById("jobSearch");
  if(search){ search.addEventListener("input", filterJobs); }
}

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

function renderUserFiles(){
  const list = document.getElementById("userFilesList");
  renderStorageInfo();
  if(!list){ return; }
  if(!currentFiles.length){
    list.innerHTML = '<div class="message">Abhi koi file upload nahi hai.</div>';
    return;
  }
  list.innerHTML = currentFiles.map((item) => `
    <div class="file-row">
      <div>
        <strong>${escapeHTML(item.file.name || "Document")}</strong>
        <small>${formatBytes(item.file.size)} - ${item.file.uploadedAt ? new Date(item.file.uploadedAt).toLocaleString("hi-IN") : "Recently uploaded"}</small>
      </div>
      <div class="file-actions">
        <button onclick="downloadUserFile('${escapeHTML(item.id)}')">Download</button>
        <button class="delete-file" onclick="deleteUserFile('${escapeHTML(item.id)}')">Delete</button>
      </div>
    </div>
  `).join("");
}

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

  onValue(ref(db, "memberFiles/" + user.uid), (snapshot) => {
    currentFiles = [];
    if(snapshot.exists()){
      snapshot.forEach((child) => currentFiles.push({ id:child.key, file:child.val() || {} }));
    }
    currentFiles.sort((a, b) => Number(b.file.uploadedAt || 0) - Number(a.file.uploadedAt || 0));
    renderUserFiles();
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

window.uploadUserFile = () => {
  if(!currentUser){
    alert("Login required.");
    return;
  }
  if(currentMember.uploadApproved !== true){
    alert("Upload ke liye admin approval zaroori hai.");
    return;
  }
  const input = document.getElementById("userFileInput");
  const file = input?.files && input.files[0];
  if(!file){
    alert("Upload ke liye file select karein.");
    return;
  }
  const status = document.getElementById("uploadStatus");
  const used = Number(currentMember.storageUsedBytes || 0);
  const limit = getStorageLimitBytes();
  if(used + file.size > limit){
    status.innerText = `Storage limit full hai. ${formatBytes(limit)} tak free allowed hai.`;
    return;
  }
  const fileRecordRef = push(ref(db, "memberFiles/" + currentUser.uid));
  const path = `${currentUser.uid}/${fileRecordRef.key}-${cleanFileName(file.name)}`;
  status.innerText = "Supabase par upload ho raha hai...";
  supabase.storage.from(supabaseBucket).upload(path, file, {
    cacheControl:"3600",
    contentType:file.type || "application/octet-stream",
    upsert:false
  }).then(async ({ error }) => {
    if(error){ throw error; }
    const nextUsed = used + file.size;
    await set(fileRecordRef, {
      name:file.name,
      size:file.size,
      type:file.type || "",
      path:path,
      storageProvider:"supabase",
      bucket:supabaseBucket,
      downloadUrl:getSupabasePublicUrl(path),
      uploadedAt:Date.now()
    });
    await update(ref(db, "members/" + currentUser.uid), {
      storageUsedBytes:nextUsed,
      storageLimitBytes:limit,
      updatedAt:Date.now()
    });
    input.value = "";
    status.innerText = "File Supabase par upload ho gayi.";
  }).catch((error) => {
    status.innerText = "Upload nahi hua: " + error.message;
  });
};

window.downloadUserFile = (id) => {
  const item = currentFiles.find((entry) => entry.id === id);
  if(!item){
    alert("Download link nahi mila.");
    return;
  }
  const url = item.file.storageProvider === "supabase"
    ? getSupabasePublicUrl(item.file.path)
    : item.file.downloadUrl || getSupabasePublicUrl(item.file.path);
  if(!url){
    alert("Download link nahi mila.");
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
};

window.deleteUserFile = async (id) => {
  if(!currentUser){
    alert("Login required.");
    return;
  }
  const item = currentFiles.find((entry) => entry.id === id);
  if(!item){
    alert("File data nahi mila.");
    return;
  }
  if(!confirm("Ye file delete karni hai?")){ return; }
  try{
    if(item.file.path){
      if(!String(item.file.path).startsWith(currentUser.uid + "/")){
        throw new Error("Ye file aapke account folder ki nahi hai.");
      }
      const { error } = await supabase.storage.from(getFileBucket(item.file)).remove([item.file.path]);
      if(error){ throw error; }
    }
    await remove(ref(db, "memberFiles/" + currentUser.uid + "/" + id));
    const used = Math.max(0, Number(currentMember.storageUsedBytes || 0) - Number(item.file.size || 0));
    await update(ref(db, "members/" + currentUser.uid), {
      storageUsedBytes:used,
      updatedAt:Date.now()
    });
    setText("uploadStatus", "File delete ho gayi.");
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
  if(pageType === "data-folder"){ loadDataFolder(user); }
});
