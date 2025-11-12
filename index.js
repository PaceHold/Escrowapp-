// index.js
document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('login-form');
  const signupLink = document.getElementById('signup-link');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const nameInput = document.getElementById('name'); // Optional name field

  // Check if a session exists already
  const userSession = JSON.parse(localStorage.getItem('pacehold_user'));
  if (userSession && userSession.role) {
    redirectToDashboard(userSession.role);
  }

  // Handle login
  if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = emailInput.value.trim();
      const password = passwordInput.value.trim();

      if (!email || !password) {
        alert('Please fill all fields');
        return;
      }

      const storedUser = JSON.parse(localStorage.getItem(email));

      if (!storedUser || storedUser.password !== password) {
        alert('Invalid email or password');
        return;
      }

      // Save session
      localStorage.setItem(
        'pacehold_user',
        JSON.stringify({ email, role: storedUser.role, name: storedUser.name })
      );

      redirectToDashboard(storedUser.role);
    });
  }

  // Handle signup link
  if (signupLink) {
    signupLink.addEventListener('click', () => {
      window.location.href = 'signup.html';
    });
  }

  function redirectToDashboard(role) {
    if (role === 'buyer') window.location.href = 'buyer.html';
    else if (role === 'seller') window.location.href = 'seller.html';
    else if (role === 'rider') window.location.href = 'rider.html';
    else window.location.href = 'dashboard.html';
  }
});
