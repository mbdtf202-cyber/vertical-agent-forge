const input = document.querySelector("#site-search");
const results = document.querySelector("#search-results");
const searchIndex = globalThis.SITE_SEARCH_INDEX ?? [];

function renderResults(items) {
  if (!results) {
    return;
  }
  if (items.length === 0) {
    results.innerHTML = '<div class="search-empty">No matching pages or sections.</div>';
    return;
  }
  results.innerHTML = items
    .map(
      (item) => `
        <a class="search-item" href="${item.url}">
          <strong>${item.title}</strong>
          <span>${item.body}</span>
        </a>
      `,
    )
    .join("");
}

function performSearch(value) {
  const query = value.trim().toLowerCase();
  if (!results) {
    return;
  }
  if (!query) {
    results.hidden = true;
    results.innerHTML = "";
    return;
  }
  const matches = searchIndex
    .filter((entry) => {
      const haystack = `${entry.title} ${entry.body}`.toLowerCase();
      return haystack.includes(query);
    })
    .slice(0, 8);
  results.hidden = false;
  renderResults(matches);
}

input?.addEventListener("input", (event) => {
  performSearch(event.currentTarget.value);
});

document.addEventListener("click", (event) => {
  if (!results || !input) {
    return;
  }
  const target = event.target;
  if (results.contains(target) || input.contains(target)) {
    return;
  }
  results.hidden = true;
});
