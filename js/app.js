// Travel Dashboard v32 - Complete with all missing functions
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

function isHomeTripName(name) { return name && name.toLowerCase().startsWith('home in'); }
function isHomeTrip(trip) { return isHomeTripName(trip.TripName); }

function locationDisplay(city, countryCode) {
    let parts = [];
    if (city) parts.push(esc(city));
    if (countryCode) parts.push(countryName(countryCode));
    return parts.join(', ');
}

function getSegFromCountry(seg) {
    if (seg.DeparturePort && seg.DeparturePort.CountryCode) return seg.DeparturePort.CountryCode;
    if (seg.Departure && seg.Departure.CountryCode) return seg.Departure.CountryCode;
    if (seg.CountryCode) return seg.CountryCode;
    return null;
}
function getSegToCountry(seg) {
    if (seg.ArrivalPort && seg.ArrivalPort.CountryCode) return seg.ArrivalPort.CountryCode;
    if (seg.Arrival && seg.Arrival.CountryCode) return seg.Arrival.CountryCode;
    if (seg.CountryCode) return seg.CountryCode;
    return null;
}

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

// ==================== ISSUES / DATA QUALITY ====================
function getSegmentIssues(seg) {
    const issues = [];
    if (!seg.BookingNumber) issues.push('Missing booking reference');
    if (seg.Source === 'inferred') issues.push('Inferred segment (not from email)');
    const start = getSegStart(seg);
    const end = getSegEnd(seg);
    if (!start) issues.push('Missing departure time');
    if (!end) issues.push('Missing arrival time');
    return issues;
}

function getTripIssues(trip) {
    const results = [];
    const segs = trip.Segments || [];
    for (let i = 0; i < segs.length; i++) {
        const segIssues = getSegmentIssues(segs[i]);
        // Check for time gaps between consecutive segments
        if (i > 0) {
            const prevEnd = getSegEnd(segs[i-1]);
            const thisStart = getSegStart(segs[i]);
            if (prevEnd && thisStart) {
                const gapDays = daysBetween(prevEnd, thisStart);
                if (gapDays > 2) {
                    segIssues.push(gapDays + '-day gap from previous segment');
                }
            }
        }
        if (segIssues.length > 0) {
            results.push({ seg: segs[i], issues: segIssues });
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
    popup.style.cssText = 'background:#161b22;border:1px solid #30363d;border-radius:12px;padding:20px;max-width:600px;width:90%;max-height:80vh;overflow:auto;position:relative;';
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '\u2715';
    closeBtn.style.cssText = 'position:absolute;top:10px;right:14px;background:none;border:none;color:#8b949e;font-size:1.3rem;cursor:pointer;';
    closeBtn.onclick = () => overlay.remove();
    const h = document.createElement('h3');
    h.style.cssText = 'color:#fbbf24;font-size:0.95rem;margin-bottom:12px;font-family:monospace;';
    h.textContent = title || 'Issues';
    popup.appendChild(closeBtn);
    popup.appendChild(h);
    if (!issues || issues.length === 0) {
        const p = document.createElement('p');
        p.style.cssText = 'color:#8b949e;font-size:0.85rem;';
        p.textContent = 'No issues found.';
        popup.appendChild(p);
    } else {
        for (const item of issues) {
            const issueList = item.issues || (Array.isArray(item) ? item : [item]);
            const seg = item.seg;
            for (const iss of issueList) {
                const row = document.createElement('div');
                row.style.cssText = 'display:flex;gap:8px;padding:6px 0;border-bottom:1px solid #21262d;font-size:0.82rem;';
                const icon = document.createElement('span');
                icon.textContent = (iss.includes('Missing booking') || iss.includes('-day gap')) ? '\u26A0\uFE0F' : '\uD83D\uDD0D';
                icon.style.minWidth = '20px';
                const text = document.createElement('span');
                text.style.color = '#d4dce8';
                let prefix = '';
                if (seg) prefix = segIcon(seg.SegmentType) + ' ' + getSegDetail(seg).trim() + ': ';
                text.textContent = prefix + iss;
                row.appendChild(icon);
                row.appendChild(text);
                popup.appendChild(row);
            }
        }
    }
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
    const count = segIdx === -1 ? issues.length : issues.length;
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
    const flightSegs = allSegs.filter(s => s.SegmentType === 'Flight');
    const totalFlights = flightSegs.length;
    // Count bookings (unique booking numbers, or 1 per flight without a booking)
    const bookingSet = new Set();
    let noBookingCount = 0;
    for (const f of flightSegs) {
        if (f.BookingNumber) bookingSet.add(f.BookingNumber);
        else noBookingCount++;
    }
    const flightBookings = bookingSet.size + noBookingCount;
    const trains = allSegs.filter(s => s.SegmentType === 'Train').length;
    const events = eventsData.length;
    let issueCount = 0;
    for (const t of trips) { issueCount += getTripIssues(t).length; }

    // Count unique countries
    const countrySet = new Set();
    for (const seg of allSegs) {
        const fc = getSegFromCountry(seg);
        const tc = getSegToCountry(seg);
        if (fc) countrySet.add(fc);
        if (tc) countrySet.add(tc);
        if (seg.PortsOfCall) {
            for (const p of seg.PortsOfCall) {
                if (p.CountryCode) countrySet.add(p.CountryCode);
            }
        }
    }

    bar.innerHTML = '<span class="stat">\u{1F30D} <strong>' + nonHome.length + '</strong> Trips</span>'
        + '<span class="stat">\u{1F9ED} <strong>' + allSegs.length + '</strong> Segments</span>'
        + '<span class="stat">\u{1F6A2} <strong>' + cruises + '</strong> Cruises</span>'
        + '<span class="stat">\u2708\uFE0F <strong>' + flightBookings + '</strong> Bookings / <strong>' + totalFlights + '</strong> Flights</span>'
        + '<span class="stat">\u{1F686} <strong>' + trains + '</strong> Trains</span>'
        + '<span class="stat">\u{1F3AB} <strong>' + events + '</strong> Events</span>'
        + '<span class="stat">\u{1F3F3}\uFE0F <strong>' + countrySet.size + '</strong> Countries</span>'
        + '<span class="stat warning">\u26A0\uFE0F <strong>' + issueCount + '</strong> Issues</span>';
}
