/* dashboard.js
   Real-time user list, private chats, and unread badge
*/

// === same firebaseConfig as other files ===
const firebaseConfig = {
  apiKey: "AIzaSyAvfyYoeooY5bx1Z-SGdcEWA-G_zGFY5B8",
  authDomain: "pacehold-4c7b2.firebaseapp.com",
  projectId: "pacehold-4c7b2",
  storageBucket: "pacehold-4c7b2.firebasestorage.app",
  messagingSenderId: "45898843261",
  appId: "1:45898843261:web:4df9b7cb59dd5a1c699d14"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let currentUser = null;
let currentUserDoc = null;
let currentChatRef = null;
let messagesUnsubscribe = null;
let usersUnsubscribe = null;

// role mapping: buyer -> see sellers, seller -> see riders, rider -> see sellers
function targetRoleFor(role){
  if(role === 'buyer') return 'seller';
  if(role === 'seller') return 'rider';
  if(role === 'rider') return 'seller';
  return 'seller';
}

// Utility: create a stable chat id for two user IDs (lexicographic)
function chatIdFor(a,b){
  return a < b ? `${a}_${b}` : `${b}_${a}`;
}

// UI elements
const welcomeName = document.getElementById('welcomeName');
const roleLabel = document.getElementById('roleLabel');
const userListEl = document.getElementById('userList');
const searchInput = document.getElementById('searchInput');
const topUser = document.getElementById('topUser');
const logoutBtn = document.getElementById('logoutBtn');
const chatFab = document.getElementById('chatFab');
const chatBadge = document.getElementById('chatBadge');
const chatPanel = document.getElementById('chatPanel');
const chatWith = document.getElementById('chatWith');
const chatWithSub = document.getElementById('chatWithSub');
const chatBody = document.getElementById('chatBody');
const messageInput = document.getElementById('messageInput');
const activeChatInfo = document.getElementById('activeChatInfo');

logoutBtn.onclick = () => auth.signOut().then(()=> window.location.href='index.html');

// Listen auth
auth.onAuthStateChanged(async user => {
  if(!user){
    window.location.href = 'index.html';
    return;
  }
  currentUser = user;
  // load profile doc
  const ud = await db.collection('users').doc(user.uid).get();
  if(!ud.exists){
    // fall back (create minimal doc)
    await db.collection('users').doc(user.uid).set({
      email: user.email,
      role: 'buyer',
      displayName: user.email.split('@')[0],
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    currentUserDoc = (await db.collection('users').doc(user.uid).get()).data();
  } else {
    currentUserDoc = ud.data();
  }

  welcomeName.innerText = currentUserDoc.displayName || user.email;
  roleLabel.innerText = 'Role: ' + (currentUserDoc.role || 'buyer');
  topUser.innerText = currentUser.email;

  // start listening user list for target role
  startUserListListener();

  // start unread badge monitor
  startUnreadMonitor();
});

// search refresh
searchInput.addEventListener('input', ()=> refreshList());

// load list of target-role users
function startUserListListener(){
  if(usersUnsubscribe) usersUnsubscribe();
  const targetRole = targetRoleFor(currentUserDoc.role);
  usersUnsubscribe = db.collection('users')
    .where('role','==',targetRole)
    .orderBy('displayName')
    .onSnapshot(snapshot => {
      // simply refresh UI with current results and filter by search
      const items = [];
      snapshot.forEach(doc => {
        const d = doc.data();
        items.push({ id: doc.id, ...d });
      });
      renderUserList(items);
    });
}

async function refreshList(){
  // manual refresh: get current collection snapshot (one-time)
  const targetRole = targetRoleFor(currentUserDoc.role);
  const q = db.collection('users').where('role','==',targetRole).orderBy('displayName');
  const snap = await q.get();
  const items = [];
  snap.forEach(d=> items.push({id:d.id,...d.data()}));
  renderUserList(items);
}

function renderUserList(items){
  const query = searchInput.value.trim().toLowerCase();
  userListEl.innerHTML = '';
  const filtered = query ? items.filter(u => (u.displayName||'').toLowerCase().includes(query)) : items;
  if(filtered.length === 0){
    userListEl.innerHTML = '<div style="color:#bbb;text-align:center;padding:10px">No users found</div>';
    return;
  }
  filtered.forEach(async user => {
    // For each user, check if there are unread messages for current user from them (to show small badge)
    const row = document.createElement('div');
    row.className = 'user-row';
    row.innerHTML = `<div>
                       <div class="user-name">${escapeHtml(user.displayName || user.email)}</div>
                       <div style="font-size:13px;color:#adb7c9">${escapeHtml(user.email)}</div>
                     </div>
                     <div id="badge-${user.id}"></div>`;
    row.onclick = () => openChatWith(user);
    userListEl.appendChild(row);
    // update unread badge
    updateRowBadge(user.id, row.querySelector(`#badge-${user.id}`));
  });
}

// escape helper
function escapeHtml(s){ if(!s) return ''; return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// Open chat with a user object {id, displayName, email}
async function openChatWith(user){
  // set active chat info
  activeChatInfo.innerHTML = `<strong>Chatting with:</strong> ${escapeHtml(user.displayName)} <div style="color:#bbb;font-size:13px">${escapeHtml(user.email)}</div>`;
  chatWith.innerText = user.displayName;
  chatWithSub.innerText = user.email;

  // ensure chat id doc exists
  const cid = chatIdFor(currentUser.uid, user.id);
  currentChatRef = db.collection('chats').doc(cid);

  // create chat doc if doesn't exist (store participants meta)
  const doc = await currentChatRef.get();
  if(!doc.exists){
    await currentChatRef.set({
      participants: [currentUser.uid, user.id],
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } else {
    await currentChatRef.update({ updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
  }

  // open chat panel
  openChatPanel();

  // unsubscribe old messages if any
  if(messagesUnsubscribe) messagesUnsubscribe();

  // mark unread messages as read on open
  const unreadQuery = currentChatRef.collection('messages').where('to','==', currentUser.uid).where('read','==', false);
  const unreadSnap = await unreadQuery.get();
  const batch = db.batch();
  unreadSnap.forEach(mdoc => batch.update(mdoc.ref, { read: true }));
  if(unreadSnap.size) await batch.commit();

  // Listen messages in real-time
  messagesUnsubscribe = currentChatRef.collection('messages').orderBy('createdAt').onSnapshot(snapshot => {
    chatBody.innerHTML = '';
    snapshot.forEach(msgDoc => {
      const m = msgDoc.data();
      const el = document.createElement('div');
      el.className = 'msg ' + (m.from === currentUser.uid ? 'me' : 'them');
      el.innerText = `${(m.fromName||'')}: ${m.text}`;
      chatBody.appendChild(el);
    });
    // scroll to bottom
    chatBody.scrollTop = chatBody.scrollHeight;
    // update unread monitor / badge
    startUnreadMonitor();
  });

  // store current chat partner id for sendMessage
  chatPanel.dataset.chatPartner = user.id;
}

// Send message
async function sendMessage(){
  const text = messageInput.value.trim();
  if(!text || !currentChatRef) return;
  const partnerId = chatPanel.dataset.chatPartner;
  const docRef = currentChatRef.collection('messages').doc();
  const data = {
    text: text,
    from: currentUser.uid,
    fromName: currentUserDoc.displayName || currentUser.email,
    to: partnerId,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    read: false
  };
  await docRef.set(data);
  // update chat updatedAt
  await currentChatRef.update({ updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
  messageInput.value = '';
}

// chat panel toggles
function toggleChatPanel(){
  if(chatPanel.style.display === 'none' || chatPanel.style.display === ''){
    // open (if a chat is selected, show it; otherwise prompt)
    chatPanel.style.display = 'flex';
  } else {
    chatPanel.style.display = 'none';
  }
}
function openChatPanel(){ chatPanel.style.display = 'flex'; chatBadge.style.display = 'none'; }
function closeChatPanel(){ chatPanel.style.display = 'none'; }

// Unread monitor: show badge on floating button if there's any unread message for current user across all chats
let unreadUnsubscribe = null;
function startUnreadMonitor(){
  if(unreadUnsubscribe) unreadUnsubscribe();
  // messages addressed to current user where read == false
  unreadUnsubscribe = db.collectionGroup('messages')
    .where('to','==', currentUser.uid)
    .where('read','==', false)
    .onSnapshot(snap => {
      if(snap.size > 0) {
        chatBadge.style.display = 'flex';
        chatBadge.innerText = snap.size > 9 ? '9+' : String(snap.size);
      } else {
        chatBadge.style.display = 'none';
      }
      // also update individual row badges
      // Note: updateRowBadge will run from user list render; but to immediately reflect, call refreshList
      refreshList();
    });
}

// update a single row's small badge (for unread from that user)
async function updateRowBadge(userId, badgeContainer){
  // find messages in chat between currentUser and userId that are to currentUser and unread
  const cid = chatIdFor(currentUser.uid, userId);
  const msgCol = db.collection('chats').doc(cid).collection('messages');
  try{
    const q = msgCol.where('to','==', currentUser.uid).where('read','==', false);
    const snap = await q.get();
    if(snap.size > 0){
      badgeContainer.innerHTML = `<div class="badge-new">${snap.size}</div>`;
    } else {
      badgeContainer.innerHTML = '';
    }
  }catch(e){
    // ignore if chat doesn't exist
    badgeContainer.innerHTML = '';
  }
}

// helper: when user list (re)renders, we call updateRowBadge for each row - done in renderUserList

// Close listeners when leaving window
window.addEventListener('beforeunload', ()=>{
  if(messagesUnsubscribe) messagesUnsubscribe();
  if(usersUnsubscribe) usersUnsubscribe();
  if(unreadUnsubscribe) unreadUnsubscribe();
});

// small helper for initial refresh
function init(){
  refreshList();
}
init();
