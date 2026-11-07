document.addEventListener("DOMContentLoaded", () => {

    if (typeof window.eventId !== 'undefined') {
        loadMapAndRoute(window.eventId);
        loadWeather(window.eventId);
        loadResults(window.eventId);
    }

    if (typeof window.eventDateStr !== 'undefined') {
        startCountdown(window.eventDateStr, window.eventEndStr);
    }
});

function startCountdown(dateString, endString) {
    const eventDate = new Date(dateString);
    const eventEnd = new Date(endString);
    const label = document.getElementById('countdown-label');

    function updateCountdown() {
        const now = new Date().getTime();
        const distance = eventDate.getTime() - now;
        const el = document.getElementById('countdown');

        if (!el) return;

        if (now >= eventEnd.getTime()) {
            const ago = now - eventEnd.getTime();
            const d = Math.floor(ago / (1000 * 60 * 60 * 24));
            const h = Math.floor((ago % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

            if (label) label.innerText = "Took Place:";
            el.innerText = d > 0
                ? `Event Ended ${d} day${d === 1 ? '' : 's'} ago`
                : h > 0
                    ? `Event Ended ${h} hour${h === 1 ? '' : 's'} ago`
                    : "Event Ended Just Now";
            return;
        }

        if (distance < 0) {
            if (label) label.innerText = "Live Now:";
            el.innerText = "Event Has Started!";
            return;
        }

        const days = Math.floor(distance / (1000 * 60 * 60 * 24));
        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);

        el.innerText = `${days}d ${hours}h ${minutes}m ${seconds}s`;
    }

    setInterval(updateCountdown, 1000);
    updateCountdown();
}

async function loadMapAndRoute(id) {
    try {

        const response = await fetch(`https://localhost:7228/api/events/${id}/route`);

        if (!response.ok) {
            throw new Error("Route data not found");
        }

        const data = await response.json();

        const startLat = Number(data.startLatitude);
        const startLng = Number(data.startLongitude);

        const map = L.map("map").setView(
            [startLat, startLng],
            13
        );

        const streets = L.tileLayer(
            "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
            {
                maxZoom: 19,
                attribution: "&copy; OpenStreetMap contributors"
            }
        ).addTo(map);

        const satellite = L.tileLayer(
            "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
            {
                maxZoom: 19,
                attribution: "Tiles &copy; Esri"
            }
        );

        L.control.layers({
            "Map": streets,
            "Satellite": satellite
        }).addTo(map);

        map.on("click", e =>
            console.log(
                `${e.latlng.lat.toFixed(6)}, ${e.latlng.lng.toFixed(6)}`
            )
        );

        const sortedWaypoints = (data.waypoints || [])
            .filter(wp =>
                wp.latitude != null &&
                wp.longitude != null
            )
            .sort((a, b) =>
                a.sequenceNo - b.sequenceNo
            );

        if (sortedWaypoints.length === 0) {
            throw new Error("No route waypoints found.");
        }

        const points = sortedWaypoints.map(wp => [
            Number(wp.latitude),
            Number(wp.longitude)
        ]);

        const finishPoint =
            points[points.length - 1];

        const makeIcon = (label, color) =>
            L.divIcon({
                className: "",
                iconSize: [0, 0],
                html: `
                    <div style="
                        background:${color};
                        color:#fff;
                        font-weight:700;
                        font-size:12px;
                        padding:4px 10px;
                        border-radius:14px;
                        border:2px solid #fff;
                        box-shadow:0 2px 6px rgba(0,0,0,.4);
                        white-space:nowrap;
                        transform:translate(-50%,-50%);
                    ">
                        ${label}
                    </div>`
            });

        const addEndMarkers = (from, to) => {
            L.marker(from, {
                icon: makeIcon("START", "#00c853")
            }).addTo(map);

            L.marker(to, {
                icon: makeIcon("FINISH", "#d50000")
            }).addTo(map);
        };

        const routeStyle = {
            color: "#ff3d00",
            weight: 5,
            opacity: 1
        };

        const coords = points
            .map(p => `${p[1]},${p[0]}`)
            .join(";");

        const url =
            `https://routing.openstreetmap.de/routed-foot/route/v1/foot/${coords}?overview=full&geometries=geojson&continue_straight=true`;

        try {

            const routeResponse =
                await fetch(url);

            const routeData =
                await routeResponse.json();

            if (routeData.code !== "Ok") {
                throw new Error(routeData.code);
            }

            const line =
                routeData.routes[0]
                    .geometry.coordinates
                    .map(c => [c[1], c[0]]);

            const polyline =
                L.polyline(line, routeStyle)
                    .addTo(map);

            addEndMarkers(
                line[0],
                line[line.length - 1]
            );

            map.fitBounds(
                polyline.getBounds()
            );

            console.log(
                "OSRM route successfully loaded."
            );

            console.log(
                "Routed distance (km):",
                (
                    routeData.routes[0].distance /
                    1000
                ).toFixed(2)
            );

        } catch (routeError) {

            console.error(
                "Routing failed, drawing straight lines:",
                routeError
            );

            const polyline =
                L.polyline(points, routeStyle)
                    .addTo(map);

            addEndMarkers(
                points[0],
                finishPoint
            );

            map.fitBounds(
                polyline.getBounds()
            );
        }

    } catch (error) {

        console.error(
            "Error loading map:",
            error
        );

        document.getElementById("map").innerHTML =
            "<p style='padding:2rem; text-align:center;'>Map data unavailable.</p>";
    }
}

async function loadWeather(id) {
    try {
        const response = await fetch(`https://localhost:7228/api/WeatherForecast/events/${id}`);

        if (!response.ok) throw new Error("Weather data not found");

        const data = await response.json();

        document.getElementById('weather-temp').innerText = Math.round(data.main.temp);
        document.getElementById('weather-desc').innerText = data.weather[0].description;
        document.getElementById('weather-humidity').innerText = data.main.humidity + '%';
        document.getElementById('weather-wind').innerText = data.wind.speed + ' km/h';
        document.getElementById('weather-location').innerText = data.name || 'Event Location';

        const iconCode = data.weather[0].icon;
        document.getElementById('weather-icon').src = `https://openweathermap.org/img/wn/${iconCode}@2x.png`;

    } catch (error) {
        console.error("Error loading weather:", error);
        document.getElementById('weather-desc').innerText = "Weather info currently unavailable.";
    }
}

async function loadResults(id) {
    const body = document.getElementById("results-body");
    if (!body) return;

    try {
        const response = await fetch(`https://localhost:7228/api/events/${id}/results`);

        if (!response.ok) throw new Error("Results not found");

        const results = await response.json();
        body.innerHTML = "";

        if (results.length === 0) {
            body.innerHTML = "<tr><td colspan='3'>No results have been published for this event yet.</td></tr>";
            return;
        }

        results
            .sort((a, b) => a.finishPosition - b.finishPosition)
            .forEach(r => {

                const row = document.createElement("tr");

                if (r.finishPosition === 1)
                    row.classList.add("rank-1");
                else if (r.finishPosition === 2)
                    row.classList.add("rank-2");
                else if (r.finishPosition === 3)
                    row.classList.add("rank-3");

                const posCell = document.createElement("td");
                posCell.textContent = r.finishPosition;

                const nameCell = document.createElement("td");
                nameCell.textContent = r.participantName ?? "Unknown";

                const timeCell = document.createElement("td");
                timeCell.textContent = r.finishTime;

                row.appendChild(posCell);
                row.appendChild(nameCell);
                row.appendChild(timeCell);

                body.appendChild(row);
            });

    } catch (error) {
        console.error("Error loading results:", error);
        body.innerHTML = "<tr><td colspan='3'>Results currently unavailable.</td></tr>";
    }
}