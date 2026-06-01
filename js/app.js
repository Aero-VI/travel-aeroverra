// Travel Verification Tool - app.js
// Source of truth: data/trips.json and data/events.json
// DO NOT modify data files. Gap detection is script-side only.

let tripsData = [];
let eventsData = [];
let currentView = 'table';

// Helpers
const segIcon = t => ({Cruise:'🚢',Flight:'✈️',Train:'🚆',Bus:'🚌',Accommodation:'🏨'}[t]||'📍');
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '';
const fmtShort = d => d ? new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '';
const daysBetween = (a,b) => Math.round((new Date(b)-new Date(a))/(86400000));

function getSegStart(seg) {
    if (seg.DeparturePort && seg.DeparturePort.Time) return seg.DeparturePort.Time;
    if (seg.Departure && seg.Departure.Time) return seg.Departure.Time;
    if (seg.CheckInDate) return seg.CheckInDate;
    return null;
}
function getSegEnd(seg) {
    if (seg.ArrivalPort && seg.ArrivalPort.Time) return seg.ArrivalPort.Time;
    if (seg.Arrival && seg.Arrival.Time) return seg.Arrival.Time;
    if (seg.CheckOutDate) return seg.CheckOutDate;
    return null;
}
function getSegFrom(seg) {
    if (seg.DeparturePort) return `${seg.DeparturePort.City||''}, ${seg.DeparturePort.CountryCode||''}`;
    if (seg.Departure) return seg.Departure.Code ? `${seg.Departure.City} (${seg.Departure.Code})` : (seg.Departure.City||'');
    if (seg.City) return `${seg.City}, ${seg.CountryCode||''}`;
    return '';
}
function getSegTo(seg) {
    if (seg.ArrivalPort) return `${seg.ArrivalPort.City||''}, ${seg.ArrivalPort.CountryCode||''}`;
    if (seg.Arrival) return seg.Arrival.Code ? `${seg.Arrival.City} (${seg.Arrival.Code})` : (seg.Arrival.City||'');
    if (seg.City) return `${seg.City}, ${seg.CountryCode||''}`;
    return '';
}
function getSegDetail(seg) {
    switch(seg.SegmentType) {
        case 'Cruise': return `${seg.CruiseLine||''} ${seg.Ship||''}${seg.Stateroom ? ' ('+seg.Stateroom+')' : ''}`.trim();
        case 'Flight': return `${seg.Airline||''}${seg.FlightNumber ? ' '+seg.FlightNumber : ''}${seg.SeatClass ? ' - '+seg.SeatClass : ''}`.trim();
        case 'Train': return `${seg.Operator||''}${seg.TrainNumber ? ' '+seg.TrainNumber : ''}${seg.SeatClass ? ' - '+seg.SeatClass : ''}`.trim();
        case 'Bus': return `${seg.Operator||''} ${seg.Route||''}`.trim();
        case 'Accommodation': return seg.DisplayName||seg.City||'';
        default: return seg.SegmentType||'';
    }
}

function getTripDateRange(trip) {
    let min = null, max = null;
    for (const seg of trip.Segments||[]) {
        const s = getSegStart(seg), e = getSegEnd(seg);
        if (s && (!min || new Date(s) < new Date(min))) min = s;
        if (e && (!max || new Date(e) > new Date(max))) max = e;
    }
    return { start: min, end: max };
}

function getTripYear(trip) {
    const { start } = getTripDateRange(trip);
    return start ? new Date(start).getFullYear() : 'Unknown';
}

// Gap Detection - only flags genuinely missing data
function detectGaps(trips) {
    const gaps = { missingFields: [], timeGaps: [], missingBooking: [], inferredSegments: [] };

    for (const trip of trips) {
        for (const seg of trip.Segments||[]) {
            // Missing booking: only flag transport segments (not Accommodation)
            // HOME is a valid value for home stays
            if (seg.SegmentType !== 'Accommodation') {
                if (!seg.BookingNumber) {
                    gaps.missingBooking.push({ trip: trip.TripName, segment: getSegDetail(seg), type: seg.SegmentType });
                }
            }

            // Inferred source (only flag non-home-stays)
            if (seg.Source === 'inferred' && seg.BookingNumber !== 'HOME') {
                gaps.inferredSegments.push({ trip: trip.TripName, segment: getSegDetail(seg), type: seg.SegmentType });
            }

            // Missing start/end times
            const s = getSegStart(seg), e = getSegEnd(seg);
            if (!s && seg.SegmentType !== 'Accommodation') {
                gaps.missingFields.push({ trip: trip.TripName, segment: getSegDetail(seg), field: 'Start date/time' });
            }
            if (!e && seg.SegmentType !== 'Accommodation') {
                gaps.missingFields.push({ trip: trip.TripName, segment: getSegDetail(seg), field: 'End date/time' });
            }
        }

        // Time gaps between segments (>2 days)
        const sorted = [...(trip.Segments||[])].sort((a,b) => new Date(getSegStart(a)||0) - new Date(getSegStart(b)||0));
        for (let i = 0; i < sorted.length - 1; i++) {
            const end = getSegEnd(sorted[i]);
            const nextStart = getSegStart(sorted[i+1]);
            if (end && nextStart) {
                const gapDays = daysBetween(end, nextStart);
                if (gapDays > 2) {
                    gaps.timeGaps.push({
                        trip: trip.TripName,
                        after: getSegDetail(sorted[i]),
                        before: getSegDetail(sorted[i+1]),
                        days: gapDays,
                        fromDate: fmtShort(end),
                        toDate: fmtShort(nextStart)
                    });
                }
            }
        }
    }
    return gaps;
}

// Stats Bar
function renderStats(trips, events, gaps) {
    const bar = document.getElementById('stats-bar');
    const totalSegs = trips.reduce((n,t) => n + (t.Segments||[]).length, 0);
    const cruises = trips.reduce((n,t) => n + (t.Segments||[]).filter(s=>s.SegmentType==='Cruise').length, 0);
    const flights = trips.reduce((n,t) => n + (t.Segments||[]).filter(s=>s.SegmentType==='Flight').length, 0);
    const emailVerified = trips.reduce((n,t) => n + (t.Segments||[]).filter(s=>s.Source==='email').length, 0);
    const inferred = trips.reduce((n,t) => n + (t.Segments||[]).filter(s=>s.Source==='inferred').length, 0);
    const countries = new Set();
    trips.forEach(t => (t.Segments||[]).forEach(s => {
        if (s.DeparturePort?.CountryCode) countries.add(s.DeparturePort.CountryCode);
        if (s.ArrivalPort?.CountryCode) countries.add(s.ArrivalPort.CountryCode);
        if (s.Departure?.CountryCode) countries.add(s.Departure.CountryCode);
        if (s.Arrival?.CountryCode) countries.add(s.Arrival.CountryCode);
        if (s.CountryCode) countries.add(s.CountryCode);
        (s.PortsOfCall||[]).forEach(p => { if(p.CountryCode) countries.add(p.CountryCode); });
    }));

    const totalGaps = gaps.missingBooking.length + gaps.timeGaps.length + gaps.inferredSegments.length + gaps.missingFields.length;

    bar.innerHTML = `
        <div class="stat-pill"><span class="num">${trips.length}</span> Trips</div>
        <div class="stat-pill"><span class="num">${totalSegs}</span> Segments</div>
        <div class="stat-pill"><span class="num">${cruises}</span> Cruises</div>
        <div class="stat-pill"><span class="num">${flights}</span> Flights</div>
        <div class="stat-pill"><span class="num">${countries.size}</span> Countries</div>
        <div class="stat-pill"><span class="num">${events.length}</span> Events</div>
        <div class="stat-pill"><span class="num">${emailVerified}</span> Verified</div>
        <div class="stat-pill warning"><span class="num">${inferred}</span> Inferred</div>
        <div class="stat-pill ${totalGaps > 0 ? 'danger' : ''}"><span class="num">${totalGaps}</span> Gaps</div>
    `;
}

// Gap Alert Banner
function renderGapAlerts(gaps) {
    const el = document.getElementById('gap-alerts');
    const total = gaps.missingBooking.length + gaps.timeGaps.length + gaps.inferredSegments.length + gaps.missingFields.length;
    if (total === 0) { el.innerHTML = ''; return; }
    el.innerHTML = `
        <div class="gap-alert-banner" onclick="switchView('gaps')">
            ⚠️ ${total} gap${total!==1?'s':''} detected:
            ${gaps.missingBooking.length} missing booking refs,
            ${gaps.timeGaps.length} time gaps,
            ${gaps.inferredSegments.length} inferred segments,
            ${gaps.missingFields.length} missing fields
            — Click to review
        </div>
    `;
}

// Table View
function renderTable(trips, filter) {
    const wrapper = document.getElementById('table-wrapper');
    let filtered = [...trips];

    if (filter.year && filter.year !== 'all') {
        filtered = filtered.filter(t => String(getTripYear(t)) === filter.year);
    }
    if (filter.type && filter.type !== 'all') {
        filtered = filtered.filter(t => (t.Segments||[]).some(s => s.SegmentType === filter.type));
    }
    if (filter.source && filter.source !== 'all') {
        filtered = filtered.filter(t => (t.Segments||[]).some(s => s.Source === filter.source));
    }
    if (filter.search) {
        const q = filter.search.toLowerCase();
        filtered = filtered.filter(t => {
            const haystack = [t.TripName, t.TripId, ...(t.Segments||[]).map(s =>
                [getSegDetail(s), getSegFrom(s), getSegTo(s), s.BookingNumber||''].join(' ')
            )].join(' ').toLowerCase();
            return haystack.includes(q);
        });
    }

    // Sort descending (newest first)
    filtered.sort((a,b) => new Date(getTripDateRange(b).start||0) - new Date(getTripDateRange(a).start||0));

    let html = '';
    for (const trip of filtered) {
        const range = getTripDateRange(trip);
        const segTypes = [...new Set((trip.Segments||[]).map(s => s.SegmentType))];
        const hasInferred = (trip.Segments||[]).some(s => s.Source === 'inferred' && s.BookingNumber !== 'HOME');
        const hasMissingBooking = (trip.Segments||[]).some(s => !s.BookingNumber && s.SegmentType !== 'Accommodation');
        const tripClass = hasMissingBooking ? 'has-missing' : hasInferred ? 'has-gaps' : '';

        html += `<div class="trip-group ${tripClass}">`;
        html += `<div class="trip-header" onclick="this.parentElement.classList.toggle('expanded')">`;
        html += `<span class="expand-icon">▶</span>`;
        html += `<span class="trip-title">${trip.TripName}</span>`;
        html += `<span class="trip-badges">${segTypes.map(t => `<span class="badge badge-${t.toLowerCase()}">${t}</span>`).join('')}`;
        if (hasInferred) html += `<span class="badge badge-inferred">Inferred</span>`;
        if (hasMissingBooking) html += `<span class="badge badge-gap">Missing Data</span>`;
        html += `</span>`;
        html += `<span class="trip-dates">${fmtShort(range.start)} — ${fmtShort(range.end)}</span>`;
        html += `</div>`;

        html += `<div class="trip-body">`;
        html += `<div class="segment-header"><div>Date</div><div>Type</div><div>Detail</div><div>From</div><div>To</div><div>Source</div><div>Booking</div></div>`;

        const sorted = [...(trip.Segments||[])].sort((a,b) => new Date(getSegStart(a)||0) - new Date(getSegStart(b)||0));

        for (const seg of sorted) {
            const isInferred = seg.Source === 'inferred' && seg.BookingNumber !== 'HOME';
            const isMissing = !seg.BookingNumber && seg.SegmentType !== 'Accommodation';
            const rowClass = isMissing ? 'gap-row' : isInferred ? 'inferred' : '';

            html += `<div class="segment-row ${rowClass}">`;
            html += `<div class="seg-date" data-label="Date">${fmtShort(getSegStart(seg))}</div>`;
            html += `<div class="seg-type" data-label="Type"><span class="badge badge-${seg.SegmentType.toLowerCase()}">${segIcon(seg.SegmentType)} ${seg.SegmentType}</span></div>`;
            html += `<div class="seg-detail" data-label="Detail">${getSegDetail(seg)}</div>`;
            html += `<div class="seg-from" data-label="From">${getSegFrom(seg)}</div>`;
            html += `<div class="seg-to" data-label="To">${getSegTo(seg)}</div>`;
            html += `<div class="seg-source" data-label="Source"><span class="badge badge-${seg.Source||'manual'}">${seg.Source||'manual'}</span></div>`;
            html += `<div class="seg-ref" data-label="Booking">`;
            if (seg.BookingNumber) {
                html += seg.BookingNumber;
            } else if (seg.SegmentType === 'Accommodation') {
                html += '<span style="color:var(--text-muted)">N/A</span>';
            } else {
                html += '<span class="missing-field">MISSING</span>';
            }
            html += `</div>`;
            html += `</div>`;

            // Port calls for cruises
            if (seg.PortsOfCall && seg.PortsOfCall.length > 0) {
                html += `<div class="ports-row"><div class="port-list">`;
                for (const port of seg.PortsOfCall) {
                    html += `<span class="port-chip"><span class="port-date">${fmtShort(port.Date)}</span>${port.City}, ${port.CountryCode}</span>`;
                }
                html += `</div></div>`;
            }
        }

        // Events linked to this trip
        const tripEvents = eventsData.filter(e => e.TripId === trip.TripId);
        if (tripEvents.length > 0) {
            html += `<div class="ports-row" style="border-top:1px solid var(--border);padding-top:0.6rem;">`;
            html += `<strong style="color:var(--accent-purple);font-size:0.75rem;">📌 EVENTS (${tripEvents.length})</strong>`;
            html += `<div class="port-list" style="margin-top:0.3rem;">`;
            for (const evt of tripEvents) {
                html += `<span class="port-chip" style="border-color:rgba(179,136,255,0.3)"><span class="port-date">${fmtShort(evt.StartTime)}</span>${evt.Title}</span>`;
            }
            html += `</div></div>`;
        }

        html += `</div></div>`;
    }

    if (filtered.length === 0) {
        html = '<p style="text-align:center;color:var(--text-muted);padding:2rem;">No trips match filters</p>';
    }

    wrapper.innerHTML = html;
}

// Timeline View
function renderTimeline(trips) {
    const container = document.getElementById('timeline-container');

    // Group by year
    const byYear = {};
    for (const trip of trips) {
        const year = getTripYear(trip);
        if (!byYear[year]) byYear[year] = [];
        byYear[year].push(trip);
    }

    const years = Object.keys(byYear).sort((a,b) => b - a);

    let html = '';
    for (const year of years) {
        const yearTrips = byYear[year].sort((a,b) => new Date(getTripDateRange(b).start||0) - new Date(getTripDateRange(a).start||0));

        html += `<div class="timeline-year-group">`;
        html += `<div class="timeline-year-header">${year}</div>`;

        for (const trip of yearTrips) {
            const range = getTripDateRange(trip);
            const days = range.start && range.end ? daysBetween(range.start, range.end) : '?';
            const hasGaps = (trip.Segments||[]).some(s => s.Source === 'inferred' && s.BookingNumber !== 'HOME');
            const tripClass = hasGaps ? 'has-gaps' : '';

            html += `<div class="timeline-trip ${tripClass}">`;
            html += `<div class="timeline-trip-header" onclick="this.parentElement.classList.toggle('expanded')">`;
            html += `<span class="expand-icon">▶</span>`;
            html += `<span class="icon">${segIcon((trip.Segments||[])[0]?.SegmentType)}</span>`;
            html += `<span class="title">${trip.TripName}</span>`;
            html += `<span class="date-range">${fmtShort(range.start)} — ${fmtShort(range.end)} (${days}d)</span>`;
            html += `</div>`;

            html += `<div class="timeline-trip-body">`;

            // Home at start/end
            if (trip.HomeAtStart || trip.HomeAtEnd) {
                html += `<div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.5rem;">`;
                if (trip.HomeAtStart) html += `🏠 Start: ${trip.HomeAtStart}`;
                if (trip.HomeAtStart && trip.HomeAtEnd) html += ` → `;
                if (trip.HomeAtEnd) html += `End: ${trip.HomeAtEnd}`;
                html += `</div>`;
            }

            const sorted = [...(trip.Segments||[])].sort((a,b) => new Date(getSegStart(a)||0) - new Date(getSegStart(b)||0));

            for (const seg of sorted) {
                const bgColor = ({
                    Cruise: 'rgba(79,195,247,0.15)',
                    Flight: 'rgba(179,136,255,0.15)',
                    Train: 'rgba(244,143,177,0.15)',
                    Bus: 'rgba(255,183,77,0.15)',
                    Accommodation: 'rgba(102,187,106,0.15)'
                })[seg.SegmentType] || 'rgba(255,255,255,0.1)';

                html += `<div class="timeline-segment">`;
                html += `<div class="seg-icon" style="background:${bgColor}">${segIcon(seg.SegmentType)}</div>`;
                html += `<div class="seg-content">`;
                html += `<div class="seg-title">${getSegDetail(seg)}</div>`;
                html += `<div class="seg-meta">${fmtShort(getSegStart(seg))} — ${fmtShort(getSegEnd(seg))} · ${getSegFrom(seg)} → ${getSegTo(seg)}</div>`;
                html += `<div class="seg-meta">`;
                html += `<span class="badge badge-${seg.Source||'manual'}">${seg.Source||'manual'}</span> `;
                html += seg.BookingNumber ? `<span style="font-family:var(--font-mono);font-size:0.7rem;color:var(--text-muted);">${seg.BookingNumber}</span>` : '';
                html += `</div>`;

                if (seg.PortsOfCall && seg.PortsOfCall.length > 0) {
                    html += `<div style="margin-top:0.3rem;"><div class="port-list">`;
                    for (const port of seg.PortsOfCall) {
                        html += `<span class="port-chip"><span class="port-date">${fmtShort(port.Date)}</span>${port.City}, ${port.CountryCode}</span>`;
                    }
                    html += `</div></div>`;
                }

                html += `</div></div>`;
            }

            // Events
            const tripEvents = eventsData.filter(e => e.TripId === trip.TripId);
            if (tripEvents.length > 0) {
                html += `<div style="border-top:1px solid var(--border);padding-top:0.5rem;margin-top:0.3rem;">`;
                html += `<div style="font-size:0.75rem;font-weight:600;color:var(--accent-purple);margin-bottom:0.3rem;">📌 Events</div>`;
                for (const evt of tripEvents) {
                    html += `<div class="timeline-segment">`;
                    html += `<div class="seg-icon" style="background:rgba(179,136,255,0.15)">📌</div>`;
                    html += `<div class="seg-content">`;
                    html += `<div class="seg-title">${evt.Title}</div>`;
                    html += `<div class="seg-meta">${fmtDate(evt.StartTime)} · ${evt.City||''}, ${evt.CountryCode||''} · ${evt.EventType}</div>`;
                    if (evt.Notes) html += `<div class="seg-meta" style="margin-top:0.2rem;">${evt.Notes.substring(0,150)}${evt.Notes.length>150?'...':''}</div>`;
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

// Gaps View
function renderGaps(gaps) {
    const container = document.getElementById('gaps-container');
    let html = '';

    if (gaps.timeGaps.length > 0) {
        html += `<div class="gap-section"><h2>🕐 Time Gaps Between Segments (${gaps.timeGaps.length})</h2>`;
        for (const g of gaps.timeGaps.sort((a,b)=>b.days-a.days)) {
            html += `<div class="gap-card ${g.days > 5 ? 'critical' : 'warning'}">`;
            html += `<div class="gap-title">${g.trip}</div>`;
            html += `<div class="gap-detail">${g.days} day gap: ${g.fromDate} → ${g.toDate}</div>`;
            html += `<div class="gap-detail">After: ${g.after} | Before: ${g.before}</div>`;
            html += `</div>`;
        }
        html += `</div>`;
    }

    if (gaps.missingBooking.length > 0) {
        html += `<div class="gap-section"><h2>📋 Missing Booking References (${gaps.missingBooking.length})</h2>`;
        for (const g of gaps.missingBooking) {
            html += `<div class="gap-card warning">`;
            html += `<div class="gap-title">${g.segment || g.type}</div>`;
            html += `<div class="gap-detail">Trip: ${g.trip}</div>`;
            html += `</div>`;
        }
        html += `</div>`;
    }

    if (gaps.inferredSegments.length > 0) {
        html += `<div class="gap-section"><h2>🔮 Inferred Segments (${gaps.inferredSegments.length})</h2>`;
        for (const g of gaps.inferredSegments) {
            html += `<div class="gap-card warning">`;
            html += `<div class="gap-title">${g.segment || g.type}</div>`;
            html += `<div class="gap-detail">Trip: ${g.trip} · Source marked as "inferred" - needs verification</div>`;
            html += `</div>`;
        }
        html += `</div>`;
    }

    if (gaps.missingFields.length > 0) {
        html += `<div class="gap-section"><h2>❌ Missing Fields (${gaps.missingFields.length})</h2>`;
        for (const g of gaps.missingFields) {
            html += `<div class="gap-card critical">`;
            html += `<div class="gap-title">Missing: ${g.field}</div>`;
            html += `<div class="gap-detail">${g.segment} · Trip: ${g.trip}</div>`;
            html += `</div>`;
        }
        html += `</div>`;
    }

    if (html === '') {
        html = '<p style="text-align:center;color:var(--accent-green);padding:2rem;font-size:1.1rem;">✅ No gaps detected! All data looks complete.</p>';
    }

    container.innerHTML = html;
}

// View Switching
function switchView(view) {
    currentView = view;
    document.querySelectorAll('.toggle-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.view === view));
    document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
    document.getElementById(view + '-view').classList.add('active');
}

// Year Filter
function populateYearFilter(trips) {
    const select = document.getElementById('year-filter');
    const years = [...new Set(trips.map(t => getTripYear(t)))].sort((a,b) => b - a);
    for (const y of years) {
        const opt = document.createElement('option');
        opt.value = y;
        opt.textContent = y;
        select.appendChild(opt);
    }
}

// Filter state
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
        const [tripsRes, eventsRes] = await Promise.all([
            fetch('data/trips.json'),
            fetch('data/events.json')
        ]);
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

    // Event listeners
    document.querySelectorAll('.toggle-btn').forEach(btn => {
        btn.addEventListener('click', () => switchView(btn.dataset.view));
    });

    const rerender = () => renderTable(tripsData, getFilters());
    document.getElementById('search-input').addEventListener('input', rerender);
    document.getElementById('year-filter').addEventListener('change', rerender);
    document.getElementById('type-filter').addEventListener('change', rerender);
    document.getElementById('source-filter').addEventListener('change', rerender);
}

document.addEventListener('DOMContentLoaded', init);
