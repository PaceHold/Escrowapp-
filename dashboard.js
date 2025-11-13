// dashboard.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-app.js";
import { getFirestore, collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "YOUR_FIREBASE_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "SENDER_ID",
  appId: "APP_ID"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// -------- Session Check ----------
const sessionUser = JSON.parse(sessionStorage.getItem("pacehold_user"));
if (!sessionUser) {
  window.location.href = "index.html";
}

// -------- Display User ----------
document.addEventListener("DOMContentLoaded", () => {
  const userBox = document.getElementById("userBox");
  if (userBox) {
    userBox.textContent = `Welcome, ${sessionUser.name} (${sessionUser.role})`;
  }
});

// -------- Search Users ----------
async function searchUsers() {
  const input = document.getElementById("searchInput").value.trim().toLowerCase();
  const resultBox = document.getElementById("resultBox");
  resultBox.innerHTML = "Searching...";
  let q;

  if (sessionUser.role === "buyer") {
    q = query(collection(db, "users"), where("role", "==", "seller"));
  } else if (sessionUser.role === "seller") {
    q = query(collection(db, "users"), where("role", "==", "buyer"));
  } else if (sessionUser.role === "rider") {
    q = query(collection(db, "users"), where("role", "in", ["buyer", "seller"]));
  }

  const snapshot = await getDocs(q);
  const matches = [];
  snapshot.forEach((doc) => {
    const data = doc.data();
    if (data.name.toLowerCase().includes(input)) {
      matches.push(data);
    }
  });

  if (matches.length === 0) {
    resultBox.innerHTML = "<p>No users found.</p>";
  } else {
    resultBox.innerHTML = matches
      .map(
        (u) =>
          `<div class="user-result">
            <strong>${u.name}</strong> — ${u.role}
          </div>`
      )
      .join("");
  }
}

const searchBtn = document.getElementById("searchBtn");
if (searchBtn) searchBtn.addEventListener("click", searchUsers);
