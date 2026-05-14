(function(){
  const key = "emitraTheme";
  const applyTheme = (theme) => {
    const isDark = theme === "dark";
    document.body.classList.toggle("dark-mode", isDark);
    const icon = document.querySelector(".theme-symbol");
    if(icon){
      icon.textContent = isDark ? "☀" : "☾";
    }
  };

  window.toggleDarkMode = function(){
    const nextTheme = document.body.classList.contains("dark-mode") ? "light" : "dark";
    localStorage.setItem(key, nextTheme);
    applyTheme(nextTheme);
  };

  applyTheme(localStorage.getItem(key) || "light");
})();
