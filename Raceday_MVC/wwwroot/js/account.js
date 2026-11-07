function onAuthChanged() {
    location.reload();
}

const fmtDate = d => new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

function gate(root, title, text, showLogin) {
    root.innerHTML = `
        <div class="account-empty">
            <h3>${esc(title)}</h3>
            <p>${esc(text)}</p>
            ${showLogin ? `<a href="#" class="account-btn" data-auth="login">Log in</a>` : ""}
        </div>`;
}

async function loadMyEnrolments() {
    const r = await apiFetch("/api/users/me/enrolments");
    if (!r.ok) throw new Error("Could not load your enrolments.");
    const list = await r.json();
    return list.filter(e => e.event);
}

async function renderEnrolments(root) {
    let list;
    try {
        list = await loadMyEnrolments();
    } catch (ex) {
        gate(root, "Something went wrong", ex.message, false);
        return;
    }

    if (list.length === 0) {
        root.innerHTML = `
            <div class="account-empty">
                <h3>No enrolments yet</h3>
                <p>Browse events and join one to see it here.</p>
                <a href="/Events" class="account-btn">Browse events</a>
            </div>`;
        return;
    }

    const now = new Date();
    list.sort((a, b) => {
        const da = new Date(a.event.eventDate), db = new Date(b.event.eventDate);
        const ua = da > now, ub = db > now;
        if (ua !== ub) return ua ? -1 : 1;
        return ua ? da - db : db - da;
    });

    root.innerHTML = `<div class="account-list">${list.map(e => {
        const ev = e.event;
        const upcoming = new Date(ev.eventDate) > now;
        const canCancel = upcoming && !e.result && e.status !== "Cancelled";
        return `
            <article class="account-card">
                <div>
                    <h3>${esc(ev.name)}</h3>
                    <p class="account-meta">${fmtDate(ev.eventDate)} · ${esc(ev.location)}</p>
                    <p class="account-meta">Category: ${esc(e.category ? e.category.name : "-")}</p>
                </div>
                <div class="account-actions">
                    <span class="status-badge status-${esc((e.status || "").toLowerCase())}">${esc(e.status)}</span>
                    <a class="account-link" href="/Events/Details/${ev.eventId}">View details &rarr;</a>
                    ${canCancel ? `<button type="button" class="account-btn danger" data-cancel="${e.enrolmentId}">Cancel</button>` : ""}
                </div>
            </article>`;
    }).join("")}</div>`;

    root.querySelectorAll("[data-cancel]").forEach(btn =>
        btn.addEventListener("click", async () => {
            if (!confirm("Cancel this enrolment?")) return;
            const r = await apiFetch(`/api/enrolments/${btn.dataset.cancel}`, { method: "DELETE" });
            if (r.ok) {
                showToast("Enrolment cancelled.");
                renderEnrolments(root);
            } else {
                const err = await r.json().catch(() => ({}));
                showToast(err.message || "Could not cancel the enrolment.");
            }
        }));
}

function ordinal(n) {
    const v = Number(n);
    const s = ["th", "st", "nd", "rd"];
    const m = v % 100;
    return v + (s[(m - 20) % 10] || s[m] || s[0]);
}

async function renderResults(root) {
    let list;
    try {
        const r = await apiFetch("/api/users/me/results");
        if (!r.ok) throw new Error("Could not load your results.");
        list = await r.json();
    } catch (ex) {
        gate(root, "Something went wrong", ex.message, false);
        return;
    }

    if (list.length === 0) {
        root.innerHTML = `
            <div class="account-empty">
                <h3>No results yet</h3>
                <p>Your results will appear here once an organiser publishes them.</p>
            </div>`;
        return;
    }

    list.sort((a, b) => new Date(b.eventDate) - new Date(a.eventDate));

    root.innerHTML = `
        <div class="account-table-wrap">
            <table class="account-table">
                <thead>
                    <tr><th>Event</th><th>Date</th><th>Category</th><th>Finish Time</th><th>Position</th></tr>
                </thead>
                <tbody>
                    ${list.map(e => `
                        <tr>
                            <td>${esc(e.eventName)}</td>
                            <td>${fmtDate(e.eventDate)}</td>
                            <td>${esc(e.categoryName || "-")}</td>
                            <td>${esc(String(e.finishTime).substring(0, 8))}</td>
                            <td class="pos-${esc(e.finishPosition)}"><strong>${ordinal(e.finishPosition)}</strong> of ${esc(e.totalFinishers)} finisher${Number(e.totalFinishers) === 1 ? "" : "s"}</td>
                        </tr>`).join("")}
                </tbody>
            </table>
        </div>`;
}

function renderProfile(root, me) {
    const isParticipant = me.role === "Participant";
    const dob = me.dateOfBirth ? String(me.dateOfBirth).substring(0, 10) : "";
    const initial = (me.fullName || me.email || "?").charAt(0).toUpperCase();

    root.innerHTML = `
        <div class="profile-card">
            <div class="profile-head">
                ${me.profilePictureUrl
            ? `<img class="profile-pic" src="${esc(me.profilePictureUrl)}" alt="Profile picture" />`
            : `<div class="profile-pic profile-initial">${esc(initial)}</div>`}
                <div>
                    <h2>${esc(me.fullName || "")}</h2>
                    <p class="account-meta">${esc(me.email)} · ${esc(me.role)}</p>
                </div>
            </div>
            <form id="profile-form" class="profile-form">
                <label>Full name<input id="pf-name" type="text" value="${esc(me.fullName)}" required /></label>
                <label>Phone number<input id="pf-phone" type="tel" value="${esc(me.phoneNumber)}" /></label>
                ${isParticipant ? `<label>Date of birth<input id="pf-dob" type="date" value="${dob}" /></label>` : ""}
                                <label>Profile picture<input id="pf-pic" type="file" accept="image/png,image/jpeg,image/webp" /></label>
                <img id="pf-preview" alt="" style="display:none;" />
                <button type="button" id="pf-pic-clear" class="account-btn small danger" style="display:none;">Remove new picture</button>
                <button type="submit" class="account-btn">Save changes</button>
                <p id="pf-msg" class="profile-msg"></p>
            </form>
        </div>`;

    const pfInput = document.getElementById("pf-pic");
    const pfPrev = document.getElementById("pf-preview");
    const pfClear = document.getElementById("pf-pic-clear");

    function resetPicChoice() {
        pfInput.value = "";
        pfPrev.removeAttribute("src");
        pfPrev.style.display = "none";
        pfClear.style.display = "none";
    }

    pfInput.addEventListener("change", e => {
        const f = e.target.files[0];
        if (!f) { resetPicChoice(); return; }
        pfPrev.src = URL.createObjectURL(f);
        pfPrev.style.display = "block";
        pfClear.style.display = "inline-block";
    });

    pfClear.addEventListener("click", resetPicChoice);

    document.getElementById("profile-form").addEventListener("submit", async e => {
        e.preventDefault();
        const msg = document.getElementById("pf-msg");

        msg.innerText = "";

        const dobEl = document.getElementById("pf-dob");
        const dobVal = dobEl ? dobEl.value : "";

        const r = await apiFetch("/api/users/me", {
            method: "PUT",
            body: JSON.stringify({
                fullName: document.getElementById("pf-name").value.trim(),
                phoneNumber: document.getElementById("pf-phone").value.trim(),
                profilePictureUrl: "",
                dateOfBirth: dobVal ? new Date(dobVal).toISOString() : null
            })
        });

        if (!r.ok) {
            const err = await r.json().catch(() => ({}));
            msg.style.color = "#b00020";
            msg.innerText = err.message || "Could not save your changes.";
            return;
        }

    const picFile = document.getElementById("pf-pic").files[0];
    if (picFile) {
        try {
            await uploadImage("/api/users/me/picture", picFile);
        } catch (ex) {
            msg.style.color = "#b00020";
            msg.innerText = ex.message;
            return;
        }
    }

        const r2 = await apiFetch("/api/users/me");
        if (r2.ok) {
            const updated = await r2.json();
            renderProfile(root, updated);
            document.getElementById("pf-msg").innerText = "Profile updated.";
            await loadCurrentUser();
            renderNav();
        }
    });
}

document.addEventListener("DOMContentLoaded", async () => {
    const root = document.getElementById("account-content");
    if (!root) return;

    const page = root.dataset.page;

    const r = await apiFetch("/api/users/me");
    if (!r.ok) {
        gate(root, "Please log in", "You need to be logged in to see this page.", true);
        return;
    }

    const me = await r.json();

    if (page === "profile") {
        renderProfile(root, me);
        return;
    }

    if (me.role !== "Participant") {
        gate(root, "Participants only", "This page is only available to participant accounts.", false);
        return;
    }

    if (page === "enrolments") await renderEnrolments(root);
    if (page === "results") await renderResults(root);
});