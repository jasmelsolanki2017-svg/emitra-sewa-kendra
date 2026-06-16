(function(){
  const defaultServer = "https://emitra-sewa-kendra.onrender.com";
  const darkKey = "emitraTheme";
  const normalizeTheme = (value) => String(value || "premium").toLowerCase() === "classic" ? "classic" : "premium";
  const apiUrl = () => {
    if(location.protocol === "file:" || /^emitrawala\.online$|github\.io$/i.test(location.hostname)){
      return defaultServer + "/api/settings";
    }
    return "/api/settings";
  };
  const applySiteTheme = (theme) => {
    const active = normalizeTheme(theme);
    document.body.classList.toggle("site-theme-premium", active === "premium");
    document.documentElement.dataset.siteTheme = active;
    localStorage.setItem("emitraSiteTheme", active);
  };
  window.applyEmitraSiteTheme = applySiteTheme;
  applySiteTheme(localStorage.getItem("emitraSiteTheme") || "premium");

  const forceHomePortalDark = (isDark) => {
    document.querySelectorAll(".home-portal-box,.home-portal-masthead,.home-portal-search,.home-portal-ticker").forEach((el) => {
      if (isDark) {
        el.style.setProperty("background", "#101b2d", "important");
        el.style.setProperty("border-color", "#24405f", "important");
        el.style.setProperty("color", "#e8f1ff", "important");
      } else {
        el.style.removeProperty("background");
        el.style.removeProperty("border-color");
        el.style.removeProperty("color");
      }
    });
    document.querySelectorAll(".home-portal-list,.home-portal-list li").forEach((el) => {
      if (isDark) {
        el.style.setProperty("background", "transparent", "important");
        el.style.setProperty("color", "#cbd8ea", "important");
      } else {
        el.style.removeProperty("background");
        el.style.removeProperty("color");
      }
    });
    document.querySelectorAll(".home-portal-list a,.home-portal-job-card h3 a").forEach((el) => {
      if (isDark) {
        el.style.setProperty("color", "#8ec5ff", "important");
      } else {
        el.style.removeProperty("color");
      }
    });
    document.querySelectorAll(".home-portal-title").forEach((el) => {
      if (isDark) {
        el.style.setProperty("background", "#b30000", "important");
        el.style.setProperty("color", "#ffffff", "important");
      } else {
        el.style.removeProperty("background");
        el.style.removeProperty("color");
      }
    });
  };

  const applyDarkMode = (theme) => {
    const isDark = String(theme || "").toLowerCase() === "dark";
    document.body.classList.toggle("dark-mode", isDark);
    forceHomePortalDark(isDark);
    const icon = document.querySelector(".theme-symbol");
    if (icon) {
      icon.textContent = isDark ? "☀" : "☾";
    }
    const toggle = document.querySelector(".theme-toggle");
    if (toggle) {
      toggle.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");
      toggle.setAttribute("title", isDark ? "Light mode" : "Dark mode");
    }
    setTimeout(() => forceHomePortalDark(isDark), 1200);
  };

  const ensureThemeToggle = () => {
    if (document.querySelector(".theme-toggle")) return;
    const button = document.createElement("button");
    button.className = "theme-toggle";
    button.type = "button";
    button.innerHTML = '<span class="theme-symbol" aria-hidden="true">☾</span>';
    button.addEventListener("click", () => {
      const nextTheme = document.body.classList.contains("dark-mode") ? "light" : "dark";
      localStorage.setItem(darkKey, nextTheme);
      applyDarkMode(nextTheme);
    });
    document.body.appendChild(button);
  };

  window.toggleDarkMode = window.toggleDarkMode || function(){
    const nextTheme = document.body.classList.contains("dark-mode") ? "light" : "dark";
    localStorage.setItem(darkKey, nextTheme);
    applyDarkMode(nextTheme);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      ensureThemeToggle();
      applyDarkMode(localStorage.getItem(darkKey) || "light");
    });
  } else {
    ensureThemeToggle();
    applyDarkMode(localStorage.getItem(darkKey) || "light");
  }

  fetch(apiUrl(), { cache:"no-store" })
    .then((response) => response.ok ? response.json() : null)
    .then((data) => applySiteTheme(data && data.settings ? data.settings.siteTheme : "premium"))
    .catch(() => {});
})();
