// Travel Verification Tool - app.js
// Source of truth: data/trips.json and data/events.json
// DO NOT modify data files. Gap detection is script-side only.

let tripsData = [];
let eventsData = [];
let currentView = 'table';

// Helpers
const segIcon = t => ({Cruise:'\u{1F6A2}',Flight:'\u2708\uFE0F',Train:'\u{1F686}',Bus:'\u{1F68C}',Accommodation:'\u{1F3E8}'}[t]||'\u{1F4CD}');
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '';
const fmtShort = d => d ? new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '';
const fmtTime = d => d ? new Date(d).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}) : '';
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
    if (seg.DeparturePort) return seg.DeparturePort.City || seg.DeparturePort.PortName || '';
    if (seg.Departure) return seg.Departure.City || '';
    if (seg.City) return seg.City;
    return '';
}
function getSegTo(seg) {
    if (seg.ArrivalPort) return seg.ArrivalPort.City || seg.ArrivalPort.PortName || '';
    if (seg.Arrival) return seg.Arrival.City || '';
    if (seg.City) return seg.City;
    return '';
}
function getSegFromFull(seg) {
    if (seg.DeparturePort) {
        const p = seg.DeparturePort;
        return `${p.City||p.PortName||''}, ${p.CountryCode||''}`;
    }
    if (seg.Departure) {
        const d = seg.Departure;
        return d.Code ? `${d.City} (${d.Code})` : (d.City||'');
    }
    if (seg.City) return `${seg.City}, ${seg.CountryCode||''}`;
    return '';
}
function getSegToFull(seg) {
    if (seg.ArrivalPort) {
        const p = seg.ArrivalPort;
        return `${p.City||p.PortName||''}, ${p.CountryCode||''}`;
    }
    if (seg.Arrival) {
        const a = seg.Arrival;
        return a.Code ? `${a.City} (${a.Code})` : (a.City||'');
    }
    if (seg.City) return `${seg.City}, ${seg.CountryCode||''}`;
    return '';
}
function getSegDetail(seg) {
    switch(seg.SegmentType) {
        case 'Cruise': return `${seg.CruiseLine||''} ${seg.Ship||''}`.trim();
        case 'Flight': return `${seg.Airline||''}${seg.FlightNumber ? ' '+seg.FlightNumber : ''}`.trim();
        case 'Train': return `${seg.Operator||''}${seg.TrainNumber ? ' '+seg.TrainNumber : ''}`.trim();
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

// Group connected flights (same booking number within a trip) and back-to-back trains
function groupSegments(segments) {
    const groups = [];
    const used = new Set();
    for (let i = 0; i < segments.length; i++) {
        if (used.has(i)) continue;
        const seg = segments[i];
        if (seg.SegmentType === 'Flight' && seg.BookingNumber) {
            const connected = [seg];
            used.add(i);
            for (let j = i + 1; j < segments.length; j++) {
                if (used.has(j)) continue;
                if (segments[j].SegmentType === 'Flight' && segments[j].BookingNumber === seg.BookingNumber) {
                    connected.push(segments[j]);
                    used.add(j);
                }
            }
            if (connected.length > 1) {
                connected.sort((a,b) => new Date(getSegStart(a)||0) - new Date(getSegStart(b)||0));
                groups.push({ type: 'flight-group', segments: connected, booking: seg.BookingNumber });
            } else {
                groups.push({ type: 'single', segment: seg });
            }
        } else if (seg.SegmentType === 'Train') {
            const trainGroup = [seg];
            used.add(i);
            let lastEnd = getSegEnd(seg);
            for (let j = i + 1; j < segments.length; j++) {
                if (used.has(j)) continue;
                if (segments[j].SegmentType !== 'Train') break;
                const nextStart = getSegStart(segments[j]);
                if (lastEnd && nextStart) {
                    const gapHours = (new Date(nextStart) - new Date(lastEnd)) / (3600000);
                    if (gapHours >= 0 && gapHours <= 3) {
                        trainGroup.push(segments[j]);
                        used.add(j);
                        lastEnd = getSegEnd(segments[j]);
                    } else break;
                } else break;
            }
            if (trainGroup.length > 1) {
                groups.push({ type: 'train-group', segments: trainGroup });
            } else {
                groups.push({ type: 'single', segment: seg });
            }
        } else {
            used.add(i);
            groups.push({ type: 'single', segment: seg });
        }
    }
    return groups;
}

// Detect gaps in data
function detectGaps() {
    const gaps = [];
    for (const trip of tripsData) {
        const segs = trip.Segments || [];
        // Missing booking numbers
        for (const seg of segs) {
            if (!seg.BookingNumber) {
                gaps.push({ trip: trip.TripName, tripId: trip.TripId, severity: 'warning',
                    msg: `Missing booking number: ${segIcon(seg.SegmentType)} ${seg.SegmentType} - ${getSegDetail(seg)} (${getSegFrom(seg)} to ${getSegTo(seg)})` });
            }
        }
        // Inferred segments
        for (const seg of segs) {
            if (seg.Source === 'inferred') {
                gaps.push({ trip: trip.TripName, tripId: trip.TripId, severity: 'info',
                    msg: `Inferred segment: ${segIcon(seg.SegmentType)} ${seg.SegmentType} - ${getSegDetail(seg)} (${getSegFrom(seg)} to ${getSegTo(seg)})` });
            }
        }
        // Time gaps between segments (> 24 hours unaccounted)
        const sorted = [...segs].filter(s => getSegEnd(s) && getSegStart(s))
            .sort((a,b) => new Date(getSegEnd(a)) - new Date(getSegEnd(b)));
        for (let i = 0; i < sorted.length - 1; i++) {
            const end = getSegEnd(sorted[i]);
            const nextStart = getSegStart(sorted[i+1]);
            if (end && nextStart) {
                const gapDays = daysBetween(end, nextStart);
                if (gapDays > 1) {
                    gaps.push({ trip: trip.TripName, tripId: trip.TripId, severity: 'info',
                        msg: `${gapDays}-day gap between "${getSegDetail(sorted[i])}" ending ${fmtDate(end)} and "${getSegDetail(sorted[i+1])}" starting ${fmtDate(nextStart)}` });
                }
            }
        }
        // Missing departure/arrival times
        for (const seg of segs) {
            if (seg.SegmentType !== 'Accommodation') {
                if (!getSegStart(seg)) {
                    gaps.push({ trip: trip.TripName, tripId: trip.TripId, severity: 'warning',
                        msg: `Missing departure time: ${segIcon(seg.SegmentType)} ${getSegDetail(seg)}` });
                }
                if (!getSegEnd(seg)) {
                    gaps.push({ trip: trip.TripName, tripId: trip.TripId, severity: 'warning',
                        msg: `Missing arrival time: ${segIcon(seg.SegmentType)} ${getSegDetail(seg)}` });
                }
            }
        }
    }
    return gaps;
}

// ==================== TABLE VIEW ====================
function renderTableView(trips, events) {
    const wrapper = document.getElementById('table-wrapper');
    if (!trips.length) { wrapper.innerHTML = '<p class="empty">No trips match filters.</p>'; return; }
    let html = '';
    for (const trip of trips) {
        const range = getTripDateRange(trip);
        const segCount = (trip.Segments||[]).length;
        const tripEvents = events.filter(e => e.TripId === trip.TripId);
        const groups = groupSegments(trip.Segments || []);
        html += `<div class="trip-card">
            <div class="trip-header" onclick="this.parentElement.classList.toggle('expanded')">
                <div class="trip-title">${trip.TripName}</div>
                <div class="trip-meta">
                    <span>${fmtDate(range.start)} - ${fmtDate(range.end)}</span>
                    <span>${segCount} segment${segCount!==1?'s':''}</span>
                    ${tripEvents.length ? `<span>${tripEvents.length} event${tripEvents.length!==1?'s':''}</span>` : ''}
                    <span class="expand-icon">&#9660;</span>
                </div>
            </div>
            <div class="trip-body">
                <table class="seg-table">
                    <thead><tr>
                        <th>Type</th><th>Detail</th><th>From</th><th>To</th>
                        <th>Depart</th><th>Arrive</th><th>Booking</th><th>Source</th>
                    </tr></thead>
                    <tbody>`;
        for (const group of groups) {
            if (group.type === 'single') {
                html += renderSegRow(group.segment);
            } else if (group.type === 'flight-group') {
                const first = group.segments[0];
                const last = group.segments[group.segments.length - 1];
                const id = 'grp-' + Math.random().toString(36).substr(2, 8);
                html += `<tr class="group-header" onclick="document.querySelectorAll('.${id}').forEach(r=>r.classList.toggle('show'))">
                    <td>${segIcon('Flight')} Flight</td>
                    <td>${first.Airline || ''} (${group.segments.length} legs) <span class="conn-badge">connection</span></td>
                    <td>${getSegFromFull(first)}</td>
                    <td>${getSegToFull(last)}</td>
                    <td>${fmtDate(getSegStart(first))} ${fmtTime(getSegStart(first))}</td>
                    <td>${fmtDate(getSegEnd(last))} ${fmtTime(getSegEnd(last))}</td>
                    <td>${group.booking||''}</td>
                    <td>${first.Source||''}</td>
                </tr>`;
                for (const leg of group.segments) {
                    html += `<tr class="conn-leg ${id}">
                        <td></td>
                        <td class="indent">${leg.Airline||''} ${leg.FlightNumber||''} ${leg.SeatClass?'('+leg.SeatClass+')':''}</td>
                        <td>${getSegFromFull(leg)}</td>
                        <td>${getSegToFull(leg)}</td>
                        <td>${fmtDate(getSegStart(leg))} ${fmtTime(getSegStart(leg))}</td>
                        <td>${fmtDate(getSegEnd(leg))} ${fmtTime(getSegEnd(leg))}</td>
                        <td>${leg.BookingNumber||''}</td>
                        <td>${leg.Source||''}</td>
                    </tr>`;
                }
            } else if (group.type === 'train-group') {
                const first = group.segments[0];
                const last = group.segments[group.segments.length - 1];
                const id = 'grp-' + Math.random().toString(36).substr(2, 8);
                html += `<tr class="group-header" onclick="document.querySelectorAll('.${id}').forEach(r=>r.classList.toggle('show'))">
                    <td>${segIcon('Train')} Train</td>
                    <td>${first.Operator||''} (${group.segments.length} legs) <span class="conn-badge">connection</span></td>
                    <td>${getSegFromFull(first)}</td>
                    <td>${getSegToFull(last)}</td>
                    <td>${fmtDate(getSegStart(first))} ${fmtTime(getSegStart(first))}</td>
                    <td>${fmtDate(getSegEnd(last))} ${fmtTime(getSegEnd(last))}</td>
                    <td>${first.BookingNumber||''}</td>
                    <td>${first.Source||''}</td>
                </tr>`;
                for (const leg of group.segments) {
                    html += `<tr class="conn-leg ${id}">
                        <td></td>
                        <td class="indent">${leg.Operator||''} ${leg.TrainNumber||''} ${leg.SeatClass?'('+leg.SeatClass+')':''}</td>
                        <td>${getSegFromFull(leg)}</td>
                        <td>${getSegToFull(leg)}</td>
                        <td>${fmtDate(getSegStart(leg))} ${fmtTime(getSegStart(leg))}</td>
                        <td>${fmtDate(getSegEnd(leg))} ${fmtTime(getSegEnd(leg))}</td>
                        <td>${leg.BookingNumber||''}</td>
                        <td>${leg.Source||''}</td>
                    </tr>`;
                }
            }
        }
        // Cruise port calls (expandable within the cruise row)
        // Events for this trip
        if (tripEvents.length) {
            html += `<tr class="event-separator"><td colspan="8">Events</td></tr>`;
            for (const ev of tripEvents) {
                html += `<tr class="event-row">
                    <td>\u{1F3AF} ${ev.EventType}</td>
                    <td>${ev.Title}</td>
                    <td>${ev.City}, ${ev.CountryCode}</td>
                    <td></td>
                    <td>${fmtDate(ev.StartTime)} ${ev.IsFullDay?'(all day)':fmtTime(ev.StartTime)}</td>
                    <td>${ev.EndTime ? fmtTime(ev.EndTime) : ''}</td>
                    <td></td>
                    <td>${ev.Source||''}</td>
                </tr>`;
            }
        }
        html += '</tbody></table></div></div>';
    }
    wrapper.innerHTML = html;
}

function renderSegRow(seg) {
    // For cruises, make them expandable to show port calls
    if (seg.SegmentType === 'Cruise' && seg.PortsOfCall && seg.PortsOfCall.length) {
        const id = 'ports-' + Math.random().toString(36).substr(2, 8);
        let html = `<tr class="group-header" onclick="document.querySelectorAll('.${id}').forEach(r=>r.classList.toggle('show'))">
            <td>${segIcon(seg.SegmentType)} ${seg.SegmentType}</td>
            <td>${getSegDetail(seg)} ${seg.RoomType?'('+seg.RoomType+')':''} ${seg.Stateroom?'#'+seg.Stateroom:''} <span class="conn-badge">${seg.PortsOfCall.length} ports</span></td>
            <td>${getSegFromFull(seg)}</td>
            <td>${getSegToFull(seg)}</td>
            <td>${fmtDate(getSegStart(seg))} ${fmtTime(getSegStart(seg))}</td>
            <td>${fmtDate(getSegEnd(seg))} ${fmtTime(getSegEnd(seg))}</td>
            <td>${seg.BookingNumber||''}</td>
            <td>${seg.Source||''}</td>
        </tr>`;
        for (const port of seg.PortsOfCall) {
            html += `<tr class="conn-leg ${id}">
                <td></td>
                <td class="indent">\u2693 ${port.PortName || port.City || ''}</td>
                <td>${port.City||''}, ${port.CountryCode||''}</td>
                <td></td>
                <td>${fmtDate(port.Date)}</td>
                <td></td>
                <td></td>
                <td></td>
            </tr>`;
        }
        return html;
    }
    // Regular single segment row
    let extra = '';
    if (seg.SegmentType === 'Flight') extra = seg.SeatClass ? ' (' + seg.SeatClass + ')' : '';
    if (seg.SegmentType === 'Train') extra = seg.SeatClass ? ' (' + seg.SeatClass + ')' : '';
    if (seg.SegmentType === 'Accommodation') extra = seg.Address1 ? ' - ' + seg.Address1 : '';
    const missingBooking = !seg.BookingNumber ? ' class="missing"' : '';
    return `<tr>
        <td>${segIcon(seg.SegmentType)} ${seg.SegmentType}</td>
        <td>${getSegDetail(seg)}${extra}</td>
        <td>${getSegFromFull(seg)}</td>
        <td>${getSegToFull(seg)}</td>
        <td>${fmtDate(getSegStart(seg))} ${fmtTime(getSegStart(seg))}</td>
        <td>${fmtDate(getSegEnd(seg))} ${fmtTime(getSegEnd(seg))}</td>
        <td${missingBooking}>${seg.BookingNumber || '<span class="gap-marker">missing</span>'}</td>
        <td>${seg.Source||''}</td>
    </tr>`;
}

// ==================== TIMELINE VIEW ====================
function renderTimelineView(trips, events) {
    const container = document.getElementById('timeline-container');
    // Group by year descending
    const byYear = {};
    for (const trip of trips) {
        const year = getTripYear(trip);
        if (!byYear[year]) byYear[year] = [];
        byYear[year].push(trip);
    }
    const years = Object.keys(byYear).sort((a,b) => b - a);
    let html = '';
    for (const year of years) {
        const yearTrips = byYear[year].sort((a,b) => {
            const aStart = getTripDateRange(a).start;
            const bStart = getTripDateRange(b).start;
            return new Date(bStart||0) - new Date(aStart||0);
        });
        html += `<div class="timeline-year">
            <div class="year-header" onclick="this.parentElement.classList.toggle('collapsed')">
                <h2>${year}</h2>
                <span class="trip-count">${yearTrips.length} trip${yearTrips.length!==1?'s':''}</span>
                <span class="expand-icon">&#9660;</span>
            </div>
            <div class="year-body">`;
        for (const trip of yearTrips) {
            const range = getTripDateRange(trip);
            const days = range.start && range.end ? daysBetween(range.start, range.end) : 0;
            const groups = groupSegments(trip.Segments || []);
            const tripEvents = events.filter(e => e.TripId === trip.TripId);
            html += `<div class="timeline-trip">
                <div class="timeline-trip-header" onclick="this.parentElement.classList.toggle('expanded')">
                    <div class="timeline-trip-title">${trip.TripName}</div>
                    <div class="timeline-trip-dates">
                        ${fmtDate(range.start)} - ${fmtDate(range.end)}
                        ${days ? `(${days} days)` : ''}
                    </div>
                    <span class="expand-icon">&#9660;</span>
                </div>
                <div class="timeline-trip-body">
                    <div class="timeline-segments">`;
            for (const group of groups) {
                if (group.type === 'single') {
                    const seg = group.segment;
                    html += renderTimelineSegment(seg);
                } else if (group.type === 'flight-group') {
                    const first = group.segments[0];
                    const last = group.segments[group.segments.length - 1];
                    const id = 'tl-' + Math.random().toString(36).substr(2, 8);
                    html += `<div class="tl-segment tl-group" onclick="this.classList.toggle('expanded')">
                        <div class="tl-icon">${segIcon('Flight')}</div>
                        <div class="tl-content">
                            <div class="tl-main">${first.Airline||''}: ${getSegFrom(first)} to ${getSegTo(last)} <span class="conn-badge">${group.segments.length} legs</span></div>
                            <div class="tl-time">${fmtDate(getSegStart(first))} ${fmtTime(getSegStart(first))} - ${fmtTime(getSegEnd(last))}</div>
                            <div class="tl-legs">`;
                    for (const leg of group.segments) {
                        html += `<div class="tl-leg">
                            ${leg.Airline||''} ${leg.FlightNumber||''}: ${getSegFrom(leg)} (${fmtTime(getSegStart(leg))}) to ${getSegTo(leg)} (${fmtTime(getSegEnd(leg))})
                        </div>`;
                    }
                    html += `</div></div></div>`;
                } else if (group.type === 'train-group') {
                    const first = group.segments[0];
                    const last = group.segments[group.segments.length - 1];
                    html += `<div class="tl-segment tl-group" onclick="this.classList.toggle('expanded')">
                        <div class="tl-icon">${segIcon('Train')}</div>
                        <div class="tl-content">
                            <div class="tl-main">${first.Operator||'Train'}: ${getSegFrom(first)} to ${getSegTo(last)} <span class="conn-badge">${group.segments.length} legs</span></div>
                            <div class="tl-time">${fmtDate(getSegStart(first))} ${fmtTime(getSegStart(first))} - ${fmtTime(getSegEnd(last))}</div>
                            <div class="tl-legs">`;
                    for (const leg of group.segments) {
                        html += `<div class="tl-leg">
                            ${leg.Operator||''} ${leg.TrainNumber||''}: ${getSegFrom(leg)} (${fmtTime(getSegStart(leg))}) to ${getSegTo(leg)} (${fmtTime(getSegEnd(leg))})
                        </div>`;
                    }
                    html += `</div></div></div>`;
                }
            }
            // Events in timeline
            if (tripEvents.length) {
                html += '<div class="tl-events-header">Events</div>';
                for (const ev of tripEvents) {
                    html += `<div class="tl-segment tl-event">
                        <div class="tl-icon">\u{1F3AF}</div>
                        <div class="tl-content">
                            <div class="tl-main">${ev.Title}</div>
                            <div class="tl-time">${fmtDate(ev.StartTime)} ${ev.IsFullDay?'(all day)':fmtTime(ev.StartTime)}${ev.Notes ? ' - '+ev.Notes.substring(0,80)+'...' : ''}</div>
                        </div>
                    </div>`;
                }
            }
            html += '</div></div></div>';
        }
        html += '</div></div>';
    }
    container.innerHTML = html;
}

function renderTimelineSegment(seg) {
    let detail = getSegDetail(seg);
    let timeStr = '';
    if (seg.SegmentType === 'Accommodation') {
        timeStr = `${fmtDate(seg.CheckInDate)} - ${fmtDate(seg.CheckOutDate)}`;
    } else {
        timeStr = `${fmtDate(getSegStart(seg))} ${fmtTime(getSegStart(seg))}`;
        if (getSegEnd(seg)) timeStr += ` - ${fmtTime(getSegEnd(seg))}`;
    }
    let portsHtml = '';
    if (seg.SegmentType === 'Cruise' && seg.PortsOfCall && seg.PortsOfCall.length) {
        portsHtml = `<div class="tl-legs">`;
        for (const p of seg.PortsOfCall) {
            portsHtml += `<div class="tl-leg">\u2693 ${p.PortName||p.City||''}, ${p.CountryCode||''} - ${fmtDate(p.Date)}</div>`;
        }
        portsHtml += '</div>';
        return `<div class="tl-segment tl-group" onclick="this.classList.toggle('expanded')">
            <div class="tl-icon">${segIcon(seg.SegmentType)}</div>
            <div class="tl-content">
                <div class="tl-main">${detail} <span class="conn-badge">${seg.PortsOfCall.length} ports</span></div>
                <div class="tl-sub">${getSegFrom(seg)} to ${getSegTo(seg)}</div>
                <div class="tl-time">${timeStr}</div>
                ${portsHtml}
            </div>
        </div>`;
    }
    return `<div class="tl-segment">
        <div class="tl-icon">${segIcon(seg.SegmentType)}</div>
        <div class="tl-content">
            <div class="tl-main">${detail}</div>
            <div class="tl-sub">${getSegFromFull(seg)} to ${getSegToFull(seg)}</div>
            <div class="tl-time">${timeStr}</div>
        </div>
    </div>`;
}

// ==================== GAPS VIEW ====================
function renderGapsView() {
    const container = document.getElementById('gaps-container');
    const gaps = detectGaps();
    if (!gaps.length) {
        container.innerHTML = '<p class="empty">No gaps or issues detected. All data looks complete!</p>';
        return;
    }
    // Group by trip
    const byTrip = {};
    for (const g of gaps) {
        if (!byTrip[g.trip]) byTrip[g.trip] = [];
        byTrip[g.trip].push(g);
    }
    let html = `<div class="gaps-summary">
        <h3>Data Issues Found</h3>
        <div class="gap-stats">
            <span class="gap-stat warning">${gaps.filter(g=>g.severity==='warning').length} warnings</span>
            <span class="gap-stat info">${gaps.filter(g=>g.severity==='info').length} info</span>
        </div>
    </div>`;
    for (const [tripName, tripGaps] of Object.entries(byTrip)) {
        html += `<div class="gap-trip">
            <div class="gap-trip-header" onclick="this.parentElement.classList.toggle('collapsed')">
                <h4>${tripName}</h4>
                <span>${tripGaps.length} issue${tripGaps.length!==1?'s':''}</span>
                <span class="expand-icon">&#9660;</span>
            </div>
            <div class="gap-trip-body">`;
        for (const g of tripGaps) {
            html += `<div class="gap-item ${g.severity}">
                <span class="gap-severity">${g.severity === 'warning' ? '\u26A0\uFE0F' : '\u2139\uFE0F'}</span>
                <span class="gap-msg">${g.msg}</span>
            </div>`;
        }
        html += '</div></div>';
    }
    container.innerHTML = html;
}

// ==================== STATS BAR ====================
function renderStats() {
    const bar = document.getElementById('stats-bar');
    let totalSegs = 0, cruises = 0, flights = 0, trains = 0, buses = 0, accommodations = 0;
    const countries = new Set();
    for (const trip of tripsData) {
        for (const seg of trip.Segments || []) {
            totalSegs++;
            if (seg.SegmentType === 'Cruise') cruises++;
            else if (seg.SegmentType === 'Flight') flights++;
            else if (seg.SegmentType === 'Train') trains++;
            else if (seg.SegmentType === 'Bus') buses++;
            else if (seg.SegmentType === 'Accommodation') accommodations++;
            // Collect countries
            if (seg.DeparturePort && seg.DeparturePort.CountryCode) countries.add(seg.DeparturePort.CountryCode);
            if (seg.ArrivalPort && seg.ArrivalPort.CountryCode) countries.add(seg.ArrivalPort.CountryCode);
            if (seg.Departure && seg.Departure.CountryCode) countries.add(seg.Departure.CountryCode);
            if (seg.Arrival && seg.Arrival.CountryCode) countries.add(seg.Arrival.CountryCode);
            if (seg.CountryCode) countries.add(seg.CountryCode);
            if (seg.PortsOfCall) seg.PortsOfCall.forEach(p => { if(p.CountryCode) countries.add(p.CountryCode); });
        }
    }
    const gapCount = detectGaps().filter(g => g.severity === 'warning').length;
    bar.innerHTML = `
        <div class="stat">\u{1F30D} <strong>${tripsData.length}</strong> trips</div>
        <div class="stat">\u{1F4CD} <strong>${totalSegs}</strong> segments</div>
        <div class="stat">\u{1F6A2} <strong>${cruises}</strong> cruises</div>
        <div class="stat">\u2708\uFE0F <strong>${flights}</strong> flights</div>
        <div class="stat">\u{1F686} <strong>${trains}</strong> trains</div>
        <div class="stat">\u{1F3E8} <strong>${accommodations}</strong> stays</div>
        <div class="stat">\u{1F30E} <strong>${countries.size}</strong> countries</div>
        <div class="stat">\u{1F3AF} <strong>${eventsData.length}</strong> events</div>
        ${gapCount ? `<div class="stat warning">\u26A0\uFE0F <strong>${gapCount}</strong> gaps</div>` : ''}
    `;
}

// ==================== FILTERING ====================
function getFilteredTrips() {
    let trips = [...tripsData];
    const search = document.getElementById('search-input').value.toLowerCase();
    const yearFilter = document.getElementById('year-filter').value;
    const typeFilter = document.getElementById('type-filter').value;
    const sourceFilter = document.getElementById('source-filter').value;

    if (search) {
        trips = trips.filter(t => {
            const name = t.TripName.toLowerCase();
            if (name.includes(search)) return true;
            return (t.Segments||[]).some(s =>
                (getSegDetail(s)||'').toLowerCase().includes(search) ||
                (getSegFrom(s)||'').toLowerCase().includes(search) ||
                (getSegTo(s)||'').toLowerCase().includes(search) ||
                (s.BookingNumber||'').toLowerCase().includes(search)
            );
        });
    }
    if (yearFilter !== 'all') {
        trips = trips.filter(t => String(getTripYear(t)) === yearFilter);
    }
    if (typeFilter !== 'all') {
        trips = trips.filter(t => (t.Segments||[]).some(s => s.SegmentType === typeFilter));
    }
    if (sourceFilter !== 'all') {
        trips = trips.filter(t => (t.Segments||[]).some(s => s.Source === sourceFilter));
    }
    // Sort descending by start date
    trips.sort((a,b) => {
        const aStart = getTripDateRange(a).start;
        const bStart = getTripDateRange(b).start;
        return new Date(bStart||0) - new Date(aStart||0);
    });
    return trips;
}

function populateYearFilter() {
    const sel = document.getElementById('year-filter');
    const years = new Set();
    for (const trip of tripsData) years.add(getTripYear(trip));
    const sorted = [...years].sort((a,b) => b - a);
    for (const y of sorted) {
        const opt = document.createElement('option');
        opt.value = y; opt.textContent = y;
        sel.appendChild(opt);
    }
}

function renderCurrentView() {
    const trips = getFilteredTrips();
    const events = eventsData;
    if (currentView === 'table') renderTableView(trips, events);
    else if (currentView === 'timeline') renderTimelineView(trips, events);
    else if (currentView === 'gaps') renderGapsView();
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
    } catch (err) {
        console.error('Failed to load data:', err);
        document.getElementById('table-wrapper').innerHTML = '<p class="empty">Failed to load data files.</p>';
        return;
    }
    populateYearFilter();
    renderStats();
    renderCurrentView();

    // Nav buttons
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
            currentView = btn.dataset.view;
            document.getElementById(currentView + '-view').classList.add('active');
            renderCurrentView();
        });
    });

    // Filters
    ['search-input','year-filter','type-filter','source-filter'].forEach(id => {
        const el = document.getElementById(id);
        el.addEventListener(id === 'search-input' ? 'input' : 'change', renderCurrentView);
    });
}

document.addEventListener('DOMContentLoaded', init);
