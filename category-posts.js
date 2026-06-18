(() => {
  const search = document.getElementById("categorySearch");
  const count = document.getElementById("categoryCount");
  const rows = [...document.querySelectorAll("#categoryPostList li")];
  if (!search) return;
  const render = () => {
    const query = search.value.trim().toLowerCase();
    let visible = 0;
    rows.forEach((row) => {
      const show = !query || String(row.dataset.search || row.innerText).toLowerCase().includes(query);
      row.hidden = !show;
      if (show) visible++;
    });
    if (count) count.textContent = `${visible} Posts`;
  };
  search.addEventListener("input", render);
})();
