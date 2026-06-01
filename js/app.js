// Travel Verification Tool - Complete Rewrite
// Source of truth: data/trips.json and data/events.json
// DO NOT modify data files. All gap detection is script-side only.

let tripsData = [];
let eventsData = [];
let currentView = 'table';

// ==================== COUNTRY CODE MAP ====================
const COUNTRIES = {
    AU:'Australia',BS:'Bahamas',CA:'Canada',CO:'Colombia',CR:'Costa Rica',
    DE:'Germany',DK:'Denmark',DO:'Dominican Republic',EE:'Estonia',ES:'Spain',
    FI:'Finland',FR:'France',GB:'United Kingdom',GI:'Gibraltar',GR:'Greece',
    GU:'Guam',ID:'Indonesia',IE:'Ireland',IS:'Iceland',IT:'Italy',JP:'Japan',
    KR:'South Korea',KY:'Cayman Islands',LV:'Latvia',MX:'Mexico',MY:'Malaysia',
    NL:'Netherlands',NO:'Norway',PA:'Panama',PH:'Philippines',PL:'Poland',
    PR:'Puerto Rico',PT:'Portugal',SE:'Sweden',SG:'Singapore',SX:'Sint Maarten',
    TC:'Turks & Caicos',TR:'Turkey',US:'United States',VI:'US Virgin Islands',
    VN:'Vietnam',HK:'Hong Kong',TW:'Taiwan',TH:'Thailand',NZ:'New Zealand',
    CN:'China',IN:'India',AE:'UAE',BR:'Brazil',AR:'Argentina',CL:'Chile',
    PE:'Peru',EC:'Ecuador',JM:'Jamaica',HT:'Haiti',CU:'Cuba',BZ:'Belize',
    HN:'Honduras',GT:'Guatemala',SV:'El Salvador',NI:'Nicaragua',BB:'Barbados',
    TT:'Trinidad & Tobago',AW:'Aruba',CW:'Curacao',BM:'Bermuda',LC:'Saint Lucia',
    AG:'Antigua & Barbuda',KN:'Saint Kitts & Nevis',DM:'Dominica',GD:'Grenada',
    VC:'St. Vincent & Grenadines',MT:'Malta',CY:'Cyprus',HR:'Croatia',ME:'Montenegro',
    AL:'Albania',MK:'North Macedonia',RS:'Serbia',BA:'Bosnia & Herzegovina',
    SI:'Slovenia',SK:'Slovakia',CZ:'Czech Republic',HU:'Hungary',RO:'Romania',
    BG:'Bulgaria',LT:'Lithuania',UA:'Ukraine',BY:'Belarus',MD:'Moldova',
    AT:'Austria',CH:'Switzerland',BE:'Belgium',LU:'Luxembourg',MC:'Monaco',
    LI:'Liechtenstein',SM:'San Marino',VA:'Vatican City',AD:'Andorra'
};
function countryName(code) { return code ? (COUNTRIES[code] || code) : ''; }

// ==================== HELPERS ====================
function esc(s) { if (!s) return ''; const d=document.createElement('div'); d.textContent=s; return d.innerHTML; }
const segIcon = t => ({Cruise:'\u{1F6A2}',Flight:'\u2708\uFE0F',Train:'\u{1F686}',Bus:'\u{1F68C}',Accommodation:'\u{1F3E8}'}[t]||'\u{1F4CD}');
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '';
const fmtShort = d => d ? new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '';
const fmtTime = d => d ? new Date(d).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}) : '';
const daysBetween = (a,b) => { const ms = new Date(b)-new Date(a); return Math.round(ms/86400000); };

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
    if (seg.DeparturePort) {
        const p = seg.DeparturePort;
        return p.City || p.PortName || '';
    }
    if (seg.Departure) {
        const d = seg.Departure;
        return d.Code ? d.City + ' (' + d.Code + ')' : (d.City || '');
    }
    if (seg.City) return seg.City;
    return '';
}
function getSegTo(seg) {
    if (seg.ArrivalPort) {
        const p = seg.ArrivalPort;
        return p.City || p.PortName || '';
    }
    if (seg.Arrival) {
        const a = seg.Arrival;
        return a.Code ? a.City + ' (' + a.Code + ')' : (a.City || '');
    }
    if (seg.City) return seg.City;
    return '';
}
function getSegFromCountry(seg) {
    if (seg.DeparturePort) return seg.DeparturePort.CountryCode || '';
    if (seg.Departure) return seg.Departure.CountryCode || '';
    return seg.CountryCode || '';
}
function getSegToCountry(seg) {
    if (seg.ArrivalPort) return seg.ArrivalPort.CountryCode || '';
    if (seg.Arrival) return seg.Arrival.CountryCode || '';
    return seg.CountryCode || '';
}
function getSegDetail(seg) {
    switch(seg.SegmentType) {
        case 'Cruise': return (seg.CruiseLine||'') + ' ' + (seg.Ship||'');
        case 'Flight': return (seg.Airline||'') + (seg.FlightNumber ? ' '+seg.FlightNumber : '');
        case 'Train': return (seg.Operator||'') + (seg.TrainNumber ? ' '+seg.TrainNumber : '');
        case 'Bus': return (seg.Operator||'') + ' ' + (seg.Route||'');
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
    return start ? new Date(start).getFullYear() : 9999;
}
function getTripEvents(tripId) { return eventsData.filter(e => e.TripId === tripId); }

// Location display with full country name
function locationDisplay(city, countryCode, province) {
    let parts = [city];
    if (province) parts.push(province);
    if (countryCode) parts.push(countryName(countryCode));
    return parts.filter(Boolean).join(', ');
}

// Port display: show City if different from PortName, always show full country
function portDisplay(port) {
    let name = port.PortName || '';
    let city = port.City || '';
    let country = countryName(port.CountryCode);
    // If city differs from port name, show both
    if (city && city !== name) {
        return name + ' (' + city + '), ' + country;
    }
    return (name || city) + ', ' + country;
}


// ==================== JSON VIEWER POPUP ====================
function showJsonPopup(data) {
    // Remove any existing popup
    const existing = document.getElementById('json-popup-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'json-popup-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

    const popup = document.createElement('div');
    popup.style.cssText = 'background:#161b22;border:1px solid #30363d;border-radius:12px;padding:20px;max-width:700px;width:90%;max-height:80vh;overflow:auto;position:relative;';

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '\u2715';
    closeBtn.style.cssText = 'position:absolute;top:10px;right:14px;background:none;border:none;color:#8b949e;font-size:1.3rem;cursor:pointer;';
    closeBtn.onclick = () => overlay.remove();

    const pre = document.createElement('pre');
    pre.style.cssText = 'color:#e6edf3;font-size:0.82rem;white-space:pre-wrap;word-break:break-word;font-family:monospace;margin:0;';
    pre.textContent = JSON.stringify(data, null, 2);

    popup.appendChild(closeBtn);
    popup.appendChild(pre);
    overlay.appendChild(popup);
    document.body.appendChild(overlay);
}

// JSON button HTML - attach data index for lookup
function jsonBtnHTML(tripIdx, segIdx) {
    return '<button class="json-btn" data-trip="' + tripIdx + '" data-seg="' + segIdx + '" title="View JSON">{}</button>';
}
function jsonBtnTripHTML(tripIdx) {
    return '<button class="json-btn json-btn-trip" data-trip="' + tripIdx + '" data-seg="-1" title="View Trip JSON">{}</button>';
}
function jsonBtnEventHTML(eventIdx) {
    return '<button class="json-btn" data-event="' + eventIdx + '" title="View Event JSON">{}</button>';
}

function attachJsonListeners() {
    document.querySelectorAll('.json-btn').forEach(btn => {
        btn.onclick = function(e) {
            e.stopPropagation();
            const eventIdx = this.getAttribute('data-event');
            if (eventIdx !== null && eventIdx !== undefined && eventIdx !== '') {
                showJsonPopup(eventsData[parseInt(eventIdx)]);
                return;
            }
            const tripIdx = parseInt(this.getAttribute('data-trip'));
            const segIdx = parseInt(this.getAttribute('data-seg'));
            if (segIdx === -1) {
                showJsonPopup(tripsData[tripIdx]);
            } else {
                showJsonPopup(tripsData[tripIdx].Segments[segIdx]);
            }
        };
    });
}

// ==================== GROUPING LOGIC ====================
// Group flights with same booking number as connections
// Group back-to-back trains (within 3 hours) as connections
function groupSegments(segments) {
    const groups = [];
    const used = new Set();

    for (let i = 0; i < segments.length; i++) {
        if (used.has(i)) continue;
        const seg = segments[i];

        if (seg.SegmentType === 'Flight' && seg.BookingNumber) {
            const connected = [{seg, idx: i}];
            used.add(i);
            for (let j = i + 1; j < segments.length; j++) {
                if (used.has(j)) continue;
                if (segments[j].SegmentType === 'Flight' && segments[j].BookingNumber === seg.BookingNumber) {
                    connected.push({seg: segments[j], idx: j});
                    used.add(j);
                }
            }
            if (connected.length > 1) {
                connected.sort((a,b) => new Date(getSegStart(a.seg)||0) - new Date(getSegStart(b.seg)||0));
                groups.push({ type: 'flight-connection', legs: connected });
            } else {
                groups.push({ type: 'single', seg: seg, idx: i });
            }
        } else if (seg.SegmentType === 'Train') {
            const trainGroup = [{seg, idx: i}];
            used.add(i);
            let lastEnd = getSegEnd(seg);
            for (let j = i + 1; j < segments.length; j++) {
                if (used.has(j)) continue;
                if (segments[j].SegmentType !== 'Train') break;
                const nextStart = getSegStart(segments[j]);
                if (lastEnd && nextStart) {
                    const gapHours = (new Date(nextStart) - new Date(lastEnd)) / (1000*60*60);
                    if (gapHours >= 0 && gapHours <= 3) {
                        trainGroup.push({seg: segments[j], idx: j});
                        used.add(j);
                        lastEnd = getSegEnd(segments[j]);
                    } else break;
                } else break;
            }
            if (trainGroup.length > 1) {
                groups.push({ type: 'train-connection', legs: trainGroup });
            } else {
                groups.push({ type: 'single', seg: seg, idx: i });
            }
        } else {
            used.add(i);
            groups.push({ type: 'single', seg: seg, idx: i });
        }
    }
    return groups;
}


// ==================== TABLE VIEW ====================
function renderTableView(trips) {
    const wrapper = document.getElementById('table-wrapper');
    if (!trips.length) { wrapper.innerHTML = '<p class="empty">No trips match your filters.</p>'; return; }

    let html = '';
    for (let ti = 0; ti < tripsData.length; ti++) {
        const trip = tripsData[ti];
        // Check if this trip is in filtered list
        if (!trips.includes(trip)) continue;

        const range = getTripDateRange(trip);
        const events = getTripEvents(trip.TripId);
        const groups = groupSegments(trip.Segments || []);
        const types = [...new Set((trip.Segments||[]).map(s => s.SegmentType))];
        const hasMissing = (trip.Segments||[]).some(s => !s.BookingNumber);
        const hasInferred = (trip.Segments||[]).some(s => s.Source === 'inferred');

        const badges = types.map(t => '<span class="badge badge-' + t.toLowerCase() + '">' + segIcon(t) + ' ' + t + '</span>').join('');

        html += '<div class="trip-card">';
        html += '<div class="trip-header" onclick="this.parentElement.classList.toggle(\'expanded\')">';
        html += '<span class="expand-icon">\u25B6</span>';
        html += '<span class="trip-title">' + esc(trip.TripName) + '</span>';
        html += '<span class="trip-meta">' + badges;
        if (hasInferred) html += '<span class="badge badge-inferred">Has Inferred</span>';
        if (hasMissing) html += '<span class="badge badge-gap">Missing Data</span>';
        html += '</span>';
        html += '<span class="trip-dates">' + fmtDate(range.start) + ' to ' + fmtDate(range.end) + '</span>';
        html += jsonBtnTripHTML(ti);
        html += '</div>';

        html += '<div class="trip-body">';

        // Home info
        if (trip.HomeAtStart || trip.HomeAtEnd) {
            html += '<div class="home-info">';
            if (trip.HomeAtStart) html += '<strong>Home at start:</strong> ' + esc(trip.HomeAtStart);
            if (trip.HomeAtStart && trip.HomeAtEnd) html += ' &rarr; ';
            if (trip.HomeAtEnd) html += '<strong>Home at end:</strong> ' + esc(trip.HomeAtEnd);
            html += '</div>';
        }

        // Segment table
        html += '<table class="seg-table"><thead><tr>';
        html += '<th></th><th>Type</th><th>Detail</th><th>From</th><th>To</th><th>Dates</th><th>Source</th><th>Booking</th><th></th>';
        html += '</tr></thead><tbody>';

        for (const group of groups) {
            if (group.type === 'single') {
                html += renderSingleSegRow(group.seg, group.idx, ti);
            } else if (group.type === 'flight-connection') {
                html += renderFlightConnection(group.legs, ti);
            } else if (group.type === 'train-connection') {
                html += renderTrainConnection(group.legs, ti);
            }
        }

        // Events
        if (events.length > 0) {
            html += '<tr class="event-separator"><td colspan="9">\u{1F3AB} Events & Excursions (' + events.length + ')</td></tr>';
            for (let ei = 0; ei < eventsData.length; ei++) {
                const ev = eventsData[ei];
                if (ev.TripId !== trip.TripId) continue;
                html += '<tr class="event-row">';
                html += '<td></td>';
                html += '<td><span class="badge badge-event">\u{1F3AB} Event</span></td>';
                html += '<td>' + esc(ev.Title) + '</td>';
                html += '<td>' + locationDisplay(ev.City, ev.CountryCode) + '</td>';
                html += '<td></td>';
                html += '<td>' + fmtDate(ev.StartTime) + '</td>';
                html += '<td><span class="badge badge-' + (ev.Source||'manual') + '">' + (ev.Source||'manual') + '</span></td>';
                html += '<td></td>';
                html += '<td>' + jsonBtnEventHTML(ei) + '</td>';
                html += '</tr>';
            }
        }

        html += '</tbody></table></div></div>';
    }

    wrapper.innerHTML = html;
    attachJsonListeners();
}

function renderSingleSegRow(seg, segIdx, tripIdx) {
    const type = seg.SegmentType;
    const isCruise = type === 'Cruise' && seg.PortsOfCall && seg.PortsOfCall.length > 0;
    const booking = seg.BookingNumber;
    const source = seg.Source || 'manual';
    const start = getSegStart(seg);
    const end = getSegEnd(seg);
    const fromCountry = getSegFromCountry(seg);
    const toCountry = getSegToCountry(seg);
    const isInferred = source === 'inferred';
    const cls = !booking ? ' class="gap-row"' : (isInferred ? ' class="inferred-row"' : '');

    if (isCruise) return renderCruiseRow(seg, segIdx, tripIdx);

    let html = '<tr' + cls + '>';
    html += '<td>' + jsonBtnHTML(tripIdx, segIdx) + '</td>';
    html += '<td><span class="badge badge-' + type.toLowerCase() + '">' + segIcon(type) + ' ' + type + '</span></td>';
    html += '<td>' + esc(getSegDetail(seg).trim());
    if (seg.SeatClass) html += ' <span class="text-muted">(' + esc(seg.SeatClass) + ')</span>';
    if (seg.Stateroom) html += ' <span class="text-muted">Rm ' + esc(seg.Stateroom) + '</span>';
    if (seg.RoomType) html += ' <span class="text-muted">' + esc(seg.RoomType) + '</span>';
    html += '</td>';
    html += '<td>' + esc(getSegFrom(seg)) + (fromCountry ? '<br><span class="text-muted">' + countryName(fromCountry) + '</span>' : '') + '</td>';
    html += '<td>' + esc(getSegTo(seg)) + (toCountry ? '<br><span class="text-muted">' + countryName(toCountry) + '</span>' : '') + '</td>';
    html += '<td>' + fmtShort(start) + (end ? ' to ' + fmtShort(end) : '') + '</td>';
    html += '<td><span class="badge badge-' + source + '">' + source + '</span></td>';
    html += '<td>' + (booking ? '<span class="booking-ref">' + esc(booking) + '</span>' : '<span class="missing-tag">MISSING</span>') + '</td>';
    html += '<td></td>';
    html += '</tr>';
    return html;
}


// ==================== CRUISE EXPANDABLE ROW ====================
function renderCruiseRow(seg, segIdx, tripIdx) {
    const booking = seg.BookingNumber;
    const source = seg.Source || 'manual';
    const start = getSegStart(seg);
    const end = getSegEnd(seg);
    const days = (start && end) ? daysBetween(start, end) : '';
    const ports = seg.PortsOfCall || [];
    const uid = 'cruise-' + tripIdx + '-' + segIdx;

    let html = '';
    // Main cruise row (clickable to expand)
    html += '<tr class="group-header" onclick="toggleGroup(\'' + uid + '\')">';
    html += '<td>' + jsonBtnHTML(tripIdx, segIdx) + '</td>';
    html += '<td><span class="badge badge-cruise">' + segIcon('Cruise') + ' Cruise</span> <span class="conn-badge">' + ports.length + ' ports</span></td>';
    html += '<td>' + esc(getSegDetail(seg).trim());
    if (seg.RoomType) html += '<br><span class="text-muted">' + esc(seg.RoomType) + '</span>';
    if (seg.Stateroom) html += ' <span class="text-muted">Rm ' + esc(seg.Stateroom) + '</span>';
    html += '</td>';
    html += '<td>' + esc(getSegFrom(seg)) + '<br><span class="text-muted">' + countryName(getSegFromCountry(seg)) + '</span></td>';
    html += '<td>' + esc(getSegTo(seg)) + '<br><span class="text-muted">' + countryName(getSegToCountry(seg)) + '</span></td>';
    html += '<td>' + fmtShort(start) + ' to ' + fmtShort(end) + '<br><span class="text-muted">' + days + ' days</span></td>';
    html += '<td><span class="badge badge-' + source + '">' + source + '</span></td>';
    html += '<td>' + (booking ? '<span class="booking-ref">' + esc(booking) + '</span>' : '<span class="missing-tag">MISSING</span>') + '</td>';
    html += '<td></td>';
    html += '</tr>';

    // Cruise details row (hidden by default)
    html += '<tr class="conn-leg" id="' + uid + '-details">';
    html += '<td></td><td colspan="8">';
    html += '<div class="cruise-detail-box">';
    html += '<strong>Cruise Details</strong>';
    html += '<div class="cruise-info-grid">';
    html += '<div><span class="text-muted">Cruise Line:</span> ' + esc(seg.CruiseLine || 'N/A') + '</div>';
    html += '<div><span class="text-muted">Ship:</span> ' + esc(seg.Ship || 'N/A') + '</div>';
    html += '<div><span class="text-muted">Booking:</span> ' + esc(booking || 'N/A') + '</div>';
    html += '<div><span class="text-muted">Room Type:</span> ' + esc(seg.RoomType || 'N/A') + '</div>';
    html += '<div><span class="text-muted">Stateroom:</span> ' + esc(seg.Stateroom || 'N/A') + '</div>';
    html += '<div><span class="text-muted">Duration:</span> ' + days + ' days</div>';
    html += '</div>';

    // Ports of call
    html += '<div class="ports-section">';
    html += '<strong>Ports of Call (' + ports.length + ')</strong>';
    html += '<div class="ports-table">';
    for (const port of ports) {
        const portDate = port.Date ? fmtDate(port.Date + 'T12:00:00') : '';
        html += '<div class="port-row">';
        html += '<span class="port-date">' + portDate + '</span>';
        html += '<span class="port-name">' + portDisplay(port) + '</span>';
        html += '</div>';
    }
    html += '</div></div></div>';
    html += '</td></tr>';

    return html;
}

// Toggle group visibility
function toggleGroup(uid) {
    const details = document.getElementById(uid + '-details');
    if (details) details.classList.toggle('show');
    // Also toggle any legs
    document.querySelectorAll('[id^="' + uid + '-leg"]').forEach(el => el.classList.toggle('show'));
}
// Make it globally available
window.toggleGroup = toggleGroup;

// ==================== FLIGHT CONNECTION ====================
function renderFlightConnection(legs, tripIdx) {
    const first = legs[0];
    const last = legs[legs.length - 1];
    const uid = 'flight-' + tripIdx + '-' + first.idx;
    const booking = first.seg.BookingNumber;
    const stops = legs.length - 1;

    let html = '';
    html += '<tr class="group-header" onclick="toggleGroup(\'' + uid + '\')">';
    html += '<td></td>';
    html += '<td><span class="badge badge-flight">' + segIcon('Flight') + ' Flight</span> <span class="conn-badge">' + stops + ' stop' + (stops > 1 ? 's' : '') + '</span></td>';
    html += '<td>' + legs.map(l => esc(getSegDetail(l.seg).trim())).join(' / ') + '</td>';
    html += '<td>' + esc(getSegFrom(first.seg)) + '<br><span class="text-muted">' + countryName(getSegFromCountry(first.seg)) + '</span></td>';
    html += '<td>' + esc(getSegTo(last.seg)) + '<br><span class="text-muted">' + countryName(getSegToCountry(last.seg)) + '</span></td>';
    html += '<td>' + fmtShort(getSegStart(first.seg)) + ' to ' + fmtShort(getSegEnd(last.seg)) + '</td>';
    html += '<td><span class="badge badge-' + (first.seg.Source||'manual') + '">' + (first.seg.Source||'manual') + '</span></td>';
    html += '<td>' + (booking ? '<span class="booking-ref">' + esc(booking) + '</span>' : '<span class="missing-tag">MISSING</span>') + '</td>';
    html += '<td></td>';
    html += '</tr>';

    // Leg rows
    for (const leg of legs) {
        const s = leg.seg;
        html += '<tr class="conn-leg" id="' + uid + '-leg-' + leg.idx + '">';
        html += '<td>' + jsonBtnHTML(tripIdx, leg.idx) + '</td>';
        html += '<td class="indent"><span class="badge badge-flight">' + segIcon('Flight') + '</span></td>';
        html += '<td>' + esc(getSegDetail(s).trim()) + (s.SeatClass ? ' <span class="text-muted">(' + esc(s.SeatClass) + ')</span>' : '') + '</td>';
        html += '<td>' + esc(getSegFrom(s)) + '</td>';
        html += '<td>' + esc(getSegTo(s)) + '</td>';
        html += '<td>' + fmtDate(getSegStart(s)) + ' ' + fmtTime(getSegStart(s)) + '</td>';
        html += '<td></td>';
        html += '<td></td>';
        html += '<td></td>';
        html += '</tr>';
    }
    return html;
}

// ==================== TRAIN CONNECTION ====================
function renderTrainConnection(legs, tripIdx) {
    const first = legs[0];
    const last = legs[legs.length - 1];
    const uid = 'train-' + tripIdx + '-' + first.idx;
    const stops = legs.length - 1;

    let html = '';
    html += '<tr class="group-header" onclick="toggleGroup(\'' + uid + '\')">';
    html += '<td></td>';
    html += '<td><span class="badge badge-train">' + segIcon('Train') + ' Train</span> <span class="conn-badge">' + stops + ' stop' + (stops > 1 ? 's' : '') + '</span></td>';
    html += '<td>' + legs.map(l => esc(getSegDetail(l.seg).trim())).join(' / ') + '</td>';
    html += '<td>' + esc(getSegFrom(first.seg)) + '<br><span class="text-muted">' + countryName(getSegFromCountry(first.seg)) + '</span></td>';
    html += '<td>' + esc(getSegTo(last.seg)) + '<br><span class="text-muted">' + countryName(getSegToCountry(last.seg)) + '</span></td>';
    html += '<td>' + fmtShort(getSegStart(first.seg)) + ' to ' + fmtShort(getSegEnd(last.seg)) + '</td>';
    html += '<td><span class="badge badge-' + (first.seg.Source||'manual') + '">' + (first.seg.Source||'manual') + '</span></td>';
    html += '<td>' + (first.seg.BookingNumber ? '<span class="booking-ref">' + esc(first.seg.BookingNumber) + '</span>' : '<span class="missing-tag">MISSING</span>') + '</td>';
    html += '<td></td>';
    html += '</tr>';

    for (const leg of legs) {
        const s = leg.seg;
        html += '<tr class="conn-leg" id="' + uid + '-leg-' + leg.idx + '">';
        html += '<td>' + jsonBtnHTML(tripIdx, leg.idx) + '</td>';
        html += '<td class="indent"><span class="badge badge-train">' + segIcon('Train') + '</span></td>';
        html += '<td>' + esc(getSegDetail(s).trim()) + (s.SeatClass ? ' <span class="text-muted">(' + esc(s.SeatClass) + ')</span>' : '') + '</td>';
        html += '<td>' + esc(getSegFrom(s)) + '</td>';
        html += '<td>' + esc(getSegTo(s)) + '</td>';
        html += '<td>' + fmtDate(getSegStart(s)) + ' ' + fmtTime(getSegStart(s)) + '</td>';
        html += '<td></td>';
        html += '<td>' + (s.BookingNumber ? esc(s.BookingNumber) : '') + '</td>';
        html += '<td></td>';
        html += '</tr>';
    }
    return html;
}


// ==================== TIMELINE VIEW ====================
function renderTimelineView(trips) {
    const container = document.getElementById('timeline-container');
    if (!container) return;

    const byYear = {};
    for (const trip of trips) {
        const year = getTripYear(trip) || 'Unknown';
        if (!byYear[year]) byYear[year] = [];
        byYear[year].push(trip);
    }
    const years = Object.keys(byYear).sort((a, b) => b - a);

    let html = '';
    for (const year of years) {
        const yearTrips = byYear[year].sort((a, b) =>
            new Date(getTripDateRange(b).start || 0) - new Date(getTripDateRange(a).start || 0)
        );

        html += '<div class="timeline-year">';
        html += '<div class="year-header" onclick="this.parentElement.classList.toggle(\'collapsed\')">';
        html += '<span class="expand-icon">\u25BC</span>';
        html += '<h2>' + year + '</h2>';
        html += '<span class="trip-count">' + yearTrips.length + ' trip' + (yearTrips.length !== 1 ? 's' : '') + '</span>';
        html += '</div>';
        html += '<div class="year-body">';

        for (const trip of yearTrips) {
            const ti = tripsData.indexOf(trip);
            const range = getTripDateRange(trip);
            const days = range.start && range.end ? daysBetween(range.start, range.end) : '?';
            const events = getTripEvents(trip.TripId);
            const groups = groupSegments(trip.Segments || []);

            html += '<div class="timeline-trip">';
            html += '<div class="timeline-trip-header" onclick="this.parentElement.classList.toggle(\'expanded\')">';
            html += '<span class="expand-icon">\u25B6</span>';
            html += '<span class="timeline-trip-title">' + esc(trip.TripName) + '</span>';
            html += '<span class="trip-meta">';
            const types = [...new Set((trip.Segments||[]).map(s => s.SegmentType))];
            html += types.map(t => '<span class="badge badge-' + t.toLowerCase() + '">' + segIcon(t) + '</span>').join('');
            html += '</span>';
            html += '<span class="timeline-trip-dates">' + fmtShort(range.start) + ' to ' + fmtShort(range.end) + ' (' + days + 'd)</span>';
            html += '</div>';

            html += '<div class="timeline-trip-body">';

            if (trip.HomeAtStart || trip.HomeAtEnd) {
                html += '<div class="home-info">';
                if (trip.HomeAtStart) html += '<strong>Home at start:</strong> ' + esc(trip.HomeAtStart);
                if (trip.HomeAtStart && trip.HomeAtEnd) html += ' &rarr; ';
                if (trip.HomeAtEnd) html += '<strong>Home at end:</strong> ' + esc(trip.HomeAtEnd);
                html += '</div>';
            }

            for (const group of groups) {
                if (group.type === 'single') {
                    const seg = group.seg;
                    const hasPorts = seg.SegmentType === 'Cruise' && seg.PortsOfCall && seg.PortsOfCall.length > 0;
                    const tlUid = 'tl-' + ti + '-' + group.idx;

                    html += '<div class="tl-segment' + (hasPorts ? ' tl-group' : '') + '"' + (hasPorts ? ' onclick="this.classList.toggle(\'expanded\')"' : '') + '>';
                    html += '<div class="tl-icon">' + segIcon(seg.SegmentType) + '</div>';
                    html += '<div class="tl-content">';
                    html += '<div class="tl-main">' + esc(getSegDetail(seg).trim()) + '</div>';
                    html += '<div class="tl-sub">' + esc(getSegFrom(seg));
                    if (getSegTo(seg) && getSegTo(seg) !== getSegFrom(seg)) html += ' \u2192 ' + esc(getSegTo(seg));
                    html += '</div>';
                    html += '<div class="tl-time">' + fmtShort(getSegStart(seg));
                    if (getSegEnd(seg)) html += ' to ' + fmtShort(getSegEnd(seg));
                    if (seg.BookingNumber) html += ' | <span class="booking-ref">' + esc(seg.BookingNumber) + '</span>';
                    html += '</div>';

                    if (hasPorts) {
                        html += '<div class="tl-legs">';
                        for (const port of seg.PortsOfCall) {
                            html += '<div class="tl-leg">' + (port.Date ? fmtShort(port.Date + 'T12:00:00') + ' ' : '') + portDisplay(port) + '</div>';
                        }
                        html += '</div>';
                    }

                    html += '</div></div>';

                } else {
                    // Connection (flight or train)
                    const legs = group.legs;
                    const first = legs[0].seg;
                    const last = legs[legs.length - 1].seg;
                    const connType = group.type === 'flight-connection' ? 'Flight' : 'Train';
                    const stops = legs.length - 1;

                    html += '<div class="tl-segment tl-group" onclick="this.classList.toggle(\'expanded\')">';
                    html += '<div class="tl-icon">' + segIcon(connType) + '</div>';
                    html += '<div class="tl-content">';
                    html += '<div class="tl-main">' + esc(getSegFrom(first)) + ' \u2192 ' + esc(getSegTo(last)) + ' <span class="conn-badge">' + stops + ' stop' + (stops > 1 ? 's' : '') + '</span></div>';
                    html += '<div class="tl-sub">' + legs.map(l => esc(getSegDetail(l.seg).trim())).join(' / ') + '</div>';
                    html += '<div class="tl-time">' + fmtShort(getSegStart(first)) + ' to ' + fmtShort(getSegEnd(last)) + '</div>';
                    html += '<div class="tl-legs">';
                    for (const leg of legs) {
                        html += '<div class="tl-leg">' + segIcon(connType) + ' ' + esc(getSegDetail(leg.seg).trim()) + ': ' + esc(getSegFrom(leg.seg)) + ' \u2192 ' + esc(getSegTo(leg.seg)) + ' (' + fmtShort(getSegStart(leg.seg)) + ' ' + fmtTime(getSegStart(leg.seg)) + ')</div>';
                    }
                    html += '</div>';
                    html += '</div></div>';
                }
            }

            // Events
            if (events.length > 0) {
                html += '<div class="tl-events-header">Events & Excursions</div>';
                for (const ev of events) {
                    html += '<div class="tl-segment tl-event">';
                    html += '<div class="tl-icon">\u{1F3AB}</div>';
                    html += '<div class="tl-content">';
                    html += '<div class="tl-main">' + esc(ev.Title) + '</div>';
                    html += '<div class="tl-sub">' + locationDisplay(ev.City, ev.CountryCode) + '</div>';
                    html += '<div class="tl-time">' + fmtDate(ev.StartTime) + '</div>';
                    html += '</div></div>';
                }
            }

            html += '</div></div>';
        }

        html += '</div></div>';
    }

    container.innerHTML = html;
}


// ==================== GAPS VIEW ====================
function detectAllGaps() {
    const gaps = [];

    for (let ti = 0; ti < tripsData.length; ti++) {
        const trip = tripsData[ti];
        const segs = trip.Segments || [];

        for (let i = 0; i < segs.length; i++) {
            const seg = segs[i];

            // Missing booking
            if (!seg.BookingNumber) {
                gaps.push({ type: 'missing_booking', trip, segment: seg, tripIdx: ti, segIdx: i });
            }

            // Inferred
            if (seg.Source === 'inferred') {
                gaps.push({ type: 'inferred', trip, segment: seg, tripIdx: ti, segIdx: i });
            }

            // Missing departure
            if (!getSegStart(seg)) {
                gaps.push({ type: 'missing_departure', trip, segment: seg, tripIdx: ti, segIdx: i });
            }

            // Missing arrival
            if (!getSegEnd(seg)) {
                gaps.push({ type: 'missing_arrival', trip, segment: seg, tripIdx: ti, segIdx: i });
            }

            // Time gap between consecutive segments
            if (i > 0) {
                const prevEnd = getSegEnd(segs[i - 1]);
                const thisStart = getSegStart(seg);
                if (prevEnd && thisStart) {
                    const gapDays = daysBetween(prevEnd, thisStart);
                    if (gapDays > 2) {
                        gaps.push({
                            type: 'time_gap',
                            trip,
                            afterSeg: segs[i - 1],
                            beforeSeg: seg,
                            days: gapDays,
                            tripIdx: ti
                        });
                    }
                }
            }
        }
    }
    return gaps;
}

function renderGapsView() {
    const container = document.getElementById('gaps-container');
    if (!container) return;

    const gaps = detectAllGaps();

    const missing = gaps.filter(g => g.type === 'missing_booking');
    const inferred = gaps.filter(g => g.type === 'inferred');
    const timeGaps = gaps.filter(g => g.type === 'time_gap');
    const missingDep = gaps.filter(g => g.type === 'missing_departure');
    const missingArr = gaps.filter(g => g.type === 'missing_arrival');

    let html = '<div class="gaps-summary"><h3>Data Quality Report</h3>';
    html += '<div class="gap-stats">';
    html += '<span class="gap-stat warning">\u26A0 ' + missing.length + ' missing bookings</span>';
    html += '<span class="gap-stat info">\u{1F50D} ' + inferred.length + ' inferred segments</span>';
    html += '<span class="gap-stat warning">\u23F0 ' + timeGaps.length + ' time gaps</span>';
    if (missingDep.length > 0) html += '<span class="gap-stat info">' + missingDep.length + ' missing departures</span>';
    if (missingArr.length > 0) html += '<span class="gap-stat info">' + missingArr.length + ' missing arrivals</span>';
    html += '</div></div>';

    // Group gaps by trip
    const byTrip = {};
    for (const gap of gaps) {
        const name = gap.trip.TripName;
        if (!byTrip[name]) byTrip[name] = { trip: gap.trip, gaps: [] };
        byTrip[name].gaps.push(gap);
    }

    for (const [tripName, data] of Object.entries(byTrip)) {
        html += '<div class="gap-trip">';
        html += '<div class="gap-trip-header" onclick="this.parentElement.classList.toggle(\'collapsed\')">';
        html += '<h4>' + esc(tripName) + '</h4>';
        html += '<span class="gap-stat warning">' + data.gaps.length + ' issue' + (data.gaps.length !== 1 ? 's' : '') + '</span>';
        html += '</div>';
        html += '<div class="gap-trip-body">';

        for (const gap of data.gaps) {
            const severity = (gap.type === 'missing_booking' || gap.type === 'time_gap') ? 'warning' : 'info';
            html += '<div class="gap-item ' + severity + '">';
            html += '<span class="gap-severity">' + (severity === 'warning' ? '\u26A0' : '\u{1F50D}') + '</span>';
            html += '<span class="gap-msg">';

            switch (gap.type) {
                case 'missing_booking':
                    html += 'Missing booking: <strong>' + esc(getSegDetail(gap.segment).trim()) + '</strong> (' + gap.segment.SegmentType + ': ' + esc(getSegFrom(gap.segment)) + ' \u2192 ' + esc(getSegTo(gap.segment)) + ')';
                    break;
                case 'inferred':
                    html += 'Inferred segment: <strong>' + esc(getSegDetail(gap.segment).trim()) + '</strong> (' + gap.segment.SegmentType + ')';
                    break;
                case 'time_gap':
                    html += gap.days + '-day gap between <strong>' + esc(getSegDetail(gap.afterSeg).trim()) + '</strong> and <strong>' + esc(getSegDetail(gap.beforeSeg).trim()) + '</strong>';
                    break;
                case 'missing_departure':
                    html += 'Missing departure time: <strong>' + esc(getSegDetail(gap.segment).trim()) + '</strong>';
                    break;
                case 'missing_arrival':
                    html += 'Missing arrival time: <strong>' + esc(getSegDetail(gap.segment).trim()) + '</strong>';
                    break;
            }
            html += '</span></div>';
        }

        html += '</div></div>';
    }

    if (gaps.length === 0) {
        html += '<div style="text-align:center;padding:3rem;color:#3fb950;font-size:1.2rem;">\u2705 No gaps detected. All data looks clean!</div>';
    }

    container.innerHTML = html;
}

// ==================== STATS BAR ====================
function renderStats() {
    const bar = document.getElementById('stats-bar');
    if (!bar) return;

    const totalTrips = tripsData.length;
    const totalSegs = tripsData.reduce((n, t) => n + (t.Segments||[]).length, 0);
    const totalEvents = eventsData.length;
    const gaps = detectAllGaps();

    const cruises = tripsData.reduce((n,t) => n + (t.Segments||[]).filter(s=>s.SegmentType==='Cruise').length, 0);
    const flights = tripsData.reduce((n,t) => n + (t.Segments||[]).filter(s=>s.SegmentType==='Flight').length, 0);
    const trains = tripsData.reduce((n,t) => n + (t.Segments||[]).filter(s=>s.SegmentType==='Train').length, 0);

    bar.innerHTML = '<span class="stat">🌍 <strong>' + totalTrips + '</strong> Trips</span>' +
        '<span class="stat">🧭 <strong>' + totalSegs + '</strong> Segments</span>' +
        '<span class="stat">🚢 <strong>' + cruises + '</strong> Cruises</span>' +
        '<span class="stat">✈️ <strong>' + flights + '</strong> Flights</span>' +
        '<span class="stat">🚆 <strong>' + trains + '</strong> Trains</span>' +
        '<span class="stat">🎫 <strong>' + totalEvents + '</strong> Events</span>' +
        '<span class="stat' + (gaps.length > 0 ? ' warning' : '') + '">⚠️ <strong>' + gaps.length + '</strong> Issues</span>';
}

// ==================== FILTERING ====================
function getFilteredTrips() {
    let filtered = [...tripsData];
    const yearVal = document.getElementById('year-filter').value;
    const typeVal = document.getElementById('type-filter').value;
    const sourceVal = document.getElementById('source-filter').value;
    const searchVal = (document.getElementById('search-input').value || '').toLowerCase();

    if (yearVal !== 'all') filtered = filtered.filter(t => String(getTripYear(t)) === yearVal);
    if (typeVal !== 'all') filtered = filtered.filter(t => (t.Segments||[]).some(s => s.SegmentType === typeVal));
    if (sourceVal !== 'all') filtered = filtered.filter(t => (t.Segments||[]).some(s => s.Source === sourceVal));
    if (searchVal) {
        filtered = filtered.filter(t => {
            const hay = [t.TripName, t.TripId, ...(t.Segments||[]).map(s =>
                [getSegDetail(s), getSegFrom(s), getSegTo(s), s.BookingNumber||'', s.CruiseLine||'', s.Ship||'', s.Airline||''].join(' ')
            )].join(' ').toLowerCase();
            return hay.includes(searchVal);
        });
    }

    // Sort descending
    filtered.sort((a, b) => new Date(getTripDateRange(b).start || 0) - new Date(getTripDateRange(a).start || 0));
    return filtered;
}

function populateYearFilter() {
    const sel = document.getElementById('year-filter');
    const years = [...new Set(tripsData.map(t => getTripYear(t)))].sort((a,b) => b - a);
    for (const y of years) {
        const opt = document.createElement('option');
        opt.value = y;
        opt.textContent = y;
        sel.appendChild(opt);
    }
}

// ==================== INIT ====================
function render() {
    const filtered = getFilteredTrips();
    renderStats();

    if (currentView === 'table') {
        renderTableView(filtered);
    } else if (currentView === 'timeline') {
        renderTimelineView(filtered);
    } else if (currentView === 'gaps') {
        renderGapsView();
    }
}

async function init() {
    try {
        const [tripsRes, eventsRes] = await Promise.all([
            fetch('data/trips.json'),
            fetch('data/events.json')
        ]);
        tripsData = await tripsRes.json();
        eventsData = await eventsRes.json();
    } catch (e) {
        console.error('Failed to load data:', e);
        document.getElementById('table-wrapper').innerHTML = '<p class="empty">Failed to load data files.</p>';
        return;
    }

    populateYearFilter();

    // Nav buttons
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentView = btn.getAttribute('data-view');
            document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
            document.getElementById(currentView + '-view').classList.add('active');
            render();
        });
    });

    // Filter listeners
    document.getElementById('search-input').addEventListener('input', render);
    document.getElementById('year-filter').addEventListener('change', render);
    document.getElementById('type-filter').addEventListener('change', render);
    document.getElementById('source-filter').addEventListener('change', render);

    render();
}

document.addEventListener('DOMContentLoaded', init);
