/* dashboard.js
   Full working dashboard:
   - search (buyer->seller, seller->rider) with client-side partial match
   - real-time chat (chats/{chatId}/messages)
   - wallets (wallets/{uid}) with balance & escrowHeld
   - transactions (transactions collection) with buyer/rider confirmations
   - rider assignment modal with distance simulation & price estimate
   - fund wallet helper
   Keep files separate: dashboard.html + dashboard.js
*/

// === firebaseConfig: your config ===
const firebaseConfig = {
  apiKey: "AIzaSyAvfyYoeooY5bx1Z-SGdcEWA-G_zGFY5B8",
  authDomain: "pacehold-4c7b2.firebaseapp.com",
  projectId: "pacehold-4c7b2",
  storageBucket: "pacehold-4c7b2.firebasestorage.app",
  messagingSenderId: "45898843261",
  appId: "1:45898843261:web:4df9b7cb59dd5a1c699d14"
};

// Initialize Firebase (compat)
if(!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// State
let currentUser = null;
let currentUserDoc = null;
let currentWallet = null;
let currentChatRef = null;
let messagesUnsubscribe = null;
let usersUnsubscribe = null;
let unreadUnsubscribe = null;
let txUnsubscribe = null;

// DOM
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
const roleInstructionEl = document.getElementById('roleInstruction');
const riderModal = document.getElementById('riderModal');

logoutBtn.onclick = () => auth.signOut().then(()=> window.location.href='index.html');

// helpers
function escapeHtml(s){ if(!s) return ''; return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function chatIdFor(a,b){ return a < b ? `${a}_${b}` : `${b}_${a}`; }
function targetRoleFor(role){
  if(role === 'buyer') return 'seller';
  if(role === 'seller') return 'rider';
  if(role === 'rider') return 'seller';
  return 'seller';
}
function formatNGN(n){ if(typeof n !== 'number') n = Number(n || 0); return n.toLocaleString('en-NG', { style: 'currency', currency: 'NGN' }); }

// text-based distance & price estimation
function estimateDistanceAndPrice(locA, locB){
  const a = (locA || '').toLowerCase().trim();
  const b = (locB || '').toLowerCase().trim();
  if(!a || !b) return { label: 'Unknown', price: 1500 };
  if(a === b) return { label: 'Near', price: 500 };
  const aTokens = new Set(a.split(/\s+/));
  const bTokens = new Set(b.split(/\s+/));
  let common = 0;
  aTokens.forEach(t => { if(bTokens.has(t)) common++; });
  if(common > 0) return { label: 'Near', price: 700 };
  const commonLetters = [...a].filter(ch => b.includes(ch)).length;
  const avgLen = (a.length + b.length) / 2;
  const ratio = avgLen === 0 ? 0 : (commonLetters / avgLen);
  if(ratio > 0.35) return { label: 'Medium', price: 1500 };
  if(ratio > 0.18) return { label: 'Medium', price: 1800 };
  return { label: 'Far', price: 2500 };
}

// ---------- Auth listener ----------
auth.onAuthStateChanged(async user => {
  if(!user){
    window.location.href = 'index.html';
    return;
  }
  currentUser = user;

  // Load or ensure user doc exists
  const uRef = db.collection('users').doc(user.uid);
  const uSnap = await uRef.get();
  if(!uSnap.exists){
    await uRef.set({
      email: user.email,
      role: 'buyer',
      displayName: user.email.split('@')[0],
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }
  currentUserDoc = (await uRef.get()).data();

  // Load or create wallet
  const wRef = db.collection('wallets').doc(user.uid);
  const wSnap = await wRef.get();
  if(!wSnap.exists){
    await wRef.set({ uid: user.uid, balance: 0, escrowHeld: 0, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
    currentWallet = { uid: user.uid, balance: 0, escrowHeld: 0 };
  } else {
    currentWallet = wSnap.data();
    if(typeof currentWallet.balance === 'undefined' || typeof currentWallet.escrowHeld === 'undefined'){
      await wRef.update({ balance: currentWallet.balance || 0, escrowHeld: currentWallet.escrowHeld || 0 });
      currentWallet = (await wRef.get()).data();
    }
  }

  // UI update
  welcomeName.innerText = currentUserDoc.displayName || currentUser.email;
  roleLabel.innerText = 'Role: ' + (currentUserDoc.role || 'buyer');
  topUser.innerText = currentUser.email;

  insertRoleInstruction();
  injectEscrowUI();

  startUserListListener();
  startUnreadMonitor();
  startTransactionsListener();
});

// ---------- Search & User List (fixed) ----------
searchInput.addEventListener('input', ()=> refreshList());

function startUserListListener(){
  if(usersUnsubscribe) usersUnsubscribe();
  const target = targetRoleFor(currentUserDoc.role);
  usersUnsubscribe = db.collection('users').where('role','==',target).orderBy('displayName').onSnapshot(snap => {
    const items = [];
    snap.forEach(d => items.push({ id: d.id, ...d.data() }));
    renderUserList(items);
  }, err => console.error('users listener err', err));
}

async function refreshList(){
  const target = targetRoleFor(currentUserDoc.role);
  const snap = await db.collection('users').where('role','==',target).orderBy('displayName').get();
  const items = []; snap.forEach(d => items.push({ id: d.id, ...d.data() }));
  renderUserList(items);
}

function renderUserList(items){
  const q = (searchInput.value || '').trim().toLowerCase();
  userListEl.innerHTML = '';
  const filtered = q ? items.filter(u => ( (u.displayName||'') + ' ' + (u.email||'') ).toLowerCase().includes(q) ) : items;
  if(filtered.length === 0){
    userListEl.innerHTML = '<div style="color:#bbb;text-align:center;padding:10px">No users found</div>';
    return;
  }
  filtered.forEach(user => {
    const row = document.createElement('div');
    row.className = 'user-row';
    row.innerHTML = `<div>
                       <div class="user-name">${escapeHtml(user.displayName || user.email)}</div>
                       <div style="font-size:13px;color:#adb7c9">${escapeHtml(user.email || '')}</div>
                     </div>
                     <div id="badge-${user.id}"></div>`;
    row.onclick = () => openChatWith(user);
    userListEl.appendChild(row);
    updateRowBadge(user.id, document.getElementById(`badge-${user.id}`));
  });
}

// ---------- Chat open + messages (stable chatId) ----------
async function openChatWith(user){
  activeChatInfo.innerHTML = `<strong>Chatting with:</strong> ${escapeHtml(user.displayName)} <div style="color:#bbb;font-size:13px">${escapeHtml(user.email)}</div>`;
  chatWith.innerText = user.displayName || user.email;
  chatWithSub.innerText = user.email || '';

  const cid = chatIdFor(currentUser.uid, user.id);
  currentChatRef = db.collection('chats').doc(cid);

  // create or update chat doc
  const docSnap = await currentChatRef.get();
  if(!docSnap.exists){
    await currentChatRef.set({
      participants: [currentUser.uid, user.id],
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } else {
    await currentChatRef.update({ updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
  }

  openChatPanel();

  if(messagesUnsubscribe) messagesUnsubscribe();

  // mark unread to current user as read
  const unreadQ = currentChatRef.collection('messages').where('to','==', currentUser.uid).where('read','==', false);
  const unreadSnap = await unreadQ.get();
  if(!unreadSnap.empty){
    const batch = db.batch();
    unreadSnap.forEach(m => batch.update(m.ref, { read: true }));
    await batch.commit();
  }

  messagesUnsubscribe = currentChatRef.collection('messages').orderBy('createdAt').onSnapshot(snapshot => {
    chatBody.innerHTML = '';
    snapshot.forEach(doc => {
      const m = doc.data();
      const el = document.createElement('div');
      el.className = 'msg ' + (m.from === currentUser.uid ? 'me' : 'them');
      el.innerText = `${m.fromName || ''}: ${m.text}`;
      chatBody.appendChild(el);
    });
    chatBody.scrollTop = chatBody.scrollHeight;
    refreshTransactionsUI();
    startUnreadMonitor();
  }, err => console.error('messages onSnapshot error', err));

  chatPanel.dataset.chatPartner = user.id;
}

// send message
async function sendMessage(){
  const text = (messageInput.value || '').trim();
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
  await currentChatRef.update({ updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
  messageInput.value = '';
}

// chat panel toggles
function toggleChatPanel(){ chatPanel.style.display = (chatPanel.style.display === 'flex') ? 'none' : 'flex'; }
function openChatPanel(){ chatPanel.style.display = 'flex'; chatBadge.style.display = 'none'; }
function closeChatPanel(){ chatPanel.style.display = 'none'; }

// ---------- Unread / badges ----------
function startUnreadMonitor(){
  if(unreadUnsubscribe) unreadUnsubscribe();
  unreadUnsubscribe = db.collectionGroup('messages').where('to','==', currentUser.uid).where('read','==', false)
    .onSnapshot(snap => {
      if(snap.size > 0){
        chatBadge.style.display = 'flex';
        chatBadge.innerText = snap.size > 9 ? '9+' : String(snap.size);
      } else {
        chatBadge.style.display = 'none';
      }
      refreshList();
    }, err => console.error('unread monitor error', err));
}

async function updateRowBadge(userId, badgeContainer){
  if(!badgeContainer) return;
  const cid = chatIdFor(currentUser.uid, userId);
  try{
    const q = db.collection('chats').doc(cid).collection('messages').where('to','==', currentUser.uid).where('read','==', false);
    const snap = await q.get();
    if(snap.size > 0) badgeContainer.innerHTML = `<div class="badge-new">${snap.size}</div>`;
    else badgeContainer.innerHTML = '';
  }catch(e){
    badgeContainer.innerHTML = '';
  }
}

// ---------- Transactions & Escrow (wallets, transactions) ----------
function startTransactionsListener(){
  if(txUnsubscribe) txUnsubscribe();
  txUnsubscribe = db.collection('transactions').where('participants','array-contains', currentUser.uid).orderBy('createdAt','desc')
    .onSnapshot(snap => refreshTransactionsUI(), err => console.error('tx listener err', err));
}

async function refreshTransactionsUI(){
  if(!document.getElementById('escrowContainer')) return;
  const listEl = document.getElementById('escrowList');
  const balEl = document.getElementById('balanceDisplay');
  const escrowTotalEl = document.getElementById('escrowTotalDisplay');

  const wSnap = await db.collection('wallets').doc(currentUser.uid).get();
  const wallet = wSnap.exists ? wSnap.data() : { balance:0, escrowHeld:0 };
  currentWallet = wallet;
  if(balEl) balEl.innerText = formatNGN(wallet.balance || 0);
  if(escrowTotalEl) escrowTotalEl.innerText = formatNGN(wallet.escrowHeld || 0);

  // query transactions where user is participant
  const txSnap = await db.collection('transactions').where('participants','array-contains', currentUser.uid).orderBy('createdAt','desc').get();
  const items = [];
  txSnap.forEach(d => items.push({ id: d.id, ...d.data() }));

  listEl.innerHTML = '';
  if(items.length === 0){ listEl.innerHTML = '<div style="color:#bbb;padding:8px">No transactions</div>'; return; }

  for(const t of items){
    const buyerDoc = await db.collection('users').doc(t.buyerId).get();
    const sellerDoc = await db.collection('users').doc(t.sellerId).get();
    const riderDoc = t.riderId ? await db.collection('users').doc(t.riderId).get() : null;
    const buyerName = buyerDoc.exists ? (buyerDoc.data().displayName || buyerDoc.data().email) : t.buyerId;
    const sellerName = sellerDoc.exists ? (sellerDoc.data().displayName || sellerDoc.data().email) : t.sellerId;
    const riderName = riderDoc && riderDoc.exists ? (riderDoc.data().displayName || riderDoc.data().email) : (t.riderId || 'Unassigned');

    const div = document.createElement('div');
    div.className = 'tx-row';
    let statusLabel = '';
    if(t.status === 'held') statusLabel = 'Awaiting rider assignment';
    else if(t.status === 'in_transit') statusLabel = 'In transit';
    else if(t.status === 'awaiting_confirmation') statusLabel = 'Awaiting confirmations';
    else if(t.status === 'released') statusLabel = 'Released';

    div.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-weight:700">${formatNGN(t.amount)}</div>
          <div style="font-size:13px;color:#bbb">Buyer: ${escapeHtml(buyerName)} • Seller: ${escapeHtml(sellerName)} • Rider: ${escapeHtml(riderName)}</div>
          <div style="font-size:13px;color:#9fb2d9;margin-top:6px">${escapeHtml(statusLabel)}</div>
          <div style="font-size:13px;color:#cfe3ff;margin-top:6px">Buyer confirmed: ${t.buyerConfirmed ? 'Yes' : 'No'} • Rider confirmed: ${t.riderConfirmed ? 'Yes' : 'No'}</div>
        </div>
        <div id="tx-actions-${t.id}"></div>
      </div>
    `;

    const actions = div.querySelector(`#tx-actions-${t.id}`);

    // Seller can assign rider when status is held
    if(currentUser.uid === t.sellerId && t.status === 'held'){
      const assignBtn = document.createElement('button');
      assignBtn.innerText = 'Find Rider';
      assignBtn.className = 'small';
      assignBtn.onclick = () => openRiderPicker(t.id);
      actions.appendChild(assignBtn);
    }

    // Rider confirm
    if(currentUserDoc.role === 'rider' && currentUser.uid === t.riderId && !t.riderConfirmed && (t.status === 'in_transit' || t.status === 'awaiting_confirmation')){
      const rbtn = document.createElement('button');
      rbtn.innerText = 'Confirm Arrival';
      rbtn.className = 'small';
      rbtn.onclick = () => riderConfirm(t.id);
      actions.appendChild(rbtn);
    }

    // Buyer confirm
    if(currentUser.uid === t.buyerId && !t.buyerConfirmed && t.status === 'awaiting_confirmation'){
      const bbtn = document.createElement('button');
      bbtn.innerText = 'Confirm Received';
      bbtn.className = 'small';
      bbtn.onclick = () => buyerConfirm(t.id);
      actions.appendChild(bbtn);
    }

    // Show release state
    if(t.status === 'released'){
      const lbl = document.createElement('div');
      lbl.innerText = 'Released';
      lbl.style.color = '#9fe29f';
      actions.appendChild(lbl);
    }

    listEl.appendChild(div);
  }
}

// ---------- Hold funds ----------
async function holdFundsForCurrentChat(amountValue){
  const amt = Number(amountValue);
  if(isNaN(amt) || amt <= 0){ alert('Enter a valid amount'); return; }
  const partnerId = chatPanel.dataset.chatPartner;
  if(!partnerId){ alert('Open a chat with the seller you want to pay'); return; }

  let buyerId, sellerId;
  if(currentUserDoc.role === 'buyer'){ buyerId = currentUser.uid; sellerId = partnerId; }
  else if(currentUserDoc.role === 'seller'){ buyerId = currentUser.uid; sellerId = partnerId; }
  else { buyerId = currentUser.uid; sellerId = partnerId; }

  const buyerWalletRef = db.collection('wallets').doc(buyerId);

  try {
    await db.runTransaction(async tx => {
      const snap = await tx.get(buyerWalletRef);
      if(!snap.exists) throw new Error('Buyer wallet not found');
      const data = snap.data();
      const bal = Number(data.balance || 0);
      if(bal < amt) throw new Error('Insufficient balance. Fund your wallet first.');

      tx.update(buyerWalletRef, { balance: bal - amt, escrowHeld: (data.escrowHeld || 0) + amt });

      const trRef = db.collection('transactions').doc();
      tx.set(trRef, {
        buyerId,
        sellerId,
        riderId: null,
        amount: amt,
        status: 'held',
        buyerConfirmed: false,
        riderConfirmed: false,
        participants: [buyerId, sellerId],
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    });

    alert('Funds held (escrow).');
    refreshTransactionsUI();
  } catch(err){
    alert('Hold failed: ' + err.message);
  }
}

// ---------- Rider picker modal ----------
async function openRiderPicker(txId){
  const snap = await db.collection('users').where('role','==','rider').orderBy('displayName').get();
  const riders = [];
  snap.forEach(d => riders.push({ id: d.id, ...d.data() }));
  if(riders.length === 0){ alert('No riders registered yet'); return; }

  riderModal.innerHTML = '';
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `<h3>Select Rider</h3><div id="riderList"></div><div style="text-align:right;margin-top:8px"><button id="closeRiderModal" class="small">Close</button></div>`;
  backdrop.appendChild(modal);
  riderModal.appendChild(backdrop);
  riderModal.style.display = 'block';
  document.getElementById('closeRiderModal').onclick = () => closeRiderModal();

  const rl = modal.querySelector('#riderList');
  const txDoc = (await db.collection('transactions').doc(txId).get()).data();
  const sellerDoc = await db.collection('users').doc(txDoc.sellerId).get();
  const sellerLoc = (sellerDoc.exists && sellerDoc.data().location) ? sellerDoc.data().location : '';

  riders.forEach(r => {
    const est = estimateDistanceAndPrice(sellerLoc, r.location || '');
    const row = document.createElement('div');
    row.className = 'rider-row';
    row.innerHTML = `<div>
                       <div style="font-weight:700">${escapeHtml(r.displayName || r.email)}</div>
                       <div style="font-size:13px;color:#bbb">${escapeHtml(r.phone || '')} • ${escapeHtml(r.location || '')}</div>
                       <div style="font-size:13px;color:#cfe3ff;margin-top:6px">${escapeHtml(est.label)} (${formatNGN(est.price)})</div>
                     </div>
                     <div>
                       <button class="small">Assign</button>
                     </div>`;
    row.querySelector('button').onclick = async () => {
      await assignRiderToTx(txId, r.id, est.price);
      closeRiderModal();
    };
    rl.appendChild(row);
  });
}

function closeRiderModal(){ riderModal.innerHTML = ''; riderModal.style.display = 'none'; }

// ---------- Assign rider ----------
async function assignRiderToTx(txId, riderId, deliveryPrice){
  try {
    const trRef = db.collection('transactions').doc(txId);
    await trRef.update({
      riderId,
      status: 'in_transit',
      deliveryPrice: deliveryPrice,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      participants: firebase.firestore.FieldValue.arrayUnion(riderId)
    });
    alert('Rider assigned. Delivery price: ' + formatNGN(deliveryPrice));
    refreshTransactionsUI();
  } catch(err){ alert('Assign failed: ' + err.message); }
}

// ---------- Rider confirm ----------
async function riderConfirm(txId){
  try {
    const trRef = db.collection('transactions').doc(txId);
    await trRef.update({ riderConfirmed: true, status: 'awaiting_confirmation', updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
    await tryAutoRelease(txId);
    refreshTransactionsUI();
  } catch(err){ alert('Confirm failed: ' + err.message); }
}

// ---------- Buyer confirm ----------
async function buyerConfirm(txId){
  try {
    const trRef = db.collection('transactions').doc(txId);
    await trRef.update({ buyerConfirmed: true, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
    await tryAutoRelease(txId);
    refreshTransactionsUI();
  } catch(err){ alert('Confirm failed: ' + err.message); }
}

// ---------- Auto-release ----------
async function tryAutoRelease(txId){
  const trRef = db.collection('transactions').doc(txId);
  const trSnap = await trRef.get();
  if(!trSnap.exists) return;
  const t = trSnap.data();
  if(t.buyerConfirmed && t.riderConfirmed && t.status !== 'released'){
    const buyerWRef = db.collection('wallets').doc(t.buyerId);
    const sellerWRef = db.collection('wallets').doc(t.sellerId);
    try {
      await db.runTransaction(async tx => {
        const bSnap = await tx.get(buyerWRef);
        const sSnap = await tx.get(sellerWRef);
        const buyerEsc = Number(bSnap.data().escrowHeld || 0);
        const sellerBal = Number(sSnap.exists ? sSnap.data().balance || 0 : 0);
        tx.update(buyerWRef, { escrowHeld: Math.max(0, buyerEsc - t.amount) });
        tx.update(sellerWRef, { balance: sellerBal + t.amount });
        tx.update(trRef, { status: 'released', releasedAt: firebase.firestore.FieldValue.serverTimestamp(), updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
      });
      alert('Escrow released and seller credited.');
      refreshTransactionsUI();
    } catch(err){
      console.error('auto release err', err);
      alert('Auto-release failed: ' + err.message);
    }
  }
}

// ---------- Fund wallet (test) ----------
async function fundWallet(amountValue){
  const amt = Number(amountValue);
  if(isNaN(amt) || amt <= 0){ alert('Enter valid amount'); return; }
  const wRef = db.collection('wallets').doc(currentUser.uid);
  try {
    await db.runTransaction(async tx => {
      const snap = await tx.get(wRef);
      if(!snap.exists) tx.set(wRef, { uid: currentUser.uid, balance: amt, escrowHeld: 0, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
      else {
        const data = snap.data();
        tx.update(wRef, { balance: (Number(data.balance || 0) + amt), updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
      }
    });
    alert('Wallet funded (test).');
    refreshTransactionsUI();
  } catch(err){ alert('Fund failed: ' + err.message); }
}

// ---------- Inject fintech escrow UI ----------
function injectEscrowUI(){
  const rightCard = document.querySelector('.right .card');
  if(!rightCard) return;
  if(document.getElementById('escrowContainer')) return;

  const container = document.createElement('div');
  container.id = 'escrowContainer';
  container.className = 'card';
  container.style.marginTop = '12px';

  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div><h3 style="margin:0">Wallet & Escrow</h3><div style="color:#bbb;font-size:13px">Your balances and active escrows</div></div>
    </div>
    <div class="boxes">
      <div class="box">
        <div class="label">Wallet Balance</div>
        <div id="balanceDisplay" class="amount">${formatNGN(0)}</div>
      </div>
      <div class="box">
        <div class="label">Funds in Escrow</div>
        <div id="escrowTotalDisplay" class="amount">${formatNGN(0)}</div>
      </div>
    </div>

    <div style="margin-top:12px;display:flex;gap:8px">
      <input id="fundAmount" placeholder="Fund amount (NGN)" style="flex:1;padding:10px;border-radius:8px;border:none;background:#08355d;color:#fff" />
      <button id="fundBtn" class="small">Fund Wallet</button>
    </div>

    <div style="margin-top:8px;display:flex;gap:8px">
      <input id="escrowAmount" placeholder="Hold amount (NGN)" style="flex:1;padding:10px;border-radius:8px;border:none;background:#08355d;color:#fff" />
      <button id="holdBtn" class="small">Hold Funds</button>
    </div>

    <div style="margin-top:12px">
      <h4 style="margin:6px 0;color:#fff">Transactions</h4>
      <div id="escrowList" class="tx-list"></div>
    </div>
  `;

  rightCard.appendChild(container);

  document.getElementById('fundBtn').onclick = () => {
    const v = document.getElementById('fundAmount').value;
    fundWallet(v);
    document.getElementById('fundAmount').value = '';
  };
  document.getElementById('holdBtn').onclick = () => {
    const v = document.getElementById('escrowAmount').value;
    holdFundsForCurrentChat(v);
    document.getElementById('escrowAmount').value = '';
  };

  refreshTransactionsUI();
}

// ---------- Role instruction ----------
function insertRoleInstruction(){
  const role = currentUserDoc.role;
  let text = '';
  if(role === 'buyer') text = 'Instruction: Search for Seller';
  else if(role === 'seller') text = 'Instruction: Find Rider (choose from list)';
  else if(role === 'rider') text = 'Instruction: Check assigned deliveries';
  else text = 'Instruction: Search users';
  if(roleInstructionEl) roleInstructionEl.innerText = text;
}

// ---------- Transactions listener started earlier ----------

// ---------- Cleanup ----------
window.addEventListener('beforeunload', () => {
  if(messagesUnsubscribe) messagesUnsubscribe();
  if(usersUnsubscribe) usersUnsubscribe();
  if(unreadUnsubscribe) unreadUnsubscribe();
  if(txUnsubscribe) txUnsubscribe();
});
