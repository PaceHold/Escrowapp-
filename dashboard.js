// dashboard.js
document.addEventListener('DOMContentLoaded', () => {
  const userSession = JSON.parse(localStorage.getItem('pacehold_user'));
  const logoutBtn = document.getElementById('logout-btn');
  const roleSpan = document.getElementById('role-span');
  const searchInput = document.getElementById('search-input');
  const searchResults = document.getElementById('search-results');

  // Check if logged in
  if (!userSession) {
    window.location.href = 'index.html';
    return;
  }

  // Display user info
  if (roleSpan) {
    roleSpan.textContent = userSession.role || '-';
  }

  // Logout
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      localStorage.removeItem('pacehold_user');
      window.location.href = 'index.html';
    });
  }

  // Dummy search feature (replace with actual backend later)
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const query = searchInput.value.toLowerCase();
      if (!query) {
        searchResults.innerHTML = '';
        return;
      }

      const sampleUsers = ['alice@pacehold.com', 'bob@pacehold.com', 'charlie@pacehold.com'];
      const matches = sampleUsers.filter(user => user.includes(query));

      searchResults.innerHTML = matches.length
        ? matches.map(m => `<div class="result-item">${m}</div>`).join('')
        : '<div class="result-item">No results</div>';
    });
  }
});
