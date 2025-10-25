// PaceHold Escrow Logic Simulation
// Shared between buyer, seller, and rider

const TRANSACTION_KEY = "pacehold_transaction";

// Create a transaction (Buyer)
function createTransaction(buyer, seller, amount, item) {
  const transaction = {
    buyer,
    seller,
    amount,
    item,
    status: "Locked",
    timestamp: new Date().toISOString(),
  };
  localStorage.setItem(TRANSACTION_KEY, JSON.stringify(transaction));
  alert("✅ Funds locked in escrow for " + item);
}

// Fetch current transaction (Seller / Rider)
function getTransaction() {
  const data = localStorage.getItem(TRANSACTION_KEY);
  return data ? JSON.parse(data) : null;
}

// Update transaction status (Rider / Seller)
function updateStatus(newStatus) {
  const transaction = getTransaction();
  if (transaction) {
    transaction.status = newStatus;
    localStorage.setItem(TRANSACTION_KEY, JSON.stringify(transaction));
    alert("🔄 Transaction updated to: " + newStatus);
  } else {
    alert("No active transaction found.");
  }
}

// Release funds (Buyer)
function releaseFunds() {
  const transaction = getTransaction();
  if (transaction && transaction.status === "Delivered") {
    transaction.status = "Released";
    localStorage.setItem(TRANSACTION_KEY, JSON.stringify(transaction));
    alert("💸 Funds released to seller!");
  } else {
    alert("Funds can only be released after delivery confirmation.");
  }
}

// View current transaction info (for testing)
function showTransaction() {
  const t = getTransaction();
  if (t) {
    alert(
      `📦 Item: ${t.item}\n💰 Amount: ₦${t.amount}\n👤 Buyer: ${t.buyer}\n🧾 Seller: ${t.seller}\nStatus: ${t.status}`
    );
  } else {
    alert("No active transaction.");
  }
}
