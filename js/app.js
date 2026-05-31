let trips = [];
let events = [];

async function init() {
    const [tripsRes, eventsRes] = await Promise.all([
        fetch('data/trips.json'),
        fetch('data/events.json')
    ]);
    trips = await tripsRes.json();
    events = await eventsRes.json();

    setupNav();
    renderTimeline();
    renderTable();
    renderGaps();
}

function setupNav() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(`${btn.dataset.view}-view`).classList.add('active');
        });
    });
}

// ============ HELPERS ============

function formatDate(isoStr) {
    if (!isoStr) return '—';
    const d = new Date(isoStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateShort(isoStr) {
    if (!isoStr) return '—';
    const d = new Date(isoStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getTripDateRange(trip) {
    const dates = [];
    for (const seg of trip.Segments || []) {
        const dep = seg.DeparturePort?.Time || seg.CheckIn;
        const arr = seg.ArrivalPort?.Time || seg.CheckOut;
        if (dep) dates.push(dep);
        if (arr) dates.push(arr);
    }
    if (dates.length === 0) return null;
    dates.sort();
    return { start: dates[0], end: dates[dates.length - 1] };
}

function getSegmentTypes(trip) {
    const types = new Set();
    for (const seg of trip.Segments || []) {
        types.add(seg.SegmentType);
    }
    return [...types];
}

function getTripEvents(tripId) {
    return events.filter(e => e.TripId === tripId);
}

function getGaps(trip) {
    const gaps = [];
    for (const seg of trip.Segments || []) {
        if (!seg.BookingNumber) {
            gaps.push({
                type: 'missing_booking',
                segment: seg,
                trip: trip
            });
        }
        if (seg.DeparturePort && !seg.DeparturePort.Time) {
            gaps.push({
                type: 'missing_departure_time',
                segment: seg,
                trip: trip
            });
        }
        if (seg.ArrivalPort && !seg.ArrivalPort.Time) {
            gaps.push({
                type: 'missing_arrival_time',
                segment: seg,
                trip: trip
            });
        }
    }
    const range = getTripDateRange(trip);
    if (!range && trip.Segments && trip.Segments.length > 0) {
        gaps.push({
            type: 'no_dates',
            trip: trip
        });
    }
    return gaps;
}

function segmentSummary(seg) {
    if (seg.SegmentType === 'Cruise') {
        const from = seg.DeparturePort?.City || '?';
        const to = seg.ArrivalPort?.City || '?';
        const ports = (seg.PortsOfCall || []).length;
        return `${seg.CruiseLine || ''} ${seg.Ship || ''} — ${from} → ${to}${ports ? ` (${ports} ports)` : ''}`;
    }
    if (seg.SegmentType === 'Flight') {
        const from = seg.DeparturePort?.City || seg.DeparturePort?.PortName || '?';
        const to = seg.ArrivalPort?.City || seg.ArrivalPort?.PortName || '?';
        return `${seg.Airline || ''} ${seg.FlightNumber || ''} — ${from} → ${to}`.trim();
    }
    if (seg.SegmentType === 'Accommodation') {
        return `${seg.HotelName || seg.PropertyName || 'Accommodation'} — ${seg.City || '?'}`;
    }
    if (seg.SegmentType === 'Train') {
        const from = seg.DeparturePort?.City || seg.DepartureStation || '?';
        const to = seg.ArrivalPort?.City || seg.ArrivalStation || '?';
        return `${seg.Operator || 'Train'} — ${from} → ${to}`;
    }
    if (seg.SegmentType === 'Bus') {
        const from = seg.DeparturePort?.City || '?';
        const to = seg.ArrivalPort?.City || '?';
        return `Bus — ${from} → ${to}`;
    }
    return seg.SegmentType || 'Unknown';
}

function segmentDateStr(seg) {
    const dep = seg.DeparturePort?.Time || seg.CheckIn;
    const arr = seg.ArrivalPort?.Time || seg.CheckOut;
    if (dep && arr) return `${formatDateShort(dep)} — ${formatDateShort(arr)}`;
    if (dep) return formatDateShort(dep);
    if (arr) return `→ ${formatDateShort(arr)}`;
    return '';
}

// ============ TIMELINE VIEW ============

function renderTimeline() {
    const container = document.getElementById('timeline-view');
    let html = '';

    for (const trip of trips) {
        const range = getTripDateRange(trip);
        const segTypes = getSegmentTypes(trip);
        const tripEvents = getTripEvents(trip.TripId);
        const tripGaps = getGaps(trip);

        html += `<div class="timeline-trip" data-trip="${trip.TripId}">`;
        html += `<div class="timeline-header" onclick="toggleTrip(this)">`;
        html += `<span class="arrow">▶</span>`;
        html += `<span class="trip-name">${trip.TripName}</span>`;
        html += `<span class="trip-dates">${range ? `${formatDateShort(range.start)} — ${formatDateShort(range.end)}` : '<span class="no-dates-tag">No dates</span>'}</span>`;
        html += `<span class="trip-badges">`;
        for (const t of segTypes) {
            html += `<span class="badge badge-${t.toLowerCase()}">${t}</span>`;
        }
        if (tripGaps.length > 0) {
            html += `<span class="badge badge-gap">${tripGaps.length} gap${tripGaps.length > 1 ? 's' : ''}</span>`;
        }
        html += `</span>`;
        html += `</div>`;

        html += `<div class="timeline-body">`;

        // Segments
        for (const seg of trip.Segments || []) {
            const isGap = !seg.BookingNumber;
            html += `<div class="segment-row${isGap ? ' gap-row' : ''}">`;
            html += `<span class="segment-type ${seg.SegmentType.toLowerCase()}">${seg.SegmentType}</span>`;
            html += `<span class="segment-detail">`;
            html += segmentSummary(seg);
            if (seg.SegmentType === 'Cruise' && seg.PortsOfCall && seg.PortsOfCall.length > 0) {
                html += `<div class="ports-list">Ports: ${seg.PortsOfCall.map(p => p.City || p.PortName).join(', ')}</div>`;
            }
            if (seg.BookingNumber) {
                html += `<div class="sub">Booking: ${seg.BookingNumber}${seg.Stateroom ? ' | Room: ' + seg.Stateroom : ''}</div>`;
            } else {
                html += `<div class="sub" style="color:var(--gap)">⚠ Missing booking number</div>`;
            }
            html += `</span>`;
            html += `<span class="segment-meta">${segmentDateStr(seg)}</span>`;
            html += `</div>`;
        }

        // Events for this trip
        if (tripEvents.length > 0) {
            html += `<div style="margin-top:0.6rem;padding-top:0.6rem;border-top:1px dashed var(--border)">`;
            html += `<div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.4rem;text-transform:uppercase;font-weight:600">Events</div>`;
            for (const ev of tripEvents) {
                html += `<div class="event-row">`;
                html += `<span class="segment-type" style="color:var(--${ev.EventType.toLowerCase()})">${ev.EventType}</span>`;
                html += `<span class="segment-detail">${ev.Title}<div class="sub">${ev.City || ''}${ev.CountryCode ? ' (' + ev.CountryCode + ')' : ''}</div></span>`;
                html += `<span class="segment-meta">${formatDateShort(ev.StartTime)}</span>`;
                html += `</div>`;
            }
            html += `</div>`;
        }

        html += `</div></div>`;
    }

    container.innerHTML = html;
}

function toggleTrip(header) {
    header.closest('.timeline-trip').classList.toggle('expanded');
}

// ============ TABLE VIEW ============

function renderTable() {
    const container = document.getElementById('table-view');
    let html = `<div class="table-container"><table>`;
    html += `<thead><tr>
        <th>Trip</th>
        <th>Type</th>
        <th>Summary</th>
        <th>Departure</th>
        <th>Arrival</th>
        <th>Booking #</th>
        <th>Source</th>
    </tr></thead><tbody>`;

    for (const trip of trips) {
        // Trip group header
        const range = getTripDateRange(trip);
        html += `<tr class="trip-group-header"><td colspan="7">${trip.TripName}${range ? ` <span style="font-weight:400;color:var(--text-muted);font-size:0.8rem">(${formatDateShort(range.start)} — ${formatDateShort(range.end)})</span>` : ''}</td></tr>`;

        for (const seg of trip.Segments || []) {
            const isGap = !seg.BookingNumber;
            html += `<tr class="${isGap ? 'gap-row' : ''}">`;
            html += `<td></td>`;
            html += `<td><span class="segment-type ${seg.SegmentType.toLowerCase()}">${seg.SegmentType}</span></td>`;
            html += `<td>${segmentSummary(seg)}</td>`;
            html += `<td>${seg.DeparturePort ? `${seg.DeparturePort.City || seg.DeparturePort.PortName || '—'}<br><span style="font-size:0.75rem;color:var(--text-muted)">${formatDate(seg.DeparturePort.Time)}</span>` : (seg.CheckIn ? formatDate(seg.CheckIn) : '—')}</td>`;
            html += `<td>${seg.ArrivalPort ? `${seg.ArrivalPort.City || seg.ArrivalPort.PortName || '—'}<br><span style="font-size:0.75rem;color:var(--text-muted)">${formatDate(seg.ArrivalPort.Time)}</span>` : (seg.CheckOut ? formatDate(seg.CheckOut) : '—')}</td>`;
            html += `<td>${seg.BookingNumber || '<span style="color:var(--gap)">MISSING</span>'}</td>`;
            html += `<td style="color:var(--text-muted)">${seg.Source || '—'}</td>`;
            html += `</tr>`;
        }
    }

    html += `</tbody></table></div>`;
    container.innerHTML = html;
}

// ============ GAPS VIEW ============

function renderGaps() {
    const container = document.getElementById('gaps-view');
    let allGaps = [];

    for (const trip of trips) {
        allGaps.push(...getGaps(trip));
    }

    // Group by type
    const missingBooking = allGaps.filter(g => g.type === 'missing_booking');
    const missingDep = allGaps.filter(g => g.type === 'missing_departure_time');
    const missingArr = allGaps.filter(g => g.type === 'missing_arrival_time');
    const noDates = allGaps.filter(g => g.type === 'no_dates');

    let html = `<div class="gap-summary">`;
    html += `<div class="gap-stat"><div class="num">${trips.length}</div><div class="label">Total Trips</div></div>`;
    html += `<div class="gap-stat"><div class="num">${trips.reduce((a, t) => a + (t.Segments?.length || 0), 0)}</div><div class="label">Total Segments</div></div>`;
    html += `<div class="gap-stat"><div class="num">${events.length}</div><div class="label">Events</div></div>`;
    html += `<div class="gap-stat warning"><div class="num">${allGaps.length}</div><div class="label">Total Gaps</div></div>`;
    html += `</div>`;

    // Missing booking numbers
    if (missingBooking.length > 0) {
        html += `<h2 style="margin:1rem 0 0.5rem;font-size:1rem;color:var(--gap)">⚠ Missing Booking Numbers (${missingBooking.length})</h2>`;
        for (const gap of missingBooking) {
            html += `<div class="gap-card">`;
            html += `<h3>${gap.segment.SegmentType}: ${segmentSummary(gap.segment)}</h3>`;
            html += `<p>Trip: ${gap.trip.TripName}</p>`;
            html += `</div>`;
        }
    }

    // No dates trips
    if (noDates.length > 0) {
        html += `<h2 style="margin:1.5rem 0 0.5rem;font-size:1rem;color:var(--gap)">⚠ Trips With No Dates (${noDates.length})</h2>`;
        for (const gap of noDates) {
            html += `<div class="gap-card">`;
            html += `<h3>${gap.trip.TripName}</h3>`;
            html += `<p>No segment has departure or arrival times set.</p>`;
            html += `</div>`;
        }
    }

    // Missing departure times
    if (missingDep.length > 0) {
        html += `<h2 style="margin:1.5rem 0 0.5rem;font-size:1rem;color:var(--flight)">⏱ Missing Departure Times (${missingDep.length})</h2>`;
        for (const gap of missingDep) {
            html += `<div class="gap-card" style="border-color:var(--flight);border-left-color:var(--flight)">`;
            html += `<h3 style="color:var(--flight)">${gap.segment.SegmentType}: ${segmentSummary(gap.segment)}</h3>`;
            html += `<p>Trip: ${gap.trip.TripName}</p>`;
            html += `</div>`;
        }
    }

    // Missing arrival times
    if (missingArr.length > 0) {
        html += `<h2 style="margin:1.5rem 0 0.5rem;font-size:1rem;color:var(--flight)">⏱ Missing Arrival Times (${missingArr.length})</h2>`;
        for (const gap of missingArr) {
            html += `<div class="gap-card" style="border-color:var(--flight);border-left-color:var(--flight)">`;
            html += `<h3 style="color:var(--flight)">${gap.segment.SegmentType}: ${segmentSummary(gap.segment)}</h3>`;
            html += `<p>Trip: ${gap.trip.TripName}</p>`;
            html += `</div>`;
        }
    }

    if (allGaps.length === 0) {
        html += `<div style="text-align:center;padding:3rem;color:var(--text-muted)">✅ No gaps detected. All segments have booking numbers and dates.</div>`;
    }

    container.innerHTML = html;
}

// Init
init();
