(function(){
  const defaultServer = "https://emitra-sewa-kendra.onrender.com";
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
  fetch(apiUrl(), { cache:"no-store" })
    .then((response) => response.ok ? response.json() : null)
    .then((data) => applySiteTheme(data && data.settings ? data.settings.siteTheme : "premium"))
    .catch(() => {});
})();
