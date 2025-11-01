// ---- Firebase Config ---- //
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MSG_ID",
  appId: "YOUR_APP_ID"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// ---- DOM Elements ---- //
const userList = document.getElementById("userList");
const searchInput = document.getElementById("searchInput");
const welcomeName = document.getElementById("welcomeName");
const roleLabel = document.getElementById("roleLabel");
const topUser = document.getElementById("topUser");
const logoutBtn = document.getElementById("logoutBtn");

// ---- Session Check ---- //
auth.onAuthStateChanged(async (user) => {
  if (!user) {
    window.location.href = "index.html"; // redirect to login
    return;
  }

  const userDoc = await db.collection("users").doc(user.uid).get();
  const userData = userDoc.data();

  if (!userData) return;

  welcomeName.textContent = `Welcome, ${userData.name || "User"}`;
  topUser.textContent = userData.email;
  roleLabel.textContent = `Role: ${userData.role}`;
  loadUsers(userData.role);
});

// ---- Logout ---- //
logoutBtn.addEventListener("click", () => {
  auth.signOut();
});

// ---- Load All Users ---- //
async function loadUsers(currentRole) {
  try {
    const snapshot = await db.collection("users").get();
    let listHTML = "";

    if (snapshot.empty) {
      listHTML = `<div style="color:#bbb;text-align:center;padding:10px">No users found</div>`;
    } else {
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (data.role !== currentRole) {
          listHTML += `
            <div class="user-row" onclick="startChat('${doc.id}', '${data.name}', '${data.role}')">
              <div>
                <div class="user-name">${data.name}</div>
                <div class="small muted">${data.role}</div>
              </div>
              <div class="label-pill">${data.email}</div>
            </div>`;
        }
      });
    }
    userList.innerHTML = listHTML;
  } catch (error) {
    console.error("Error loading users:", error);
    userList.innerHTML = `<div style="color:#f66;text-align:center;padding:10px">Failed to load users</div>`;
  }
}

// ---- Search Filter ---- //
searchInput.addEventListener("input", async (e) => {
  const query = e.target.value.trim().toLowerCase();
  const currentUser = auth.currentUser;
  if (!currentUser) return;

  const userDoc = await db.collection("users").doc(currentUser.uid).get();
  const userData = userDoc.data();
  const currentRole = userData.role;

  if (query === "") {
    loadUsers(currentRole);
    return;
  }

  const snapshot = await db.collection("users").get();
  let listHTML = "";

  snapshot.forEach((doc) => {
    const data = doc.data();
    if (data.role !== currentRole) {
      const nameMatch = data.name?.toLowerCase().includes(query);
      const emailMatch = data.email?.toLowerCase().includes(query);
      const roleMatch = data.role?.toLowerCase().includes(query);
      if (nameMatch || emailMatch || roleMatch) {
        listHTML += `
          <div class="user-row" onclick="startChat('${doc.id}', '${data.name}', '${data.role}')">
            <div>
              <div class="user-name">${data.name}</div>
              <div class="small muted">${data.role}</div>
            </div>
            <div class="label-pill">${data.email}</div>
          </div>`;
      }
    }
  });

  userList.innerHTML =
    listHTML ||
    `<div style="color:#bbb;text-align:center;padding:10px">No match found</div>`;
});

// ---- Chat Placeholder ---- //
function startChat(uid, name, role) {
  const activeChatInfo = document.getElementById("activeChatInfo");
  activeChatInfo.innerHTML = `
    <div>Chatting with <b>${name}</b> (${role})</div>
    <div style="font-size:13px;color:#999">Feature coming soon...</div>
  `;
}

// ---- Refresh Button ---- //
function refreshList() {
  const currentUser = auth.currentUser;
  if (!currentUser) return;
  db.collection("users")
    .doc(currentUser.uid)
    .get()
    .then((doc) => {
      if (doc.exists) {
        loadUsers(doc.data().role);
      }
    });
}

window.refreshList = refreshList;
window.startChat = startChat;
