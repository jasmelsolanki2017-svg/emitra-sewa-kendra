(function(root, factory){
  const api = factory();
  if(typeof module !== "undefined" && module.exports){
    module.exports = api;
  }
  root.SarkariBlueLayoutUtils = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function(){
  const DEFAULT_DUPLICATE_SECTION_TITLES = new Set([
    "important dates",
    "application fee",
    "application fees",
    "age limit",
    "vacancy details",
    "educational qualification",
    "how to apply",
    "mode of selection",
    "salary / pay scale",
    "important links",
    "extra custom content",
    "short information"
  ]);

  const normalizeSectionTitle = (value = "") => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");

  const getSectionTitle = (section) => {
    if(!section || typeof section !== "object") return "";
    return normalizeSectionTitle(section.title || section.heading || section.name || section.label || section.content || section.text || "");
  };

  const filterDuplicateSarkariBlueSections = (sections = [], options = {}) => {
    const skipTitles = new Set(options.skipTitles || DEFAULT_DUPLICATE_SECTION_TITLES);
    const existingTitles = new Set(options.existingTitles || []);
    const seenKeys = new Set();
    return (Array.isArray(sections) ? sections : []).filter((section) => {
      if(!section){ return false; }
      const title = getSectionTitle(section);
      if(title && (skipTitles.has(title) || existingTitles.has(title))){ return false; }
      if(title){ existingTitles.add(title); }
      const key = typeof section === "object"
        ? JSON.stringify({
            title: section.title || section.heading || section.name || section.label || "",
            type: section.type || "",
            columns: section.columns || section.headers || [],
            rows: section.rows || section.data || [],
            items: section.items || [],
            content: section.content || section.text || "",
            links: section.links || []
          })
        : String(section);
      if(seenKeys.has(key)){ return false; }
      seenKeys.add(key);
      return true;
    });
  };

  return {
    DEFAULT_DUPLICATE_SECTION_TITLES,
    normalizeSectionTitle,
    getSectionTitle,
    filterDuplicateSarkariBlueSections
  };
});
