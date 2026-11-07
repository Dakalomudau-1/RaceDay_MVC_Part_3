const API_BASE = "https://localhost:7228";

const ROLE_LINKS = {
    Organiser: [
        { text: "Dashboard", href: "/Organiser/Dashboard" },
        { text: "Create Event", href: "/Organiser/CreateEvent" },
        { text: "View Enrolments", href: "/Organiser/Enrolments" },
        { text: "Add Results", href: "/Organiser/Results" },
        { text: "My Profile", href: "/Participant/Profile" }
    ],
    Participant: [
        { text: "My Enrolments", href: "/Participant/MyEnrolments" },
        { text: "My Results", href: "/Participant/MyResults" },
        { text: "My Profile", href: "/Participant/Profile" }
    ]
};

let currentUser = null;
let pendingAction = null;
let toastTimer = null;

const esc = s => String(s ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function apiFetch(path, options = {}) {
    return fetch(API_BASE + path, {
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        ...options
    });
}

async function loadCurrentUser() {
    try {
        const r = await apiFetch("/api/users/me");
        currentUser = r.ok ? await r.json() : null;
    } catch {
        currentUser = null;
    }
}

function renderNav() {
    const el = document.getElementById("nav-auth");
    if (!el) return;

    if (!currentUser) {
        el.innerHTML = `
            <li class="nav-item"><a class="nav-link" href="#" data-auth="login">Login</a></li>
            <li class="nav-item"><a class="nav-link" href="#" data-auth="signup">Sign up</a></li>`;
        return;
    }

    const links = (ROLE_LINKS[currentUser.role] || [])
        .map(l => `<li class="nav-item"><a class="nav-link" href="${l.href}">${esc(l.text)}</a></li>`)
        .join("");

    el.innerHTML = links + `
        <li class="nav-item"><span class="nav-link raceday-hi">Hi, ${esc(currentUser.fullName || currentUser.email)}</span></li>
        <li class="nav-item"><a class="nav-link" href="#" id="logout-link">Logout</a></li>`;
}

function setMode(mode) {
    document.getElementById("login-form").hidden = mode !== "login";
    document.getElementById("signup-form").hidden = mode !== "signup";
    document.getElementById("forgot-form").hidden = mode !== "forgot";
    document.getElementById("reset-form").hidden = mode !== "reset";
    document.querySelector(".auth-tabs").style.display =
        (mode === "forgot" || mode === "reset") ? "none" : "";
    document.getElementById("auth-title").innerText =
        ({ login: "Log in", signup: "Create your account", forgot: "Forgot password", reset: "Reset password" })[mode];
    document.querySelectorAll(".auth-tab").forEach(t =>
        t.classList.toggle("active", t.dataset.mode === mode));
    document.getElementById("auth-error").innerText = "";
}

function openAuth(mode = "login", message = "") {
    setMode(mode);
    document.getElementById("auth-message").innerText = message;
    document.getElementById("auth-overlay").hidden = false;
    document.body.classList.add("auth-open");
}

function closeAuth() {
    document.getElementById("auth-overlay").hidden = true;
    document.body.classList.remove("auth-open");
}

function showToast(msg) {
    const t = document.getElementById("auth-toast");
    t.innerText = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 4000);
}

function markJoined(btn) {
    btn.classList.add("joined");
    btn.innerText = "Joined \u2713";
    btn.style.setProperty("background", "transparent", "important");
    btn.style.setProperty("color", "#00e676", "important");
    btn.style.setProperty("border", "2px solid #00e676", "important");
    btn.style.setProperty("box-shadow", "none", "important");
}

async function refreshJoinButton() {
    const btns = document.querySelectorAll(".join-trigger");
    if (!btns.length || !currentUser || currentUser.role !== "Participant") return;

    const eventId = Number(btns[0].dataset.eventId);
    const r = await apiFetch("/api/users/me/enrolments");
    if (!r.ok) return;

    const list = await r.json();
    if (list.some(e => e.event && e.event.eventId === eventId)) btns.forEach(markJoined);
}

function markAllJoined() {
    document.querySelectorAll(".join-trigger").forEach(markJoined);
}

function categoryLabel(c) {
    const parts = [];
    if (c.distanceKm) parts.push(`${c.distanceKm} km`);
    if (c.minAge != null && c.maxAge != null) parts.push(`ages ${c.minAge}-${c.maxAge}`);
    else if (c.minAge != null) parts.push(`${c.minAge}+`);
    else if (c.maxAge != null) parts.push(`up to ${c.maxAge}`);
    return parts.length ? `${c.name} (${parts.join(", ")})` : c.name;
}

function pickCategory(categories) {
    return new Promise(resolve => {
        const overlay = document.createElement("div");
        overlay.className = "auth-overlay";
        overlay.innerHTML = `
            <div class="auth-modal" role="dialog" aria-modal="true">
                <button type="button" class="auth-close" data-pick="cancel" aria-label="Close">&times;</button>
                <h2>Choose a category</h2>
                <p class="auth-message">Pick the category you want to enter.</p>
                <div class="auth-form">
                    ${categories.map(c =>
            `<button type="button" class="auth-tab" data-pick="${c.categoryId}">${esc(categoryLabel(c))}</button>`
        ).join("")}
                </div>
            </div>`;
        document.body.appendChild(overlay);
        document.body.classList.add("auth-open");

        const done = value => {
            overlay.remove();
            document.body.classList.remove("auth-open");
            resolve(value);
        };

        overlay.addEventListener("click", e => {
            if (e.target === overlay) return done(null);
            const b = e.target.closest("[data-pick]");
            if (!b) return;
            done(b.dataset.pick === "cancel" ? null : Number(b.dataset.pick));
        });
    });
}

async function enrolInEvent(eventId) {
    const cr = await apiFetch(`/api/events/${eventId}/categories`);
    if (!cr.ok) {
        showToast("Could not load the categories for this event.");
        return false;
    }

    const categories = await cr.json();
    if (categories.length === 0) {
        showToast("This event has no categories to enrol in yet.");
        return false;
    }

    const categoryId = await pickCategory(categories);
    
    if (categoryId == null) return false;

    const r = await apiFetch(`/api/events/${eventId}/enrolments`, {
        method: "POST",
        body: JSON.stringify({ categoryId })
    });

    if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        if (r.status === 409) markAllJoined();
        showToast(err.message || "Could not enrol. Please try again.");
        return false;
    }
    return true;
}

async function handleJoin(eventId, btn) {
    if (btn.classList.contains("joined")) return;

    if (!currentUser) {
        pendingAction = () => handleJoin(eventId, btn);
        openAuth("login", "Log in or sign up as a participant to join this event.");
        return;
    }

    if (currentUser.role !== "Participant") {
        showToast("Events can only be joined by participants.");
        return;
    }

    const ok = await enrolInEvent(eventId);
    if (ok) {
        markAllJoined();
        showToast("You have joined this event!");
    }
}

async function login(email, password) {
    const r = await apiFetch("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
    });
    if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.message || "Login failed");
    }
}

async function afterAuth() {
    const action = pendingAction;
    pendingAction = null;
    closeAuth();
    await loadCurrentUser();
    renderNav();
    await refreshJoinButton();
    if (typeof onAuthChanged === "function") { onAuthChanged(); return; }
    if (action) await action();
}

function showDemoSms(code) {
    hideDemoSms();
    const box = document.createElement("div");
    box.id = "demo-sms";
    box.className = "demo-sms";
    box.innerHTML = `
        <small>Messages &middot; RaceDay</small>
        <div>Your RaceDay code is <strong>${esc(code)}</strong></div>
        <small>Valid for 10 minutes</small>
        <button type="button" id="demo-sms-close">Dismiss</button>`;
    document.body.appendChild(box);
    document.getElementById("demo-sms-close").addEventListener("click", hideDemoSms);
}

function hideDemoSms() {
    const el = document.getElementById("demo-sms");
    if (el) el.remove();
}

async function uploadImage(path, file) {
    const form = new FormData();
    form.append("file", file);
    const r = await fetch(API_BASE + path, { method: "POST", credentials: "include", body: form });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.message || "Image upload failed.");
    return data;
}

async function logout() {
    await apiFetch("/api/auth/logout", { method: "POST" });
    location.href = "/";
}

document.addEventListener("DOMContentLoaded", async () => {

    document.addEventListener("click", e => {
        const trigger = e.target.closest("[data-auth]");
        if (trigger) {
            e.preventDefault();
            openAuth(trigger.dataset.auth);
        }
        if (e.target.closest("#logout-link")) {
            e.preventDefault();
            logout();
        }
    });

    document.querySelectorAll(".auth-tab").forEach(t =>
        t.addEventListener("click", () => setMode(t.dataset.mode)));

    document.getElementById("auth-close").addEventListener("click", () => {
        pendingAction = null;
        closeAuth();
    });

    document.getElementById("auth-overlay").addEventListener("click", e => {
        if (e.target.id === "auth-overlay") {
            pendingAction = null;
            closeAuth();
        }
    });

    document.addEventListener("keydown", e => {
        if (e.key === "Escape") {
            pendingAction = null;
            closeAuth();
        }
    });

    document.getElementById("login-form").addEventListener("submit", async e => {
        e.preventDefault();
        const errEl = document.getElementById("auth-error");
        errEl.innerText = "";
        try {
            await login(
                document.getElementById("login-email").value.trim(),
                document.getElementById("login-password").value);
            await afterAuth();
        } catch (ex) {
            errEl.innerText = ex.message;
        }
    });

    document.getElementById("signup-form").addEventListener("submit", async e => {
        e.preventDefault();
        const errEl = document.getElementById("auth-error");
        errEl.innerText = "";

        const email = document.getElementById("signup-email").value.trim();
        const password = document.getElementById("signup-password").value;
        const dob = document.getElementById("signup-dob").value;

        const lower = email.toLowerCase();
        let role = null;
        if (lower.includes("@organiser")) role = "Organiser";
        else if (lower.includes("@participant")) role = "Participant";

        if (!role) {
            errEl.innerText = "Email must contain @participant or @organiser.";
            return;
        }
        if (role === "Participant" && !dob) {
            errEl.innerText = "Date of birth is required for participants.";
            return;
        }

        try {
            const r = await apiFetch("/api/auth/register", {
                method: "POST",
                body: JSON.stringify({
                    fullName: document.getElementById("signup-name").value.trim(),
                    email,
                    password,
                    role,
                    dateOfBirth: dob ? new Date(dob).toISOString() : null,
                    phoneNumber: document.getElementById("signup-phone").value.trim()
                })
            });
            if (!r.ok) {
                const err = await r.json().catch(() => ({}));
                throw new Error(err.message || "Sign up failed");
            }
            await login(email, password);
            await afterAuth();
        } catch (ex) {
            errEl.innerText = ex.message;
        }
    });

    document.addEventListener("click", e => {
        const btn = e.target.closest(".join-trigger, #join-btn");
        if (!btn) return;
        e.preventDefault();
        handleJoin(Number(btn.dataset.eventId), btn);
    });

    let resetPhone = "";

    document.addEventListener("click", e => {
        if (e.target.closest("#forgot-link")) {
            e.preventDefault();
            document.getElementById("auth-message").innerText = "";
            setMode("forgot");
        }
        if (e.target.closest("[data-back-login]")) {
            e.preventDefault();
            document.getElementById("auth-message").innerText = "";
            setMode("login");
        }
    });

    document.getElementById("forgot-form").addEventListener("submit", async e => {
        e.preventDefault();
        const errEl = document.getElementById("auth-error");
        errEl.innerText = "";
        resetPhone = document.getElementById("forgot-phone").value.trim();
        try {
            const r = await apiFetch("/api/auth/forgot-password", {
                method: "POST",
                body: JSON.stringify({ phoneNumber: resetPhone })
            });
            const data = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(data.message || "Could not send the code.");
            setMode("reset");
            document.getElementById("auth-message").innerText = data.message;
            if (data.demoCode) showDemoSms(data.demoCode);
        } catch (ex) {
            errEl.innerText = ex.message;
        }
    });

    document.getElementById("reset-form").addEventListener("submit", async e => {
        e.preventDefault();
        const errEl = document.getElementById("auth-error");
        errEl.innerText = "";
        try {
            const r = await apiFetch("/api/auth/reset-password", {
                method: "POST",
                body: JSON.stringify({
                    phoneNumber: resetPhone,
                    code: document.getElementById("reset-code").value.trim(),
                    newPassword: document.getElementById("reset-password").value
                })
            });
            const data = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(data.message || "Could not reset the password.");
            e.target.reset();
            hideDemoSms();
            setMode("login");
            document.getElementById("auth-message").innerText = data.message;
        } catch (ex) {
            errEl.innerText = ex.message;
        }
    });

    await loadCurrentUser();
    renderNav();
    await refreshJoinButton();
});