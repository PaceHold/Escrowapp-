// index.js
document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("login-form");
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");

  // 🔒 Prevent redirect loop by checking ONLY once and waiting for DOM to be ready
  const userSession = JSON.parse(localStorage.getItem("pacehold_user"));

  // Redirect ONLY if we're not already on dashboard pages
  const currentPage = window.location.pathname.split("/").pop();

  if (
    userSession &&
    userSession.role &&
    !["buyer.html", "seller.html", "rider.html", "dashboard.html"].includes(
      currentPage
    )
  ) {
    redirectToDashboard(userSession.role);
    return;
  }

  if (loginForm) {
    loginForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const email = emailInput.value.trim();
      const password = passwordInput.value.trim();

      if (!email || !password) {
        alert("Please fill all fields");
        return;
      }

      const storedUser = JSON.parse(localStorage.getItem(email));
      if (!storedUser || storedUser.password !== password) {
        alert("Invalid email or password");
        return;
      }

      // Save active session
      localStorage.setItem(
        "pacehold_user",
        JSON.stringify({
          email,
          role: storedUser.role,
          name: storedUser.name,
        })
      );

      redirectToDashboard(storedUser.role);
    });
  }

  function redirectToDashboard(role) {
    switch (role) {
      case "buyer":
        window.location.href = "buyer.html";
        break;
      case "seller":
        window.location.href = "seller.html";
        break;
      case "rider":
        window.location.href = "rider.html";
        break;
      default:
        window.location.href = "dashboard.html";
    }
  }
});
