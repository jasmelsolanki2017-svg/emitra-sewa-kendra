(function(){
  var root = document.getElementById("toolPageRoot");
  if(!root){ return; }
  var title = root.dataset.title || "Free Tool";
  var desc = root.dataset.desc || "Browser-only free tool.";
  var src = root.dataset.src || "tools.html?embed=1";
  var active = document.body.dataset.activeTool || "";
  var tools = [
    ["tools.html","fa-screwdriver-wrench","All Free Tools"],
    ["image-resizer.html","fa-image","Image Resizer"],
    ["resize-image-20kb.html","fa-compress","Resize 20KB"],
    ["image-compressor.html","fa-minimize","Compressor"],
    ["image-converter.html","fa-repeat","Converter"],
    ["passport-photo.html","fa-id-card","Passport Photo"],
    ["ssc-signature-resizer.html","fa-signature","SSC Signature"],
    ["rrb-signature-resizer.html","fa-signature","RRB Signature"],
    ["pan-signature-resizer.html","fa-pen-nib","PAN Signature"],
    ["pan-photo-resizer.html","fa-user","PAN Photo"],
    ["photo-signature-joiner.html","fa-object-group","Photo Signature"],
    ["photo-name-date-joiner.html","fa-calendar-days","Photo Name Date"],
    ["image-to-pdf.html","fa-file-pdf","Image to PDF"],
    ["pdf-to-jpg.html","fa-file-image","PDF to JPG"],
    ["pdf-merge.html","fa-layer-group","PDF Merge"],
    ["qr-generator.html","fa-qrcode","QR Generator"],
    ["age-calculator.html","fa-calculator","Age Calculator"]
  ];
  var menu = tools.map(function(item){
    return '<a class="'+(active === item[0] ? 'active' : '')+'" href="'+item[0]+'"><i class="fa-solid '+item[1]+'"></i> '+item[2]+'</a>';
  }).join("");
  document.body.insertAdjacentHTML("afterbegin", '<nav><a class="logo" href="index.html"><img src="site-logo.svg" alt="E-MITRA WALA"></a><ul><li><a href="index.html">Home</a></li><li><a href="job-form.html">Latest Jobs</a></li><li><a href="OFFLINEFORM.HTML">PDF Forms</a></li><li><details class="nav-tools" open><summary><i class="fa-solid fa-toolbox"></i> Tools</summary><div class="nav-tools-menu">'+menu+'</div></details></li><li><a href="useful-pages.html">Useful Pages</a></li><li><a href="contact.html">Contact</a></li></ul></nav><header class="hero"><h1>'+title+'</h1><p>'+desc+'</p></header>');
  root.className = "tool-page-main";
  root.innerHTML = '<iframe class="tool-frame" src="'+src+'" title="'+title+'"></iframe>';
  document.body.insertAdjacentHTML("beforeend", '<footer>© 2026 E-MITRA WALA | Free Online Tools</footer>');
})();
