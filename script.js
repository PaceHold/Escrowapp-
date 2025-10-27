/* script.js
   Handles Firebase init, signup, login, and redirect to dashboard.html
*/

// === Paste your firebaseConfig here ===
const firebaseConfig = {
  apiKey: "AIzaSyAvfyYoeooY5bx1Z-SGdcEWA-G_zGFY5B8",
  authDomain: "pacehold-4c7b2.firebaseapp.com",
  projectId: "pacehold-4c7b2",
  storageBucket: "pacehold-4c7b2.firebasestorage.app",
  messagingSenderId: "45898843261",
  appId: "1:45898843261:web:4df9b7cb59dd5a1c699d14"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

/* SIGN UP */
function signup(){
  const email = document.getElementById('signupEmail').value.trim();
  const password = document.getElementById('signupPassword').value;
  const role = document.getElementById('signupRole').value;
  const name = document.getElementById('signupName').value.trim();

  const statusEl = document.getElementById('signupStatus');
  statusEl.innerText = "Creating account...";

  if(!email || !password || !name){
    statusEl.innerText = "Please fill all fields.";
    return;
  }

  auth.createUserWithEmailAndPassword(email, password)
    .then(uc => {
      const user = uc.user;
      // store user doc
      return db.collection('users').doc(user.uid).set({
        email: email,
        role: role,
        displayName: name,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      }).then(()=> user);
    })
    .then(user => {
      statusEl.innerText = "Account created — redirecting...";
      setTimeout(()=> window.location.href = 'dashboard.html', 900);
    })
    .catch(err => {
      statusEl.innerText = "Error: " + err.message;
    });
}

/* LOGIN */
function login(){
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const statusEl = document.getElementById('loginStatus');
  statusEl.innerText = "Logging in...";

  if(!email || !password){
    statusEl.innerText = "Please enter email and password.";
    return;
  }

  auth.signInWithEmailAndPassword(email, password)
    .then(uc => {
      statusEl.innerText = "Login successful — redirecting...";
      setTimeout(()=> window.location.href = 'dashboard.html', 900);
    })
    .catch(err => {
      statusEl.innerText = "Error: " + err.message;
    });
}

// If already logged in, redirect immediately
auth.onAuthStateChanged(user => {
  if(user){
    // ensure user doc exists (in case of old users)
    db.collection('users').doc(user.uid).get().then(doc => {
      if(!doc.exists){
        // create minimal profile
        db.collection('users').doc(user.uid).set({
          email: user.email,
          role: 'buyer',
          displayName: user.email.split('@')[0],
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      }
      // If we are on index.html, redirect
      if(location.pathname.endsWith('index.html') || location.pathname.endsWith('/') ){
        // stay on the page only if user wants; we auto-redirect to dashboard for convenience
        window.location.href = 'dashboard.html';
      }
    });
  }
});
