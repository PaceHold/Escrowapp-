// index.js  — login/signup/session handling

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";

// ✅ Your Firebase Config here
const firebaseConfig = {
  apiKey: "YOUR_FIREBASE_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "SENDER_ID",
  appId: "APP_ID"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// -------- DOM ----------
const signupForm = document.getElementById("signupForm");
const loginForm = document.getElementById("loginForm");
const logoutBtn = document.getElementById("logoutBtn");
const roleSelect = document.getElementById("roleSelect");

// -------- Session Guard ----------
onAuthStateChanged(auth, async (user) => {
  if (user) {
    const stored = sessionStorage.getItem("pacehold_user");
    if (!stored) {
      const userDoc = await getDoc(doc(db, "users", user.uid));
      const data = userDoc.exists() ? userDoc.data() : {};
      sessionStorage.setItem("pacehold_user", JSON.stringify({
        uid: user.uid,
        name: data.name || user.displayName || "",
        role: data.role || "buyer"
      }));
    }
    if (!window.location.href.includes("dashboard.html")) {
      window.location.href = "dashboard.html";
    }
  } else {
    sessionStorage.removeItem("pacehold_user");
    if (window.location.href.includes("dashboard.html")) {
      window.location.href = "index.html";
    }
  }
});

// -------- Signup ----------
if (signupForm) {
  signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = signupForm["name"].value.trim();
    const email = signupForm["email"].value.trim();
    const password = signupForm["password"].value.trim();
    const role = roleSelect.value;

    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName: name });
      await setDoc(doc(db, "users", cred.user.uid), { name, email, role, uid: cred.user.uid });
      sessionStorage.setItem("pacehold_user", JSON.stringify({ uid: cred.user.uid, name, role }));
      window.location.href = "dashboard.html";
    } catch (err) {
      alert(err.message);
    }
  });
}

// -------- Login ----------
if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = loginForm["email"].value.trim();
    const password = loginForm["password"].value.trim();
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const userDoc = await getDoc(doc(db, "users", cred.user.uid));
      const data = userDoc.exists() ? userDoc.data() : {};
      sessionStorage.setItem("pacehold_user", JSON.stringify({
        uid: cred.user.uid,
        name: data.name || cred.user.displayName || "",
        role: data.role || "buyer"
      }));
      window.location.href = "dashboard.html";
    } catch (err) {
      alert(err.message);
    }
  });
}

// -------- Logout ----------
if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    await signOut(auth);
    sessionStorage.clear();
    window.location.href = "index.html";
  });
}
