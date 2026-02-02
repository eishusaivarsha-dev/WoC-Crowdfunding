//Firebase
const firebaseConfig = {
  apiKey: "AIzaSyBhH0e2AKy27LQQINa6LVnMc4KxEssbCFU",
  authDomain: "crowdfund-91490.firebaseapp.com",
  projectId: "crowdfund-91490",
  storageBucket: "crowdfund-91490.appspot.com",
  messagingSenderId: "805018461050",
  appId: "1:805018461050:web:c7a760f4e2f1dadf09ecc3"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();

//SHA-256
async function generateDonationHash(donor, amount, timestamp, previousHash) {
    const rawData = donor + amount + timestamp + previousHash;
    const encoder = new TextEncoder();
    const data = encoder.encode(rawData);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}
let donationLedger = [];
let currentCampaignId = null;

function loadLedger(campaignId) {
    currentCampaignId = campaignId;
    const saved = localStorage.getItem(`donationLedger_${campaignId}`);
    donationLedger = saved ? JSON.parse(saved) : [];
    renderTransactionLog();
}

async function recordDonation(donor, amount) {
    if (!currentCampaignId) return;

    const timestamp = Date.now();
    const previousHash =
        donationLedger.length === 0
            ? "Null"
            : donationLedger[donationLedger.length - 1].hash;

    const hash = await generateDonationHash(
        donor,
        amount,
        timestamp,
        previousHash
    );

    const tx = { donor, amount, timestamp, previousHash, hash };
    donationLedger.push(tx);

    localStorage.setItem(
        `donationLedger_${currentCampaignId}`,
        JSON.stringify(donationLedger)
    );

    renderTransactionLog();
}

function renderTransactionLog() {
    const container = document.getElementById("transactionLog");
    if (!container) return;

    container.innerHTML = "";

    donationLedger.forEach((tx, index) => {
        container.innerHTML += `
            <div class="tx-card">
                <p><strong>Transaction #${index + 1}</strong></p>
                <p><strong>Donor:</strong> ${tx.donor}</p>
                <p><strong>Amount:</strong> ₹${tx.amount}</p>
                <p><strong>Time:</strong> ${new Date(tx.timestamp).toLocaleString()}</p>
                <p class="hash"><strong>Previous Hash:</strong><br>${tx.previousHash}</p>
                <p class="hash"><strong>Current Hash:</strong><br>${tx.hash}</p>
            </div>
        `;
    });
}

//Campaigns
async function loadCampaigns() {
    const container = document.getElementById("campaigns");
    if (!container) return;

    container.innerHTML = "<p>Loading campaigns...</p>";

    const snapshot = await db.collection("campaigns").get();
    container.innerHTML = "";

    if (snapshot.empty) {
        container.innerHTML = "<p>No campaigns yet.</p>";
        return;
    }

    snapshot.forEach(doc => {
        const c = doc.data();
        const percent = c.target > 0 ? (c.raised / c.target) * 100 : 0;

        container.innerHTML += `
            <div class="campaign-card">
                <h3>${c.title}</h3>
                <div class="progress-bar">
                    <div class="progress" style="width:${percent}%"></div>
                </div>
                <p><strong>₹${c.raised}</strong> raised of ₹${c.target}</p>
                <a href="pages/campaign.html?id=${doc.id}">View Campaign</a>
            </div>
        `;
    });
}

//Authentication
let LoginMode = true;

function openAuthModal() {
    document.getElementById("authBackdrop").style.display = "flex";
    switchToLogin();
}

function closeAuthModal() {
    document.getElementById("authBackdrop").style.display = "none";
}

function switchToSignup() {
    LoginMode = false;
    document.getElementById("authTitle").innerText = "Sign Up";
    document.getElementById("authToggleText").innerHTML =
        `Already have an account?
         <span onclick="switchToLogin()" class="auth-link">Login</span>`;
}

function switchToLogin() {
    LoginMode = true;
    document.getElementById("authTitle").innerText = "Login";
    document.getElementById("authToggleText").innerHTML =
        `Don't have an account?
         <span onclick="switchToSignup()" class="auth-link">Sign up</span>`;
}

async function handleAuthSubmit() {
    const email = document.getElementById("authEmail").value;
    const password = document.getElementById("authPassword").value;

    if (LoginMode) {
        await auth.signInWithEmailAndPassword(email, password);
    } else {
        await auth.createUserWithEmailAndPassword(email, password);
    }
    closeAuthModal();
}

async function googleLogin() {
    const provider = new firebase.auth.GoogleAuthProvider();
    await auth.signInWithPopup(provider);
    closeAuthModal();
}

auth.onAuthStateChanged(user => {
    const btn = document.querySelector(".login-btn");
    if (!btn) return;

    btn.innerText = user ? "Logout" : "Login";
    btn.onclick = user ? logout : openAuthModal;
});

function logout() {
    auth.signOut();
}

//Create
const createForm = document.getElementById("createCampaignForm");

if (createForm) {
    createForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const user = auth.currentUser;
        if (!user) {
            alert("Login required");
            return;
        }

        await db.collection("campaigns").add({
            title: title.value,
            description: description.value,
            target: Number(target.value),
            raised: 0,
            deadline: deadline.value,
            creatorId: user.uid,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        alert("Campaign created!");
        createForm.reset();
    });
}
//Campaign
document.addEventListener("DOMContentLoaded", async () => {
    loadCampaigns();

    const donateBtn = document.getElementById("donateBtn");
    const donateInput = document.getElementById("donateAmount");

    if (!donateBtn || !donateInput) return;

    const id = new URLSearchParams(window.location.search).get("id");
    if (!id) return;

    loadLedger(id);

    const ref = db.collection("campaigns").doc(id);
    const doc = await ref.get();
    if (!doc.exists) return;

    const c = doc.data();

    cTitle.innerText = c.title;
    cDesc.innerText = c.description;
    campRaised.innerText = c.raised;
    campTarget.innerText = c.target;
    campDeadline.innerText = c.deadline || "—";
    campCategory.innerText = c.category || "General";

    campProgress.style.width =
        c.target > 0 ? (c.raised / c.target) * 100 + "%" : "0%";

    donateBtn.addEventListener("click", async () => {
        const amt = Number(donateInput.value);
        if (!amt || amt <= 0) return alert("Invalid amount");

        await ref.update({
            raised: firebase.firestore.FieldValue.increment(amt)
        });

        await recordDonation("anon_user", amt);

        const updated = (await ref.get()).data();
        campRaised.innerText = updated.raised;
        campProgress.style.width =
            (updated.raised / updated.target) * 100 + "%";
    });
});

//Dashboard
async function loadDashboard() {
    const container = document.getElementById("dashboardCampaigns");
    if (!container) return;

    auth.onAuthStateChanged(async (user) => {
        if (!user) return;

        const snapshot = await db
            .collection("campaigns")
            .where("creatorId", "==", user.uid)
            .get();

        totalCampaigns.innerText = snapshot.size;

        let sum = 0;
        container.innerHTML = "";

        snapshot.forEach(doc => {
            const c = doc.data();
            sum += c.raised || 0;

            container.innerHTML += `
                <div class="campaign-card">
                    <h3>${c.title}</h3>
                    <p>₹${c.raised} of ₹${c.target}</p>
                </div>
            `;
        });

        totalRaised.innerText = sum;
    });
}

document.addEventListener("DOMContentLoaded", loadDashboard);


