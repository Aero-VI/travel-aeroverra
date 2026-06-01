// Travel Dashboard v32 - Complete
// Source of truth: data/trips.json and data/events.json
// DO NOT modify data files.

let tripsData = [];
let eventsData = [];
let currentView = 'globe';

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
const daysBetween = (a,b) => Math.round((new Date(b)-new Date(a))/86400000);

function isHomeTrip(trip) { return trip.TripName && trip.TripName.toLowerCase().startsWith('home in'); }

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
    if (seg.DeparturePort) return seg.DeparturePort.City || seg.DeparturePort.PortName || '';
    if (seg.Departure) return seg.Departure.Code ? seg.Departure.City + ' (' + seg.Departure.Code + ')' : (seg.Departure.City || '');
    if (seg.City) return seg.City;
    return '';
}
function getSegTo(seg) {
    if (seg.ArrivalPort) return seg.ArrivalPort.City || seg.ArrivalPort.PortName || '';
    if (seg.Arrival) return seg.Arrival.Code ? seg.Arrival.City + ' (' + seg.Arrival.Code + ')' : (seg.Arrival.City || '');
    if (seg.City) return seg.City;
    return '';
}
function getSegFromCountry(seg) {
    if (seg.DeparturePort && seg.DeparturePort.CountryCode) return seg.DeparturePort.CountryCode;
    if (seg.Departure && seg.Departure.CountryCode) return seg.Departure.CountryCode;
    if (seg.CountryCode) return seg.CountryCode;
    return '';
}
function getSegToCountry(seg) {
    if (seg.ArrivalPort && seg.ArrivalPort.CountryCode) return seg.ArrivalPort.CountryCode;
    if (seg.Arrival && seg.Arrival.CountryCode) return seg.Arrival.CountryCode;
    if (seg.CountryCode) return seg.CountryCode;
    return '';
}
function getSegDetail(seg) {
    switch(seg.SegmentType) {
        case 'Cruise': return (seg.CruiseLine||'') + (seg.Ship ? ' - ' + seg.Ship : '');
        case 'Flight': return (seg.Airline||'') + (seg.FlightNumber ? ' ' + seg.FlightNumber : '');
        case 'Train': return (seg.Operator||'') + (seg.TrainNumber ? ' ' + seg.TrainNumber : '');
        case 'Bus': return (seg.Operator||'') + (seg.Route ? ' ' + seg.Route : '');
        case 'Accommodation': return seg.DisplayName || seg.City || '';
        default: return seg.SegmentType || '';
    }
}
function locationDisplay(city, countryCode) {
    const c = countryName(countryCode);
    if (city && c) return esc(city) + ', ' + c;
    return esc(city || c || '');
}
function getTripDateRange(trip) {
    let min = null, max = null;
    for (const seg of trip.Segments || []) {
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

function portDisplay(port) {
    let name = port.PortName || '';
    let city = port.City || '';
    let country = countryName(port.CountryCode);
    if (city && city !== name) return name + ' (' + city + '), ' + country;
    return (name || city) + (country ? ', ' + country : '');
}

function tripDurationText(start, end) {
    if (!start || !end) return '';
    const days = Math.round((new Date(end) - new Date(start)) / 86400000);
    if (days <= 0) return '';
    if (days === 1) return '1 day';
    if (days < 7) return days + ' days';
    if (days < 14) return '1 week';
    const weeks = Math.round(days / 7);
    if (days < 30) return weeks + ' weeks';
    if (days < 60) return '1 month';
    const months = Math.round(days / 30);
    if (months < 12) return months + ' months';
    const years = Math.round(days / 365.25 * 10) / 10;
    return years + ' year' + (years !== 1 ? 's' : '');
}

// ==================== ISSUE DETECTION ====================
function getSegmentIssues(seg) {
    const issues = [];
    if (!seg.BookingNumber && seg.SegmentType !== 'Accommodation') issues.push('Missing booking number');
    if (seg.Source === 'inferred') issues.push('Inferred segment (not confirmed)');
    if (seg.SegmentType === 'Flight') {
        if (!seg.Airline) issues.push('Missing airline');
        if (!seg.FlightNumber) issues.push('Missing flight number');
        if (!(seg.Departure && seg.Departure.Code)) issues.push('Missing departure airport code');
        if (!(seg.Arrival && seg.Arrival.Code)) issues.push('Missing arrival airport code');
    }
    if (seg.SegmentType === 'Cruise') {
        if (!seg.CruiseLine) issues.push('Missing cruise line');
        if (!seg.Ship) issues.push('Missing ship name');
    }
    if (seg.SegmentType === 'Train') {
        if (!seg.Operator) issues.push('Missing train operator');
    }
    return issues;
}

function getTripIssues(trip) {
    const results = [];
    const segs = trip.Segments || [];
    for (let i = 0; i < segs.length; i++) {
        const seg = segs[i];
        const segIssues = getSegmentIssues(seg);
        // Check gap to next segment
        if (i < segs.length - 1) {
            const thisEnd = getSegEnd(seg);
            const nextStart = getSegStart(segs[i + 1]);
            if (thisEnd && nextStart) {
                const gapDays = daysBetween(thisEnd, nextStart);
                if (gapDays > 2) {
                    segIssues.push(gapDays + '-day gap before next segment');
                }
            }
        }
        if (segIssues.length > 0) {
            results.push({ seg: seg, segIdx: i, issues: segIssues });
        }
    }
    return results;
}

function showIssuesPopup(issues, title) {
    const existing = document.getElementById('json-popup-overlay');
    if (existing) existing.remove();
    const overlay = document.createElement('div');
    overlay.id = 'json-popup-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    const popup = document.createElement('div');
    popup.style.cssText = 'background:#161b22;border:1px solid #30363d;border-radius:12px;padding:20px;max-width:600px;width:90%;max-height:80vh;overflow:auto;';
    let html = '<h3 style="color:#fbbf24;margin-bottom:12px;font-family:monospace">' + esc(title) + '</h3>';
    if (issues.length === 0) {
        html += '<p style="color:#5a6d82">No issues found.</p>';
    } else {
        for (const item of issues) {
            if (item.seg) {
                html += '<div style="margin:8px 0;padding:8px;background:#0a0e14;border-radius:4px">';
                html += '<strong style="color:#d4dce8">' + segIcon(item.seg.SegmentType) + ' ' + esc(getSegDetail(item.seg).trim()) + '</strong>';
                for (const iss of item.issues) {
                    html += '<div style="color:#fbbf24;font-size:0.85rem;margin-top:4px">\u26A0\uFE0F ' + esc(iss) + '</div>';
                }
                html += '</div>';
            }
        }
    }
    popup.innerHTML = html;
    overlay.appendChild(popup);
    document.body.appendChild(overlay);
}

// ==================== JSON VIEWER POPUP ====================
function showJsonPopup(data) {
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
            if (segIdx === -1) showJsonPopup(tripsData[tripIdx]);
            else showJsonPopup(tripsData[tripIdx].Segments[segIdx]);
        };
    });
    document.querySelectorAll('.issues-btn').forEach(btn => {
        btn.onclick = function(e) {
            e.stopPropagation();
            const tripIdx = parseInt(this.getAttribute('data-trip'));
            const segIdx = parseInt(this.getAttribute('data-seg'));
            if (segIdx === -1) {
                const issues = getTripIssues(tripsData[tripIdx]);
                showIssuesPopup(issues, tripsData[tripIdx].TripName + ' Issues');
            } else {
                const seg = tripsData[tripIdx].Segments[segIdx];
                const segIssues = getSegmentIssues(seg);
                showIssuesPopup(segIssues.length ? [{ seg: seg, issues: segIssues }] : [], getSegDetail(seg).trim() + ' Issues');
            }
        };
    });
}

function jsonBtn(tripIdx, segIdx) {
    return '<button class="json-btn" data-trip="' + tripIdx + '" data-seg="' + segIdx + '" title="View JSON">{}</button>';
}
function jsonBtnTrip(tripIdx) {
    return '<button class="json-btn json-btn-trip" data-trip="' + tripIdx + '" data-seg="-1" title="View Trip JSON">{}</button>';
}
function jsonBtnEvent(eventIdx) {
    return '<button class="json-btn" data-event="' + eventIdx + '" title="View Event JSON">{}</button>';
}
function issuesBtn(tripIdx, segIdx) {
    let issues;
    if (segIdx === -1) {
        issues = getTripIssues(tripsData[tripIdx]);
    } else {
        issues = getSegmentIssues(tripsData[tripIdx].Segments[segIdx]);
    }
    if (issues.length === 0) return '';
    const count = issues.length;
    return '<button class="issues-btn" data-trip="' + tripIdx + '" data-seg="' + segIdx + '" title="View Issues">\u26A0\uFE0F ' + count + '</button>';
}

// ==================== GROUPING LOGIC ====================
function groupSegments(segments) {
    const groups = [];
    const used = new Set();
    for (let i = 0; i < segments.length; i++) {
        if (used.has(i)) continue;
        const seg = segments[i];
        if (seg.SegmentType === 'Flight' && seg.BookingNumber) {
            const connected = [{ seg, idx: i }];
            used.add(i);
            for (let j = i + 1; j < segments.length; j++) {
                if (used.has(j)) continue;
                if (segments[j].SegmentType === 'Flight' && segments[j].BookingNumber === seg.BookingNumber) {
                    connected.push({ seg: segments[j], idx: j });
                    used.add(j);
                }
            }
            if (connected.length > 1) {
                connected.sort((a, b) => new Date(getSegStart(a.seg) || 0) - new Date(getSegStart(b.seg) || 0));
                groups.push({ type: 'flight-connection', legs: connected });
            } else {
                groups.push({ type: 'single', seg, idx: i });
            }
        } else if (seg.SegmentType === 'Train') {
            const trainGroup = [{ seg, idx: i }];
            used.add(i);
            let lastEnd = getSegEnd(seg);
            for (let j = i + 1; j < segments.length; j++) {
                if (used.has(j)) continue;
                if (segments[j].SegmentType !== 'Train') break;
                const nextStart = getSegStart(segments[j]);
                if (lastEnd && nextStart) {
                    const gapHours = (new Date(nextStart) - new Date(lastEnd)) / 3600000;
                    if (gapHours >= 0 && gapHours <= 4) {
                        trainGroup.push({ seg: segments[j], idx: j });
                        used.add(j);
                        lastEnd = getSegEnd(segments[j]);
                    } else break;
                } else break;
            }
            if (trainGroup.length > 1) {
                groups.push({ type: 'train-connection', legs: trainGroup });
            } else {
                groups.push({ type: 'single', seg, idx: i });
            }
        } else {
            used.add(i);
            groups.push({ type: 'single', seg, idx: i });
        }
    }
    return groups;
}

// ==================== STATS BAR ====================
function renderStats(trips) {
    const bar = document.getElementById('stats-bar');
    const nonHome = trips.filter(t => !isHomeTrip(t));
    const allSegs = trips.flatMap(t => t.Segments || []);
    const cruises = allSegs.filter(s => s.SegmentType === 'Cruise').length;
    const flights = allSegs.filter(s => s.SegmentType === 'Flight');
    const flightCount = flights.length;
    const bookingRefs = new Set(flights.filter(f => f.BookingNumber).map(f => f.BookingNumber));
    const bookingCount = bookingRefs.size + flights.filter(f => !f.BookingNumber).length;
    const trains = allSegs.filter(s => s.SegmentType === 'Train').length;
    const events = eventsData.length;
    let issueCount = 0;
    for (const t of trips) { issueCount += getTripIssues(t).length; }
    bar.innerHTML = '<span class="stat">\u{1F30D} <strong>' + nonHome.length + '</strong> Trips</span>'
        + '<span class="stat">\u{1F9ED} <strong>' + allSegs.length + '</strong> Segments</span>'
        + '<span class="stat">\u{1F6A2} <strong>' + cruises + '</strong> Cruises</span>'
        + '<span class="stat">\u2708\uFE0F <strong>' + bookingCount + '</strong> Bookings / <strong>' + flightCount + '</strong> Flights</span>'
        + '<span class="stat">\u{1F686} <strong>' + trains + '</strong> Trains</span>'
        + '<span class="stat">\u{1F3AB} <strong>' + events + '</strong> Events</span>'
        + (issueCount > 0 ? '<span class="stat warning">\u26A0\uFE0F <strong>' + issueCount + '</strong> Issues</span>' : '');
}

// ==================== TABLE VIEW ====================
function renderTableView(trips) {
    const wrapper = document.getElementById('table-wrapper');
    if (!trips.length) { wrapper.innerHTML = '<p class="empty">No trips match your filters.</p>'; return; }
    let html = '';
    for (let ti = 0; ti < tripsData.length; ti++) {
        const trip = tripsData[ti];
        if (!trips.includes(trip)) continue;
        const range = getTripDateRange(trip);
        const events = getTripEvents(trip.TripId);
        const groups = groupSegments(trip.Segments || []);
        const types = [...new Set((trip.Segments || []).map(s => s.SegmentType))];
        const tripIssues = getTripIssues(trip);
        const home = isHomeTrip(trip);

        const badges = types.map(t => '<span class="badge badge-' + t.toLowerCase() + '">' + segIcon(t) + ' ' + t + '</span>').join('');
        const homeCls = home ? ' home-trip' : '';

        html += '<div class="trip-card' + homeCls + '">';
        html += '<div class="trip-header" onclick="this.parentElement.classList.toggle(\'expanded\')">';
        html += '<span class="expand-icon">\u25B6</span>';
        html += '<span class="trip-title">' + esc(trip.TripName) + '</span>';
        html += '<span class="trip-meta">' + badges;
        if (tripIssues.length > 0) html += '<span class="badge badge-gap">\u26A0\uFE0F ' + tripIssues.length + ' issues</span>';
        html += '</span>';
        html += '<span class="trip-dates">' + fmtDate(range.start) + ' to ' + fmtDate(range.end) + '</span>';
        html += issuesBtn(ti, -1);
        html += jsonBtnTrip(ti);
        html += '</div>';

        html += '<div class="trip-body">';

        if (trip.HomeAtStart || trip.HomeAtEnd) {
            html += '<div class="home-info">';
            if (trip.HomeAtStart) html += '<strong>Home at start:</strong> ' + esc(trip.HomeAtStart);
            if (trip.HomeAtStart && trip.HomeAtEnd) html += ' &rarr; ';
            if (trip.HomeAtEnd) html += '<strong>Home at end:</strong> ' + esc(trip.HomeAtEnd);
            html += '</div>';
        }

        html += '<table class="seg-table"><thead><tr>';
        html += '<th></th><th>Type</th><th>Detail</th><th>From</th><th>To</th><th>Dates</th><th>Booking</th>';
        html += '</tr></thead><tbody>';

        for (const group of groups) {
            if (group.type === 'single') {
                html += renderSingleRow(group.seg, group.idx, ti);
            } else if (group.type === 'flight-connection') {
                html += renderConnectionRow(group.legs, ti, 'Flight');
            } else if (group.type === 'train-connection') {
                html += renderConnectionRow(group.legs, ti, 'Train');
            }
        }

        if (events.length > 0) {
            html += '<tr class="event-separator"><td colspan="7">\u{1F3AB} Events & Excursions (' + events.length + ')</td></tr>';
            for (let ei = 0; ei < eventsData.length; ei++) {
                const ev = eventsData[ei];
                if (ev.TripId !== trip.TripId) continue;
                html += '<tr class="event-row">';
                html += '<td>' + jsonBtnEvent(ei) + '</td>';
                html += '<td><span class="badge badge-event">\u{1F3AB} Event</span></td>';
                html += '<td>' + esc(ev.Title) + '</td>';
                html += '<td colspan="2">' + locationDisplay(ev.City, ev.CountryCode) + '</td>';
                html += '<td>' + fmtShort(ev.StartTime) + '</td>';
                html += '<td></td>';
                html += '</tr>';
            }
        }

        html += '</tbody></table>';
        html += '</div></div>';
    }
    wrapper.innerHTML = html;
    attachJsonListeners();
}

function renderSingleRow(seg, segIdx, tripIdx) {
    const type = seg.SegmentType;
    const booking = seg.BookingNumber;
    const source = seg.Source || 'manual';
    const start = getSegStart(seg);
    const end = getSegEnd(seg);
    const fromCountry = getSegFromCountry(seg);
    const toCountry = getSegToCountry(seg);
    const isInferred = source === 'inferred';
    const cls = !booking && type !== 'Accommodation' ? ' gap-row' : (isInferred ? ' inferred-row' : '');

    if (type === 'Cruise' && seg.PortsOfCall && seg.PortsOfCall.length > 0) {
        return renderCruiseRow(seg, segIdx, tripIdx);
    }

    let html = '<tr class="' + cls + '">';
    html += '<td>' + jsonBtn(tripIdx, segIdx) + issuesBtn(tripIdx, segIdx) + '</td>';
    html += '<td><span class="badge badge-' + type.toLowerCase() + '">' + segIcon(type) + ' ' + type + '</span></td>';
    html += '<td>' + esc(getSegDetail(seg).trim());
    if (seg.SeatClass) html += ' <span class="text-muted">(' + esc(seg.SeatClass) + ')</span>';
    if (seg.Stateroom) html += ' <span class="text-muted">Rm ' + esc(seg.Stateroom) + '</span>';
    if (seg.RoomType) html += ' <span class="text-muted">' + esc(seg.RoomType) + '</span>';
    html += '</td>';
    html += '<td>' + esc(getSegFrom(seg));
    if (fromCountry) html += '<br><span class="text-muted">' + countryName(fromCountry) + '</span>';
    html += '</td>';
    html += '<td>' + esc(getSegTo(seg));
    if (toCountry) html += '<br><span class="text-muted">' + countryName(toCountry) + '</span>';
    html += '</td>';
    html += '<td>' + fmtShort(start) + (end && start !== end ? ' to ' + fmtShort(end) : '') + '</td>';
    html += '<td>' + (booking ? '<span class="booking-ref">' + esc(booking) + '</span>' : (type !== 'Accommodation' ? '<span class="missing-tag">MISSING</span>' : '')) + '</td>';
    html += '</tr>';
    return html;
}

function renderCruiseRow(seg, segIdx, tripIdx) {
    const booking = seg.BookingNumber;
    const start = getSegStart(seg);
    const end = getSegEnd(seg);
    const depCountry = getSegFromCountry(seg);
    const arrCountry = getSegToCountry(seg);
    const ports = seg.PortsOfCall || [];
    const uid = 'cruise-' + tripIdx + '-' + segIdx;

    let html = '<tr class="group-header" onclick="document.querySelectorAll(\'.' + uid + '\').forEach(r=>r.classList.toggle(\'show\'))">';
    html += '<td>' + jsonBtn(tripIdx, segIdx) + issuesBtn(tripIdx, segIdx) + '</td>';
    html += '<td><span class="badge badge-cruise">\u{1F6A2} Cruise</span></td>';
    html += '<td>' + esc((seg.CruiseLine || '') + ' ' + (seg.Ship || ''));
    if (seg.Stateroom) html += ' <span class="text-muted">Rm ' + esc(seg.Stateroom) + '</span>';
    if (seg.RoomType) html += ' <span class="text-muted">' + esc(seg.RoomType) + '</span>';
    html += '<span class="conn-badge">' + ports.length + ' ports \u25BC</span>';
    html += '</td>';
    html += '<td>' + esc(getSegFrom(seg));
    if (depCountry) html += '<br><span class="text-muted">' + countryName(depCountry) + '</span>';
    html += '</td>';
    html += '<td>' + esc(getSegTo(seg));
    if (arrCountry) html += '<br><span class="text-muted">' + countryName(arrCountry) + '</span>';
    html += '</td>';
    html += '<td>' + fmtShort(start) + ' to ' + fmtShort(end) + '</td>';
    html += '<td>' + (booking ? '<span class="booking-ref">' + esc(booking) + '</span>' : '<span class="missing-tag">MISSING</span>') + '</td>';
    html += '</tr>';

    html += '<tr class="conn-leg ' + uid + '">';
    html += '<td colspan="7"><div class="cruise-detail-box">';
    html += '<div class="cruise-info-grid">';
    if (seg.CruiseLine) html += '<div><strong>Line:</strong> ' + esc(seg.CruiseLine) + '</div>';
    if (seg.Ship) html += '<div><strong>Ship:</strong> ' + esc(seg.Ship) + '</div>';
    if (booking) html += '<div><strong>Booking:</strong> ' + esc(booking) + '</div>';
    if (seg.Stateroom) html += '<div><strong>Room:</strong> ' + esc(seg.Stateroom) + '</div>';
    if (seg.RoomType) html += '<div><strong>Room Type:</strong> ' + esc(seg.RoomType) + '</div>';
    if (seg.DeckNumber) html += '<div><strong>Deck:</strong> ' + esc(seg.DeckNumber) + '</div>';
    if (seg.Source) html += '<div><strong>Source:</strong> ' + esc(seg.Source) + '</div>';
    html += '</div>';

    if (ports.length > 0) {
        html += '<div class="ports-section"><strong>\u{1F6A2} Ports of Call (' + ports.length + ')</strong>';
        html += '<div class="ports-table">';
        for (const port of ports) {
            html += '<div class="port-row">';
            html += '<span class="port-date">' + (port.Date ? fmtShort(port.Date) : '') + '</span>';
            html += '<span class="port-name">' + portDisplay(port) + '</span>';
            html += '</div>';
        }
        html += '</div></div>';
    }
    html += '</div></td></tr>';
    return html;
}

function renderConnectionRow(legs, tripIdx, type) {
    const first = legs[0].seg;
    const last = legs[legs.length - 1].seg;
    const booking = first.BookingNumber;
    const start = getSegStart(first);
    const end = getSegEnd(last);
    const icon = type === 'Flight' ? '\u2708\uFE0F' : '\u{1F686}';
    const badgeCls = type === 'Flight' ? 'flight' : 'train';
    const uid = 'conn-' + tripIdx + '-' + legs[0].idx;
    const fromCountry = getSegFromCountry(first);
    const toCountry = getSegToCountry(last);

    let html = '<tr class="group-header" onclick="document.querySelectorAll(\'.' + uid + '\').forEach(r=>r.classList.toggle(\'show\'))">';
    html += '<td>' + jsonBtn(tripIdx, legs[0].idx) + '</td>';
    html += '<td><span class="badge badge-' + badgeCls + '">' + icon + ' ' + type + '</span></td>';
    html += '<td>' + esc(getSegDetail(first).trim());
    html += '<span class="conn-badge">' + legs.length + ' legs \u25BC</span></td>';
    html += '<td>' + esc(getSegFrom(first));
    if (fromCountry) html += '<br><span class="text-muted">' + countryName(fromCountry) + '</span>';
    html += '</td>';
    html += '<td>' + esc(getSegTo(last));
    if (toCountry) html += '<br><span class="text-muted">' + countryName(toCountry) + '</span>';
    html += '</td>';
    html += '<td>' + fmtShort(start) + ' to ' + fmtShort(end) + '</td>';
    html += '<td>' + (booking ? '<span class="booking-ref">' + esc(booking) + '</span>' : '<span class="missing-tag">MISSING</span>') + '</td>';
    html += '</tr>';

    for (const leg of legs) {
        const s = leg.seg;
        const ls = getSegStart(s);
        const le = getSegEnd(s);
        html += '<tr class="conn-leg ' + uid + '">';
        html += '<td>' + jsonBtn(tripIdx, leg.idx) + issuesBtn(tripIdx, leg.idx) + '</td>';
        html += '<td class="indent"><span class="text-muted">\u2514 Leg</span></td>';
        html += '<td>' + esc(getSegDetail(s).trim());
        if (s.SeatClass) html += ' <span class="text-muted">(' + esc(s.SeatClass) + ')</span>';
        html += '</td>';
        html += '<td>' + esc(getSegFrom(s)) + '</td>';
        html += '<td>' + esc(getSegTo(s)) + '</td>';
        html += '<td>' + fmtShort(ls) + (le && ls !== le ? ' to ' + fmtShort(le) : '') + '</td>';
        html += '<td></td>';
        html += '</tr>';
    }
    return html;
}

// ==================== TIMELINE VIEW ====================
function renderTimelineView(trips) {
    const container = document.getElementById('timeline-container');
    if (!trips.length) { container.innerHTML = '<p class="empty">No trips match your filters.</p>'; return; }

    const byYear = {};
    for (const trip of trips) {
        const yr = getTripYear(trip);
        if (!byYear[yr]) byYear[yr] = [];
        byYear[yr].push(trip);
    }
    const years = Object.keys(byYear).sort((a, b) => b - a);

    let html = '';
    for (const year of years) {
        const yearTrips = byYear[year].sort((a, b) => {
            const da = getTripDateRange(a).start, db = getTripDateRange(b).start;
            return new Date(db || 0) - new Date(da || 0);
        });

        html += '<div class="timeline-year" id="tl-year-' + year + '">';
        html += '<div class="year-header" onclick="document.getElementById(\'tl-year-' + year + '\').classList.toggle(\'collapsed\')">';
        html += '<span class="expand-icon">\u25B6</span>';
        html += '<h2>' + year + '</h2>';
        html += '<span class="trip-count">' + yearTrips.filter(t => !isHomeTrip(t)).length + ' trips</span>';
        html += '</div>';
        html += '<div class="year-body">';

        for (const trip of yearTrips) {
            const range = getTripDateRange(trip);
            const events = getTripEvents(trip.TripId);
            const groups = groupSegments(trip.Segments || []);
            const ti = tripsData.indexOf(trip);
            const home = isHomeTrip(trip);
            const homeCls = home ? ' home-trip' : '';
            const durText = tripDurationText(range.start, range.end);

            html += '<div class="timeline-trip' + homeCls + '" id="tl-trip-' + ti + '">';
            html += '<div class="timeline-trip-header" onclick="document.getElementById(\'tl-trip-' + ti + '\').classList.toggle(\'expanded\')">';
            html += '<span class="expand-icon">\u25B6</span>';
            html += '<span class="timeline-trip-title">' + esc(trip.TripName);
            if (durText) html += ' <span class="text-muted">(' + durText + ')</span>';
            html += '</span>';
            html += '<span class="timeline-trip-dates">' + fmtShort(range.start) + ' to ' + fmtShort(range.end) + '</span>';
            html += '</div>';

            html += '<div class="timeline-trip-body">';
            for (const group of groups) {
                if (group.type === 'single') {
                    html += renderTlSegment(group.seg, group.idx, ti);
                } else if (group.type === 'flight-connection' || group.type === 'train-connection') {
                    html += renderTlConnection(group, ti);
                }
            }

            if (events.length > 0) {
                html += '<div class="tl-events-header">\u{1F3AB} Events (' + events.length + ')</div>';
                for (const ev of events) {
                    html += '<div class="tl-segment tl-event">';
                    html += '<span class="tl-icon">\u{1F3AB}</span>';
                    html += '<div class="tl-content">';
                    html += '<div class="tl-main">' + esc(ev.Title) + '</div>';
                    html += '<div class="tl-sub">' + locationDisplay(ev.City, ev.CountryCode) + '</div>';
                    html += '</div>';
                    html += '<span class="tl-time">' + fmtShort(ev.StartTime) + '</span>';
                    html += '</div>';
                }
            }

            html += '</div></div>';
        }

        html += '</div></div>';
    }
    container.innerHTML = html;
    attachJsonListeners();
}

function renderTlSegment(seg, segIdx, tripIdx) {
    const type = seg.SegmentType;
    const start = getSegStart(seg);
    const end = getSegEnd(seg);
    const fromCountry = getSegFromCountry(seg);
    const toCountry = getSegToCountry(seg);

    let html = '<div class="tl-segment">';
    html += '<span class="tl-icon">' + segIcon(type) + '</span>';
    html += '<div class="tl-content">';
    html += '<div class="tl-main">' + esc(getSegDetail(seg).trim()) + '</div>';

    if (type === 'Cruise' && seg.PortsOfCall && seg.PortsOfCall.length > 0) {
        html += '<div class="tl-sub">' + esc(getSegFrom(seg));
        if (fromCountry) html += ', ' + countryName(fromCountry);
        html += ' \u2192 ' + esc(getSegTo(seg));
        if (toCountry) html += ', ' + countryName(toCountry);
        html += ' (' + seg.PortsOfCall.length + ' ports)</div>';
    } else if (type === 'Accommodation') {
        html += '<div class="tl-sub">' + esc(getSegFrom(seg));
        if (fromCountry) html += ', ' + countryName(fromCountry);
        html += '</div>';
    } else {
        html += '<div class="tl-sub">' + esc(getSegFrom(seg));
        if (fromCountry) html += ', ' + countryName(fromCountry);
        html += ' \u2192 ' + esc(getSegTo(seg));
        if (toCountry) html += ', ' + countryName(toCountry);
        html += '</div>';
    }

    html += '</div>';
    html += '<span class="tl-time">' + fmtShort(start) + (end && start !== end ? ' - ' + fmtShort(end) : '');
    if (seg.BookingNumber) html += '<br>' + esc(seg.BookingNumber);
    html += '</span>';
    html += '</div>';
    return html;
}

function renderTlConnection(group, tripIdx) {
    const first = group.legs[0].seg;
    const last = group.legs[group.legs.length - 1].seg;
    const type = first.SegmentType;
    const start = getSegStart(first);
    const end = getSegEnd(last);
    const uid = 'tl-conn-' + tripIdx + '-' + group.legs[0].idx;

    let html = '<div class="tl-group" id="' + uid + '" onclick="document.getElementById(\'' + uid + '\').classList.toggle(\'expanded\')">';
    html += '<div class="tl-segment">';
    html += '<span class="tl-icon">' + segIcon(type) + '</span>';
    html += '<div class="tl-content">';
    html += '<div class="tl-main">' + esc(getSegDetail(first).trim());
    html += '<span class="conn-badge">' + group.legs.length + ' legs \u25BC</span></div>';
    html += '<div class="tl-sub">' + esc(getSegFrom(first)) + ' \u2192 ' + esc(getSegTo(last)) + '</div>';
    html += '</div>';
    html += '<span class="tl-time">' + fmtShort(start) + ' - ' + fmtShort(end);
    if (first.BookingNumber) html += '<br>' + esc(first.BookingNumber);
    html += '</span>';
    html += '</div>';

    html += '<div class="tl-legs">';
    for (const leg of group.legs) {
        const s = leg.seg;
        html += '<div class="tl-leg">';
        html += segIcon(s.SegmentType) + ' ' + esc(getSegFrom(s)) + ' \u2192 ' + esc(getSegTo(s));
        html += ' <span class="text-muted">' + fmtShort(getSegStart(s)) + '</span>';
        if (s.FlightNumber || s.TrainNumber) html += ' <span class="text-muted">(' + esc(s.FlightNumber || s.TrainNumber || '') + ')</span>';
        html += '</div>';
    }
    html += '</div></div>';
    return html;
}

// ==================== GAPS VIEW ====================
function renderGapsView(trips) {
    const container = document.getElementById('gaps-container');
    let totalMissing = 0, totalInferred = 0, totalGaps = 0, totalFieldIssues = 0;

    const tripReports = [];
    for (let ti = 0; ti < tripsData.length; ti++) {
        const trip = tripsData[ti];
        if (!trips.includes(trip)) continue;
        const issues = getTripIssues(trip);
        if (issues.length === 0) continue;

        const missingBooking = issues.filter(i => i.issues.some(x => x.includes('Missing booking')));
        const inferred = issues.filter(i => i.issues.some(x => x.includes('Inferred')));
        const gaps = issues.filter(i => i.issues.some(x => x.includes('-day gap')));
        const fieldIssues = issues.filter(i => i.issues.some(x => x.includes('Missing') && !x.includes('booking')));

        totalMissing += missingBooking.length;
        totalInferred += inferred.length;
        totalGaps += gaps.length;
        totalFieldIssues += fieldIssues.length;
        tripReports.push({ trip, ti, issues });
    }

    let html = '<div class="gaps-summary"><h3>\u26A0\uFE0F Data Quality Report</h3>';
    html += '<div class="gap-stats">';
    html += '<span class="gap-stat warning">' + totalMissing + ' missing bookings</span>';
    html += '<span class="gap-stat info">' + totalInferred + ' inferred segments</span>';
    html += '<span class="gap-stat warning">' + totalGaps + ' time gaps</span>';
    html += '<span class="gap-stat info">' + totalFieldIssues + ' missing fields</span>';
    html += '</div></div>';

    if (tripReports.length === 0) {
        html += '<p class="empty">No issues found in filtered trips.</p>';
    }

    for (const report of tripReports) {
        const range = getTripDateRange(report.trip);
        html += '<div class="gap-trip" onclick="this.classList.toggle(\'collapsed\')">';
        html += '<div class="gap-trip-header">';
        html += '<h4>' + esc(report.trip.TripName) + ' <span class="text-muted">(' + report.issues.length + ' issues)</span></h4>';
        html += '<span class="trip-dates">' + fmtShort(range.start) + ' to ' + fmtShort(range.end) + '</span>';
        html += '</div>';
        html += '<div class="gap-trip-body">';

        for (const item of report.issues) {
            for (const iss of item.issues) {
                let severity = 'info';
                if (iss.includes('Missing booking') || iss.includes('-day gap')) severity = 'warning';
                html += '<div class="gap-item">';
                html += '<span class="gap-severity ' + severity + '">' + (severity === 'warning' ? '\u26A0\uFE0F' : '\u{1F4CB}') + '</span>';
                html += '<span>';
                if (item.seg) html += '<strong>' + segIcon(item.seg.SegmentType) + ' ' + esc(getSegDetail(item.seg).trim()) + ':</strong> ';
                html += esc(iss);
                html += '</span>';
                html += '</div>';
            }
        }

        html += '</div></div>';
    }

    container.innerHTML = html;
}

// ==================== MAP FILTERS ====================
function populateMapFilters() {
    const shipFilter = document.getElementById('map-ship-filter');
    const yearFilter = document.getElementById('map-year-filter');
    const tripFilter = document.getElementById('map-trip-filter');

    // Ships
    const ships = new Set();
    for (const trip of tripsData) {
        for (const seg of trip.Segments || []) {
            if (seg.SegmentType === 'Cruise' && seg.Ship) ships.add(seg.Ship);
        }
    }
    [...ships].sort().forEach(ship => {
        const opt = document.createElement('option');
        opt.value = ship;
        opt.textContent = '\u{1F6A2} ' + ship;
        shipFilter.appendChild(opt);
    });

    // Years
    const years = [...new Set(tripsData.map(t => getTripYear(t)))].filter(y => y !== 9999).sort((a,b) => b - a);
    years.forEach(yr => {
        const opt = document.createElement('option');
        opt.value = yr;
        opt.textContent = yr;
        yearFilter.appendChild(opt);
    });

    // Trips (non-home only)
    tripsData.filter(t => !isHomeTrip(t)).forEach(trip => {
        const opt = document.createElement('option');
        opt.value = trip.TripId;
        opt.textContent = trip.TripName.length > 50 ? trip.TripName.substring(0, 47) + '...' : trip.TripName;
        tripFilter.appendChild(opt);
    });
}

function getMapFilteredData() {
    const shipVal = document.getElementById('map-ship-filter').value;
    const yearVal = document.getElementById('map-year-filter').value;
    const tripVal = document.getElementById('map-trip-filter').value;
    const typeVal = document.getElementById('map-type-filter').value;

    let filtered = tripsData.filter(trip => {
        if (yearVal !== 'all' && String(getTripYear(trip)) !== yearVal) return false;
        if (tripVal !== 'all' && trip.TripId !== tripVal) return false;
        if (shipVal !== 'all') {
            const hasShip = (trip.Segments || []).some(s => s.Ship === shipVal);
            if (!hasShip) return false;
        }
        if (typeVal !== 'all') {
            const hasType = (trip.Segments || []).some(s => s.SegmentType === typeVal);
            if (!hasType) return false;
        }
        return true;
    });

    // Filter events to matching trips
    const tripIds = new Set(filtered.map(t => t.TripId));
    const filteredEvents = eventsData.filter(e => tripIds.has(e.TripId));

    return { trips: filtered, events: filteredEvents, shipVal: shipVal, typeVal: typeVal };
}

function applyMapFilters() {
    const { trips, events, shipVal, typeVal } = getMapFilteredData();
    refreshMap(trips, events, shipVal, typeVal);
    updateHudStats(trips, shipVal, typeVal);
}

function updateHudStats(trips, shipVal, typeVal) {
    const hud = document.getElementById('hud-stats');
    if (!hud) return;
    const nonHome = trips.filter(t => !isHomeTrip(t));
    let allSegs = trips.flatMap(t => t.Segments || []);
    if (shipVal && shipVal !== 'all') {
        allSegs = allSegs.filter(s => {
            if (s.SegmentType === 'Cruise') return s.Ship === shipVal;
            if (!typeVal || typeVal === 'all') return false;
            return s.SegmentType === typeVal;
        });
    }
    if (typeVal && typeVal !== 'all') {
        allSegs = allSegs.filter(s => s.SegmentType === typeVal);
    }
    const countries = new Set();
    allSegs.forEach(s => {
        const fc = getSegFromCountry(s);
        const tc = getSegToCountry(s);
        if (fc) countries.add(fc);
        if (tc) countries.add(tc);
        if (s.PortsOfCall) s.PortsOfCall.forEach(p => { if (p.CountryCode) countries.add(p.CountryCode); });
    });
    hud.innerHTML = '<span class="hud-item">\u{1F30D} ' + nonHome.length + ' trips</span>'
        + '<span class="hud-item">\u{1F6A2} ' + allSegs.filter(s => s.SegmentType === 'Cruise').length + ' cruises</span>'
        + '<span class="hud-item">\u2708\uFE0F ' + allSegs.filter(s => s.SegmentType === 'Flight').length + ' flights</span>'
        + '<span class="hud-item">\u{1F3F3}\uFE0F ' + countries.size + ' countries</span>';
}

// ==================== FILTERING (TABLE/TIMELINE/GAPS) ====================
function getFilteredTrips() {
    const search = document.getElementById('search-input').value.toLowerCase();
    const yearFilter = document.getElementById('year-filter').value;
    const typeFilter = document.getElementById('type-filter').value;
    const sourceFilter = document.getElementById('source-filter').value;

    return tripsData.filter(trip => {
        if (search) {
            const haystack = (trip.TripName + ' ' + (trip.Segments || []).map(s => getSegDetail(s) + ' ' + getSegFrom(s) + ' ' + getSegTo(s) + ' ' + (s.BookingNumber || '')).join(' ')).toLowerCase();
            if (!haystack.includes(search)) return false;
        }
        if (yearFilter !== 'all') {
            if (String(getTripYear(trip)) !== yearFilter) return false;
        }
        if (typeFilter !== 'all') {
            if (!(trip.Segments || []).some(s => s.SegmentType === typeFilter)) return false;
        }
        if (sourceFilter !== 'all') {
            if (!(trip.Segments || []).some(s => (s.Source || 'manual') === sourceFilter)) return false;
        }
        return true;
    });
}

function sortTripsDescending(trips) {
    return trips.slice().sort((a, b) => {
        const da = getTripDateRange(a).start;
        const db = getTripDateRange(b).start;
        return new Date(db || 0) - new Date(da || 0);
    });
}

function render() {
    const filtered = getFilteredTrips();
    const sorted = sortTripsDescending(filtered);
    renderStats(sorted);
    if (currentView === 'table') renderTableView(sorted);
    else if (currentView === 'timeline') renderTimelineView(sorted);
    else if (currentView === 'gaps') renderGapsView(sorted);
    else if (currentView === 'globe') {
        const { trips, events, shipVal, typeVal } = getMapFilteredData();
        refreshMap(trips, events, shipVal, typeVal);
        updateHudStats(trips, shipVal, typeVal);
    }
}

// ==================== VIEW SWITCHING ====================
function switchView(view) {
    currentView = view;
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.nav-btn[data-view="' + view + '"]').classList.add('active');
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(view + '-view').classList.add('active');

    // Show/hide appropriate filter bars
    const mapFilters = document.getElementById('map-filters');
    const tableFilters = document.getElementById('filters');
    if (view === 'globe') {
        mapFilters.style.display = 'flex';
        tableFilters.style.display = 'none';
        handleMapResize();
    } else {
        mapFilters.style.display = 'none';
        tableFilters.style.display = 'flex';
    }

    render();
}

// ==================== INIT ====================
async function init() {
    try {
        const [tripsRes, eventsRes] = await Promise.all([
            fetch('data/trips.json?v=36'),
            fetch('data/events.json?v=36')
        ]);
        tripsData = await tripsRes.json();
        eventsData = await eventsRes.json();
    } catch (err) {
        console.error('Failed to load data:', err);
        document.getElementById('table-wrapper').innerHTML = '<p class="empty">Failed to load data. Check console.</p>';
        return;
    }

    // Populate year filter (table/timeline/gaps)
    const years = [...new Set(tripsData.map(t => getTripYear(t)))].filter(y => y !== 9999).sort((a, b) => b - a);
    const yearSelect = document.getElementById('year-filter');
    for (const yr of years) {
        const opt = document.createElement('option');
        opt.value = yr;
        opt.textContent = yr;
        yearSelect.appendChild(opt);
    }

    // Populate map filters
    populateMapFilters();

    // Nav buttons
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.onclick = function() { switchView(this.dataset.view); };
    });

    // Table/timeline/gaps filter listeners
    document.getElementById('search-input').addEventListener('input', render);
    document.getElementById('year-filter').addEventListener('change', render);
    document.getElementById('type-filter').addEventListener('change', render);
    document.getElementById('source-filter').addEventListener('change', render);

    // Map filter listeners
    document.getElementById('map-ship-filter').addEventListener('change', applyMapFilters);
    document.getElementById('map-year-filter').addEventListener('change', applyMapFilters);
    document.getElementById('map-trip-filter').addEventListener('change', applyMapFilters);
    document.getElementById('map-type-filter').addEventListener('change', applyMapFilters);
    document.getElementById('map-filter-reset').addEventListener('click', function() {
        document.getElementById('map-ship-filter').value = 'all';
        document.getElementById('map-year-filter').value = 'all';
        document.getElementById('map-trip-filter').value = 'all';
        document.getElementById('map-type-filter').value = 'all';
        applyMapFilters();
    });

    // Initial render
    render();
}

init();
