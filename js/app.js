// Travel Verification Tool - Complete Rewrite v14
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
const daysBetween = (a,b) => Math.round((new Date(b)-new Date(a))/86400000);

function isHomeTripName(name) { return name && name.toLowerCase().startsWith('home in'); }

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
        case 'Cruise': return (seg.CruiseLine||'') + (seg.Ship ? ' - ' + seg.Ship : '');
        case 'Flight': return (seg.Airline||'') + (seg.FlightNumber ? ' ' + seg.FlightNumber : '');
        case 'Train': return (seg.Operator||'') + (seg.TrainNumber ? ' ' + seg.TrainNumber : '');
        case 'Bus': return (seg.Operator||'') + (seg.Route ? ' ' + seg.Route : '');
        case 'Accommodation': return seg.DisplayName || seg.City || '';
        default: return seg.SegmentType || '';
    }
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
}

// ==================== ISSUES PER SEGMENT ====================
function getSegmentIssues(seg, segIdx, trip) {
    const issues = [];
    if (!seg.BookingNumber) {
        issues.push({severity: 'warning', msg: 'Missing booking reference'});
    }
    if (seg.Source === 'inferred') {
        issues.push({severity: 'info', msg: 'Segment was inferred (not from a booking source)'});
    }
    if (!getSegStart(seg)) {
        issues.push({severity: 'info', msg: 'Missing departure/start time'});
    }
    if (!getSegEnd(seg)) {
        issues.push({severity: 'info', msg: 'Missing arrival/end time'});
    }
    // Time gap: check if there's a >2 day gap before this segment
    const segs = trip.Segments || [];
    if (segIdx > 0) {
        const prevEnd = getSegEnd(segs[segIdx - 1]);
        const thisStart = getSegStart(seg);
        if (prevEnd && thisStart) {
            const gapDays = daysBetween(prevEnd, thisStart);
            if (gapDays > 2) {
                issues.push({severity: 'warning', msg: gapDays + '-day gap before this segment (from ' + esc(getSegDetail(segs[segIdx-1]).trim()) + ')'});
            }
        }
    }
    return issues;
}

function getTripIssues(trip) {
    const issues = [];
    const segs = trip.Segments || [];
    for (let i = 0; i < segs.length; i++) {
        const segIssues = getSegmentIssues(segs[i], i, trip);
        for (const issue of segIssues) {
            issues.push({...issue, segment: getSegDetail(segs[i]).trim() || segs[i].SegmentType});
        }
    }
    return issues;
}

// Issues popup
function showIssuesPopup(issues) {
    const existing = document.getElementById('json-popup-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'json-popup-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

    const popup = document.createElement('div');
    popup.style.cssText = 'background:#161b22;border:1px solid #30363d;border-radius:12px;padding:24px;max-width:600px;width:90%;max-height:80vh;overflow:auto;position:relative;';

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '\u2715';
    closeBtn.style.cssText = 'position:absolute;top:10px;right:14px;background:none;border:none;color:#8b949e;font-size:1.3rem;cursor:pointer;';
    closeBtn.onclick = () => overlay.remove();

    const title = document.createElement('h3');
    title.textContent = '\u26A0\uFE0F Issues (' + issues.length + ')';
    title.style.cssText = 'color:#d29922;margin-bottom:16px;font-size:1.1rem;';

    popup.appendChild(closeBtn);
    popup.appendChild(title);

    for (const issue of issues) {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:10px;padding:8px 0;border-bottom:1px solid #30363d;align-items:flex-start;';

        const icon = document.createElement('span');
        icon.textContent = issue.severity === 'warning' ? '\u26A0\uFE0F' : '\uD83D\uDD0D';
        icon.style.cssText = 'min-width:24px;text-align:center;';

        const msg = document.createElement('span');
        msg.style.cssText = 'color:' + (issue.severity === 'warning' ? '#d29922' : '#8b949e') + ';font-size:0.9rem;';
        let text = issue.msg;
        if (issue.segment) text = issue.segment + ': ' + text;
        msg.textContent = text;

        row.appendChild(icon);
        row.appendChild(msg);
        popup.appendChild(row);
    }

    if (issues.length === 0) {
        const noIssues = document.createElement('p');
        noIssues.textContent = '\u2705 No issues detected';
        noIssues.style.cssText = 'color:#3fb950;text-align:center;padding:20px;';
        popup.appendChild(noIssues);
    }

    overlay.appendChild(popup);
    document.body.appendChild(overlay);
}

// Issues button HTML generators
function issuesBtnHTML(tripIdx, segIdx) {
    const trip = tripsData[tripIdx];
    const seg = trip.Segments[segIdx];
    const issues = getSegmentIssues(seg, segIdx, trip);
    if (issues.length === 0) return '';
    return '<button class="issues-btn" data-trip="' + tripIdx + '" data-seg="' + segIdx + '" title="' + issues.length + ' issue(s)">\u26A0\uFE0F ' + issues.length + '</button>';
}

function issuesBtnTripHTML(tripIdx) {
    const trip = tripsData[tripIdx];
    const issues = getTripIssues(trip);
    if (issues.length === 0) return '';
    return '<button class="issues-btn issues-btn-trip" data-trip="' + tripIdx + '" data-seg="-1" title="' + issues.length + ' issue(s)">\u26A0\uFE0F ' + issues.length + '</button>';
}

function issuesBtnConnectionHTML(tripIdx, legIndices) {
    const trip = tripsData[tripIdx];
    const allIssues = [];
    for (const idx of legIndices) {
        const segIssues = getSegmentIssues(trip.Segments[idx], idx, trip);
        for (const issue of segIssues) {
            allIssues.push({...issue, segment: getSegDetail(trip.Segments[idx]).trim()});
        }
    }
    if (allIssues.length === 0) return '';
    return '<button class="issues-btn" data-trip="' + tripIdx + '" data-legs="' + legIndices.join(',') + '" title="' + allIssues.length + ' issue(s)">\u26A0\uFE0F ' + allIssues.length + '</button>';
}

function attachIssuesListeners() {
    document.querySelectorAll('.issues-btn').forEach(btn => {
        btn.onclick = function(e) {
            e.stopPropagation();
            const tripIdx = parseInt(this.getAttribute('data-trip'));
            const segIdx = parseInt(this.getAttribute('data-seg'));
            const legsAttr = this.getAttribute('data-legs');
            const trip = tripsData[tripIdx];

            if (legsAttr) {
                // Connection: aggregate issues from all legs
                const indices = legsAttr.split(',').map(Number);
                const allIssues = [];
                for (const idx of indices) {
                    const segIssues = getSegmentIssues(trip.Segments[idx], idx, trip);
                    for (const issue of segIssues) {
                        allIssues.push({...issue, segment: getSegDetail(trip.Segments[idx]).trim()});
                    }
                }
                showIssuesPopup(allIssues);
            } else if (segIdx === -1) {
                showIssuesPopup(getTripIssues(trip));
            } else {
                showIssuesPopup(getSegmentIssues(trip.Segments[segIdx], segIdx, trip));
            }
        };
    });
}

// ==================== GROUPING LOGIC ====================
// Group consecutive flights where:
//   - Same booking number, OR
//   - Arrival airport code matches next departure airport code
// Group back-to-back trains (within 3 hours) as connections
function groupSegments(segments) {
    const groups = [];
    let i = 0;

    while (i < segments.length) {
        const seg = segments[i];

        if (seg.SegmentType === 'Flight') {
            // Try to chain consecutive flights
            const chain = [{seg, idx: i}];
            let j = i + 1;
            while (j < segments.length && segments[j].SegmentType === 'Flight') {
                const prevSeg = chain[chain.length - 1].seg;
                const nextSeg = segments[j];
                const prevArrCode = (prevSeg.Arrival || {}).Code || '';
                const nextDepCode = (nextSeg.Departure || {}).Code || '';
                const sameBooking = prevSeg.BookingNumber && prevSeg.BookingNumber === nextSeg.BookingNumber;
                const airportMatch = prevArrCode && nextDepCode && prevArrCode === nextDepCode;

                if (sameBooking || airportMatch) {
                    chain.push({seg: nextSeg, idx: j});
                    j++;
                } else {
                    break;
                }
            }
            if (chain.length > 1) {
                groups.push({ type: 'flight-connection', legs: chain });
            } else {
                groups.push({ type: 'single', seg: seg, idx: i });
            }
            i = j;

        } else if (seg.SegmentType === 'Train') {
            const trainGroup = [{seg, idx: i}];
            let j = i + 1;
            let lastEnd = getSegEnd(seg);
            while (j < segments.length && segments[j].SegmentType === 'Train') {
                const nextStart = getSegStart(segments[j]);
                if (lastEnd && nextStart) {
                    const gapHours = (new Date(nextStart) - new Date(lastEnd)) / (1000*60*60);
                    if (gapHours >= 0 && gapHours <= 3) {
                        trainGroup.push({seg: segments[j], idx: j});
                        lastEnd = getSegEnd(segments[j]);
                        j++;
                    } else break;
                } else break;
            }
            if (trainGroup.length > 1) {
                groups.push({ type: 'train-connection', legs: trainGroup });
            } else {
                groups.push({ type: 'single', seg: seg, idx: i });
            }
            i = j;

        } else {
            groups.push({ type: 'single', seg: seg, idx: i });
            i++;
        }
    }
    return groups;
}


// ==================== TABLE VIEW ====================
// ==================== STATS BAR ====================
function renderStats(trips) {
    const bar = document.getElementById('stats-bar');
    const nonHomeTrips = trips.filter(t => !isHomeTripName(t.TripName));
    let segs = 0, cruises = 0, planeRides = 0, trains = 0, events = 0, issues = 0;
    const flightBookings = new Set();
    for (const t of trips) {
        for (const s of t.Segments || []) {
            segs++;
            if (s.SegmentType === 'Cruise') cruises++;
            if (s.SegmentType === 'Flight') {
                planeRides++;
                if (s.BookingNumber) flightBookings.add(s.BookingNumber);
            }
            if (s.SegmentType === 'Train') trains++;
        }
        events += getTripEvents(t.TripId || '').length;
    }
    const gapData = detectGaps(trips);
    for (const g of gapData) issues += g.issues.length;

    bar.innerHTML =
        '<span class="stat">\u{1F30D} <strong>' + nonHomeTrips.length + '</strong> Trips</span>' +
        '<span class="stat">\u{1F9E9} <strong>' + segs + '</strong> Segments</span>' +
        '<span class="stat">\u{1F6A2} <strong>' + cruises + '</strong> Cruises</span>' +
        '<span class="stat">\u2708\uFE0F <strong>' + flightBookings.size + '</strong> Bookings / <strong>' + planeRides + '</strong> Flights</span>' +
        '<span class="stat">\u{1F686} <strong>' + trains + '</strong> Trains</span>' +
        '<span class="stat">\u{1F3AD} <strong>' + events + '</strong> Events</span>' +
        '<span class="stat warning">\u26A0\uFE0F <strong>' + issues + '</strong> Issues</span>';
}

function renderTableView(trips) {
    const wrapper = document.getElementById('table-wrapper');
    if (!trips.length) { wrapper.innerHTML = '<div class="empty">No trips found</div>'; return; }
    let html = '';
    trips.forEach((trip, ti) => {
        const { start, end } = getTripDateRange(trip);
        const isHome = isHomeTripName(trip.TripName);
        const homeClass = isHome ? '' : ' non-home-trip';
        const typeBadges = [...new Set((trip.Segments||[]).map(s => s.SegmentType))].map(t =>
            '<span class="badge badge-' + t.toLowerCase() + '">' + segIcon(t) + ' ' + t + '</span>'
        ).join(' ');

        html += '<div class="trip-card' + homeClass + '" data-trip="' + ti + '">';
        html += '<div class="trip-header" onclick="this.parentElement.classList.toggle(\'expanded\')">';
        html += '<span class="expand-icon">\u25B6</span>';
        html += '<span class="trip-title">' + esc(trip.TripName) + '</span>';
        html += '<span class="trip-meta">' + typeBadges + '</span>';
        html += '<span class="trip-dates">' + fmtShort(start) + ' - ' + fmtShort(end) + '</span>';
        html += '<button class="json-btn json-btn-trip" data-trip="' + ti + '" data-seg="-1" title="View Trip JSON">{}</button>';
        html += issuesBtnTripHTML(ti);
        html += '</div>';
        html += '<div class="trip-body">';

        if (isHome) {
            html += '<div class="home-info">\u{1F3E0} Home stay in ' + esc(trip.Segments?.[0]?.City || '') + '</div>';
        }

        // Segment table
        const groups = groupSegments(trip.Segments || []);
        html += '<table class="seg-table"><thead><tr>';
        html += '<th>Type</th><th>Detail</th><th>From</th><th>To</th><th>Dates</th><th>Booking</th><th></th>';
        html += '</tr></thead><tbody>';

        groups.forEach((g, gi) => {
            if (g.type === 'flight-connection') {
                const first = g.legs[0].seg, last = g.legs[g.legs.length-1].seg;
                const stops = g.legs.length - 1;
                const gid = 'conn-f-' + ti + '-' + gi;
                html += '<tr class="group-header" onclick="document.querySelectorAll(\'.' + gid + '\').forEach(r=>r.classList.toggle(\'show\'))">';
                html += '<td>' + segIcon('Flight') + ' <span class="badge badge-flight">Flight</span></td>';
                html += '<td>' + esc(first.Airline || '') + '<span class="conn-badge">' + stops + ' stop' + (stops>1?'s':'') + '</span></td>';
                html += '<td>' + esc(getSegFrom(first)) + '</td>';
                html += '<td>' + esc(getSegTo(last)) + '</td>';
                html += '<td>' + fmtShort(getSegStart(first)) + ' - ' + fmtShort(getSegEnd(last)) + '</td>';
                html += '<td><span class="booking-ref">' + esc(first.BookingNumber || '') + '</span></td>';
                html += '<td><button class="json-btn" data-trip="' + ti + '" data-seg="' + g.legs[0].idx + '" title="View JSON">{}</button>' + issuesBtnConnectionHTML(ti, g.legs.map(function(l){return l.idx})) + '</td>';
                html += '</tr>';
                g.legs.forEach(l => {
                    html += '<tr class="conn-leg ' + gid + '">';
                    html += '<td></td>';
                    html += '<td class="indent">' + esc(l.seg.Airline||'') + (l.seg.FlightNumber ? ' ' + l.seg.FlightNumber : '') + '</td>';
                    html += '<td>' + esc(getSegFrom(l.seg)) + '</td>';
                    html += '<td>' + esc(getSegTo(l.seg)) + '</td>';
                    html += '<td>' + fmtShort(getSegStart(l.seg)) + ' - ' + fmtShort(getSegEnd(l.seg)) + '</td>';
                    html += '<td></td>';
                    html += '<td><button class="json-btn" data-trip="' + ti + '" data-seg="' + l.idx + '" title="View JSON">{}</button></td>';
                    html += '</tr>';
                });
            } else if (g.type === 'train-connection') {
                const first = g.legs[0].seg, last = g.legs[g.legs.length-1].seg;
                const stops = g.legs.length - 1;
                const gid = 'conn-t-' + ti + '-' + gi;
                html += '<tr class="group-header" onclick="document.querySelectorAll(\'.' + gid + '\').forEach(r=>r.classList.toggle(\'show\'))">';
                html += '<td>' + segIcon('Train') + ' <span class="badge badge-train">Train</span></td>';
                html += '<td>' + esc(first.Operator || '') + '<span class="conn-badge">' + stops + ' stop' + (stops>1?'s':'') + '</span></td>';
                html += '<td>' + esc(getSegFrom(first)) + '</td>';
                html += '<td>' + esc(getSegTo(last)) + '</td>';
                html += '<td>' + fmtShort(getSegStart(first)) + ' - ' + fmtShort(getSegEnd(last)) + '</td>';
                html += '<td><span class="booking-ref">' + esc(first.BookingNumber || '') + '</span></td>';
                html += '<td><button class="json-btn" data-trip="' + ti + '" data-seg="' + g.legs[0].idx + '" title="View JSON">{}</button>' + issuesBtnConnectionHTML(ti, g.legs.map(function(l){return l.idx})) + '</td>';
                html += '</tr>';
                g.legs.forEach(l => {
                    html += '<tr class="conn-leg ' + gid + '">';
                    html += '<td></td>';
                    html += '<td class="indent">' + esc(l.seg.Operator||'') + (l.seg.TrainNumber ? ' ' + l.seg.TrainNumber : '') + '</td>';
                    html += '<td>' + esc(getSegFrom(l.seg)) + '</td>';
                    html += '<td>' + esc(getSegTo(l.seg)) + '</td>';
                    html += '<td>' + fmtShort(getSegStart(l.seg)) + ' - ' + fmtShort(getSegEnd(l.seg)) + '</td>';
                    html += '<td></td>';
                    html += '<td><button class="json-btn" data-trip="' + ti + '" data-seg="' + l.idx + '" title="View JSON">{}</button></td>';
                    html += '</tr>';
                });
            } else {
                const seg = g.seg;
                const isCruise = seg.SegmentType === 'Cruise';
                const cruiseId = 'cruise-' + ti + '-' + gi;
                const clickAttr = isCruise ? ' onclick="document.getElementById(\'' + cruiseId + '\').classList.toggle(\'show\')"' : '';
                const rowClass = isCruise ? ' class="group-header"' : '';
                html += '<tr' + rowClass + clickAttr + '>';
                html += '<td>' + segIcon(seg.SegmentType) + ' <span class="badge badge-' + (seg.SegmentType||'').toLowerCase() + '">' + esc(seg.SegmentType) + '</span></td>';
                html += '<td>' + esc(getSegDetail(seg)) + '</td>';
                html += '<td>' + esc(getSegFrom(seg)) + '</td>';
                html += '<td>' + esc(getSegTo(seg)) + '</td>';
                html += '<td>' + fmtShort(getSegStart(seg)) + ' - ' + fmtShort(getSegEnd(seg)) + '</td>';
                html += '<td><span class="booking-ref">' + esc(seg.BookingNumber || '') + '</span>';
                if (seg.Source) html += ' <span class="badge badge-' + seg.Source + '">' + seg.Source + '</span>';
                html += '</td>';
                html += '<td><button class="json-btn" data-trip="' + ti + '" data-seg="' + g.idx + '" title="View JSON">{}</button>' + issuesBtnHTML(ti, g.idx) + '</td>';
                html += '</tr>';

                if (isCruise) {
                    html += '<tr class="conn-leg" id="' + cruiseId + '"><td colspan="7"><div class="cruise-detail-box">';
                    html += '<div class="cruise-info-grid">';
                    if (seg.CruiseLine) html += '<div><strong>Cruise Line:</strong> ' + esc(seg.CruiseLine) + '</div>';
                    if (seg.Ship) html += '<div><strong>Ship:</strong> ' + esc(seg.Ship) + '</div>';
                    if (seg.BookingNumber) html += '<div><strong>Booking:</strong> ' + esc(seg.BookingNumber) + '</div>';
                    if (seg.RoomType) html += '<div><strong>Room Type:</strong> ' + esc(seg.RoomType) + '</div>';
                    if (seg.Stateroom) html += '<div><strong>Stateroom:</strong> ' + esc(seg.Stateroom) + '</div>';
                    const sDays = daysBetween(getSegStart(seg), getSegEnd(seg));
                    if (sDays > 0) html += '<div><strong>Duration:</strong> ' + sDays + ' nights</div>';
                    html += '</div>';
                    if (seg.PortsOfCall && seg.PortsOfCall.length) {
                        html += '<div class="ports-section"><strong>\u{1F6A2} Ports of Call (' + seg.PortsOfCall.length + ')</strong>';
                        html += '<div class="ports-table">';
                        seg.PortsOfCall.forEach(p => {
                            html += '<div class="port-row"><span class="port-date">' + fmtShort(p.Date || p.ArrivalTime) + '</span>';
                            html += '<span class="port-name">' + esc(portDisplay(p)) + '</span></div>';
                        });
                        html += '</div></div>';
                    }
                    html += '</div></td></tr>';
                }
            }
        });

        // Events for this trip
        const tripEvents = getTripEvents(trip.TripId || '');
        if (tripEvents.length) {
            html += '<tr class="event-separator"><td colspan="7">\u{1F3AD} Events (' + tripEvents.length + ')</td></tr>';
            tripEvents.forEach((ev, ei) => {
                const evGlobalIdx = eventsData.indexOf(ev);
                html += '<tr class="event-row">';
                html += '<td>\u{1F3AD}</td>';
                html += '<td>' + esc(ev.EventName || '') + '</td>';
                html += '<td colspan="2">' + esc(ev.Venue || '') + (ev.City ? ', ' + esc(ev.City) : '') + '</td>';
                html += '<td>' + fmtShort(ev.EventDate || ev.Date) + '</td>';
                html += '<td>' + (ev.BookingNumber ? '<span class="booking-ref">' + esc(ev.BookingNumber) + '</span>' : '') + '</td>';
                html += '<td><button class="json-btn" data-event="' + evGlobalIdx + '" title="View Event JSON">{}</button></td>';
                html += '</tr>';
            });
        }

        html += '</tbody></table>';
        html += '</div></div>';
    });
    wrapper.innerHTML = html;
    attachJsonListeners();
    attachIssuesListeners();
}

// ==================== TIMELINE VIEW ====================
function renderTimelineView(trips) {
    const container = document.getElementById('timeline-container');
    if (!trips.length) { container.innerHTML = '<div class="empty">No trips found</div>'; return; }

    // Group by year descending
    const byYear = {};
    trips.forEach((trip, ti) => {
        const yr = getTripYear(trip);
        if (!byYear[yr]) byYear[yr] = [];
        byYear[yr].push({ trip, ti });
    });
    const years = Object.keys(byYear).sort((a,b) => b - a);

    let html = '';
    years.forEach(yr => {
        const yearTrips = byYear[yr].sort((a,b) => {
            const da = getTripDateRange(a.trip).start, db = getTripDateRange(b.trip).start;
            return new Date(db||0) - new Date(da||0);
        });
        const nonHome = yearTrips.filter(t => !isHomeTripName(t.trip.TripName));
        html += '<div class="timeline-year">';
        html += '<div class="year-header" onclick="this.parentElement.classList.toggle(\'collapsed\')">';
        html += '<span class="expand-icon">\u25BC</span>';
        html += '<h2>' + yr + '</h2>';
        html += '<span class="trip-count">' + nonHome.length + ' trip' + (nonHome.length!==1?'s':'') + '</span>';
        html += '</div>';
        html += '<div class="year-body">';

        yearTrips.forEach(({trip, ti}) => {
            const { start, end } = getTripDateRange(trip);
            const isHome = isHomeTripName(trip.TripName);
            html += '<div class="timeline-trip' + (isHome ? ' home-timeline-trip' : '') + '">';
            html += '<div class="timeline-trip-header" onclick="this.parentElement.classList.toggle(\'expanded\')">';
            html += '<span class="expand-icon">\u25B6</span>';
            html += '<span class="timeline-trip-title">' + esc(trip.TripName) + '</span>';
            html += '<span class="timeline-trip-dates">' + fmtShort(start) + ' - ' + fmtShort(end) + '</span>';
            html += '</div>';
            html += '<div class="timeline-trip-body">';

            const groups = groupSegments(trip.Segments || []);
            groups.forEach((g, gi) => {
                if (g.type === 'flight-connection') {
                    const first = g.legs[0].seg, last = g.legs[g.legs.length-1].seg;
                    const stops = g.legs.length - 1;
                    const gid = 'tl-fg-' + ti + '-' + gi;
                    html += '<div class="tl-segment tl-group" onclick="this.classList.toggle(\'expanded\')">';
                    html += '<div class="tl-icon">' + segIcon('Flight') + '</div>';
                    html += '<div class="tl-content">';
                    html += '<div class="tl-main">' + esc(first.Airline || 'Flight') + '<span class="conn-badge">' + stops + ' stop' + (stops>1?'s':'') + '</span></div>';
                    html += '<div class="tl-sub">' + esc(getSegFrom(first)) + ' \u2192 ' + esc(getSegTo(last)) + '</div>';
                    html += '<div class="tl-time">' + fmtShort(getSegStart(first)) + ' - ' + fmtShort(getSegEnd(last)) + ' \u2022 ' + esc(first.BookingNumber || '') + '</div>';
                    html += '<div class="tl-legs">';
                    g.legs.forEach(l => {
                        html += '<div class="tl-leg">' + esc(l.seg.Airline||'') + (l.seg.FlightNumber ? ' ' + l.seg.FlightNumber : '') + ': ' +
                            esc(getSegFrom(l.seg)) + ' \u2192 ' + esc(getSegTo(l.seg)) + ' (' + fmtShort(getSegStart(l.seg)) + ')</div>';
                    });
                    html += '</div></div></div>';
                } else if (g.type === 'train-connection') {
                    const first = g.legs[0].seg, last = g.legs[g.legs.length-1].seg;
                    const stops = g.legs.length - 1;
                    html += '<div class="tl-segment tl-group" onclick="this.classList.toggle(\'expanded\')">';
                    html += '<div class="tl-icon">' + segIcon('Train') + '</div>';
                    html += '<div class="tl-content">';
                    html += '<div class="tl-main">' + esc(first.Operator || 'Train') + '<span class="conn-badge">' + stops + ' stop' + (stops>1?'s':'') + '</span></div>';
                    html += '<div class="tl-sub">' + esc(getSegFrom(first)) + ' \u2192 ' + esc(getSegTo(last)) + '</div>';
                    html += '<div class="tl-time">' + fmtShort(getSegStart(first)) + ' - ' + fmtShort(getSegEnd(last)) + '</div>';
                    html += '<div class="tl-legs">';
                    g.legs.forEach(l => {
                        html += '<div class="tl-leg">' + esc(l.seg.Operator||'') + (l.seg.TrainNumber ? ' ' + l.seg.TrainNumber : '') + ': ' +
                            esc(getSegFrom(l.seg)) + ' \u2192 ' + esc(getSegTo(l.seg)) + ' (' + fmtShort(getSegStart(l.seg)) + ')</div>';
                    });
                    html += '</div></div></div>';
                } else {
                    const seg = g.seg;
                    if (seg.SegmentType === 'Cruise') {
                        html += '<div class="tl-segment tl-group" onclick="this.classList.toggle(\'expanded\')">';
                        html += '<div class="tl-icon">' + segIcon('Cruise') + '</div>';
                        html += '<div class="tl-content">';
                        html += '<div class="tl-main">' + esc(seg.CruiseLine || '') + ' - ' + esc(seg.Ship || '') + '</div>';
                        html += '<div class="tl-sub">' + esc(getSegFrom(seg)) + ' \u2192 ' + esc(getSegTo(seg)) + '</div>';
                        html += '<div class="tl-time">' + fmtShort(getSegStart(seg)) + ' - ' + fmtShort(getSegEnd(seg)) +
                            ' \u2022 ' + daysBetween(getSegStart(seg), getSegEnd(seg)) + ' nights</div>';
                        if (seg.PortsOfCall && seg.PortsOfCall.length) {
                            html += '<div class="tl-legs">';
                            seg.PortsOfCall.forEach(p => {
                                html += '<div class="tl-leg">' + fmtShort(p.Date || p.ArrivalTime) + ': ' + esc(portDisplay(p)) + '</div>';
                            });
                            html += '</div>';
                        }
                        html += '</div></div>';
                    } else {
                        html += '<div class="tl-segment">';
                        html += '<div class="tl-icon">' + segIcon(seg.SegmentType) + '</div>';
                        html += '<div class="tl-content">';
                        html += '<div class="tl-main">' + esc(getSegDetail(seg)) + '</div>';
                        html += '<div class="tl-sub">' + esc(getSegFrom(seg));
                        if (getSegTo(seg) && getSegTo(seg) !== getSegFrom(seg)) html += ' \u2192 ' + esc(getSegTo(seg));
                        html += '</div>';
                        html += '<div class="tl-time">' + fmtShort(getSegStart(seg)) + ' - ' + fmtShort(getSegEnd(seg)) + '</div>';
                        html += '</div></div>';
                    }
                }
            });

            // Events
            const tripEvents = getTripEvents(trip.TripId || '');
            if (tripEvents.length) {
                html += '<div class="tl-events-header">\u{1F3AD} Events</div>';
                tripEvents.forEach(ev => {
                    html += '<div class="tl-segment tl-event">';
                    html += '<div class="tl-icon">\u{1F3AD}</div>';
                    html += '<div class="tl-content">';
                    html += '<div class="tl-main">' + esc(ev.EventName || '') + '</div>';
                    html += '<div class="tl-sub">' + esc(ev.Venue || '') + (ev.City ? ', ' + esc(ev.City) : '') + '</div>';
                    html += '<div class="tl-time">' + fmtShort(ev.EventDate || ev.Date) + '</div>';
                    html += '</div></div>';
                });
            }

            html += '</div></div>';
        });
        html += '</div></div>';
    });
    container.innerHTML = html;
}

// ==================== GAP DETECTION ====================
function detectGaps(trips) {
    const results = [];
    trips.forEach((trip, ti) => {
        const issues = [];
        const segs = trip.Segments || [];
        // Missing booking numbers
        segs.forEach((seg, si) => {
            if (!seg.BookingNumber && seg.SegmentType !== 'Accommodation') {
                issues.push({ severity: 'warning', msg: seg.SegmentType + ': ' + getSegDetail(seg) + ' has no booking number' });
            }
            if (seg.Source === 'inferred') {
                issues.push({ severity: 'info', msg: seg.SegmentType + ': ' + getSegDetail(seg) + ' is inferred (not confirmed)' });
            }
        });
        // Time gaps between consecutive segments
        for (let i = 0; i < segs.length - 1; i++) {
            const end = getSegEnd(segs[i]);
            const start = getSegStart(segs[i+1]);
            if (end && start) {
                const gap = daysBetween(end, start);
                if (gap > 2) {
                    issues.push({ severity: 'warning', msg: gap + '-day gap between ' + getSegDetail(segs[i]) + ' and ' + getSegDetail(segs[i+1]) });
                }
            }
        }
        if (issues.length) results.push({ trip, ti, issues });
    });
    return results;
}

function renderGapsView(trips) {
    const container = document.getElementById('gaps-container');
    const gapData = detectGaps(trips);
    if (!gapData.length) { container.innerHTML = '<div class="empty">No issues detected</div>'; return; }

    let totalIssues = 0, warnings = 0, infos = 0;
    gapData.forEach(g => {
        g.issues.forEach(i => {
            totalIssues++;
            if (i.severity === 'warning') warnings++;
            else infos++;
        });
    });

    let html = '<div class="gaps-summary"><h3>Issues Summary</h3><div class="gap-stats">';
    html += '<span class="gap-stat warning">\u26A0\uFE0F ' + warnings + ' Warnings</span>';
    html += '<span class="gap-stat info">\u2139\uFE0F ' + infos + ' Info</span>';
    html += '<span class="gap-stat info">' + gapData.length + ' trips with issues</span>';
    html += '</div></div>';

    gapData.forEach(({ trip, ti, issues }) => {
        html += '<div class="gap-trip">';
        html += '<div class="gap-trip-header" onclick="this.parentElement.classList.toggle(\'collapsed\')">';
        html += '<h4>' + esc(trip.TripName) + '</h4>';
        html += '<span class="badge badge-gap">' + issues.length + ' issue' + (issues.length>1?'s':'') + '</span>';
        html += '</div>';
        html += '<div class="gap-trip-body">';
        issues.forEach(iss => {
            html += '<div class="gap-item ' + iss.severity + '">';
            html += '<span class="gap-severity">' + (iss.severity === 'warning' ? '\u26A0\uFE0F' : '\u2139\uFE0F') + '</span>';
            html += '<span class="gap-msg">' + esc(iss.msg) + '</span>';
            html += '</div>';
        });
        html += '</div></div>';
    });
    container.innerHTML = html;
}

// ==================== FILTERING ====================
function applyFilters() {
    const search = document.getElementById('search-input').value.toLowerCase();
    const year = document.getElementById('year-filter').value;
    const type = document.getElementById('type-filter').value;
    const source = document.getElementById('source-filter').value;

    let filtered = tripsData.filter(trip => {
        if (search) {
            const haystack = (trip.TripName + ' ' + JSON.stringify(trip.Segments || [])).toLowerCase();
            if (!haystack.includes(search)) return false;
        }
        if (year !== 'all' && getTripYear(trip) !== parseInt(year)) return false;
        if (type !== 'all') {
            const hasType = (trip.Segments||[]).some(s => s.SegmentType === type);
            if (!hasType) return false;
        }
        if (source !== 'all') {
            const hasSource = (trip.Segments||[]).some(s => s.Source === source);
            if (!hasSource) return false;
        }
        return true;
    });

    renderStats(filtered);
    if (currentView === 'table') renderTableView(filtered);
    else if (currentView === 'timeline') renderTimelineView(filtered);
    else if (currentView === 'gaps') renderGapsView(filtered);
}

// ==================== INIT ====================
async function init() {
    try {
        const [tripsResp, eventsResp] = await Promise.all([
            fetch('data/trips.json'),
            fetch('data/events.json')
        ]);
        tripsData = await tripsResp.json();
        eventsData = await eventsResp.json();
    } catch(e) {
        console.error('Failed to load data:', e);
        document.getElementById('table-wrapper').innerHTML = '<div class="empty">Failed to load data</div>';
        return;
    }

    // Sort trips by start date descending
    tripsData.sort((a,b) => {
        const da = getTripDateRange(a).start, db = getTripDateRange(b).start;
        return new Date(db||0) - new Date(da||0);
    });

    // Populate year filter
    const years = [...new Set(tripsData.map(getTripYear))].sort((a,b) => b - a);
    const yearSelect = document.getElementById('year-filter');
    years.forEach(yr => {
        const opt = document.createElement('option');
        opt.value = yr; opt.textContent = yr;
        yearSelect.appendChild(opt);
    });

    // View switching
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.onclick = function() {
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
            this.classList.add('active');
            currentView = this.getAttribute('data-view');
            document.getElementById(currentView + '-view').classList.add('active');
            applyFilters();
        };
    });

    // Filter listeners
    document.getElementById('search-input').oninput = applyFilters;
    document.getElementById('year-filter').onchange = applyFilters;
    document.getElementById('type-filter').onchange = applyFilters;
    document.getElementById('source-filter').onchange = applyFilters;

    applyFilters();
}

init();
