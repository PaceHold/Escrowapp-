// transaction.js - shared PaceHold transaction simulation (localStorage)
const TRAN_KEY = "pacehold_tx";

function makeAlert(msg){ console.log(msg); /* keep console log for debug */ }

function createTransaction(buyer='Buyer', seller='Seller', amount=30000, item='Item') {
  const tx = {
    id: 'TX' + Date.now(),
    buyer, seller, amount, item,
    status: 'Locked', createdAt: new Date().toISOString()
  };
  localStorage.setItem(TRAN_KEY, JSON.stringify(tx));
  makeAlert('Transaction created: ' + tx.id);
  return tx;
}

function getTransaction() {
  const raw = localStorage.getItem(TRAN_KEY);
  return raw ? JSON.parse(raw) : null;
}

function updateStatus(newStatus) {
  const tx = getTransaction();
  if (!tx) { alert('No active transaction'); return null; }
  tx.status = newStatus;
  tx.updatedAt = new Date().toISOString();
  localStorage.setItem(TRAN_KEY, JSON.stringify(tx));
  makeAlert('Status: ' + newStatus);
  return tx;
}

function releaseFunds() {
  const tx = getTransaction();
  if (!tx) { alert('No active transaction'); return null; }
  if (tx.status !== 'Delivered') { alert('Can only release after delivery'); return null; }
  tx.status = 'Released';
  tx.releasedAt = new Date().toISOString();
  localStorage.setItem(TRAN_KEY, JSON.stringify(tx));
  alert('Funds released to seller (simulated).');
  return tx;
}

function clearTransaction() {
  localStorage.removeItem(TRAN_KEY);
  alert('Transaction cleared (simulated).');
}

// helper to show in-page
function renderTxTo(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const tx = getTransaction();
  if (!tx) {
    el.innerHTML = '<div class="empty">No active transaction.</div>';
    return;
  }
  el.innerHTML = `
    <div class="tx">
      <div><strong>${tx.item}</strong> · ${tx.id}</div>
      <div>₦${Number(tx.amount).toLocaleString()}</div>
      <div>Buyer: ${tx.buyer} · Seller: ${tx.seller}</div>
      <div>Status: <strong>${tx.status}</strong></div>
      <div class="small">Created: ${new Date(tx.createdAt).toLocaleString()}</div>
    </div>
  `;
}
