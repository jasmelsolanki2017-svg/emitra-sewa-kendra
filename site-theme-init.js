(function(){
  var premium = "premium";
  var dark = "light";
  try {
    premium = localStorage.getItem("emitraSiteTheme") || "premium";
    dark = localStorage.getItem("emitraTheme") || "light";
  } catch (_) {}
  premium = "premium";
  document.documentElement.classList.add("site-theme-premium");
  document.documentElement.dataset.siteTheme = premium;
  if (String(dark).toLowerCase() === "dark") {
    document.documentElement.classList.add("dark-mode");
    document.documentElement.dataset.colorTheme = "dark";
  } else {
    document.documentElement.dataset.colorTheme = "light";
  }
})();
