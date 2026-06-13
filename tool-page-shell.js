(function(){
  var root = document.getElementById("toolPageRoot");
  if(!root){ return; }
  var title = root.dataset.title || "Free Tool";
  var desc = root.dataset.desc || "Browser-only free tool.";
  var src = root.dataset.src || "tools.html?embed=1";
  document.body.insertAdjacentHTML("afterbegin", '<nav><a class="logo" href="index.html"><img src="site-logo.svg" alt="E-MITRA WALA"></a><ul><li><a href="index.html">Home</a></li><li><a href="job-form.html">Latest Jobs</a></li><li><a href="OFFLINEFORM.HTML">PDF Forms</a></li><li><a href="/tools.html">🧰 Tools</a></li><li><a href="useful-pages.html">Useful Pages</a></li><li><a href="contact.html">Contact</a></li></ul></nav><header class="hero"><h1>'+title+'</h1><p>'+desc+'</p></header>');
  root.className = "tool-page-main";
  root.innerHTML = '<iframe class="tool-frame" src="'+src+'" title="'+title+'"></iframe>';
  document.body.insertAdjacentHTML("beforeend", '<footer>© 2026 E-MITRA WALA | Free Online Tools</footer>');
})();
