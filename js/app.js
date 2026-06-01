// Travel Dashboard v200 - Search, Where Was I, Countries, Annual Summary
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
    LI:'Liechtenstein',SM:'San Marino',VA:'Vatican City',AD:'Andorra',
    NC:'New Caledonia',VU:'Vanuatu'
};

// Country flag emoji from ISO code
const FLAG_EMOJI = {};
Object.keys(COUNTRIES).forEach(code => {
    const codePoints = code.split('').map(c => 0x1F1E6 + c.charCodeAt(0) - 65);
    FLAG_EMOJI[code] = String.fromCodePoint(...codePoints);
});

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

// ==================== SEARCH INDEX ====================
let searchIndex = [];

function buildSearchIndex() {
    searchIndex = [];
    // Index all locations from geocode database
    const allLocations = new Map(); // key -> {name, type, latlng, trips, countries}

    for (const trip of tripsData) {
        if (isHomeTrip(trip)) continue;
        for (const seg of trip.Segments || []) {
            const addLoc = (name, type, countryCode) => {
                if (!name) return;
                const key = name.toLowerCase();
                if (!allLocations.has(key)) {
                    allLocations.set(key, { name, type, trips: new Set(), countries: new Set() });
                }
                const loc = allLocations.get(key);
                loc.trips.add(trip.TripName);
                if (countryCode) loc.countries.add(countryCode);
            };

            if (seg.SegmentType === 'Cruise') {
                const dep = seg.DeparturePort || {};
                const arr = seg.ArrivalPort || {};
                addLoc(dep.City || dep.PortName, 'Cruise Port', dep.CountryCode);
                addLoc(arr.City || arr.PortName, 'Cruise Port', arr.CountryCode);
                (seg.PortsOfCall || []).forEach(p => addLoc(p.City || p.PortName, 'Cruise Port', p.CountryCode));
                if (seg.Ship) addLoc(seg.Ship, 'Ship', null);
            } else if (seg.SegmentType === 'Flight') {
                const dep = seg.Departure || {};
                const arr = seg.Arrival || {};
                addLoc(dep.City, 'Airport', dep.CountryCode);
                addLoc(arr.City, 'Airport', arr.CountryCode);
                if (dep.Code) addLoc(dep.Code, 'Airport Code', dep.CountryCode);
                if (arr.Code) addLoc(arr.Code, 'Airport Code', arr.CountryCode);
            } else if (seg.SegmentType === 'Train') {
                const dep = seg.Departure || {};
                const arr = seg.Arrival || {};
                addLoc(dep.City || dep.LocationName, 'Train Station', dep.CountryCode);
                addLoc(arr.City || arr.LocationName, 'Train Station', arr.CountryCode);
            } else if (seg.SegmentType === 'Bus') {
                const dep = seg.Departure || {};
                const arr = seg.Arrival || {};
                addLoc(dep.City || dep.LocationName, 'Bus Stop', dep.CountryCode);
                addLoc(arr.City || arr.LocationName, 'Bus Stop', arr.CountryCode);
            }
        }
    }

    // Add countries
    const visitedCountries = getAllVisitedCountries();
    for (const code of visitedCountries) {
        const name = countryName(code);
        if (name) {
            allLocations.set('country:' + code, { name, type: 'Country', trips: new Set(), countries: new Set([code]) });
        }
    }

    // Add trip names
    for (const trip of tripsData) {
        if (!isHomeTrip(trip)) {
            allLocations.set('trip:' + trip.TripId, { name: trip.TripName, type: 'Trip', trips: new Set([trip.TripName]), countries: new Set() });
        }
    }

    for (const [key, loc] of allLocations) {
        searchIndex.push({
            key,
            name: loc.name,
            type: loc.type,
            trips: [...loc.trips],
            countries: [...loc.countries],
            searchText: (loc.name + ' ' + [...loc.countries].map(c => countryName(c)).join(' ')).toLowerCase()
        });
    }
}

function searchLocations(query) {
    if (!query || query.length < 2) return [];
    const q = query.toLowerCase();
    const results = searchIndex.filter(item => item.searchText.includes(q));
    // Sort: exact match first, then by trip count
    results.sort((a, b) => {
        const aExact = a.name.toLowerCase().startsWith(q) ? 0 : 1;
        const bExact = b.name.toLowerCase().startsWith(q) ? 0 : 1;
        if (aExact !== bExact) return aExact - bExact;
        return b.trips.length - a.trips.length;
    });
    return results.slice(0, 12);
}

function flyToLocation(name, type) {
    // Try to geocode the location
    let coords = null;
    if (type === 'Airport Code') {
        coords = geocode('Flight', '', '', name);
    } else if (type === 'Cruise Port') {
        coords = geocode('Cruise', name, name, '');
    } else if (type === 'Train Station') {
        coords = geocode('Train', name, name, '');
    } else if (type === 'Bus Stop') {
        coords = geocode('Bus', name, name, '');
    } else if (type === 'Country') {
        // Find a city in that country to fly to
        for (const item of searchIndex) {
            if (item.type !== 'Country' && item.countries.length > 0) {
                const cc = item.countries[0];
                if (countryName(cc) === name) {
                    coords = geocode('', item.name, item.name, '');
                    if (coords) break;
                }
            }
        }
    } else {
        coords = geocode('Cruise', name, name, '') || geocode('Train', name, name, '') || geocode('', '', name, '');
    }

    if (coords && map) {
        map.flyTo({ center: [coords[1], coords[0]], zoom: 8, duration: 2000, essential: true });
    }
}

// ==================== WHERE WAS I ON ====================
function findWhereOnDate(dateStr) {
    const targetDate = new Date(dateStr + 'T12:00:00');
    const targetMs = targetDate.getTime();
    let result = null;

    for (const trip of tripsData) {
        const segs = trip.Segments || [];
        for (const seg of segs) {
            const start = getSegStart(seg);
            const end = getSegEnd(seg);
            if (!start) continue;

            const startMs = new Date(start).getTime();
            const endMs = end ? new Date(end).getTime() : startMs + 86400000;

            if (targetMs >= startMs && targetMs <= endMs) {
                // Found it - determine specific location
                if (seg.SegmentType === 'Cruise') {
                    // Check ports of call for exact date
                    const ports = seg.PortsOfCall || [];
                    for (const port of ports) {
                        if (port.Date) {
                            const portDate = new Date(port.Date).toISOString().slice(0, 10);
                            if (portDate === dateStr) {
                                return {
                                    trip: trip.TripName,
                                    segment: seg,
                                    location: (port.City || port.PortName) + ', ' + countryName(port.CountryCode),
                                    detail: 'Docked at ' + (port.PortName || port.City) + ' on ' + (seg.Ship || 'cruise'),
                                    type: 'Cruise Port',
                                    countryCode: port.CountryCode,
                                    portName: port.City || port.PortName
                                };
                            }
                        }
                    }
                    // At sea or between ports
                    return {
                        trip: trip.TripName,
                        segment: seg,
                        location: 'At sea on ' + (seg.Ship || 'cruise ship'),
                        detail: (seg.CruiseLine || '') + ' ' + (seg.Ship || '') + ' (' + getSegFrom(seg) + ' to ' + getSegTo(seg) + ')',
                        type: 'At Sea',
                        countryCode: null,
                        portName: null
                    };
                } else if (seg.SegmentType === 'Flight') {
                    return {
                        trip: trip.TripName,
                        segment: seg,
                        location: 'In transit: ' + getSegFrom(seg) + ' to ' + getSegTo(seg),
                        detail: (seg.Airline || '') + ' ' + (seg.FlightNumber || ''),
                        type: 'Flight',
                        countryCode: getSegFromCountry(seg),
                        portName: null
                    };
                } else if (seg.SegmentType === 'Train') {
                    return {
                        trip: trip.TripName,
                        segment: seg,
                        location: getSegFrom(seg) + ' to ' + getSegTo(seg),
                        detail: (seg.Operator || 'Train') + ' ' + (seg.TrainNumber || ''),
                        type: 'Train',
                        countryCode: getSegFromCountry(seg),
                        portName: null
                    };
                } else if (seg.SegmentType === 'Accommodation') {
                    return {
                        trip: trip.TripName,
                        segment: seg,
                        location: (seg.City || seg.DisplayName || 'Unknown') + (seg.CountryCode ? ', ' + countryName(seg.CountryCode) : ''),
                        detail: seg.DisplayName || seg.City || '',
                        type: 'Accommodation',
                        countryCode: seg.CountryCode,
                        portName: seg.City
                    };
                } else {
                    return {
                        trip: trip.TripName,
                        segment: seg,
                        location: getSegFrom(seg) || 'Unknown',
                        detail: getSegDetail(seg),
                        type: seg.SegmentType,
                        countryCode: getSegFromCountry(seg),
                        portName: null
                    };
                }
            }
        }

        // Check if date falls within trip date range but between segments
        const range = getTripDateRange(trip);
        if (range.start && range.end) {
            const tripStart = new Date(range.start).getTime();
            const tripEnd = new Date(range.end).getTime();
            if (targetMs >= tripStart && targetMs <= tripEnd && !result) {
                // Find the most recent past segment and next upcoming segment
                let prevSeg = null, nextSeg = null;
                let prevDist = Infinity, nextDist = Infinity;
                for (const seg of segs) {
                    const end = getSegEnd(seg);
                    const start = getSegStart(seg);
                    if (end) {
                        const dist = targetMs - new Date(end).getTime();
                        if (dist >= 0 && dist < prevDist) { prevDist = dist; prevSeg = seg; }
                    }
                    if (start) {
                        const dist = new Date(start).getTime() - targetMs;
                        if (dist >= 0 && dist < nextDist) { nextDist = dist; nextSeg = seg; }
                    }
                }
                // Prefer next segment's departure city (where you are waiting to depart from)
                // Fall back to previous segment's arrival city
                let loc = null, cc = null, city = null;
                if (nextSeg) {
                    loc = getSegFrom(nextSeg);
                    cc = getSegFromCountry(nextSeg);
                    city = loc;
                }
                if (!loc && prevSeg) {
                    loc = getSegTo(prevSeg);
                    cc = getSegToCountry(prevSeg);
                    city = loc;
                }
                if (loc) {
                    result = {
                        trip: trip.TripName,
                        segment: prevSeg || nextSeg,
                        location: loc + (cc ? ', ' + countryName(cc) : ''),
                        detail: 'Staying in ' + loc,
                        type: 'Location',
                        countryCode: cc,
                        portName: city
                    };
                }
            }
        }
    }

    // Check home trips
    if (!result) {
        // Default: check which home period this falls in
        for (const trip of tripsData) {
            if (!isHomeTrip(trip)) continue;
            // Home trips don't have dates, so check if this date is between the surrounding trips
            const ti = tripsData.indexOf(trip);
            let prevEnd = null, nextStart = null;
            // Look backward for previous trip end
            for (let i = ti - 1; i >= 0; i--) {
                const r = getTripDateRange(tripsData[i]);
                if (r.end) { prevEnd = r.end; break; }
            }
            // Look forward for next trip start
            for (let i = ti + 1; i < tripsData.length; i++) {
                const r = getTripDateRange(tripsData[i]);
                if (r.start) { nextStart = r.start; break; }
            }
            if (prevEnd && nextStart) {
                if (targetMs >= new Date(prevEnd).getTime() && targetMs <= new Date(nextStart).getTime()) {
                    const homeName = trip.TripName.replace('Home in ', '');
                    result = {
                        trip: trip.TripName,
                        segment: null,
                        location: homeName,
                        detail: 'Home base',
                        type: 'Home',
                        countryCode: 'US',
                        portName: homeName
                    };
                    break;
                }
            }
        }
    }

    return result;
}

function showWhereResult(dateStr) {
    const banner = document.getElementById('where-result');
    const result = findWhereOnDate(dateStr);
    const formattedDate = new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    if (!result) {
        banner.innerHTML = '<div class="where-content"><span class="where-date">' + formattedDate + '</span><span class="where-location">No travel data found for this date</span><button class="where-close" onclick="document.getElementById(\'where-result\').style.display=\'none\'">\u2715</button></div>';
        banner.style.display = 'flex';
        return;
    }

    const icon = result.type === 'At Sea' ? '\u{1F6A2}' :
                 result.type === 'Cruise Port' ? '\u2693' :
                 result.type === 'Flight' ? '\u2708\uFE0F' :
                 result.type === 'Train' ? '\u{1F686}' :
                 result.type === 'Home' ? '\u{1F3E0}' :
                 result.type === 'Gap Day' ? '\u{1F4CD}' : '\u{1F30D}';

    banner.innerHTML = '<div class="where-content">'
        + '<span class="where-date">' + formattedDate + '</span>'
        + '<span class="where-icon">' + icon + '</span>'
        + '<span class="where-location">' + esc(result.location) + '</span>'
        + '<span class="where-detail">' + esc(result.detail) + '</span>'
        + '<span class="where-trip">' + esc(result.trip) + '</span>'
        + '<button class="where-close" onclick="document.getElementById(\'where-result\').style.display=\'none\'">\u2715</button>'
        + '</div>';
    banner.style.display = 'flex';

    // Fly to location on map
    if (result.portName) {
        flyToLocation(result.portName, result.type);
    }
}

// ==================== COUNTRY DATA ====================
function getAllVisitedCountries() {
    const countries = new Set();
    for (const trip of tripsData) {
        for (const seg of trip.Segments || []) {
            const fc = getSegFromCountry(seg);
            const tc = getSegToCountry(seg);
            if (fc) countries.add(fc);
            if (tc) countries.add(tc);
            if (seg.PortsOfCall) {
                seg.PortsOfCall.forEach(p => { if (p.CountryCode) countries.add(p.CountryCode); });
            }
        }
    }
    for (const ev of eventsData) {
        if (ev.CountryCode) countries.add(ev.CountryCode);
    }
    return countries;
}

function getCountryDetails() {
    const countryData = {};

    // Build a chronological list of all country touches across all trips
    const countryTimeline = []; // [{code, city, date, tripName}]

    for (const trip of tripsData) {
        if (isHomeTrip(trip)) continue;

        for (const seg of trip.Segments || []) {
            const addTouch = (code, city, date) => {
                if (!code) return;
                countryTimeline.push({ code, city, date, tripName: trip.TripName });
                // Initialize country data
                if (!countryData[code]) {
                    countryData[code] = { code, visits: 0, firstVisit: null, lastVisit: null, cities: new Set(), trips: new Set(), totalDays: 0 };
                }
                const cd = countryData[code];
                if (city) cd.cities.add(city);
                cd.trips.add(trip.TripName);
                if (date) {
                    const d = new Date(date);
                    if (!cd.firstVisit || d < new Date(cd.firstVisit)) cd.firstVisit = date;
                    if (!cd.lastVisit || d > new Date(cd.lastVisit)) cd.lastVisit = date;
                }
            };

            if (seg.SegmentType === 'Cruise') {
                const dep = seg.DeparturePort || {};
                const arr = seg.ArrivalPort || {};
                addTouch(dep.CountryCode, dep.City, dep.Time);
                (seg.PortsOfCall || []).forEach(p => addTouch(p.CountryCode, p.City || p.PortName, p.Date));
                addTouch(arr.CountryCode, arr.City, arr.Time);
            } else if (seg.SegmentType === 'Flight') {
                const dep = seg.Departure || {};
                const arr = seg.Arrival || {};
                addTouch(dep.CountryCode, dep.City, dep.Time);
                addTouch(arr.CountryCode, arr.City, arr.Time);
            } else if (seg.SegmentType === 'Train' || seg.SegmentType === 'Bus') {
                const dep = seg.Departure || {};
                const arr = seg.Arrival || {};
                addTouch(dep.CountryCode, dep.City || dep.LocationName, dep.Time);
                addTouch(arr.CountryCode, arr.City || arr.LocationName, arr.Time);
            } else if (seg.SegmentType === 'Accommodation') {
                addTouch(seg.CountryCode, seg.City, seg.CheckInDate);
                if (seg.CheckInDate && seg.CheckOutDate) {
                    const days = daysBetween(seg.CheckInDate, seg.CheckOutDate);
                    if (countryData[seg.CountryCode]) countryData[seg.CountryCode].totalDays += days;
                }
            }
        }
    }

    // Sort timeline chronologically
    countryTimeline.sort((a, b) => {
        const da = a.date ? new Date(a.date).getTime() : 0;
        const db = b.date ? new Date(b.date).getTime() : 0;
        return da - db;
    });

    // Count visits: a new visit = touching a country after having been in a different country
    // Consecutive touches of the same country (even different cities) = same visit
    let lastCountry = null;
    for (const touch of countryTimeline) {
        if (touch.code !== lastCountry) {
            // Entered a new country (or re-entered after leaving)
            if (countryData[touch.code]) {
                countryData[touch.code].visits++;
            }
            lastCountry = touch.code;
        }
    }

    return countryData;
}

// ==================== COUNTRIES VIEW ====================
function renderCountriesView() {
    const container = document.getElementById('countries-container');
    const countryData = getCountryDetails();
    const allCodes = Object.keys(countryData).sort((a, b) => {
        // Sort by visit count desc, then name asc
        const va = countryData[a].visits, vb = countryData[b].visits;
        if (va !== vb) return vb - va;
        return countryName(a).localeCompare(countryName(b));
    });

    const totalCountries = allCodes.length;
    const totalCities = new Set();
    allCodes.forEach(c => countryData[c].cities.forEach(city => totalCities.add(city)));

    // By continent/region grouping
    const regions = {
        'Asia & Pacific': ['JP','KR','CN','TW','HK','TH','VN','SG','MY','ID','PH','GU','AU','NZ','NC','VU','IN'],
        'Europe': ['GB','IE','FR','DE','IT','ES','PT','NL','BE','AT','CH','DK','SE','NO','FI','IS','EE','LV','LT','PL','CZ','SK','HU','HR','ME','AL','GR','TR','MT','CY','GI','MK','RS','BA','SI','RO','BG','UA','BY','MD','MC','LI','SM','VA','AD','LU'],
        'Americas': ['US','CA','MX','CO','CR','PA','PR','VI','BS','KY','DO','SX','TC','JM','HT','CU','BZ','HN','GT','SV','NI','BB','TT','AW','CW','BM','LC','AG','KN','DM','GD','VC','BR','AR','CL','PE','EC'],
        'Middle East & Africa': ['AE']
    };

    let html = '<div class="countries-header">';
    html += '<div class="countries-stats">';
    html += '<div class="cs-big">' + (FLAG_EMOJI['US'] || '') + ' <span class="cs-num">' + totalCountries + '</span> <span class="cs-label">countries visited</span></div>';
    html += '<div class="cs-small">' + totalCities.size + ' unique cities</div>';
    html += '<div class="cs-small">' + Math.round(totalCountries / 195 * 100) + '% of the world</div>';
    html += '</div>';
    html += '<div class="countries-progress"><div class="cp-bar" style="width:' + (totalCountries / 195 * 100) + '%"></div><span class="cp-text">' + totalCountries + '/195</span></div>';
    html += '</div>';

    // Sort options
    html += '<div class="countries-sort">';
    html += '<button class="sort-btn active" data-sort="visits">By Visits</button>';
    html += '<button class="sort-btn" data-sort="name">By Name</button>';
    html += '<button class="sort-btn" data-sort="recent">By Recent</button>';
    html += '<button class="sort-btn" data-sort="region">By Region</button>';
    html += '</div>';

    // Default view: by visits
    html += '<div id="countries-grid" class="countries-grid">';
    html += renderCountryCards(allCodes, countryData, 'visits');
    html += '</div>';

    container.innerHTML = html;

    // Sort button handlers
    container.querySelectorAll('.sort-btn').forEach(btn => {
        btn.onclick = function() {
            container.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            const sort = this.dataset.sort;
            let sorted;
            if (sort === 'name') {
                sorted = [...allCodes].sort((a, b) => countryName(a).localeCompare(countryName(b)));
            } else if (sort === 'recent') {
                sorted = [...allCodes].sort((a, b) => {
                    const da = countryData[a].lastVisit, db = countryData[b].lastVisit;
                    if (!da && !db) return 0;
                    if (!da) return 1;
                    if (!db) return -1;
                    return new Date(db) - new Date(da);
                });
            } else if (sort === 'region') {
                sorted = [];
                const used = new Set();
                for (const [region, codes] of Object.entries(regions)) {
                    const regionCodes = codes.filter(c => allCodes.includes(c));
                    regionCodes.forEach(c => { sorted.push(c); used.add(c); });
                }
                allCodes.filter(c => !used.has(c)).forEach(c => sorted.push(c));
            } else {
                sorted = allCodes;
            }
            document.getElementById('countries-grid').innerHTML = renderCountryCards(sorted, countryData, sort);
        };
    });
}

function renderCountryCards(codes, countryData, sortMode) {
    const regions = {
        'Asia & Pacific': ['JP','KR','CN','TW','HK','TH','VN','SG','MY','ID','PH','GU','AU','NZ','NC','VU','IN'],
        'Europe': ['GB','IE','FR','DE','IT','ES','PT','NL','BE','AT','CH','DK','SE','NO','FI','IS','EE','LV','LT','PL','CZ','SK','HU','HR','ME','AL','GR','TR','MT','CY','GI','MK','RS','BA','SI','RO','BG','UA','BY','MD','MC','LI','SM','VA','AD','LU'],
        'Americas': ['US','CA','MX','CO','CR','PA','PR','VI','BS','KY','DO','SX','TC','JM','HT','CU','BZ','HN','GT','SV','NI','BB','TT','AW','CW','BM','LC','AG','KN','DM','GD','VC','BR','AR','CL','PE','EC'],
        'Middle East & Africa': ['AE']
    };

    let html = '';
    let currentRegion = '';

    for (const code of codes) {
        const cd = countryData[code];
        if (!cd) continue;

        // Region header for region sort
        if (sortMode === 'region') {
            for (const [region, rcodes] of Object.entries(regions)) {
                if (rcodes.includes(code) && region !== currentRegion) {
                    currentRegion = region;
                    html += '<div class="region-header">' + region + '</div>';
                    break;
                }
            }
        }

        const flag = FLAG_EMOJI[code] || '';
        const name = countryName(code);
        const cities = [...cd.cities].slice(0, 5).join(', ');
        const firstDate = cd.firstVisit ? fmtDate(cd.firstVisit) : 'Unknown';
        const lastDate = cd.lastVisit ? fmtDate(cd.lastVisit) : '';
        const tripCount = cd.trips.size;

        html += '<div class="country-card" onclick="this.classList.toggle(\'expanded\')">';
        html += '<div class="cc-header">';
        html += '<span class="cc-flag">' + flag + '</span>';
        html += '<span class="cc-name">' + esc(name) + '</span>';
        html += '<span class="cc-visits">' + cd.visits + ' visit' + (cd.visits !== 1 ? 's' : '') + '</span>';
        html += '</div>';
        html += '<div class="cc-body">';
        html += '<div class="cc-row"><span class="cc-label">First visit:</span> ' + firstDate + '</div>';
        if (lastDate && lastDate !== firstDate) html += '<div class="cc-row"><span class="cc-label">Last visit:</span> ' + lastDate + '</div>';
        html += '<div class="cc-row"><span class="cc-label">Cities:</span> ' + esc(cities) + (cd.cities.size > 5 ? ' +' + (cd.cities.size - 5) + ' more' : '') + '</div>';
        html += '<div class="cc-row"><span class="cc-label">Trips:</span> ' + tripCount + '</div>';
        html += '<div class="cc-trips">';
        [...cd.trips].slice(0, 4).forEach(t => {
            html += '<div class="cc-trip-name">' + esc(t.length > 60 ? t.substring(0, 57) + '...' : t) + '</div>';
        });
        if (cd.trips.size > 4) html += '<div class="cc-trip-name cc-more">+' + (cd.trips.size - 4) + ' more trips</div>';
        html += '</div>';
        html += '</div>';
        html += '</div>';
    }
    return html;
}

// ==================== ANNUAL SUMMARY VIEW ====================
function renderSummaryView() {
    const container = document.getElementById('summary-container');
    const years = [...new Set(tripsData.map(t => getTripYear(t)))].filter(y => y !== 9999).sort((a, b) => b - a);

    let html = '<div class="summary-header"><h2>Annual Travel Summary</h2></div>';

    // Year selector
    html += '<div class="summary-year-tabs">';
    html += '<button class="sy-tab active" data-year="all">All Time</button>';
    years.forEach(yr => {
        html += '<button class="sy-tab" data-year="' + yr + '">' + yr + '</button>';
    });
    html += '</div>';

    html += '<div id="summary-content">';
    html += buildSummaryContent('all');
    html += '</div>';

    container.innerHTML = html;

    // Year tab handlers
    container.querySelectorAll('.sy-tab').forEach(tab => {
        tab.onclick = function() {
            container.querySelectorAll('.sy-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            document.getElementById('summary-content').innerHTML = buildSummaryContent(this.dataset.year);
        };
    });
}

function buildSummaryContent(yearFilter) {
    const isAll = yearFilter === 'all';
    const filteredTrips = tripsData.filter(t => {
        if (isAll) return !isHomeTrip(t);
        return !isHomeTrip(t) && String(getTripYear(t)) === yearFilter;
    });

    const allSegs = filteredTrips.flatMap(t => t.Segments || []);
    const cruises = allSegs.filter(s => s.SegmentType === 'Cruise');
    const flights = allSegs.filter(s => s.SegmentType === 'Flight');
    const trains = allSegs.filter(s => s.SegmentType === 'Train');
    const buses = allSegs.filter(s => s.SegmentType === 'Bus');

    // Countries
    const countries = new Set();
    allSegs.forEach(s => {
        const fc = getSegFromCountry(s);
        const tc = getSegToCountry(s);
        if (fc) countries.add(fc);
        if (tc) countries.add(tc);
        if (s.PortsOfCall) s.PortsOfCall.forEach(p => { if (p.CountryCode) countries.add(p.CountryCode); });
    });

    // Ships
    const ships = new Set();
    cruises.forEach(c => { if (c.Ship) ships.add(c.Ship); });

    // Cruise days
    let cruiseDays = 0;
    cruises.forEach(c => {
        const s = getSegStart(c), e = getSegEnd(c);
        if (s && e) cruiseDays += daysBetween(s, e);
    });

    // Ports of call
    const ports = new Set();
    cruises.forEach(c => {
        (c.PortsOfCall || []).forEach(p => ports.add(p.PortName || p.City || ''));
    });

    // Travel days
    let totalTravelDays = 0;
    filteredTrips.forEach(t => {
        const r = getTripDateRange(t);
        if (r.start && r.end) totalTravelDays += daysBetween(r.start, r.end);
    });

    // Events
    const tripIds = new Set(filteredTrips.map(t => t.TripId));
    const events = eventsData.filter(e => tripIds.has(e.TripId));

    // Unique booking refs (flight bookings)
    const flightBookings = new Set(flights.filter(f => f.BookingNumber).map(f => f.BookingNumber));

    // Airlines
    const airlines = new Set();
    flights.forEach(f => { if (f.Airline) airlines.add(f.Airline); });

    // Cities
    const cities = new Set();
    allSegs.forEach(s => {
        const from = getSegFrom(s).replace(/\s*\(.*\)/, '');
        const to = getSegTo(s).replace(/\s*\(.*\)/, '');
        if (from) cities.add(from);
        if (to) cities.add(to);
    });

    const title = isAll ? 'All Time Stats' : yearFilter + ' in Review';

    let html = '<div class="summary-title">' + title + '</div>';

    // Big stat cards
    html += '<div class="summary-cards">';
    html += buildStatCard('\u{1F30D}', 'Trips', filteredTrips.length, '');
    html += buildStatCard('\u{1F3F3}\uFE0F', 'Countries', countries.size, Math.round(countries.size / 195 * 100) + '% of world');
    html += buildStatCard('\u{1F3D9}\uFE0F', 'Cities', cities.size, '');
    html += buildStatCard('\u{1F4C5}', 'Travel Days', totalTravelDays, totalTravelDays > 365 ? (totalTravelDays / 365.25).toFixed(1) + ' years' : '');
    html += buildStatCard('\u{1F6A2}', 'Cruises', cruises.length, cruiseDays + ' days at sea');
    html += buildStatCard('\u2708\uFE0F', 'Flights', flights.length, flightBookings.size + ' bookings');
    html += buildStatCard('\u{1F686}', 'Trains', trains.length, '');
    html += buildStatCard('\u2693', 'Ports', ports.size, '');
    html += buildStatCard('\u{1F3AB}', 'Events', events.length, '');
    html += '</div>';

    // Breakdowns
    html += '<div class="summary-sections">';

    // Ships used
    if (ships.size > 0) {
        html += '<div class="summary-section">';
        html += '<h3>\u{1F6A2} Ships (' + ships.size + ')</h3>';
        html += '<div class="ss-list">';
        [...ships].sort().forEach(ship => {
            const shipCruises = cruises.filter(c => c.Ship === ship);
            let shipDays = 0;
            shipCruises.forEach(c => {
                const s = getSegStart(c), e = getSegEnd(c);
                if (s && e) shipDays += daysBetween(s, e);
            });
            html += '<div class="ss-item"><span class="ss-name">' + esc(ship) + '</span><span class="ss-stat">' + shipCruises.length + ' cruise' + (shipCruises.length > 1 ? 's' : '') + ', ' + shipDays + ' days</span></div>';
        });
        html += '</div></div>';
    }

    // Airlines
    if (airlines.size > 0) {
        html += '<div class="summary-section">';
        html += '<h3>\u2708\uFE0F Airlines (' + airlines.size + ')</h3>';
        html += '<div class="ss-list">';
        [...airlines].sort().forEach(airline => {
            const count = flights.filter(f => f.Airline === airline).length;
            html += '<div class="ss-item"><span class="ss-name">' + esc(airline) + '</span><span class="ss-stat">' + count + ' flight' + (count > 1 ? 's' : '') + '</span></div>';
        });
        html += '</div></div>';
    }

    // Countries list
    if (countries.size > 0) {
        html += '<div class="summary-section">';
        html += '<h3>\u{1F3F3}\uFE0F Countries (' + countries.size + ')</h3>';
        html += '<div class="ss-countries">';
        [...countries].sort((a, b) => countryName(a).localeCompare(countryName(b))).forEach(code => {
            const flag = FLAG_EMOJI[code] || '';
            html += '<span class="ss-country">' + flag + ' ' + countryName(code) + '</span>';
        });
        html += '</div></div>';
    }

    // Trip list
    html += '<div class="summary-section">';
    html += '<h3>\u{1F30D} Trips (' + filteredTrips.length + ')</h3>';
    html += '<div class="ss-list">';
    filteredTrips.sort((a, b) => {
        const da = getTripDateRange(a).start, db = getTripDateRange(b).start;
        return new Date(da || 0) - new Date(db || 0);
    }).forEach(trip => {
        const r = getTripDateRange(trip);
        const dur = tripDurationText(r.start, r.end);
        const segCount = (trip.Segments || []).length;
        html += '<div class="ss-item"><span class="ss-name">' + esc(trip.TripName) + '</span><span class="ss-stat">' + fmtDate(r.start) + (dur ? ' (' + dur + ')' : '') + ' - ' + segCount + ' segments</span></div>';
    });
    html += '</div></div>';

    html += '</div>';
    return html;
}

function buildStatCard(icon, label, value, sub) {
    return '<div class="stat-card"><div class="sc-icon">' + icon + '</div><div class="sc-value">' + value + '</div><div class="sc-label">' + label + '</div>' + (sub ? '<div class="sc-sub">' + sub + '</div>' : '') + '</div>';
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

    const years = [...new Set(tripsData.map(t => getTripYear(t)))].filter(y => y !== 9999).sort((a,b) => b - a);
    years.forEach(yr => {
        const opt = document.createElement('option');
        opt.value = yr;
        opt.textContent = yr;
        yearFilter.appendChild(opt);
    });

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
    else if (currentView === 'countries') renderCountriesView();
    else if (currentView === 'summary') renderSummaryView();
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

    const mapFilters = document.getElementById('map-filters');
    const tableFilters = document.getElementById('filters');
    const statsBar = document.getElementById('stats-bar');
    if (view === 'globe') {
        mapFilters.style.display = 'flex';
        tableFilters.style.display = 'none';
        statsBar.style.display = 'none';
        handleMapResize();
    } else {
        mapFilters.style.display = 'none';
        tableFilters.style.display = view === 'countries' || view === 'summary' ? 'none' : 'flex';
        statsBar.style.display = view === 'countries' || view === 'summary' ? 'none' : 'flex';
        // Hide detail panel when switching away from globe
        var dp = document.getElementById('detail-panel');
        if (dp) dp.style.display = 'none';
    }

    render();
}

// ==================== SEARCH SETUP ====================
function setupSearch() {
    const searchInput = document.getElementById('map-search');
    const resultsDiv = document.getElementById('map-search-results');

    searchInput.addEventListener('input', function() {
        const query = this.value;
        const results = searchLocations(query);

        if (results.length === 0) {
            resultsDiv.style.display = 'none';
            return;
        }

        let html = '';
        results.forEach(item => {
            const typeIcon = item.type === 'Ship' ? '\u{1F6A2}' :
                             item.type === 'Airport' || item.type === 'Airport Code' ? '\u2708\uFE0F' :
                             item.type === 'Cruise Port' ? '\u2693' :
                             item.type === 'Train Station' ? '\u{1F686}' :
                             item.type === 'Country' ? '\u{1F3F3}\uFE0F' :
                             item.type === 'Trip' ? '\u{1F30D}' : '\u{1F4CD}';
            const countryStr = item.countries.length > 0 ? ' <span class="sr-country">' + item.countries.map(c => countryName(c)).join(', ') + '</span>' : '';
            html += '<div class="search-result" data-name="' + esc(item.name) + '" data-type="' + esc(item.type) + '">';
            html += '<span class="sr-icon">' + typeIcon + '</span>';
            html += '<span class="sr-name">' + esc(item.name) + '</span>';
            html += '<span class="sr-type">' + esc(item.type) + '</span>';
            html += countryStr;
            html += '</div>';
        });
        resultsDiv.innerHTML = html;
        resultsDiv.style.display = 'block';

        resultsDiv.querySelectorAll('.search-result').forEach(el => {
            el.onclick = function() {
                const name = this.dataset.name;
                const type = this.dataset.type;
                searchInput.value = name;
                resultsDiv.style.display = 'none';

                if (type === 'Trip') {
                    // Find and select the trip in the filter
                    const tripFilter = document.getElementById('map-trip-filter');
                    for (const opt of tripFilter.options) {
                        if (opt.textContent.includes(name.substring(0, 20))) {
                            tripFilter.value = opt.value;
                            applyMapFilters();
                            return;
                        }
                    }
                } else if (type === 'Ship') {
                    const shipFilter = document.getElementById('map-ship-filter');
                    for (const opt of shipFilter.options) {
                        if (opt.textContent.includes(name)) {
                            shipFilter.value = opt.value;
                            applyMapFilters();
                            return;
                        }
                    }
                }

                flyToLocation(name, type);
            };
        });
    });

    searchInput.addEventListener('focus', function() {
        if (this.value.length >= 2) {
            resultsDiv.style.display = 'block';
        }
    });

    document.addEventListener('click', function(e) {
        if (!e.target.closest('.map-search-wrapper')) {
            resultsDiv.style.display = 'none';
        }
    });
}

// ==================== INIT ====================
async function init() {
    try {
        const [tripsRes, eventsRes] = await Promise.all([
            fetch('data/trips.json?v=220'),
            fetch('data/events.json?v=220')
        ]);
        tripsData = await tripsRes.json();
        eventsData = await eventsRes.json();
    } catch (err) {
        console.error('Failed to load data:', err);
        document.getElementById('table-wrapper').innerHTML = '<p class="empty">Failed to load data. Check console.</p>';
        return;
    }

    document.getElementById('stats-bar').style.display = 'none';

    // Build search index
    buildSearchIndex();

    // Populate year filter (table/timeline/gaps)
    const years = [...new Set(tripsData.map(t => getTripYear(t)))].filter(y => y !== 9999).sort((a, b) => b - a);
    const yearSelect = document.getElementById('year-filter');
    for (const yr of years) {
        const opt = document.createElement('option');
        opt.value = yr;
        opt.textContent = yr;
        yearSelect.appendChild(opt);
    }

    // Set default date for "Where Was I On" to today or a sample date
    const whereDate = document.getElementById('where-date');
    whereDate.value = '2025-06-15'; // Default to a date during travel

    // Populate map filters
    populateMapFilters();

    // Setup search
    setupSearch();

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
        document.getElementById('map-search').value = '';
        document.getElementById('where-result').style.display = 'none';
        applyMapFilters();
    });

    // Where Was I On
    document.getElementById('where-btn').addEventListener('click', function() {
        const dateVal = document.getElementById('where-date').value;
        if (dateVal) showWhereResult(dateVal);
    });

    // Initial render
    render();
}

init();
