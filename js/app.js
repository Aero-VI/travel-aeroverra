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
    if (!isoStr) return '';
    const d = new Date(isoStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateShort(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDateTime(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// Universal getters that handle all segment types
function getDepTime(seg) {
    return seg.DeparturePort?.Time || seg.Departure?.Time || seg.CheckInDate || null;
}

function getArrTime(seg) {
    return seg.ArrivalPort?.Time || seg.Arrival?.Time || seg.CheckOutDate || null;
}

function getDepCity(seg) {
    if (seg.DeparturePort) return seg.DeparturePort.City || seg.DeparturePort.PortName || '';
    if (seg.Departure) return seg.Departure.City || '';
    if (seg.City) return seg.City;
    return '';
}

function getArrCity(seg) {
    if (seg.ArrivalPort) return seg.ArrivalPort.City || seg.ArrivalPort.PortName || '';
    if (seg.Arrival) return seg.Arrival.City || '';
    if (seg.City) return seg.City;
    return '';
}

function getDepCode(seg) {
    return seg.DeparturePort?.CountryCode || seg.Departure?.Code || '';
}

function getArrCode(seg) {
    return seg.ArrivalPort?.CountryCode || seg.Arrival?.Code || '';
}

function getDepLocation(seg) {
    if (seg.DeparturePort) {
        const city = seg.DeparturePort.City || seg.DeparturePort.PortName || '';
        const cc = seg.DeparturePort.CountryCode || '';
        return cc ? `${city}, ${cc}` : city;
    }
    if (seg.Departure) {
        const city = seg.Departure.City || '';
        const code = seg.Departure.Code || '';
        return code ? `${city} (${code})` : city;
    }
    if (seg.City) {
        return seg.CountryCode ? `${seg.City}, ${seg.CountryCode}` : seg.City;
    }
    return '';
}

function getArrLocation(seg) {
    if (seg.ArrivalPort) {
        const city = seg.ArrivalPort.City || seg.ArrivalPort.PortName || '';
        const cc = seg.ArrivalPort.CountryCode || '';
        return cc ? `${city}, ${cc}` : city;
    }
    if (seg.Arrival) {
        const city = seg.Arrival.City || '';
        const code = seg.Arrival.Code || '';
        return code ? `${city} (${code})` : city;
    }
    if (seg.City) {
        return seg.CountryCode ? `${seg.City}, ${seg.CountryCode}` : seg.City;
    }
    return '';
}

function getTripDateRange(trip) {
    const dates = [];
    for (const seg of trip.Segments || []) {
        const dep = getDepTime(seg);
        const arr = getArrTime(seg);
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

function segmentSummary(seg) {
    const from = getDepCity(seg) || '?';
    const to = getArrCity(seg) || '?';

    switch (seg.SegmentType) {
        case 'Cruise': {
            const ports = (seg.PortsOfCall || []).length;
            return `${seg.CruiseLine || ''} ${seg.Ship || ''}  -  ${from} \u2192 ${to}${ports ? ` (${ports} ports)` : ''}`;
        }
        case 'Flight': {
            const depCode = seg.Departure?.Code || '';
            const arrCode = seg.Arrival?.Code || '';
            const route = depCode && arrCode ? `${depCode} \u2192 ${arrCode}` : `${from} \u2192 ${to}`;
            return `${seg.Airline || ''} ${seg.FlightNumber || ''}  -  ${route}`.trim();
        }
        case 'Train': {
            return `${seg.Operator || 'Train'} ${seg.TrainNumber || ''}  -  ${from} \u2192 ${to}`.trim();
        }
        case 'Bus': {
            return `${seg.Operator || 'Bus'} ${seg.Route || ''}  -  ${from} \u2192 ${to}`.trim();
        }
        case 'Accommodation': {
            const name = seg.DisplayName || seg.HotelName || seg.PropertyName || 'Accommodation';
            const city = seg.City || '';
            return city ? `${name}  -  ${city}` : name;
        }
        default:
            return seg.SegmentType || 'Unknown';
    }
}

function segmentDateStr(seg) {
    const dep = getDepTime(seg);
    const arr = getArrTime(seg);
    if (dep && arr) return `${formatDateShort(dep)}  -  ${formatDateShort(arr)}`;
    if (dep) return formatDateShort(dep);
    if (arr) return `\u2192 ${formatDateShort(arr)}`;
    return '';
}

// Sort segments by departure time
function sortSegments(segments) {
    return [...(segments || [])].sort((a, b) => {
        const aTime = getDepTime(a) || '9999';
        const bTime = getDepTime(b) || '9999';
        return new Date(aTime) - new Date(bTime);
    });
}

// ============ GAP DETECTION ============

function getGaps(trip) {
    const gaps = [];
    for (const seg of trip.Segments || []) {
        // Missing booking number (accommodations with HOME are fine)
        if (!seg.BookingNumber) {
            gaps.push({ type: 'missing_booking', segment: seg, trip: trip });
        }
        // Missing departure time
        if (!getDepTime(seg)) {
            gaps.push({ type: 'missing_departure_time', segment: seg, trip: trip });
        }
        // Missing arrival time
        if (!getArrTime(seg)) {
            gaps.push({ type: 'missing_arrival_time', segment: seg, trip: trip });
        }
        // Inferred source
        if (seg.Source === 'inferred') {
            gaps.push({ type: 'inferred', segment: seg, trip: trip });
        }
    }

    // Time gaps between segments
    const sorted = sortSegments(trip.Segments);
    for (let i = 0; i < sorted.length - 1; i++) {
        const end = getArrTime(sorted[i]);
        const nextStart = getDepTime(sorted[i + 1]);
        if (end && nextStart) {
            const gapMs = new Date(nextStart) - new Date(end);
            const gapDays = Math.round(gapMs / 86400000);
            if (gapDays > 2) {
                gaps.push({
                    type: 'time_gap',
                    days: gapDays,
                    afterSeg: sorted[i],
                    beforeSeg: sorted[i + 1],
                    trip: trip
                });
            }
        }
    }

    return gaps;
}

// ============ TIMELINE VIEW ============

function renderTimeline() {
    const container = document.getElementById('timeline-view');
    let html = '';

    // Group by year
    const byYear = {};
    const sortedTrips = [...trips].sort((a, b) => { const aR = getTripDateRange(a); const bR = getTripDateRange(b); return new Date(bR?.start || 0) - new Date(aR?.start || 0); });
    for (const trip of sortedTrips) {
        const range = getTripDateRange(trip);
        const year = range ? new Date(range.start).getFullYear() : 'Unknown';
        if (!byYear[year]) byYear[year] = [];
        byYear[year].push(trip);
    }

    const years = Object.keys(byYear).sort((a, b) => b - a);

    for (const year of years) {
        html += `<div class="timeline-year"><h2 class="year-label">${year}</h2>`;

        // Sort trips within year by start date
        byYear[year].sort((a, b) => {
            const aR = getTripDateRange(a);
            const bR = getTripDateRange(b);
            return new Date(bR?.start || 0) - new Date(aR?.start || 0);
        });

        for (const trip of byYear[year]) {
            const range = getTripDateRange(trip);
            const segTypes = getSegmentTypes(trip);
            const tripEvents = getTripEvents(trip.TripId);
            const tripGaps = getGaps(trip);

            html += `<div class="timeline-trip">`;
            html += `<div class="timeline-header" onclick="toggleTrip(this)">`;
            html += `<span class="arrow">\u25B6</span>`;
            html += `<span class="trip-name">${trip.TripName}</span>`;
            html += `<span class="trip-dates">${range ? `${formatDateShort(range.start)}  -  ${formatDateShort(range.end)}` : '<span class="no-dates-tag">No dates</span>'}</span>`;
            html += `<span class="trip-badges">`;
            for (const t of segTypes) {
                html += `<span class="badge badge-${t.toLowerCase()}">${t}</span>`;
            }
            if (tripGaps.length > 0) {
                html += `<span class="badge badge-gap">${tripGaps.length} gap${tripGaps.length > 1 ? 's' : ''}</span>`;
            }
            html += `</span>`;
            html += `</div>`; // header

            html += `<div class="timeline-body">`;

            // Home info
            if (trip.HomeAtStart || trip.HomeAtEnd) {
                html += `<div class="home-info">`;
                if (trip.HomeAtStart) html += `<span>\uD83C\uDFE0 Home at start: <strong>${trip.HomeAtStart}</strong></span>`;
                if (trip.HomeAtStart && trip.HomeAtEnd) html += ` \u2192 `;
                if (trip.HomeAtEnd) html += `<span>\uD83C\uDFE0 Home at end: <strong>${trip.HomeAtEnd}</strong></span>`;
                html += `</div>`;
            }

            // Segments
            const sorted = sortSegments(trip.Segments);
            for (const seg of sorted) {
                const isGap = !seg.BookingNumber;
                const isInferred = seg.Source === 'inferred';

                html += `<div class="segment-row${isGap ? ' gap-highlight' : ''}${isInferred ? ' inferred-highlight' : ''}">`;
                html += `<div class="segment-type ${seg.SegmentType.toLowerCase()}">${seg.SegmentType}</div>`;
                html += `<div class="segment-detail">`;
                html += `<div>${segmentSummary(seg)}</div>`;

                // Ports of call for cruises
                if (seg.SegmentType === 'Cruise' && seg.PortsOfCall && seg.PortsOfCall.length > 0) {
                    html += `<div class="ports-list">Ports: ${seg.PortsOfCall.map(p => `${p.City || p.PortName}${p.CountryCode ? ' (' + p.CountryCode + ')' : ''}`).join(', ')}</div>`;
                }

                // Booking info
                if (seg.BookingNumber) {
                    html += `<div class="sub">Booking: <strong>${seg.BookingNumber}</strong>`;
                    if (seg.Stateroom) html += ` | Room: ${seg.Stateroom}`;
                    if (seg.RoomType) html += ` | ${seg.RoomType}`;
                    if (seg.SeatClass) html += ` | ${seg.SeatClass}`;
                    html += `</div>`;
                } else {
                    html += `<div class="sub" style="color:var(--gap)">\u26A0 Missing booking number</div>`;
                }

                // Source badge
                if (seg.Source) {
                    const srcColor = seg.Source === 'email' ? 'var(--accommodation)' : seg.Source === 'inferred' ? 'var(--flight)' : 'var(--text-muted)';
                    html += `<div class="sub">Source: <span style="color:${srcColor}">${seg.Source}</span></div>`;
                }

                html += `</div>`; // segment-detail
                html += `<div class="segment-meta">${segmentDateStr(seg)}</div>`;
                html += `</div>`; // segment-row
            }

            // Events for this trip
            if (tripEvents.length > 0) {
                html += `<div class="events-section">`;
                html += `<div class="events-label">\uD83D\uDCCC Events</div>`;
                for (const ev of tripEvents) {
                    html += `<div class="event-row">`;
                    html += `<div class="segment-type" style="color:var(--excursion)">${ev.EventType}</div>`;
                    html += `<div class="segment-detail">${ev.Title}${ev.City ? `  -  ${ev.City}` : ''}${ev.CountryCode ? ` (${ev.CountryCode})` : ''}</div>`;
                    html += `<div class="segment-meta">${formatDateShort(ev.StartTime)}</div>`;
                    html += `</div>`;
                }
                html += `</div>`;
            }

            html += `</div>`; // timeline-body
            html += `</div>`; // timeline-trip
        }

        html += `</div>`; // timeline-year
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
    html += `<thead><tr>`;
    html += `<th>Trip</th><th>Type</th><th>Summary</th><th>From</th><th>To</th><th>Departure</th><th>Arrival</th><th>Booking #</th><th>Source</th>`;
    html += `</tr></thead><tbody>`;

    const sortedTrips = [...trips].sort((a, b) => { const aR = getTripDateRange(a); const bR = getTripDateRange(b); return new Date(bR?.start || 0) - new Date(aR?.start || 0); });
    for (const trip of sortedTrips) {
        const range = getTripDateRange(trip);
        html += `<tr class="trip-group-header"><td colspan="9">${trip.TripName}${range ? ` (${formatDateShort(range.start)}  -  ${formatDateShort(range.end)})` : ''}</td></tr>`;

        const sorted = sortSegments(trip.Segments);
        for (const seg of sorted) {
            const isGap = !seg.BookingNumber;
            const isInferred = seg.Source === 'inferred';
            html += `<tr class="${isGap ? 'gap-row' : ''} ${isInferred ? 'inferred-row' : ''}">`;
            html += `<td></td>`;
            html += `<td><span class="badge badge-${seg.SegmentType.toLowerCase()}">${seg.SegmentType}</span></td>`;
            html += `<td>${segmentSummary(seg)}</td>`;
            html += `<td>${getDepLocation(seg)}</td>`;
            html += `<td>${getArrLocation(seg)}</td>`;
            html += `<td>${formatDateTime(getDepTime(seg)) || '<span style="color:var(--gap)">MISSING</span>'}</td>`;
            html += `<td>${formatDateTime(getArrTime(seg)) || '<span style="color:var(--gap)">MISSING</span>'}</td>`;
            html += `<td>${seg.BookingNumber || '<span style="color:var(--gap)">MISSING</span>'}</td>`;
            html += `<td>${seg.Source || ''}</td>`;
            html += `</tr>`;

            // Ports of call sub-rows for cruises
            if (seg.SegmentType === 'Cruise' && seg.PortsOfCall && seg.PortsOfCall.length > 0) {
                html += `<tr class="port-row"><td colspan="9"><div class="ports-list"><strong>Ports of Call:</strong> `;
                html += seg.PortsOfCall.map(p => `${p.City || p.PortName} (${p.CountryCode || '?'}) ${formatDateShort(p.Date)}`).join(' \u2192 ');
                html += `</div></td></tr>`;
            }
        }
    }

    html += `</tbody></table></div>`;
    container.innerHTML = html;
}

// ============ GAPS VIEW ============

function renderGaps() {
    const container = document.getElementById('gaps-view');
    let allGaps = [];
    const sortedTrips = [...trips].sort((a, b) => { const aR = getTripDateRange(a); const bR = getTripDateRange(b); return new Date(bR?.start || 0) - new Date(aR?.start || 0); });
    for (const trip of sortedTrips) {
        allGaps.push(...getGaps(trip));
    }

    const missingBooking = allGaps.filter(g => g.type === 'missing_booking');
    const missingDep = allGaps.filter(g => g.type === 'missing_departure_time');
    const missingArr = allGaps.filter(g => g.type === 'missing_arrival_time');
    const inferred = allGaps.filter(g => g.type === 'inferred');
    const timeGaps = allGaps.filter(g => g.type === 'time_gap');

    const totalSegments = trips.reduce((a, t) => a + (t.Segments?.length || 0), 0);
    const emailSegments = trips.reduce((a, t) => a + (t.Segments || []).filter(s => s.Source === 'email').length, 0);

    let html = `<div class="gap-summary">`;
    html += `<div class="gap-stat"><div class="num">${trips.length}</div><div class="label">Trips</div></div>`;
    html += `<div class="gap-stat"><div class="num">${totalSegments}</div><div class="label">Segments</div></div>`;
    html += `<div class="gap-stat"><div class="num">${emailSegments}</div><div class="label">Email Verified</div></div>`;
    html += `<div class="gap-stat"><div class="num">${events.length}</div><div class="label">Events</div></div>`;
    html += `<div class="gap-stat${allGaps.length > 0 ? ' warning' : ''}"><div class="num">${allGaps.length}</div><div class="label">Total Gaps</div></div>`;
    html += `</div>`;

    // Missing booking numbers
    if (missingBooking.length > 0) {
        html += `<h3 class="gap-section-title">\u26A0 Missing Booking Numbers (${missingBooking.length})</h3>`;
        for (const gap of missingBooking) {
            html += `<div class="gap-card">`;
            html += `<h3>${gap.segment.SegmentType}: ${segmentSummary(gap.segment)}</h3>`;
            html += `<p>Trip: ${gap.trip.TripName}</p>`;
            html += `<p>Dates: ${segmentDateStr(gap.segment)}</p>`;
            html += `</div>`;
        }
    }

    // Inferred segments
    if (inferred.length > 0) {
        html += `<h3 class="gap-section-title">\uD83D\uDD2E Inferred Segments (${inferred.length})</h3>`;
        for (const gap of inferred) {
            html += `<div class="gap-card">`;
            html += `<h3>${gap.segment.SegmentType}: ${segmentSummary(gap.segment)}</h3>`;
            html += `<p>Trip: ${gap.trip.TripName}</p>`;
            html += `<p>Source marked "inferred" - needs email or manual confirmation</p>`;
            html += `</div>`;
        }
    }

    // Time gaps
    if (timeGaps.length > 0) {
        html += `<h3 class="gap-section-title">\u23F0 Time Gaps Between Segments (${timeGaps.length})</h3>`;
        for (const gap of timeGaps) {
            html += `<div class="gap-card">`;
            html += `<h3>${gap.days} day gap</h3>`;
            html += `<p>After: ${segmentSummary(gap.afterSeg)}</p>`;
            html += `<p>Before: ${segmentSummary(gap.beforeSeg)}</p>`;
            html += `<p>Trip: ${gap.trip.TripName}</p>`;
            html += `</div>`;
        }
    }

    // Missing departure times
    if (missingDep.length > 0) {
        html += `<h3 class="gap-section-title">\u23F1 Missing Departure Times (${missingDep.length})</h3>`;
        for (const gap of missingDep) {
            html += `<div class="gap-card">`;
            html += `<h3>${gap.segment.SegmentType}: ${segmentSummary(gap.segment)}</h3>`;
            html += `<p>Trip: ${gap.trip.TripName}</p>`;
            html += `</div>`;
        }
    }

    // Missing arrival times
    if (missingArr.length > 0) {
        html += `<h3 class="gap-section-title">\u23F1 Missing Arrival Times (${missingArr.length})</h3>`;
        for (const gap of missingArr) {
            html += `<div class="gap-card">`;
            html += `<h3>${gap.segment.SegmentType}: ${segmentSummary(gap.segment)}</h3>`;
            html += `<p>Trip: ${gap.trip.TripName}</p>`;
            html += `</div>`;
        }
    }

    if (allGaps.length === 0) {
        html += `<div style="text-align:center;padding:3rem;color:var(--accommodation);font-size:1.2rem;">\u2705 No gaps detected. All segments have booking numbers and dates.</div>`;
    }

    container.innerHTML = html;
}

// Init
init();

// Render a single segment row (used by both table and connection views)
function renderSegRow(seg, isLeg) {
    const isInferred = seg.Source === 'inferred' && seg.BookingNumber !== 'HOME';
    const isMissing = !seg.BookingNumber && seg.SegmentType !== 'Accommodation';
    const rowClass = isMissing ? 'gap-row' : isInferred ? 'inferred-row' : '';
    const indent = isLeg ? ' leg-row' : '';

    let html = `<div class="seg-row ${rowClass}${indent}">`;
    html += `<div class="seg-date">${fmtShort(getSegStart(seg))}</div>`;
    html += `<div class="seg-type"><span class="badge badge-${seg.SegmentType.toLowerCase()}">${segIcon(seg.SegmentType)} ${seg.SegmentType}</span></div>`;
    html += `<div class="seg-detail">${getSegDetail(seg)}</div>`;
    html += `<div class="seg-from">${getSegFrom(seg)}</div>`;
    html += `<div class="seg-to">${getSegTo(seg)}</div>`;
    html += `<div class="seg-source"><span class="badge badge-${seg.Source||'manual'}">${seg.Source||'manual'}</span></div>`;
    html += `<div class="seg-ref">`;
    if (seg.BookingNumber) {
        html += `<span class="booking-ref">${seg.BookingNumber}</span>`;
    } else if (seg.SegmentType === 'Accommodation') {
        html += '<span class="text-muted">N/A</span>';
    } else {
        html += '<span class="missing-field">MISSING</span>';
    }
    html += `</div></div>`;
    return html;
}

// Render ports of call
function renderPorts(ports) {
    if (!ports || ports.length === 0) return '';
    let html = '<div class="ports-row"><div class="port-list">';
    for (const port of ports) {
        html += `<span class="port-chip"><span class="port-date">${fmtShort(port.Date)}</span>${port.City}, ${port.CountryCode}</span>`;
    }
    html += '</div></div>';
    return html;
}

// Render connection group (expandable)
function renderConnection(group) {
    const first = group.legs[0];
    const last = group.legs[group.legs.length - 1];
    const origin = getSegFrom(first);
    const dest = getSegTo(last);
    const stops = group.legs.length - 1;
    const icon = segIcon(group.segmentType);
    const isInferred = group.legs.some(l => l.Source === 'inferred');
    const isMissing = group.legs.some(l => !l.BookingNumber);
    const rowClass = isMissing ? 'gap-row' : isInferred ? 'inferred-row' : '';

    let html = `<div class="connection-group ${rowClass}">`;
    html += `<div class="connection-header" onclick="this.parentElement.classList.toggle('expanded')">`;
    html += `<span class="expand-icon">\u25B6</span>`;
    html += `<div class="seg-date">${fmtShort(getSegStart(first))}</div>`;
    html += `<div class="seg-type"><span class="badge badge-${group.segmentType.toLowerCase()}">${icon} ${group.segmentType}</span></div>`;
    html += `<div class="seg-detail">${getSegDetail(first)} + ${stops} connection${stops>1?'s':''}</div>`;
    html += `<div class="seg-from">${origin}</div>`;
    html += `<div class="seg-to">${dest}</div>`;
    html += `<div class="seg-source"><span class="badge badge-${first.Source||'manual'}">${first.Source||'manual'}</span></div>`;
    html += `<div class="seg-ref">`;
    const refs = [...new Set(group.legs.map(l => l.BookingNumber).filter(Boolean))];
    html += refs.length > 0 ? refs.map(r => `<span class="booking-ref">${r}</span>`).join(' ') : '<span class="missing-field">MISSING</span>';
    html += `</div></div>`;

    html += `<div class="connection-legs">`;
    for (const leg of group.legs) {
        html += renderSegRow(leg, true);
    }
    html += `</div></div>`;
    return html;
}

// Table View
function renderTable(trips, filter) {
    const wrapper = document.getElementById('table-wrapper');
    let filtered = [...trips];

    if (filter.year && filter.year !== 'all') filtered = filtered.filter(t => String(getTripYear(t)) === filter.year);
    if (filter.type && filter.type !== 'all') filtered = filtered.filter(t => (t.Segments||[]).some(s => s.SegmentType === filter.type));
    if (filter.source && filter.source !== 'all') filtered = filtered.filter(t => (t.Segments||[]).some(s => s.Source === filter.source));
    if (filter.search) {
        const q = filter.search.toLowerCase();
        filtered = filtered.filter(t => {
            const haystack = [t.TripName, t.TripId, ...(t.Segments||[]).map(s => [getSegDetail(s), getSegFrom(s), getSegTo(s), s.BookingNumber||''].join(' '))].join(' ').toLowerCase();
            return haystack.includes(q);
        });
    }
    filtered.sort((a,b) => new Date(getTripDateRange(a).start||0) - new Date(getTripDateRange(b).start||0));

    let html = '';
    for (const trip of filtered) {
        const range = getTripDateRange(trip);
        const segTypes = [...new Set((trip.Segments||[]).map(s => s.SegmentType))];
        const hasInferred = (trip.Segments||[]).some(s => s.Source === 'inferred' && s.BookingNumber !== 'HOME');
        const hasMissing = (trip.Segments||[]).some(s => !s.BookingNumber && s.SegmentType !== 'Accommodation');
        const tripClass = hasMissing ? 'has-missing' : hasInferred ? 'has-gaps' : '';

        html += `<div class="trip-group ${tripClass}">`;
        html += `<div class="trip-header" onclick="this.parentElement.classList.toggle('expanded')">`;
        html += `<span class="expand-icon">\u25B6</span>`;
        html += `<span class="trip-title">${trip.TripName}</span>`;
        html += `<span class="trip-badges">${segTypes.map(t => `<span class="badge badge-${t.toLowerCase()}">${t}</span>`).join('')}`;
        if (hasInferred) html += `<span class="badge badge-inferred">Inferred</span>`;
        if (hasMissing) html += `<span class="badge badge-gap">Missing Data</span>`;
        html += `</span>`;
        html += `<span class="trip-dates">${fmtShort(range.start)} to ${fmtShort(range.end)}</span>`;
        html += `</div>`;

        html += `<div class="trip-body">`;

        if (trip.HomeAtStart || trip.HomeAtEnd) {
            html += `<div class="home-info">`;
            if (trip.HomeAtStart) html += `Home start: <strong>${trip.HomeAtStart}</strong>`;
            if (trip.HomeAtStart && trip.HomeAtEnd) html += ` | `;
            if (trip.HomeAtEnd) html += `Home end: <strong>${trip.HomeAtEnd}</strong>`;
            html += `</div>`;
        }

        html += `<div class="seg-grid-header"><div>Date</div><div>Type</div><div>Detail</div><div>From</div><div>To</div><div>Source</div><div>Booking</div></div>`;

        const groups = groupConnections(trip.Segments||[]);

        for (const group of groups) {
            if (group.type === 'connection') {
                html += renderConnection(group);
            } else {
                const seg = group.seg;
                // Cruise: make expandable if it has ports
                if (seg.SegmentType === 'Cruise' && seg.PortsOfCall && seg.PortsOfCall.length > 0) {
                    html += `<div class="cruise-expandable">`;
                    html += `<div class="cruise-header" onclick="this.parentElement.classList.toggle('expanded')">`;
                    html += `<span class="expand-icon">\u25B6</span>`;
                    html += renderSegRow(seg, false).replace('<div class="seg-row', '<div class="seg-row-inner');
                    html += `</div>`;
                    html += `<div class="cruise-ports">`;
                    html += renderPorts(seg.PortsOfCall);
                    html += `</div></div>`;
                } else {
                    html += renderSegRow(seg, false);
                }
            }
        }

        // Events
        const tripEvents = eventsData.filter(e => e.TripId === trip.TripId);
        if (tripEvents.length > 0) {
            html += `<div class="events-section">`;
            html += `<div class="events-label">Events (${tripEvents.length})</div>`;
            for (const evt of tripEvents) {
                html += `<div class="event-chip"><span class="port-date">${fmtShort(evt.StartTime)}</span>${evt.Title} (${evt.City||''}, ${evt.CountryCode||''})</div>`;
            }
            html += `</div>`;
        }

        html += `</div></div>`;
    }

    if (filtered.length === 0) html = '<p class="empty-msg">No trips match filters</p>';
    wrapper.innerHTML = html;
}

// Timeline View
function renderTimeline(trips) {
    const container = document.getElementById('timeline-container');
    const byYear = {};
    for (const trip of trips) {
        const year = getTripYear(trip);
        if (!byYear[year]) byYear[year] = [];
        byYear[year].push(trip);
    }
    const years = Object.keys(byYear).sort((a,b) => b - a);

    let html = '';
    for (const year of years) {
        const yearTrips = byYear[year].sort((a,b) => new Date(getTripDateRange(a).start||0) - new Date(getTripDateRange(b).start||0));
        html += `<div class="timeline-year">`;
        html += `<div class="year-label" onclick="this.parentElement.classList.toggle('collapsed')">${year} <span class="year-count">(${yearTrips.length} trips)</span></div>`;

        for (const trip of yearTrips) {
            const range = getTripDateRange(trip);
            const days = range.start && range.end ? daysBetween(range.start, range.end) : '?';
            const hasGaps = (trip.Segments||[]).some(s => s.Source === 'inferred' && s.BookingNumber !== 'HOME');
            const tripClass = hasGaps ? 'has-gaps' : '';

            html += `<div class="timeline-trip ${tripClass}">`;
            html += `<div class="timeline-header" onclick="this.parentElement.classList.toggle('expanded')">`;
            html += `<span class="arrow">\u25B6</span>`;
            html += `<span class="trip-name">${trip.TripName}</span>`;
            html += `<span class="trip-badges">`;
            const segTypes = [...new Set((trip.Segments||[]).map(s => s.SegmentType))];
            html += segTypes.map(t => `<span class="badge badge-${t.toLowerCase()}">${segIcon(t)}</span>`).join('');
            html += `</span>`;
            html += `<span class="trip-dates">${fmtShort(range.start)} to ${fmtShort(range.end)} (${days}d)</span>`;
            html += `</div>`;

            html += `<div class="timeline-body">`;

            if (trip.HomeAtStart || trip.HomeAtEnd) {
                html += `<div class="home-info">`;
                if (trip.HomeAtStart) html += `Home start: <strong>${trip.HomeAtStart}</strong>`;
                if (trip.HomeAtStart && trip.HomeAtEnd) html += ` | `;
                if (trip.HomeAtEnd) html += `Home end: <strong>${trip.HomeAtEnd}</strong>`;
                html += `</div>`;
            }

            const groups = groupConnections(trip.Segments||[]);

            for (const group of groups) {
                if (group.type === 'connection') {
                    const first = group.legs[0], last = group.legs[group.legs.length-1];
                    const stops = group.legs.length - 1;
                    html += `<div class="tl-segment connection-tl" onclick="this.classList.toggle('expanded')">`;
                    html += `<div class="seg-icon" style="background:${getBgColor(group.segmentType)}">${segIcon(group.segmentType)}</div>`;
                    html += `<div class="seg-content">`;
                    html += `<div class="seg-title">${getSegFrom(first)} \u2192 ${getSegTo(last)} (${stops} stop${stops>1?'s':''})</div>`;
                    html += `<div class="seg-meta">${fmtShort(getSegStart(first))} to ${fmtShort(getSegEnd(last))}</div>`;
                    html += `<div class="connection-detail">`;
                    for (const leg of group.legs) {
                        html += `<div class="conn-leg">${segIcon(leg.SegmentType)} ${getSegDetail(leg)}: ${getSegFrom(leg)} \u2192 ${getSegTo(leg)} (${fmtShort(getSegStart(leg))})</div>`;
                    }
                    html += `</div>`;
                    html += `</div></div>`;
                } else {
                    const seg = group.seg;
                    const hasPorts = seg.SegmentType === 'Cruise' && seg.PortsOfCall && seg.PortsOfCall.length > 0;
                    html += `<div class="tl-segment${hasPorts ? ' has-ports' : ''}"${hasPorts ? ' onclick="this.classList.toggle(\'expanded\')"' : ''}>`;
                    html += `<div class="seg-icon" style="background:${getBgColor(seg.SegmentType)}">${segIcon(seg.SegmentType)}</div>`;
                    html += `<div class="seg-content">`;
                    html += `<div class="seg-title">${getSegDetail(seg)}</div>`;
                    html += `<div class="seg-meta">${fmtShort(getSegStart(seg))} to ${fmtShort(getSegEnd(seg))} | ${getSegFrom(seg)} \u2192 ${getSegTo(seg)}</div>`;
                    html += `<div class="seg-meta"><span class="badge badge-${seg.Source||'manual'}">${seg.Source||'manual'}</span> `;
                    html += seg.BookingNumber ? `<span class="booking-ref">${seg.BookingNumber}</span>` : '';
                    html += `</div>`;

                    if (hasPorts) {
                        html += `<div class="tl-ports">`;
                        for (const port of seg.PortsOfCall) {
                            html += `<span class="port-chip"><span class="port-date">${fmtShort(port.Date)}</span>${port.City}, ${port.CountryCode}</span>`;
                        }
                        html += `</div>`;
                    }
                    html += `</div></div>`;
                }
            }

            // Events
            const tripEvents = eventsData.filter(e => e.TripId === trip.TripId);
            if (tripEvents.length > 0) {
                html += `<div class="events-section">`;
                html += `<div class="events-label">Events</div>`;
                for (const evt of tripEvents) {
                    html += `<div class="tl-segment">`;
                    html += `<div class="seg-icon" style="background:rgba(236,72,153,0.15)">\u{1F4CC}</div>`;
                    html += `<div class="seg-content">`;
                    html += `<div class="seg-title">${evt.Title}</div>`;
                    html += `<div class="seg-meta">${fmtDate(evt.StartTime)} | ${evt.City||''}, ${evt.CountryCode||''} | ${evt.EventType}</div>`;
                    html += `</div></div>`;
                }
                html += `</div>`;
            }

            html += `</div></div>`;
        }
        html += `</div>`;
    }
    container.innerHTML = html;
}

function getBgColor(type) {
    return ({
        Cruise: 'rgba(59,130,246,0.15)',
        Flight: 'rgba(245,158,11,0.15)',
        Train: 'rgba(139,92,246,0.15)',
        Bus: 'rgba(239,68,68,0.15)',
        Accommodation: 'rgba(16,185,129,0.15)'
    })[type] || 'rgba(255,255,255,0.1)';
}

// Gaps View
function renderGaps(gaps) {
    const container = document.getElementById('gaps-container');
    let html = '';

    html += `<div class="gap-summary">`;
    html += `<div class="gap-stat${gaps.missingBooking.length?'  warning':''}"><div class="num">${gaps.missingBooking.length}</div><div class="label">Missing Booking</div></div>`;
    html += `<div class="gap-stat${gaps.timeGaps.length?' warning':''}"><div class="num">${gaps.timeGaps.length}</div><div class="label">Time Gaps</div></div>`;
    html += `<div class="gap-stat${gaps.inferredSegments.length?' warning':''}"><div class="num">${gaps.inferredSegments.length}</div><div class="label">Inferred</div></div>`;
    html += `<div class="gap-stat${gaps.missingFields.length?' warning':''}"><div class="num">${gaps.missingFields.length}</div><div class="label">Missing Fields</div></div>`;
    html += `</div>`;

    if (gaps.missingBooking.length > 0) {
        html += `<div class="gap-section-title">Missing Booking References (${gaps.missingBooking.length})</div>`;
        for (const g of gaps.missingBooking) {
            html += `<div class="gap-card"><h3>${g.type}: ${g.segment}</h3><p>Trip: ${g.trip}</p></div>`;
        }
    }
    if (gaps.timeGaps.length > 0) {
        html += `<div class="gap-section-title">Time Gaps Between Segments (${gaps.timeGaps.length})</div>`;
        for (const g of gaps.timeGaps.sort((a,b)=>b.days-a.days)) {
            html += `<div class="gap-card"><h3>${g.days} day gap in ${g.trip}</h3><p>${g.fromDate} to ${g.toDate}<br>After: ${g.after}<br>Before: ${g.before}</p></div>`;
        }
    }
    if (gaps.inferredSegments.length > 0) {
        html += `<div class="gap-section-title">Inferred Segments (${gaps.inferredSegments.length})</div>`;
        for (const g of gaps.inferredSegments) {
            html += `<div class="gap-card"><h3>${g.type}: ${g.segment}</h3><p>Trip: ${g.trip} | Source: inferred (needs verification)</p></div>`;
        }
    }
    if (gaps.missingFields.length > 0) {
        html += `<div class="gap-section-title">Missing Fields (${gaps.missingFields.length})</div>`;
        for (const g of gaps.missingFields) {
            html += `<div class="gap-card"><h3>Missing: ${g.field}</h3><p>${g.segment} | Trip: ${g.trip}</p></div>`;
        }
    }
    if (!gaps.missingBooking.length && !gaps.timeGaps.length && !gaps.inferredSegments.length && !gaps.missingFields.length) {
        html = '<p class="empty-msg" style="color:var(--accommodation)">All data looks complete. No gaps detected.</p>';
    }
    container.innerHTML = html;
}

// View Switching
function switchView(view) {
    currentView = view;
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.view === view));
    document.querySelectorAll('.view').forEach(p => p.classList.remove('active'));
    document.getElementById(view + '-view').classList.add('active');
}

function populateYearFilter(trips) {
    const select = document.getElementById('year-filter');
    const years = [...new Set(trips.map(t => getTripYear(t)))].sort((a,b) => b - a);
    for (const y of years) {
        const opt = document.createElement('option');
        opt.value = y; opt.textContent = y;
        select.appendChild(opt);
    }
}

function getFilters() {
    return {
        search: document.getElementById('search-input').value,
        year: document.getElementById('year-filter').value,
        type: document.getElementById('type-filter').value,
        source: document.getElementById('source-filter').value
    };
}

// Init
async function init() {
    try {
        const [tripsRes, eventsRes] = await Promise.all([fetch('data/trips.json'), fetch('data/events.json')]);
        tripsData = await tripsRes.json();
        eventsData = await eventsRes.json();
    } catch(e) {
        console.error('Failed to load data:', e);
        document.getElementById('stats-bar').innerHTML = '<div class="stat-pill danger"><span class="num">ERROR</span> Failed to load data files</div>';
        return;
    }

    const gaps = detectGaps(tripsData);
    renderStats(tripsData, eventsData, gaps);
    renderGapAlerts(gaps);
    renderTable(tripsData, getFilters());
    renderTimeline(tripsData);
    renderGaps(gaps);
    populateYearFilter(tripsData);

    document.querySelectorAll('.nav-btn').forEach(btn => btn.addEventListener('click', () => switchView(btn.dataset.view)));
    const rerender = () => renderTable(tripsData, getFilters());
    document.getElementById('search-input').addEventListener('input', rerender);
    document.getElementById('year-filter').addEventListener('change', rerender);
    document.getElementById('type-filter').addEventListener('change', rerender);
    document.getElementById('source-filter').addEventListener('change', rerender);
}

document.addEventListener('DOMContentLoaded', init);
