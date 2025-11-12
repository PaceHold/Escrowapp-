// dashboard.js
document.addEventListener("DOMContentLoaded", () => {
  const logoutBtn = document.getElementById("logout-btn");
  const roleSpan = document.getElementById("role-span");
  const searchInput = document.getElementById("search-input");
  const searchResults = document.getElementById("search-results");

  const userSession = JSON.parse(localStorage.getItem("pacehold_user"));
  const currentPage = window.location.pathname.split("/").pop();

  // ⛔ Only redirect if the user is NOT logged in
  if (!userSession) {
    if (currentPage !== "index.html") {
      window.location.href = "index.html";
    }
    return;
  }

  if (roleSpan) roleSpan.textContent = userSession.role || "-";

  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      localStorage.removeItem("pacehold_user");
      window.location.href = "index.html";
    });
  }

  // 🧠 Search simulation
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      const query = searchInput.value.toLowerCase();
      if (!query) {
        searchResults.innerHTML = "";
        return;
      }

      const users = ["alice@pacehold.com", "bob@pacehold.com", "charlie@pacehold.com"];
      const results = users.filter((u) => u.includes(query));

      searchResults.innerHTML =
        results.length > 0
          ? results.map((r) => `<div class="result-item">${r}</div>`).join("")
          : `<div class="result-item">No results found</div>`;
    });
  }
});
