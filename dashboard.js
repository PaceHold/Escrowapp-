import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, getDocs, addDoc, setDoc, query, where, onSnapshot, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAvfyYoeooY5bx1Z-SGdcEWA-G_zGFY5B8",
  authDomain: "pacehold-4c7b2.firebaseapp.com",
  projectId: "pacehold-4c7b2",
  storageBucket: "pacehold-4c7b2.firebasestorage.app",
  messagingSenderId: "45898843261",
  appId: "1:45898843261:web:4df9b7cb59dd5a1c699d14"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const tabs = document.querySelectorAll("nav button[data-tab]");
const sections = document.querySelectorAll("section");
const logoutBtn = document.getElementById("logoutBtn");

tabs.forEach(tab => {
  tab.addEventListener("click", () => {
    tabs.forEach(t => t.classList.remove("active"));
    sections.forEach(s => s.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById(tab.dataset.tab).classList.add("active");
  });
});

// Session + Role-based Dashboard
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  const userRef = doc(db, "users", user.uid);
  const userSnap = await getDoc(userRef);
  const data = userSnap.data();

  if (!data) return;

  document.getElementById("welcomeText").innerText = `Welcome, ${data.name} (${data.role})`;
  document.getElementById("balanceAmount").innerText = (data.balance ?? 0).toLocaleString();

  // Role instructions
  const searchInstruction = document.getElementById("searchInstruction");
  if (data.role === "buyer") searchInstruction.innerText = "Search for a Seller to start a transaction.";
  else if (data.role === "seller") searchInstruction.innerText = "Search for a Rider to deliver your goods.";
  else searchInstruction.innerText = "Search for assigned deliveries.";

  // Search
  const searchBtn = document.getElementById("searchBtn");
  const searchResults = document.getElementById("searchResults");
  searchBtn.onclick = async () => {
    const queryVal = document.getElementById("searchInput").value.trim().toLowerCase();
    if (!queryVal) return;
    const usersRef = collection(db, "users");
    const q = query(usersRef, where("name", ">=", queryVal), where("name", "<=", queryVal + "\uf8ff"));
    const snap = await getDocs(q);

    searchResults.innerHTML = "";
    snap.forEach(docu => {
      const u = docu.data();
      if (u.email !== user.email) {
        const div = document.createElement("div");
        div.classList.add("card");
        div.innerHTML = `<strong>${u.name}</strong><br>${u.role.toUpperCase()}`;
        searchResults.appendChild(div);
      }
    });
    if (!snap.size) searchResults.innerHTML = "<p>No results found.</p>";
  };

  // Chat logic
  const chatBox = document.getElementById("chatBox");
  const messageInput = document.getElementById("messageInput");
  const sendBtn = document.getElementById("sendMsgBtn");

  const chatRef = collection(db, "chat");
  onSnapshot(chatRef, (snapshot) => {
    chatBox.innerHTML = "";
    snapshot.forEach(docu => {
      const msg = docu.data();
      const div = document.createElement("div");
      div.classList.add("message");
      if (msg.sender === user.uid) div.classList.add("you");
      div.textContent = `${msg.text}`;
      chatBox.appendChild(div);
    });
    chatBox.scrollTop = chatBox.scrollHeight;
  });

  sendBtn.onclick = async () => {
    const text = messageInput.value.trim();
    if (!text) return;
    await addDoc(chatRef, {
      sender: user.uid,
      text,
      timestamp: new Date()
    });
    messageInput.value = "";
  };

  // Escrow confirmation logic placeholder
  const confirmBtn = document.getElementById("confirmBtn");
  confirmBtn.onclick = async () => {
    alert("Delivery confirmed! Escrow will be released once both confirm.");
  };
});

logoutBtn.addEventListener("click", () => {
  signOut(auth).then(() => window.location.href = "index.html");
});
