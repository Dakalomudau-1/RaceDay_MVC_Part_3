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

async function loadMyEvents(me) {
    const organiserId = me.organiserId ?? me.OrganiserId;
    if (organiserId == null) {
        throw new Error("Your organiser details are missing. Log out and log in again.");
    }
    const r = await apiFetch("/api/events");
    if (!r.ok) throw new Error("Could not load events.");
    const all = await r.json();
    return all
        .filter(e => (e.organiserId ?? e.OrganiserId) === organiserId)
        .sort((a, b) => new Date(b.eventDate ?? b.EventDate) - new Date(a.eventDate ?? a.EventDate));
}

async function renderDashboardPage(root, me) {
    try {
        const events = await loadMyEvents(me);
        const upcoming = events.filter(e => new Date(e.eventDate ?? e.EventDate) >= new Date());

        root.innerHTML = `
            <div class="org-summary" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:1rem;margin-bottom:1.5rem;">
                <div class="account-card"><h3>${events.length}</h3><p class="account-meta">Total events</p></div>
                <div class="account-card"><h3>${upcoming.length}</h3><p class="account-meta">Upcoming</p></div>
            </div>
            <p style="margin-bottom:1rem;"><a class="account-btn" href="/Organiser/CreateEvent">+ Create event</a></p>
            <div class="account-list">
                ${events.length === 0
                ? `<div class="account-empty"><h3>No events yet</h3><p>Create your first event.</p></div>`
                : events.map(e => {
                    const id = e.eventId ?? e.EventId;
                    const name = e.name ?? e.Name ?? "";
                    const loc = e.location ?? e.Location ?? "";
                    const type = e.eventType ?? e.EventType ?? "";
                    const date = e.eventDate ?? e.EventDate;
                    return `
                        <article class="account-card">
                            <div>
                                <h3>${esc(name)}</h3>
                                <p class="account-meta">${fmtDate(date)} · ${esc(loc)} · ${esc(type)}</p>
                            </div>
                            <div class="account-actions">
                                <a class="account-link" href="/Organiser/CreateEvent?id=${id}">Edit</a>
                                <a class="account-link" href="/Organiser/Enrolments?eventId=${id}">Enrolments</a>
                                <a class="account-link" href="/Organiser/Results?eventId=${id}">Results</a>
                                <button type="button" class="account-btn danger" data-delete="${id}">Delete</button>
                            </div>
                        </article>`;
                }).join("")}
            </div>`;

        root.querySelectorAll("[data-delete]").forEach(btn => {
            btn.addEventListener("click", async () => {
                if (!confirm("Delete this event? This cannot be undone.")) return;
                const r = await apiFetch(`/api/events/${btn.dataset.delete}`, { method: "DELETE" });
                if (r.ok || r.status === 204) {
                    showToast("Event deleted.");
                    await renderDashboardPage(root, me);
                } else {
                    const err = await r.json().catch(() => ({}));
                    showToast(err.message || "Could not delete event.");
                }
            });
        });
    } catch (ex) {
        gate(root, "Something went wrong", ex.message, false);
    }
}

async function renderEnrolmentsPage(root, me) {
    let events;
    try {
        events = await loadMyEvents(me);
    } catch (ex) {
        gate(root, "Something went wrong", ex.message, false);
        return;
    }

    if (events.length === 0) {
        root.innerHTML = `
            <div class="account-empty">
                <h3>No events yet</h3>
                <p>Events you create will appear here with their enrolments.</p>
            </div>`;
        return;
    }

    const wanted = Number(new URLSearchParams(location.search).get("eventId"));
    const selectedId = events.some(e => e.eventId === wanted) ? wanted : events[0].eventId;

    root.innerHTML = `
        <div class="org-toolbar">
            <label for="event-select">Event</label>
            <select id="event-select" class="org-select">
                ${events.map(e => `<option value="${e.eventId}" ${e.eventId === selectedId ? "selected" : ""}>${esc(e.name)} (${fmtDate(e.eventDate)})</option>`).join("")}
            </select>
        </div>
        <div id="enrol-summary" class="org-summary"></div>
        <div id="enrol-list"></div>`;

    const select = document.getElementById("event-select");
    select.addEventListener("change", () => loadEnrolments(Number(select.value)));
    await loadEnrolments(selectedId);
}

async function loadEnrolments(eventId) {
    const list = document.getElementById("enrol-list");
    const summary = document.getElementById("enrol-summary");
    list.innerHTML = "Loading...";

    const r = await apiFetch(`/api/events/${eventId}/enrolments`);
    if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        summary.innerHTML = "";
        list.innerHTML = `
            <div class="account-empty">
                <h3>Could not load enrolments</h3>
                <p>${esc(err.message || "Please try again.")}</p>
            </div>`;
        return;
    }

    const rows = await r.json();
    const count = s => rows.filter(x => x.status === s).length;

    summary.innerHTML = `
        <span class="status-badge status-pending">${count("Pending")} pending</span>
        <span class="status-badge status-confirmed">${count("Confirmed")} confirmed</span>
        <span class="status-badge status-cancelled">${count("Cancelled")} cancelled</span>`;

    if (rows.length === 0) {
        list.innerHTML = `
            <div class="account-empty">
                <h3>No enrolments yet</h3>
                <p>Nobody has joined this event yet.</p>
            </div>`;
        return;
    }

    const order = { Pending: 0, Confirmed: 1, Cancelled: 2 };
    rows.sort((a, b) =>
        (order[a.status] ?? 3) - (order[b.status] ?? 3) ||
        new Date(b.enrolmentDate) - new Date(a.enrolmentDate));

    list.innerHTML = `<div class="account-list">${rows.map(e => `
        <article class="account-card">
            <div>
                <h3>${esc(e.participant ? e.participant.fullName : "Unknown")}</h3>
                <p class="account-meta">Phone: ${esc(e.participant && e.participant.phoneNumber ? e.participant.phoneNumber : "-")}</p>
                <p class="account-meta">Category: ${esc(e.category ? e.category.name : "-")} · Enrolled ${fmtDate(e.enrolmentDate)}</p>
            </div>
            <div class="account-actions">
                <span class="status-badge status-${esc((e.status || "").toLowerCase())}">${esc(e.status)}</span>
                ${e.status !== "Confirmed" ? `<button type="button" class="account-btn small" data-id="${e.enrolmentId}" data-set-status="Confirmed">Confirm</button>` : ""}
                ${e.status !== "Cancelled" ? `<button type="button" class="account-btn small danger" data-id="${e.enrolmentId}" data-set-status="Cancelled">Cancel</button>` : ""}
            </div>
        </article>`).join("")}</div>`;

    list.querySelectorAll("[data-set-status]").forEach(btn =>
        btn.addEventListener("click", async () => {
            btn.disabled = true;
            const res = await apiFetch(`/api/enrolments/${btn.dataset.id}/status`, {
                method: "PUT",
                body: JSON.stringify({ status: btn.dataset.setStatus })
            });
            if (res.ok) {
                showToast(`Enrolment ${btn.dataset.setStatus.toLowerCase()}.`);
                await loadEnrolments(eventId);
            } else {
                const err = await res.json().catch(() => ({}));
                showToast(err.message || "Could not update the enrolment.");
                btn.disabled = false;
            }
        }));
}

document.addEventListener("DOMContentLoaded", async () => {
    const root = document.getElementById("account-content");
    if (!root) return;

    const r = await apiFetch("/api/users/me");
    if (!r.ok) {
        gate(root, "Please log in", "You need to be logged in to see this page.", true);
        return;
    }

    const me = await r.json();
    if (me.role !== "Organiser") {
        gate(root, "Organisers only", "This page is only available to organiser accounts.", false);
        return;
    }

    if (root.dataset.page === "enrolments") await renderEnrolmentsPage(root, me);
    if (root.dataset.page === "create") renderCreateEventPage(root);
    if (root.dataset.page === "edit") await renderEditEventPage(root);
    if (root.dataset.page === "results") await renderResultsPage(root, me);
    if (root.dataset.page === "dashboard") await renderDashboardPage(root, me);
});

function renderCreateEventPage(root) {
    const editId = Number(new URLSearchParams(location.search).get("id")) || null;
    let createdEventId = null;
    let categoryDone = false;
    let bannerDone = false;
    const points = [];

    root.innerHTML = `
        <div class="profile-card create-card">
            <form id="create-form" class="profile-form">
                <label>Event name<input id="ce-name" type="text" required /></label>
                <label>Description<textarea id="ce-desc" rows="3"></textarea></label>
                <div class="create-grid">
                    <label>Type
                        <select id="ce-type">
                            <option value="Run">Run</option>
                            <option value="Walk">Walk</option>
                            <option value="Cycle">Cycle</option>
                        </select>
                    </label>
                    <label>Date and start time<input id="ce-date" type="datetime-local" required /></label>
                    <label>Distance (km)<input id="ce-dist" type="number" step="0.01" min="0.1" required /></label>
                    <label>Elevation gain (m)<input id="ce-elev" type="number" step="1" min="0" /></label>
                </div>
                <label>Location<input id="ce-loc" type="text" required placeholder="e.g. Church Square, Pretoria" /></label>
                                <div class="create-grid">
                    <label>Minimum age (optional)<input id="ce-minage" type="number" min="0" max="120" /></label>
                    <label>Maximum age (optional)<input id="ce-maxage" type="number" min="0" max="120" /></label>
                </div>
                <label>Banner image (optional)<input id="ce-banner" type="file" accept="image/png,image/jpeg,image/webp" /></label>
                                                <img id="ce-preview" alt="" style="display:none;" />
                <button type="button" id="ce-banner-clear" class="account-btn small danger" style="display:none;">Remove image</button>
                <div>
                    <strong>Route</strong>
                    <p class="account-meta">Click the map to add route points in order. The first point is the start and the last is the finish.</p>
                    <div class="map-tools">
                        <button type="button" id="ce-find" class="account-btn small danger">Find location on map</button>
                        <button type="button" id="ce-undo" class="account-btn small danger">Undo last point</button>
                        <button type="button" id="ce-clear" class="account-btn small danger">Clear</button>
                        <span id="ce-count" class="account-meta">0 points</span>
                    </div>
                    <div id="create-map"></div>
                </div>

                <button type="submit" class="account-btn">Create event</button>
                <p id="ce-msg" class="profile-msg"></p>
            </form>
        </div>`;

    const ceInput = document.getElementById("ce-banner");
    const cePrev = document.getElementById("ce-preview");
    const ceClear = document.getElementById("ce-banner-clear");

    ceInput.addEventListener("change", e => {
        const f = e.target.files[0];
        if (!f) {
            cePrev.style.display = "none";
            ceClear.style.display = "none";
            return;
        }
        cePrev.src = URL.createObjectURL(f);
        cePrev.style.display = "block";
        ceClear.style.display = "inline-block";
    });

    ceClear.addEventListener("click", () => {
        ceInput.value = "";
        cePrev.removeAttribute("src");
        cePrev.style.display = "none";
        ceClear.style.display = "none";
    });

    const map = L.map("create-map").setView([-28.5, 24.5], 5);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors"
    }).addTo(map);

    const line = L.polyline([], { color: "#ff3d00", weight: 4 }).addTo(map);
    const markers = [];

    function redraw() {
        line.setLatLngs(points);
        markers.forEach(m => m.remove());
        markers.length = 0;
        points.forEach((p, i) => {
            const color = i === 0 ? "#00c853" : (i === points.length - 1 ? "#d50000" : "#ff3d00");
            markers.push(L.circleMarker(p, {
                radius: 7, color: "#fff", weight: 2, fillColor: color, fillOpacity: 1
            }).addTo(map));
        });
        document.getElementById("ce-count").innerText =
            `${points.length} point${points.length === 1 ? "" : "s"}`;
    }

    map.on("click", e => {
        points.push([Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6))]);
        redraw();
    });

    document.getElementById("ce-undo").addEventListener("click", () => { points.pop(); redraw(); });
    document.getElementById("ce-clear").addEventListener("click", () => { points.length = 0; redraw(); });

    document.getElementById("ce-find").addEventListener("click", async () => {
        const q = document.getElementById("ce-loc").value.trim();
        if (!q) { showToast("Type a location first."); return; }
        try {
            const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=za&q=${encodeURIComponent(q)}`);
            const res = await r.json();
            if (res.length) map.setView([Number(res[0].lat), Number(res[0].lon)], 14);
            else showToast("Location not found. Zoom the map by hand instead.");
        } catch {
            showToast("Could not search for that location.");
        }
    });

    document.getElementById("create-form").addEventListener("submit", async e => {
        e.preventDefault();
        const msg = document.getElementById("ce-msg");
        const btn = e.target.querySelector("button[type=submit]");
        msg.style.color = "#b00020";
        msg.innerText = "";

        if (points.length < 2) {
            msg.innerText = "Add at least 2 route points on the map (a start and a finish).";
            return;
        }

        const name = document.getElementById("ce-name").value.trim();
        const distance = Number(document.getElementById("ce-dist").value);
        let dateVal = document.getElementById("ce-date").value;
        if (!dateVal || new Date(dateVal) <= new Date()) {
            msg.innerText = "Choose a date and time in the future.";
            return;
        }
        if (dateVal.length === 16) dateVal += ":00";
        const elev = document.getElementById("ce-elev").value;

        const minAgeVal = document.getElementById("ce-minage").value;
        const maxAgeVal = document.getElementById("ce-maxage").value;
        const minAge = minAgeVal === "" ? null : Number(minAgeVal);
        const maxAge = maxAgeVal === "" ? null : Number(maxAgeVal);
        if (minAge !== null && maxAge !== null && minAge > maxAge) {
            msg.innerText = "Minimum age cannot be higher than maximum age.";
            return;
        }

        btn.disabled = true;
        try {
            if (createdEventId == null) {
                const r = await apiFetch("/api/events", {
                    method: "POST",
                    body: JSON.stringify({
                        name,
                        description: document.getElementById("ce-desc").value.trim(),
                        eventDate: dateVal,
                        location: document.getElementById("ce-loc").value.trim(),
                        distanceKm: distance,
                        eventType: document.getElementById("ce-type").value,
                        bannerImageUrl: "/images/running.jpg"
                    })
                });
                if (!r.ok) {
                    const err = await r.json().catch(() => ({}));
                    throw new Error(err.message || "Could not create the event.");
                }
                createdEventId = (await r.json()).eventId;
            }

            const bannerFile = document.getElementById("ce-banner").files[0];
            if (bannerFile && !bannerDone) {
                await uploadImage(`/api/events/${createdEventId}/banner`, bannerFile);
                bannerDone = true;
            }

            if (!categoryDone) {
                const c = await apiFetch(`/api/events/${createdEventId}/categories`, {
                    method: "POST",
                    body: JSON.stringify({ name: "Open", minAge, maxAge, distanceKm: distance })
                     });
                if (!c.ok) throw new Error("Could not create the default category.");
                categoryDone = true;
            }

            const rr = await apiFetch(`/api/events/${createdEventId}/route`, {
                method: "POST",
                body: JSON.stringify({
                    routeName: `${name} Route`,
                    startLatitude: points[0][0],
                    startLongitude: points[0][1],
                    elevationGain: elev ? Number(elev) : null,
                    mapUrl: "",
                    waypoints: points.map((p, i) => ({ sequence: i + 1, latitude: p[0], longitude: p[1] }))
                })
            });
            if (!rr.ok) {
                const err = await rr.json().catch(() => ({}));
                throw new Error(err.message || "Could not save the route.");
            }

            showToast("Event created!");
            location.href = `/Events/Details/${createdEventId}`;
        } catch (ex) {
            msg.innerText = createdEventId
                ? `${ex.message} The event is saved, so press the button again to retry the rest.`
                : ex.message;
            btn.disabled = false;
        }
    });
}

function normaliseTime(v) {
    const t = (v || "").trim();
    let m = /^(\d{1,2}):([0-5]\d):([0-5]\d)$/.exec(t);
    if (m) return `${m[1].padStart(2, "0")}:${m[2]}:${m[3]}`;
    m = /^(\d{1,2}):([0-5]\d)$/.exec(t);
    if (m) return `00:${m[1].padStart(2, "0")}:${m[2]}`;
    return null;
}

async function renderResultsPage(root, me) {
    let events;
    try {
        events = (await loadMyEvents(me)).filter(e => new Date(e.eventDate) <= new Date());
    } catch (ex) {
        gate(root, "Something went wrong", ex.message, false);
        return;
    }

    if (events.length === 0) {
        root.innerHTML = `
            <div class="account-empty">
                <h3>No past events yet</h3>
                <p>Results can be captured once one of your events has taken place.</p>
            </div>`;
        return;
    }

    root.innerHTML = `
        <div class="org-toolbar">
            <label for="res-event">Event</label>
            <select id="res-event" class="org-select">
                ${events.map(e => `<option value="${e.eventId}">${esc(e.name)} (${fmtDate(e.eventDate)})</option>`).join("")}
            </select>
            <button type="button" id="res-rank" class="account-btn small danger">Rank by time</button>
        </div>
        <div id="res-list"></div>`;

    const select = document.getElementById("res-event");
    select.addEventListener("change", () => loadResultRows(Number(select.value)));
    document.getElementById("res-rank").addEventListener("click", rankByTime);
    await loadResultRows(Number(select.value));
}

async function loadResultRows(eventId) {
    const list = document.getElementById("res-list");
    list.innerHTML = "Loading...";

    const r = await apiFetch(`/api/events/${eventId}/enrolments`);
    if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        list.innerHTML = `
            <div class="account-empty">
                <h3>Could not load enrolments</h3>
                <p>${esc(err.message || "Please try again.")}</p>
            </div>`;
        return;
    }

    const rows = (await r.json()).filter(e => e.status === "Confirmed" || e.result);

    if (rows.length === 0) {
        list.innerHTML = `
            <div class="account-empty">
                <h3>No confirmed participants</h3>
                <p>Confirm enrolments first, then come back to capture results.</p>
                <a href="/Organiser/Enrolments" class="account-btn">View Enrolments</a>
            </div>`;
        return;
    }

    rows.sort((a, b) => {
        const pa = a.result ? a.result.finishPosition : Infinity;
        const pb = b.result ? b.result.finishPosition : Infinity;
        if (pa !== pb) return pa - pb;
        return String(a.participant ? a.participant.fullName : "").localeCompare(String(b.participant ? b.participant.fullName : ""));
    });

    list.innerHTML = `
        <div class="account-table-wrap">
            <table class="account-table">
                <thead>
                    <tr><th>Participant</th><th>Category</th><th>Position</th><th>Finish Time</th><th></th></tr>
                </thead>
                <tbody>
                    ${rows.map(e => `
                        <tr data-enrolment="${e.enrolmentId}" data-result="${e.result ? e.result.resultId : ""}">
                            <td>${esc(e.participant ? e.participant.fullName : "Unknown")}</td>
                            <td>${esc(e.category ? e.category.name : "-")}</td>
                            <td><input class="res-input res-pos" type="number" min="1" value="${e.result ? e.result.finishPosition : ""}" /></td>
                            <td><input class="res-input res-time" type="text" placeholder="00:23:45" value="${e.result ? esc(String(e.result.finishTime).substring(0, 8)) : ""}" /></td>
                            <td><button type="button" class="account-btn small" data-save>${e.result ? "Update" : "Save"}</button></td>
                        </tr>`).join("")}
                </tbody>
            </table>
        </div>`;

    list.querySelectorAll("[data-save]").forEach(btn =>
        btn.addEventListener("click", () => saveResultRow(btn.closest("tr"), btn)));
}

async function saveResultRow(tr, btn) {
    const pos = Number(tr.querySelector(".res-pos").value);
    const time = normaliseTime(tr.querySelector(".res-time").value);

    if (!Number.isInteger(pos) || pos < 1) {
        showToast("Enter a finish position of 1 or more.");
        return;
    }
    if (!time || time === "00:00:00") {
        showToast("Enter a finish time like 00:23:45 (or 23:45).");
        return;
    }

    const clash = [...document.querySelectorAll("#res-list tr[data-enrolment]")]
        .some(other => other !== tr && Number(other.querySelector(".res-pos").value) === pos);
    if (clash) {
        showToast(`Position ${pos} is already used by another participant.`);
        return;
    }

    const resultId = tr.dataset.result;
    btn.disabled = true;

    const res = resultId
        ? await apiFetch(`/api/results/${resultId}`, {
            method: "PUT",
            body: JSON.stringify({ finishTime: time, finishPosition: pos })
        })
        : await apiFetch(`/api/enrolments/${tr.dataset.enrolment}/results`, {
            method: "POST",
            body: JSON.stringify({ finishTime: time, finishPosition: pos })
        });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast(err.message || "Could not save the result.");
        btn.disabled = false;
        return;
    }

    if (!resultId) {
        const created = await res.json();
        tr.dataset.result = created.resultId;
        btn.innerText = "Update";
    }
    tr.querySelector(".res-time").value = time;
    btn.disabled = false;
    showToast("Result saved.");
}

function rankByTime() {
    const rows = [...document.querySelectorAll("#res-list tr[data-enrolment]")]
        .map(tr => ({ tr, time: normaliseTime(tr.querySelector(".res-time").value) }))
        .filter(x => x.time)
        .sort((a, b) => a.time.localeCompare(b.time));

    rows.forEach((x, i) => { x.tr.querySelector(".res-pos").value = i + 1; });
    showToast(rows.length
        ? "Positions filled in. Press Save or Update on each row."
        : "Enter some finish times first.");
}

async function renderEditEventPage(root) {
    const eventId = Number(root.dataset.eventId);
    const r = await apiFetch(`/api/events/${eventId}`);
    if (!r.ok) {
        gate(root, "Event not found", "This event could not be loaded.", false);
        return;
    }
    const ev = await r.json();

    root.innerHTML = `
        <div class="profile-card create-card">
            <form id="edit-form" class="profile-form">
                <label>Event name<input id="ee-name" type="text" required /></label>
                <label>Description<textarea id="ee-desc" rows="3"></textarea></label>
                <div class="create-grid">
                    <label>Type
                        <select id="ee-type">
                            <option value="Run">Run</option>
                            <option value="Walk">Walk</option>
                            <option value="Cycle">Cycle</option>
                        </select>
                    </label>
                    <label>Date and start time<input id="ee-date" type="datetime-local" required /></label>
                    <label>Distance (km)<input id="ee-dist" type="number" step="0.01" min="0.1" required /></label>
                </div>
                <label>Location<input id="ee-loc" type="text" required /></label>
               <label>Banner image (optional)<input id="ee-banner" type="file" accept="image/png,image/jpeg,image/webp" /></label>
                                <img id="ee-preview" alt="" style="display:none;max-width:100%;border-radius:12px;" />
                <button type="button" id="ee-banner-clear" class="account-btn small danger" style="display:none;">Remove new image</button>
                <button type="submit" class="account-btn">Save changes</button>
                <a class="account-link" href="/Organiser/Dashboard">Cancel</a>
                                <p id="ee-msg" class="profile-msg"></p>
            </form>
        </div>
        <div class="profile-card create-card" style="margin-top:1.5rem;">
            <h3 style="margin-bottom:.75rem;">Categories</h3>
            <div id="ee-cat-list"></div>
            <form id="ee-cat-form" class="profile-form" style="margin-top:1rem;">
                <label>Category name<input id="ee-cat-name" type="text" required placeholder="e.g. Under 20, Senior, 21km" /></label>
                <div class="create-grid">
                    <label>Minimum age (optional)<input id="ee-cat-min" type="number" min="0" max="120" /></label>
                    <label>Maximum age (optional)<input id="ee-cat-max" type="number" min="0" max="120" /></label>
                    <label>Distance km (optional)<input id="ee-cat-dist" type="number" step="0.01" min="0" /></label>
                </div>
                <button type="submit" class="account-btn">Add category</button>
                <p id="ee-cat-msg" class="profile-msg"></p>
            </form>
        </div>`;

    document.getElementById("ee-name").value = ev.name ?? "";
    document.getElementById("ee-desc").value = ev.description ?? "";
    document.getElementById("ee-type").value = ev.eventType ?? "Run";
    document.getElementById("ee-date").value = String(ev.eventDate ?? "").substring(0, 16);
    document.getElementById("ee-dist").value = ev.distanceKm ?? "";
    document.getElementById("ee-loc").value = ev.location ?? "";
    if (ev.bannerImageUrl) {
        const prev = document.getElementById("ee-preview");
        prev.src = ev.bannerImageUrl;
        prev.style.display = "block";
    }
    setupCategories(eventId, ev.distanceKm);

    const eeInput = document.getElementById("ee-banner");
    const eePrev = document.getElementById("ee-preview");
    const eeClear = document.getElementById("ee-banner-clear");

    function restoreSavedBanner() {
        eeInput.value = "";
        eeClear.style.display = "none";
        if (ev.bannerImageUrl) {
            eePrev.src = ev.bannerImageUrl;
            eePrev.style.display = "block";
        } else {
            eePrev.removeAttribute("src");
            eePrev.style.display = "none";
        }
    }

    eeInput.addEventListener("change", e => {
        const f = e.target.files[0];
        if (!f) { restoreSavedBanner(); return; }
        eePrev.src = URL.createObjectURL(f);
        eePrev.style.display = "block";
        eeClear.style.display = "inline-block";
    });

    eeClear.addEventListener("click", restoreSavedBanner);

    document.getElementById("edit-form").addEventListener("submit", async e => {
        e.preventDefault();
        const msg = document.getElementById("ee-msg");
        const btn = e.target.querySelector("button[type=submit]");
        msg.style.color = "#b00020";
        msg.innerText = "";

        let dateVal = document.getElementById("ee-date").value;
        if (!dateVal) { msg.innerText = "Choose a date and time."; return; }
        if (dateVal.length === 16) dateVal += ":00";

        btn.disabled = true;
        try {
            const res = await apiFetch(`/api/events/${eventId}`, {
                method: "PUT",
                body: JSON.stringify({
                    name: document.getElementById("ee-name").value.trim(),
                    description: document.getElementById("ee-desc").value.trim(),
                    eventDate: dateVal,
                    location: document.getElementById("ee-loc").value.trim(),
                    distanceKm: Number(document.getElementById("ee-dist").value),
                    eventType: document.getElementById("ee-type").value,
                    
                })
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.message || "Could not update the event.");
            }

            const bannerFile = document.getElementById("ee-banner").files[0];
            if (bannerFile) await uploadImage(`/api/events/${eventId}/banner`, bannerFile);
            showToast("Event updated!");
            location.href = "/Organiser/Dashboard";
        } catch (ex) {
            msg.innerText = ex.message;
            btn.disabled = false;
        }
    });
}

function setupCategories(eventId, defaultDistance) {
    async function loadList() {
        const box = document.getElementById("ee-cat-list");
        const r = await apiFetch(`/api/events/${eventId}/categories`);
        if (!r.ok) {
            box.innerHTML = `<p class="account-meta">Could not load categories.</p>`;
            return;
        }
        const cats = await r.json();
        if (cats.length === 0) {
            box.innerHTML = `<p class="account-meta">No categories yet.</p>`;
            return;
        }
        box.innerHTML = cats.map(c => {
            const parts = [];
            if (c.distanceKm) parts.push(`${c.distanceKm} km`);
            if (c.minAge != null && c.maxAge != null) parts.push(`ages ${c.minAge}-${c.maxAge}`);
            else if (c.minAge != null) parts.push(`${c.minAge}+`);
            else if (c.maxAge != null) parts.push(`up to ${c.maxAge}`);
            return `
                <article class="account-card" style="margin-bottom:.5rem;">
                    <div>
                        <h3>${esc(c.name)}</h3>
                        <p class="account-meta">${esc(parts.join(" · ") || "No restrictions")}</p>
                    </div>
                    <div class="account-actions">
                        <button type="button" class="account-btn small danger" data-del-cat="${c.categoryId}">Delete</button>
                    </div>
                </article>`;
        }).join("");

        box.querySelectorAll("[data-del-cat]").forEach(btn =>
            btn.addEventListener("click", async () => {
                if (cats.length <= 1) {
                    showToast("An event needs at least one category.");
                    return;
                }
                if (!confirm("Delete this category?")) return;
                btn.disabled = true;
                const res = await apiFetch(`/api/categories/${btn.dataset.delCat}`, { method: "DELETE" });
                if (res.ok || res.status === 204) {
                    showToast("Category deleted.");
                    await loadList();
                } else {
                    const err = await res.json().catch(() => ({}));
                    showToast(err.message || "Could not delete the category.");
                    btn.disabled = false;
                }
            }));
    }

    document.getElementById("ee-cat-form").addEventListener("submit", async e => {
        e.preventDefault();
        const msg = document.getElementById("ee-cat-msg");
        const btn = e.target.querySelector("button[type=submit]");
        msg.style.color = "#b00020";
        msg.innerText = "";

        const name = document.getElementById("ee-cat-name").value.trim();
        const minVal = document.getElementById("ee-cat-min").value;
        const maxVal = document.getElementById("ee-cat-max").value;
        const distVal = document.getElementById("ee-cat-dist").value;
        const minAge = minVal === "" ? null : Number(minVal);
        const maxAge = maxVal === "" ? null : Number(maxVal);

        if (!name) { msg.innerText = "Enter a category name."; return; }
        if (minAge !== null && maxAge !== null && minAge > maxAge) {
            msg.innerText = "Minimum age cannot be higher than maximum age.";
            return;
        }

        btn.disabled = true;
        try {
            const r = await apiFetch(`/api/events/${eventId}/categories`, {
                method: "POST",
                body: JSON.stringify({
                    name,
                    minAge,
                    maxAge,
                    distanceKm: distVal === "" ? Number(defaultDistance) : Number(distVal)
                })
            });
            if (!r.ok) {
                const err = await r.json().catch(() => ({}));
                throw new Error(err.message || "Could not add the category.");
            }
            e.target.reset();
            showToast("Category added.");
            await loadList();
        } catch (ex) {
            msg.innerText = ex.message;
        } finally {
            btn.disabled = false;
        }
    });

    loadList();
}