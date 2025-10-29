import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore, collection, addDoc, getDocs, doc, setDoc, onSnapshot, query, where, updateDoc, getDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  getAuth, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAvfyYoeooY5bx1Z-SGdcEWA-G_zGFY5B8",
  authDomain: "pacehold-4c7b2.firebaseapp.com",
  projectId: "pacehold-4c7b2",
  storageBucket: "pacehold-4c7b2.firebasestorage.app",
  messagingSenderId: "45898843261",
  appId: "1:45898843261:web:4df9b7cb59dd5a1c699d14"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

let currentUser = null;
let currentChatId = null;
let currentChatRef = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    alert("You must be signed in");
    window.location.href = "index.html";
    return;
  }

  currentUser = user;
  const userDoc = await getDoc(doc(db, "users", user.uid));
  const thisUser = userDoc.data();
  if (!thisUser) return;

  document.getElementById("userBalance").innerText = `Balance: ₦${(thisUser.balance || 0).toLocaleString()}`;

  if (thisUser.role === "buyer") {
    document.getElementById("buyerSection").style.display = "block";
  } else if (thisUser.role === "seller") {
    document.getElementById("sellerSection").style.display = "block";
  } else if (thisUser.role === "rider") {
    document.getElementById("riderSection").style.display = "block";
  }
});

window.searchUsers = async function (role, inputId, resultDivId) {
  const input = document.getElementById(inputId).value.trim().toLowerCase();
  const resultDiv = document.getElementById(resultDivId);
  resultDiv.innerHTML = "<p>Searching...</p>";

  const q = query(collection(db, "users"), where("role", "==", role));
  const querySnap = await getDocs(q);
  let results = [];
  querySnap.forEach(docSnap => {
    const data = docSnap.data();
    if (
      data.name?.toLowerCase().includes(input) ||
      data.business?.toLowerCase().includes(input)
    ) {
      results.push({ id: docSnap.id, ...data });
    }
  });

  if (results.length === 0) {
    resultDiv.innerHTML = "<p>No users found.</p>";
    return;
  }

  resultDiv.innerHTML = results.map(
    u => `
      <div class="user-box">
        <strong>${u.name || u.business}</strong><br>
        <small>${u.location || "No location"}</small><br>
        <button onclick="connectUser('${u.id}', '${u.name || u.business}')">Connect</button>
      </div>
    `
  ).join("");
};

window.connectUser = async function (otherId, otherName) {
  currentChatId = [auth.currentUser.uid, otherId].sort().join("_");
  currentChatRef = doc(db, "chats", currentChatId);

  await setDoc(currentChatRef, {
    participants: [auth.currentUser.uid, otherId],
    buyerConfirmed: false,
    riderConfirmed: false,
    escrowReleased: false
  }, { merge: true });

  document.getElementById("chatSection").style.display = "block";
  document.getElementById("chatBox").innerHTML = `<p>Connected with ${otherName}</p>`;
  document.getElementById("confirmSection").style.display = "flex";

  const chatMessages = collection(db, "chats", currentChatId, "messages");
  onSnapshot(chatMessages, (snapshot) => {
    const chatBox = document.getElementById("chatBox");
    chatBox.innerHTML = "";
    snapshot.forEach(msg => {
      const m = msg.data();
      const sender = m.senderId === auth.currentUser.uid ? "You" : m.senderName;
      chatBox.innerHTML += `<p><strong>${sender}:</strong> ${m.text}</p>`;
    });
    chatBox.scrollTop = chatBox.scrollHeight;
  });

  onSnapshot(currentChatRef, (snap) => {
    const data = snap.data();
    updateConfirmButtons(data);
  });
};

function updateConfirmButtons(chatData) {
  const buyerBtn = document.getElementById("buyerConfirmBtn");
  const riderBtn = document.getElementById("riderConfirmBtn");

  buyerBtn.className = chatData.buyerConfirmed ? "done" : "pending";
  buyerBtn.innerText = chatData.buyerConfirmed ? "Buyer Confirmed" : "Buyer Confirm";

  riderBtn.className = chatData.riderConfirmed ? "done" : "pending";
  riderBtn.innerText = chatData.riderConfirmed ? "Rider Confirmed" : "Rider Confirm";

  if (chatData.buyerConfirmed && chatData.riderConfirmed && !chatData.escrowReleased) {
    releaseEscrow();
  }
}

async function releaseEscrow() {
  await updateDoc(currentChatRef, { escrowReleased: true });
  alert("✅ Both confirmed — escrow released to the seller!");
}

window.confirmDelivery = async function (role) {
  const updateField = role === "buyer" ? "buyerConfirmed" : "riderConfirmed";
  await updateDoc(currentChatRef, { [updateField]: true });
};

window.sendMessage = async function () {
  const input = document.getElementById("chatInput");
  if (!input.value.trim() || !currentChatId) return;
  await addDoc(collection(db, "chats", currentChatId, "messages"), {
    text: input.value,
    senderId: auth.currentUser.uid,
    senderName: currentUser.displayName || "User",
    timestamp: new Date()
  });
  input.value = "";
};
