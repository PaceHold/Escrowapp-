/* dashboard.js
   Real-time chat + wallets + transactions (escrow) + fund wallet button
   - Uses Firestore collections: users, wallets, chats, transactions
   - Currency formatting: NGN (₦)
   - Replace existing dashboard.js with this file.
*/

// ===== firebaseConfig — your config (unchanged) =====
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
let currentWallet = null;
let currentChatRef = null;
let messagesUnsubscribe = null;
let usersUnsubscribe = null;
let unreadUnsubscribe = null;
let txUnsubscribe = null;

// DOM references (from dashboard.html)
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
const searchContainer = document.querySelector('.search');

// Escrow container will be injected (fintech boxes)
let escrowContainer = null;

// logout
logoutBtn.onclick = () => auth.signOut().then(()=> window.location.href='index.html');

// ---------- Helpers ----------
function escapeHtml(s){ if(!s) return ''; return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function chatIdFor(a,b){ return a < b ? `${a}_${b}` : `${b}_${a}`; }
function targetRoleFor(role){
  if(role === 'buyer') return 'seller';
  if(role === 'seller') return 'rider';
  if(role === 'rider') return 'seller';
  return 'seller';
}
function formatNGN(n){
  if(typeof n !== 'number') n = Number(n || 0);
  return n.toLocaleString('en-NG', { style: 'currency', currency: 'NGN' });
}

// ---------- Auth listener ----------
auth.onAuthStateChanged(async user => {
  if(!user){ window.location.href = 'index.html'; return; }
  currentUser = user;

  // load or create user doc (users collection)
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

  // load or create wallet (wallets collection)
  const wRef = db.collection('wallets').doc(user.uid);
  const wSnap = await wRef.get();
  if(!wSnap.exists){
    await wRef.set({
      uid: user.uid,
      balance: 0,
      escrowHeld: 0,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    currentWallet = { uid: user.uid, balance: 0, escrowHeld: 0 };
  } else {
    currentWallet = wSnap.data();
    // ensure fields exist
    if(typeof currentWallet.balance === 'undefined' || typeof currentWallet.escrowHeld === 'undefined'){
      await wRef.update({ balance: currentWallet.balance || 0, escrowHeld: currentWallet.escrowHeld || 0 });
      currentWallet = (await wRef.get()).data();
    }
  }

  // UI updates
  welcomeName.innerText = currentUserDoc.displayName || currentUser.email;
  roleLabel.innerText = 'Role: ' + (currentUserDoc.role || 'buyer');
  topUser.innerText = currentUser.email;

  // insert instruction text + inject escrow UI (once)
  insertRoleInstruction();
  injectEscrowUI();

  // start listeners
  startUserListListener();
  startUnreadMonitor();
  startTransactionsListener();
});

// ---------- User list / search ----------
searchInput.addEventListener('input', ()=> refreshList());

function startUserListListener(){
  if(usersUnsubscribe) usersUnsubscribe();
  const targetRole = targetRoleFor(currentUserDoc.role);
  usersUnsubscribe = db.collection('users').where('role','==',targetRole).orderBy('displayName', 'asc')
    .onSnapshot(snap => {
      const items = [];
      snap.forEach(d => items.push({ id: d.id, ...d.data() }));
      renderUserList(items);
    }, err => console.error('users listener err', err));
}

async function refreshList(){
  const targetRole = targetRoleFor(currentUserDoc.role);
  const snap = await db.collection('users').where('role','==',targetRole).orderBy('displayName').get();
  const items = [];
  snap.forEach(d => items.push({ id: d.id, ...d.data() }));
  renderUserList(items);
}

function renderUserList(items){
  const q = (searchInput.value || '').trim().toLowerCase();
  userListEl.innerHTML = '';

  const filtered = q ? items.filter(u => ((u.displayName||'') + ' ' + (u.email||'')).toLowerCase().includes(q)) : items;

  if(filtered.length === 0){
    userListEl.innerHTML = '<div style="color:#bbb;text-align:center;padding:10px">No users found</div>';
    return;
  }

  filtered.forEach(user => {
    const row = document.createElement('div');
    row.className = 'user-row';
    row.style.display = 'flex';
    row.style.justifyContent = 'space-between';
    row.style.alignItems = 'center';
    row.innerHTML = `<div>
                       <div class="user-name">${escapeHtml(user.displayName || user.email)}</div>
                       <div style="font-size:13px;color:#adb7c9">${escapeHtml(user.email)}</div>
                     </div>
                     <div id="badge-${user.id}"></div>`;
    row.onclick = () => openChatWith(user);
    userListEl.appendChild(row);
    updateRowBadge(user.id, document.getElementById(`badge-${user.id}`));
  });
}

// ---------- Chat open + messages ----------
async function openChatWith(user){
  activeChatInfo.innerHTML = `<strong>Chatting with:</strong> ${escapeHtml(user.displayName)} <div style="color:#bbb;font-size:13px">${escapeHtml(user.email)}</div>`;
  chatWith.innerText = user.displayName || user.email;
  chatWithSub.innerText = user.email || '';

  const cid = chatIdFor(currentUser.uid, user.id);
  currentChatRef = db.collection('chats').doc(cid);

  // create chat document if needed
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

  messagesUnsubscribe = currentChatRef.collection('messages').orderBy('createdAt')
    .onSnapshot(snapshot => {
      chatBody.innerHTML = '';
      snapshot.forEach(doc => {
        const m = doc.data();
        const el = document.createElement('div');
        el.className = 'msg ' + (m.from === currentUser.uid ? 'me' : 'them');
        el.innerText = `${m.fromName || ''}: ${m.text}`;
        chatBody.appendChild(el);
      });
      chatBody.scrollTop = chatBody.scrollHeight;
      refreshTransactionsUI(); // refresh escrow UI since partner may have created tx
      startUnreadMonitor();
    }, err => console.error('msgs err', err));

  chatPanel.dataset.chatPartner = user.id;
}

// send message
async function sendMessage(){
  const text = (messageInput.value || '').trim();
  if(!text || !currentChatRef) return;
  const partnerId = chatPanel.dataset.chatPartner;
  const ref = currentChatRef.collection('messages').doc();
  const msg = {
    text,
    from: currentUser.uid,
    fromName: currentUserDoc.displayName || currentUser.email,
    to: partnerId,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    read: false
  };
  await ref.set(msg);
  await currentChatRef.update({ updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
  messageInput.value = '';
}

// chat panel controls
function toggleChatPanel(){ chatPanel.style.display = (chatPanel.style.display === 'flex') ? 'none' : 'flex'; }
function openChatPanel(){ chatPanel.style.display = 'flex'; chatBadge.style.display = 'none'; }
function closeChatPanel(){ chatPanel.style.display = 'none'; }

// ---------- Unread monitoring ----------
function startUnreadMonitor(){
  if(unreadUnsubscribe) unreadUnsubscribe();
  unreadUnsubscribe = db.collectionGroup('messages')
    .where('to','==', currentUser.uid)
    .where('read','==', false)
    .onSnapshot(snap => {
      if(snap.size > 0){
        chatBadge.style.display = 'flex';
        chatBadge.innerText = snap.size > 9 ? '9+' : String(snap.size);
      } else {
        chatBadge.style.display = 'none';
      }
      // update visible row badges
      refreshList();
    }, err => console.error('unread monitor err', err));
}

async function updateRowBadge(otherUserId, containerEl){
  if(!containerEl) return;
  const cid = chatIdFor(currentUser.uid, otherUserId);
  try {
    const q = db.collection('chats').doc(cid).collection('messages')
      .where('to','==', currentUser.uid).where('read','==', false);
    const snap = await q.get();
    if(snap.size > 0) containerEl.innerHTML = `<div class="badge-new">${snap.size}</div>`;
    else containerEl.innerHTML = '';
  } catch(e){ containerEl.innerHTML = ''; }
}

// ---------- Transactions & Escrow (wallets collection & transactions) ----------

// start listener for transactions relevant to current user (buyer/seller/rider)
function startTransactionsListener(){
  if(txUnsubscribe) txUnsubscribe();
  // listen to transactions where user is buyer OR seller OR rider
  txUnsubscribe = db.collection('transactions')
    .where('participants', 'array-contains', currentUser.uid) // we store participants = [buyerId, sellerId, riderId?]
    .orderBy('createdAt', 'desc')
    .onSnapshot(snap => {
      refreshTransactionsUI();
    }, err => console.error('tx listener err', err));
}

// refresh transactions UI (escrow box & list)
async function refreshTransactionsUI(){
  if(!document.getElementById('escrowContainer')) return;
  const listEl = document.getElementById('escrowList');
  const balEl = document.getElementById('balanceDisplay');
  const escrowTotalEl = document.getElementById('escrowTotalDisplay');

  // refresh wallet display
  const wSnap = await db.collection('wallets').doc(currentUser.uid).get();
  const wallet = wSnap.exists ? wSnap.data() : { balance:0, escrowHeld:0 };
  currentWallet = wallet;
  if(balEl) balEl.innerText = formatNGN(wallet.balance || 0);
  if(escrowTotalEl) escrowTotalEl.innerText = formatNGN(wallet.escrowHeld || 0);

  // query transactions where user is involved
  const txsSnapshot = await db.collection('transactions')
    .where('participants','array-contains', currentUser.uid)
    .orderBy('createdAt','desc')
    .get();

  const items = [];
  txsSnapshot.forEach(d => items.push({ id: d.id, ...d.data() }));

  // render list
  listEl.innerHTML = '';
  if(items.length === 0){ listEl.innerHTML = '<div style="color:#bbb;padding:8px">No transactions</div>'; return; }

  for(const t of items){
    // present readable info: buyer/seller/rider names (fetch)
    const buyerDoc = await db.collection('users').doc(t.buyerId).get();
    const sellerDoc = await db.collection('users').doc(t.sellerId).get();
    const riderDoc = t.riderId ? await db.collection('users').doc(t.riderId).get() : null;

    const buyerName = buyerDoc.exists ? (buyerDoc.data().displayName || buyerDoc.data().email) : t.buyerId;
    const sellerName = sellerDoc.exists ? (sellerDoc.data().displayName || sellerDoc.data().email) : t.sellerId;
    const riderName = riderDoc && riderDoc.exists ? (riderDoc.data().displayName || riderDoc.data().email) : (t.riderId || 'Unassigned');

    const div = document.createElement('div');
    div.style.padding = '8px';
    div.style.borderBottom = '1px solid rgba(255,255,255,0.03)';
    div.style.color = '#ddd';

    let statusLabel = '';
    if(t.status === 'held') statusLabel = 'Awaiting rider assignment';
    else if(t.status === 'in_transit') statusLabel = 'In transit';
    else if(t.status === 'awaiting_confirmation') statusLabel = 'Awaiting confirmations';
    else if(t.status === 'released') statusLabel = 'Released';
    else statusLabel = t.status;

    div.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-weight:700">${formatNGN(t.amount)}</div>
          <div style="font-size:13px;color:#bbb">Buyer: ${escapeHtml(buyerName)} • Seller: ${escapeHtml(sellerName)} • Rider: ${escapeHtml(riderName)}</div>
          <div style="font-size:13px;color:#9fb2d9;margin-top:6px">${escapeHtml(statusLabel)}</div>
        </div>
        <div id="tx-actions-${t.id}"></div>
      </div>
    `;

    // Append action buttons depending on role and status
    const actionsContainer = div.querySelector(`#tx-actions-${t.id}`);

    // If current user is seller and no rider assigned, allow "Assign Rider" (seller picks from riders)
    if(currentUser.uid === t.sellerId && (!t.riderId || t.status === 'held')){
      const assignBtn = document.createElement('button');
      assignBtn.innerText = 'Assign Rider';
      assignBtn.style.marginRight = '6px';
      assignBtn.onclick = () => openAssignRiderModal(t.id);
      actionsContainer.appendChild(assignBtn);
    }

    // If current user is rider and assigned & not yet riderConfirmed -> show Confirm Arrival
    if(currentUserDoc.role === 'rider' && currentUser.uid === t.riderId && !t.riderConfirmed && (t.status === 'in_transit' || t.status === 'awaiting_confirmation')){
      const confirmBtn = document.createElement('button');
      confirmBtn.innerText = 'Confirm Arrival';
      confirmBtn.onclick = () => riderConfirm(t.id);
      actionsContainer.appendChild(confirmBtn);
    }

    // If current user is buyer and not yet buyerConfirmed and status awaiting confirmation -> show Confirm Received
    if(currentUser.uid === t.buyerId && !t.buyerConfirmed && t.status === 'awaiting_confirmation'){
      const confirmBtn = document.createElement('button');
      confirmBtn.innerText = 'Confirm Received';
      confirmBtn.onclick = () => buyerConfirm(t.id);
      actionsContainer.appendChild(confirmBtn);
    }

    // If status is released show label
    if(t.status === 'released'){
      const releasedDiv = document.createElement('div');
      releasedDiv.innerText = 'Released';
      releasedDiv.style.color = '#9fe29f';
      actionsContainer.appendChild(releasedDiv);
    }

    listEl.appendChild(div);
  }
}

// ---------- Hold Funds (Buyer initiates escrow) ----------
async function holdFundsForCurrentChat(amountValue){
  const amt = Number(amountValue);
  if(isNaN(amt) || amt <= 0){ alert('Enter a valid amount'); return; }
  const partnerId = chatPanel.dataset.chatPartner;
  if(!partnerId){ alert('Open a chat with the seller you want to pay.'); return; }

  // Determine buyerId and sellerId based on current user role and partner role
  let buyerId, sellerId;
  if(currentUserDoc.role === 'buyer'){
    buyerId = currentUser.uid;
    sellerId = partnerId;
  } else if(currentUserDoc.role === 'seller'){
    // if seller initiates (edge) treat seller as buyer (payer) and partner as seller
    buyerId = currentUser.uid;
    sellerId = partnerId;
  } else {
    buyerId = currentUser.uid;
    sellerId = partnerId;
  }

  const buyerWalletRef = db.collection('wallets').doc(buyerId);

  try {
    await db.runTransaction(async tx => {
      const snap = await tx.get(buyerWalletRef);
      if(!snap.exists) throw new Error('Buyer wallet not found');
      const data = snap.data();
      const bal = typeof data.balance === 'number' ? data.balance : 0;
      if(bal < amt) throw new Error('Insufficient balance. Fund your wallet first.');

      // Deduct balance and increase escrowHeld
      tx.update(buyerWalletRef, { balance: bal - amt, escrowHeld: (data.escrowHeld || 0) + amt });

      // create transaction doc
      const txRef = db.collection('transactions').doc();
      tx.set(txRef, {
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

    alert('Funds held in escrow (simulation).');
    refreshTransactionsUI();
  } catch(err){
    alert('Hold failed: ' + err.message);
  }
}

// ---------- Assign Rider (seller picks rider) ----------
async function openAssignRiderModal(txId){
  // fetch riders list (users with role 'rider')
  const snap = await db.collection('users').where('role','==','rider').orderBy('displayName').get();
  const riders = [];
  snap.forEach(d => riders.push({ id: d.id, ...d.data() }));

  if(riders.length === 0){
    alert('No riders registered yet. A rider must sign up first.');
    return;
  }

  // Simple prompt to pick rider by name (for now)
  const names = riders.map((r, i) => `${i+1}. ${r.displayName} (${r.email})`).join('\n');
  const pick = prompt(`Pick a rider by number:\n${names}`);
  const idx = Number(pick) - 1;
  if(isNaN(idx) || idx < 0 || idx >= riders.length) { alert('Invalid selection'); return; }

  const rider = riders[idx];
  // assign rider to transaction
  try {
    await db.collection('transactions').doc(txId).update({
      riderId: rider.id,
      status: 'in_transit',
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      // ensure participants include rider for listening
      participants: firebase.firestore.FieldValue.arrayUnion(rider.id)
    });
    alert('Rider assigned.');
    refreshTransactionsUI();
  } catch(err){ alert('Assign failed: ' + err.message); }
}

// ---------- Rider confirm ----------
async function riderConfirm(txId){
  try {
    await db.runTransaction(async tx => {
      const trRef = db.collection('transactions').doc(txId);
      const trSnap = await tx.get(trRef);
      if(!trSnap.exists) throw new Error('Transaction not found');
      const data = trSnap.data();
      if(data.status !== 'in_transit' && data.status !== 'awaiting_confirmation') throw new Error('Invalid transaction state');
      // mark riderConfirmed true
      tx.update(trRef, {
        riderConfirmed: true,
        status: data.buyerConfirmed ? 'awaiting_confirmation' : 'awaiting_confirmation',
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    });
    // After marking, check release
    await tryAutoRelease(txId);
    refreshTransactionsUI();
  } catch(err){ alert('Confirm failed: ' + err.message); }
}

// ---------- Buyer confirm ----------
async function buyerConfirm(txId){
  try {
    await db.runTransaction(async tx => {
      const trRef = db.collection('transactions').doc(txId);
      const trSnap = await tx.get(trRef);
      if(!trSnap.exists) throw new Error('Transaction not found');
      const data = trSnap.data();
      if(data.status !== 'in_transit' && data.status !== 'awaiting_confirmation' && data.status !== 'held') throw new Error('Invalid transaction state');
      // mark buyerConfirmed true
      tx.update(trRef, {
        buyerConfirmed: true,
        status: data.riderConfirmed ? 'awaiting_confirmation' : 'awaiting_confirmation',
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    });
    await tryAutoRelease(txId);
    refreshTransactionsUI();
  } catch(err){ alert('Confirm failed: ' + err.message); }
}

// ---------- Auto-release when both confirm ----------
async function tryAutoRelease(txId){
  const trRef = db.collection('transactions').doc(txId);
  const trSnap = await trRef.get();
  if(!trSnap.exists) return;
  const data = trSnap.data();
  if(data.buyerConfirmed && data.riderConfirmed && data.status !== 'released'){
    // perform transfer from escrow (escrow already deducted from buyer balance and in escrowHeld)
    const buyerWalletRef = db.collection('wallets').doc(data.buyerId);
    const sellerWalletRef = db.collection('wallets').doc(data.sellerId);

    try {
      await db.runTransaction(async tx => {
        const buyerW = await tx.get(buyerWalletRef);
        const sellerW = await tx.get(sellerWalletRef);

        const buyerBal = buyerW.exists ? (Number(buyerW.data().balance) || 0) : 0;
        const buyerEscrow = buyerW.exists ? (Number(buyerW.data().escrowHeld) || 0) : 0;
        const sellerBal = sellerW.exists ? (Number(sellerW.data().balance) || 0) : 0;

        // reduce buyer escrowHeld (already deducted from balance at hold time)
        if(buyerEscrow < data.amount) {
          // still proceed but avoid negative zeroing
          tx.update(buyerWalletRef, { escrowHeld: Math.max(0, buyerEscrow - data.amount) });
        } else {
          tx.update(buyerWalletRef, { escrowHeld: buyerEscrow - data.amount });
        }

        // credit seller balance
        tx.update(sellerWalletRef, { balance: sellerBal + data.amount });

        // mark transaction released
        tx.update(trRef, { status: 'released', releasedAt: firebase.firestore.FieldValue.serverTimestamp(), updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
      });

      alert('Escrow released: seller credited.');
      refreshTransactionsUI();
    } catch(err){
      console.error('auto release err', err);
      alert('Auto-release failed: ' + err.message);
    }
  }
}

// ---------- Wallet funding (test helper) ----------
async function fundWallet(amountValue){
  const amt = Number(amountValue);
  if(isNaN(amt) || amt <= 0){ alert('Enter a valid amount to fund'); return; }
  const wRef = db.collection('wallets').doc(currentUser.uid);
  try {
    await db.runTransaction(async tx => {
      const snap = await tx.get(wRef);
      if(!snap.exists){
        tx.set(wRef, { uid: currentUser.uid, balance: amt, escrowHeld: 0, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
      } else {
        const data = snap.data();
        const bal = Number(data.balance || 0);
        tx.update(wRef, { balance: bal + amt, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
      }
    });
    alert('Wallet funded (simulation).');
    refreshTransactionsUI();
  } catch(err){ alert('Fund failed: ' + err.message); }
}

// ---------- Inject Fintech Escrow UI into right card ----------
function injectEscrowUI(){
  const rightCard = document.querySelector('.right .card');
  if(!rightCard) return;
  if(document.getElementById('escrowContainer')) return; // already injected

  escrowContainer = document.createElement('div');
  escrowContainer.id = 'escrowContainer';
  escrowContainer.className = 'card';
  escrowContainer.style.marginTop = '12px';

  escrowContainer.innerHTML = `
    <div style="display:flex;gap:12px;align-items:center;justify-content:space-between">
      <div>
        <h3 style="margin:0">Wallet & Escrow</h3>
        <div style="color:#bbb;font-size:13px">Your account & active escrows</div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px">
      <div style="background:#02355f;padding:12px;border-radius:10px">
        <div style="font-size:13px;color:#9fb2d9">Wallet Balance</div>
        <div id="balanceDisplay" style="font-weight:800;font-size:18px;margin-top:6px">${formatNGN(0)}</div>
      </div>
      <div style="background:#02355f;padding:12px;border-radius:10px">
        <div style="font-size:13px;color:#9fb2d9">Funds in Escrow</div>
        <div id="escrowTotalDisplay" style="font-weight:800;font-size:18px;margin-top:6px">${formatNGN(0)}</div>
      </div>
    </div>

    <div style="margin-top:12px">
      <div style="display:flex;gap:8px">
        <input id="fundAmount" placeholder="Amount to fund (NGN)" style="flex:1;padding:8px;border-radius:8px;border:none;background:#08355d;color:#fff" />
        <button id="fundBtn" style="padding:8px 10px;border-radius:8px;border:none;background:#1e90ff;color:#fff;cursor:pointer">Fund Wallet</button>
      </div>
      <div style="height:8px"></div>
      <div style="display:flex;gap:8px">
        <input id="escrowAmount" placeholder="Hold amount (NGN)" style="flex:1;padding:8px;border-radius:8px;border:none;background:#08355d;color:#fff" />
        <button id="holdBtn" style="padding:8px 10px;border-radius:8px;border:none;background:#1e90ff;color:#fff;cursor:pointer">Hold Funds</button>
      </div>

      <div style="margin-top:12px">
        <h4 style="margin:6px 0;color:#fff">Your Transactions</h4>
        <div id="escrowList" style="max-height:200px;overflow:auto;color:#ddd"></div>
      </div>
    </div>
  `;

  rightCard.appendChild(escrowContainer);

  // attach handlers
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

  // initial refresh
  refreshTransactionsUI();
}

// ---------- Role instruction ----------
function insertRoleInstruction(){
  const role = currentUserDoc.role;
  let text = '';
  if(role === 'buyer') text = 'Instruction: Search for Seller';
  else if(role === 'seller') text = 'Instruction: Search for Rider';
  else if(role === 'rider') text = 'Instruction: Check assigned deliveries';
  else text = 'Instruction: Search users';
  // place above search box
  let inst = document.getElementById('roleInstruction');
  if(inst){ inst.innerText = text; return; }
  inst = document.createElement('div');
  inst.id = 'roleInstruction';
  inst.style.color = '#cfe3ff';
  inst.style.marginBottom = '8px';
  inst.innerText = text;
  if(searchContainer && searchContainer.parentNode) searchContainer.parentNode.insertBefore(inst, searchContainer);
}

// ---------- Cleanup ----------
window.addEventListener('beforeunload', () => {
  if(messagesUnsubscribe) messagesUnsubscribe();
  if(usersUnsubscribe) usersUnsubscribe();
  if(unreadUnsubscribe) unreadUnsubscribe();
  if(txUnsubscribe) txUnsubscribe();
});
