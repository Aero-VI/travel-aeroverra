// Travel Verification Tool - app.js
// Source of truth: data/trips.json and data/events.json
// DO NOT modify data files. Gap detection is script-side only.

let tripsData = [];
let eventsData = [];
let currentView = 'table';

const segIcon = t => ({Cruise:'\u{1F6A2}',Flight:'\u2708\uFE0F',Train:'\u{1F686}',Bus:'\u{1F68C}',Accommodation:'\u{1F3E8}'}[t]||'\u{1F4CD}');
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '';
const fmtShort = d => d ? new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '';
const fmtTime = d => d ? new Date(d).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}) : '';
const daysBetween = (a,b) => Math.round((new Date(b)-new Date(a))/(86400000));

function esc(str) { if (!str) return ''; return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

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
    if (seg.Departure) return seg.Departure.Code ? seg.Departure.City+' ('+seg.Departure.Code+')' : (seg.Departure.City||'');
    if (seg.City) return seg.City;
    return '';
}
function getSegTo(seg) {
    if (seg.ArrivalPort) return seg.ArrivalPort.City || seg.ArrivalPort.PortName || '';
    if (seg.Arrival) return seg.Arrival.Code ? seg.Arrival.City+' ('+seg.Arrival.Code+')' : (seg.Arrival.City||'');
    if (seg.City) return seg.City;
    return '';
}
function getSegDetail(seg) {
    switch(seg.SegmentType) {
        case 'Cruise': return (seg.CruiseLine||'')+' '+(seg.Ship||'');
        case 'Flight': return (seg.Airline||'')+(seg.FlightNumber?' '+seg.FlightNumber:'');
        case 'Train': return (seg.Operator||'')+(seg.TrainNumber?' '+seg.TrainNumber:'');
        case 'Bus': return (seg.Operator||'')+' '+(seg.Route||'');
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
function typeBadge(t) { return '<span class="badge badge-'+(t||'').toLowerCase()+'">'+segIcon(t)+' '+t+'</span>'; }
function srcBadge(s) { return '<span class="badge badge-'+(s||'email').toLowerCase()+'">'+(s||'unknown')+'</span>'; }

function groupSegments(segments) {
    const groups = [], used = new Set();
    for (let i = 0; i < segments.length; i++) {
        if (used.has(i)) continue;
        const seg = segments[i];
        if (seg.SegmentType === 'Flight' && seg.BookingNumber) {
            const connected = [seg]; used.add(i);
            for (let j = i+1; j < segments.length; j++) {
                if (used.has(j)) continue;
                if (segments[j].SegmentType === 'Flight' && segments[j].BookingNumber === seg.BookingNumber) { connected.push(segments[j]); used.add(j); }
            }
            if (connected.length > 1) { connected.sort((a,b) => new Date(getSegStart(a)||0)-new Date(getSegStart(b)||0)); groups.push({type:'flight-group',segments:connected,booking:seg.BookingNumber}); }
            else groups.push({type:'single',segment:seg});
        } else if (seg.SegmentType === 'Train') {
            const tg = [seg]; used.add(i); let lastEnd = getSegEnd(seg);
            for (let j = i+1; j < segments.length; j++) {
                if (used.has(j) || segments[j].SegmentType !== 'Train') break;
                const ns = getSegStart(segments[j]);
                if (lastEnd && ns && (new Date(ns)-new Date(lastEnd))/(36e5) <= 3 && (new Date(ns)-new Date(lastEnd))/(36e5) >= 0) { tg.push(segments[j]); used.add(j); lastEnd = getSegEnd(segments[j]); }
                else break;
            }
            groups.push(tg.length > 1 ? {type:'train-group',segments:tg} : {type:'single',segment:seg});
        } else { used.add(i); groups.push({type:'single',segment:seg}); }
    }
    return groups;
}

function detectGaps() {
    const gaps = {missingBooking:[],inferredSegments:[],timeGaps:[],missingFields:[]};
    for (const trip of tripsData) {
        const segs = trip.Segments||[];
        for (let i = 0; i < segs.length; i++) {
            const seg = segs[i];
            if (!seg.BookingNumber) gaps.missingBooking.push({trip:trip.TripName,seg,index:i});
            if (seg.Source === 'inferred') gaps.inferredSegments.push({trip:trip.TripName,seg,index:i});
            const missing = [];
            if (!getSegStart(seg)) missing.push('start date');
            if (!getSegEnd(seg)) missing.push('end date');
            if (seg.SegmentType==='Flight' && !seg.Airline) missing.push('airline');
            if (seg.SegmentType==='Flight' && !seg.FlightNumber) missing.push('flight number');
            if (seg.SegmentType==='Cruise' && !seg.Ship) missing.push('ship');
            if (missing.length) gaps.missingFields.push({trip:trip.TripName,seg,index:i,fields:missing});
            if (i > 0) {
                const pe = getSegEnd(segs[i-1]), ts = getSegStart(seg);
                if (pe && ts) { const d = daysBetween(pe,ts); if (d > 2) gaps.timeGaps.push({trip:trip.TripName,from:segs[i-1],to:seg,days:d}); }
            }
        }
    }
    return gaps;
}

function renderStats() {
    const bar = document.getElementById('stats-bar');
    const gaps = detectGaps();
    const totalGaps = gaps.missingBooking.length+gaps.inferredSegments.length+gaps.timeGaps.length+gaps.missingFields.length;
    const cruises = tripsData.reduce((n,t) => n+(t.Segments||[]).filter(s=>s.SegmentType==='Cruise').length, 0);
    const flights = tripsData.reduce((n,t) => n+(t.Segments||[]).filter(s=>s.SegmentType==='Flight').length, 0);
    bar.innerHTML = '<span class="stat-pill"><span class="num">'+tripsData.length+'</span>Trips</span>'
        +'<span class="stat-pill"><span class="num">'+tripsData.reduce((n,t)=>n+(t.Segments||[]).length,0)+'</span>Segments</span>'
        +'<span class="stat-pill"><span class="num">'+cruises+'</span>Cruises</span>'
        +'<span class="stat-pill"><span class="num">'+flights+'</span>Flights</span>'
        +'<span class="stat-pill"><span class="num">'+eventsData.length+'</span>Events</span>'
        +'<span class="stat-pill '+(totalGaps>0?'danger':'')+'"><span class="num">'+totalGaps+'</span>Issues</span>';
}

function renderSegRow(seg) {
    const start = getSegStart(seg), end = getSegEnd(seg);
    const days = (start && end) ? daysBetween(start,end) : '';
    const bk = seg.BookingNumber;
    const isInferred = seg.Source === 'inferred';
    if (seg.SegmentType === 'Cruise' && seg.PortsOfCall && seg.PortsOfCall.length > 0) return renderCruiseRow(seg);
    let cls = 'seg-row'; if (isInferred) cls += ' inferred-row'; if (!bk) cls += ' gap-row';
    return '<div class="'+cls+'">'
        +'<div>'+typeBadge(seg.SegmentType)+'</div>'
        +'<div>'+srcBadge(seg.Source)+'</div>'
        +'<div>'+esc(getSegDetail(seg).trim())+(seg.SeatClass?' <span class="text-muted">('+esc(seg.SeatClass)+')</span>':'')+(seg.Stateroom?' <span class="text-muted">Rm '+esc(seg.Stateroom)+'</span>':'')+'</div>'
        +'<div>'+esc(getSegFrom(seg))+(start?'<br><span class="text-muted">'+fmtDate(start)+' '+fmtTime(start)+'</span>':'')+'</div>'
        +'<div>'+esc(getSegTo(seg))+(end?'<br><span class="text-muted">'+fmtDate(end)+' '+fmtTime(end)+'</span>':'')+'</div>'
        +'<div>'+days+'</div>'
        +'<div>'+(bk?'<span class="booking-ref">'+esc(bk)+'</span>':'<span class="missing-field">No booking</span>')+'</div>'
        +'</div>';
}

function renderCruiseRow(seg) {
    const start = getSegStart(seg), end = getSegEnd(seg);
    const days = (start && end) ? daysBetween(start,end) : '';
    const bk = seg.BookingNumber; const ports = seg.PortsOfCall||[];
    let h = '<div class="cruise-expandable">'
        +'<div class="cruise-header" onclick="this.parentElement.classList.toggle(\'expanded\')">'
        +'<span class="expand-icon">&#9654;</span>'
        +'<div class="seg-row-inner">'
        +'<div>'+typeBadge('Cruise')+'</div>'
        +'<div>'+srcBadge(seg.Source)+'</div>'
        +'<div>'+esc(getSegDetail(seg).trim())+(seg.Stateroom?' <span class="text-muted">Rm '+esc(seg.Stateroom)+'</span>':'')+(seg.RoomType?' <span class="text-muted">('+esc(seg.RoomType)+')</span>':'')+'</div>'
        +'<div>'+esc(getSegFrom(seg))+(start?'<br><span class="text-muted">'+fmtDate(start)+'</span>':'')+'</div>'
        +'<div>'+esc(getSegTo(seg))+(end?'<br><span class="text-muted">'+fmtDate(end)+'</span>':'')+'</div>'
        +'<div>'+days+'</div>'
        +'<div>'+(bk?'<span class="booking-ref">'+esc(bk)+'</span>':'<span class="missing-field">No booking</span>')+'</div>'
        +'</div></div>'
        +'<div class="cruise-ports"><div class="port-list">';
    for (const p of ports) h += '<span class="port-chip"><span class="port-date">'+fmtShort(p.Date)+'</span> '+esc(p.City||p.PortName)+(p.CountryCode?' ('+p.CountryCode+')':'')+'</span>';
    h += '</div></div></div>';
    return h;
}

function renderConnectionGroup(segs, type, booking) {
    const first = segs[0], last = segs[segs.length-1];
    const s = getSegStart(first), e = getSegEnd(last);
    const days = (s&&e)?daysBetween(s,e):'';
    let h = '<div class="connection-group">'
        +'<div class="connection-header" onclick="this.parentElement.classList.toggle(\'expanded\')">'
        +'<span class="expand-icon">&#9654;</span>'
        +'<div>'+typeBadge(type)+'</div>'
        +'<div>'+srcBadge(first.Source)+'</div>'
        +'<div>'+esc(getSegDetail(first).trim())+' <span class="text-muted">('+segs.length+' legs)</span></div>'
        +'<div>'+esc(getSegFrom(first))+(s?'<br><span class="text-muted">'+fmtDate(s)+' '+fmtTime(s)+'</span>':'')+'</div>'
        +'<div>'+esc(getSegTo(last))+(e?'<br><span class="text-muted">'+fmtDate(e)+' '+fmtTime(e)+'</span>':'')+'</div>'
        +'<div>'+days+'</div>'
        +'<div>'+(booking?'<span class="booking-ref">'+esc(booking)+'</span>':'<span class="text-muted">mixed</span>')+'</div>'
        +'</div><div class="connection-legs">';
    for (const leg of segs) {
        const ls = getSegStart(leg), le = getSegEnd(leg);
        h += '<div class="seg-row leg-row"><div></div><div></div>'
            +'<div>'+esc(getSegDetail(leg).trim())+(leg.SeatClass?' <span class="text-muted">('+esc(leg.SeatClass)+')</span>':'')+'</div>'
            +'<div>'+esc(getSegFrom(leg))+(ls?'<br><span class="text-muted">'+fmtTime(ls)+'</span>':'')+'</div>'
            +'<div>'+esc(getSegTo(leg))+(le?'<br><span class="text-muted">'+fmtTime(le)+'</span>':'')+'</div>'
            +'<div></div>'
            +'<div>'+(leg.BookingNumber?'<span class="booking-ref">'+esc(leg.BookingNumber)+'</span>':'')+'</div></div>';
    }
    h += '</div></div>';
    return h;
}

function renderTableView(trips) {
    const w = document.getElementById('table-wrapper');
    if (!trips.length) { w.innerHTML = '<p class="empty-msg">No trips match your filters.</p>'; return; }
    let html = '';
    for (const trip of trips) {
        const range = getTripDateRange(trip);
        const events = getTripEvents(trip.TripId);
        const grouped = groupSegments(trip.Segments||[]);
        const hasMissing = (trip.Segments||[]).some(s => !s.BookingNumber);
        const hasInferred = (trip.Segments||[]).some(s => s.Source === 'inferred');
        const types = [...new Set((trip.Segments||[]).map(s => s.SegmentType))];
        html += '<div class="trip-group'+(hasMissing?' has-missing':'')+(hasInferred?' has-gaps':'')+'">'
            +'<div class="trip-header" onclick="this.parentElement.classList.toggle(\'expanded\')">'
            +'<span class="expand-icon">&#9654;</span>'
            +'<span class="trip-title">'+esc(trip.TripName)+'</span>'
            +'<span class="trip-badges">'+types.map(t=>typeBadge(t)).join('')+'</span>'
            +'<span class="trip-dates">'+fmtDate(range.start)+' - '+fmtDate(range.end)+'</span>'
            +'</div><div class="trip-body">';
        if (trip.HomeAtStart || trip.HomeAtEnd) {
            html += '<div class="home-info">';
            if (trip.HomeAtStart) html += '<strong>Home at start:</strong> '+esc(trip.HomeAtStart);
            if (trip.HomeAtStart && trip.HomeAtEnd) html += ' &rarr; ';
            if (trip.HomeAtEnd) html += '<strong>Home at end:</strong> '+esc(trip.HomeAtEnd);
            html += '</div>';
        }
        html += '<div class="seg-grid-header"><div>Type</div><div>Source</div><div>Detail</div><div>From</div><div>To</div><div>Days</div><div>Booking</div></div>';
        for (const g of grouped) {
            if (g.type === 'single') html += renderSegRow(g.segment);
            else if (g.type === 'flight-group') html += renderConnectionGroup(g.segments, 'Flight', g.booking);
            else if (g.type === 'train-group') html += renderConnectionGroup(g.segments, 'Train', null);
        }
        if (events.length) {
            html += '<div class="events-section"><div class="events-label">Events & Excursions</div>';
            for (const ev of events) html += '<div class="event-chip">'+esc(ev.Title)+' <span class="text-muted">'+fmtShort(ev.StartTime)+'</span></div>';
            html += '</div>';
        }
        html += '</div></div>';
    }
    w.innerHTML = html;
}

function renderTimelineView(trips) {
    const c = document.getElementById('timeline-container');
    if (!trips.length) { c.innerHTML = '<p class="empty-msg">No trips match your filters.</p>'; return; }
    const byYear = {};
    for (const t of trips) { const y = getTripYear(t); if (!byYear[y]) byYear[y]=[]; byYear[y].push(t); }
    const years = Object.keys(byYear).sort((a,b)=>b-a);
    let html = '';
    for (const year of years) {
        const yTrips = byYear[year].sort((a,b) => new Date(getTripDateRange(b).start||0)-new Date(getTripDateRange(a).start||0));
        html += '<div class="timeline-year"><div class="year-label" onclick="this.parentElement.classList.toggle(\'collapsed\')">'+year+' <span class="year-count">('+yTrips.length+' trips)</span></div>';
        for (const trip of yTrips) {
            const range = getTripDateRange(trip);
            const events = getTripEvents(trip.TripId);
            const grouped = groupSegments(trip.Segments||[]);
            const hasGaps = (trip.Segments||[]).some(s => !s.BookingNumber || s.Source==='inferred');
            html += '<div class="timeline-trip'+(hasGaps?' has-gaps':'')+'">'
                +'<div class="timeline-header" onclick="this.parentElement.classList.toggle(\'expanded\')">'
                +'<span class="arrow">&#9654;</span>'
                +'<span class="trip-name">'+esc(trip.TripName)+'</span>'
                +'<span class="trip-dates">'+fmtDate(range.start)+' - '+fmtDate(range.end)+'</span>'
                +'</div><div class="timeline-body">';
            if (trip.HomeAtStart||trip.HomeAtEnd) {
                html += '<div class="home-info">';
                if (trip.HomeAtStart) html += 'Home: <strong>'+esc(trip.HomeAtStart)+'</strong>';
                if (trip.HomeAtStart && trip.HomeAtEnd && trip.HomeAtStart !== trip.HomeAtEnd) html += ' &rarr; <strong>'+esc(trip.HomeAtEnd)+'</strong>';
                html += '</div>';
            }
            for (const g of grouped) {
                if (g.type === 'single') html += renderTLSeg(g.segment);
                else if (g.type === 'flight-group') html += renderTLConn(g.segments, 'Flight');
                else if (g.type === 'train-group') html += renderTLConn(g.segments, 'Train');
            }
            if (events.length) {
                html += '<div class="events-section"><div class="events-label">Events & Excursions</div>';
                for (const ev of events) html += '<div class="event-chip">'+esc(ev.Title)+' <span class="text-muted">'+fmtShort(ev.StartTime)+'</span></div>';
                html += '</div>';
            }
            html += '</div></div>';
        }
        html += '</div>';
    }
    c.innerHTML = html;
}

function renderTLSeg(seg) {
    const start = getSegStart(seg), end = getSegEnd(seg);
    const hasPorts = seg.SegmentType==='Cruise' && seg.PortsOfCall && seg.PortsOfCall.length > 0;
    const bk = seg.BookingNumber;
    const color = 'var(--'+(seg.SegmentType||'').toLowerCase()+')';
    let h = '<div class="tl-segment'+(hasPorts?' has-ports':'')+'"'+(hasPorts?' onclick="this.classList.toggle(\'expanded\')"':'')+'>'
        +'<div class="seg-icon" style="background:'+color+'22;color:'+color+'">'+segIcon(seg.SegmentType)+'</div>'
        +'<div class="seg-content">'
        +'<div class="seg-title">'+esc(getSegDetail(seg).trim())+(hasPorts?' <span class="text-muted">('+seg.PortsOfCall.length+' ports)</span>':'')+'</div>'
        +'<div class="seg-meta">'+esc(getSegFrom(seg))+' &rarr; '+esc(getSegTo(seg))+'</div>'
        +'<div class="seg-meta">'+fmtDate(start)+' - '+fmtDate(end)+(bk?' &bull; '+esc(bk):'')+(seg.Source==='inferred'?' &bull; <span class="badge badge-inferred">inferred</span>':'')+'</div>';
    if (hasPorts) {
        h += '<div class="tl-ports">';
        for (const p of seg.PortsOfCall) h += '<span class="port-chip"><span class="port-date">'+fmtShort(p.Date)+'</span> '+esc(p.City||p.PortName)+'</span>';
        h += '</div>';
    }
    h += '</div></div>';
    return h;
}

function renderTLConn(segs, type) {
    const first = segs[0], last = segs[segs.length-1];
    const color = 'var(--'+type.toLowerCase()+')';
    let h = '<div class="tl-segment connection-tl" onclick="this.classList.toggle(\'expanded\')">'
        +'<div class="seg-icon" style="background:'+color+'22;color:'+color+'">'+segIcon(type)+'</div>'
        +'<div class="seg-content">'
        +'<div class="seg-title">'+esc(getSegDetail(first).trim())+' <span class="text-muted">('+segs.length+' legs)</span></div>'
        +'<div class="seg-meta">'+esc(getSegFrom(first))+' &rarr; '+esc(getSegTo(last))+'</div>'
        +'<div class="seg-meta">'+fmtDate(getSegStart(first))+' - '+fmtDate(getSegEnd(last))+'</div>'
        +'<div class="connection-detail">';
    for (const leg of segs) h += '<div class="conn-leg">'+segIcon(type)+' '+esc(getSegDetail(leg).trim())+': '+esc(getSegFrom(leg))+' &rarr; '+esc(getSegTo(leg))+' ('+fmtTime(getSegStart(leg))+' - '+fmtTime(getSegEnd(leg))+')</div>';
    h += '</div></div></div>';
    return h;
}

function renderGapsView() {
    const c = document.getElementById('gaps-container');
    const gaps = detectGaps();
    const total = gaps.missingBooking.length+gaps.inferredSegments.length+gaps.timeGaps.length+gaps.missingFields.length;
    let html = '<div class="gap-summary">'
        +'<div class="gap-stat'+(gaps.missingBooking.length?' warning':'')+'"><div class="num">'+gaps.missingBooking.length+'</div><div class="label">Missing Bookings</div></div>'
        +'<div class="gap-stat'+(gaps.inferredSegments.length?' warning':'')+'"><div class="num">'+gaps.inferredSegments.length+'</div><div class="label">Inferred Segments</div></div>'
        +'<div class="gap-stat'+(gaps.timeGaps.length?' warning':'')+'"><div class="num">'+gaps.timeGaps.length+'</div><div class="label">Time Gaps (&gt;2 days)</div></div>'
        +'<div class="gap-stat'+(gaps.missingFields.length?' warning':'')+'"><div class="num">'+gaps.missingFields.length+'</div><div class="label">Missing Fields</div></div>'
        +'</div>';
    if (!total) { html += '<p class="empty-msg">No gaps or issues detected.</p>'; c.innerHTML = html; return; }
    if (gaps.missingBooking.length) {
        html += '<div class="gap-section-title">Missing Booking Numbers ('+gaps.missingBooking.length+')</div>';
        for (const g of gaps.missingBooking) html += '<div class="gap-card"><h3>'+segIcon(g.seg.SegmentType)+' '+esc(getSegDetail(g.seg).trim())+'</h3><p>Trip: '+esc(g.trip)+'</p><p>'+esc(getSegFrom(g.seg))+' &rarr; '+esc(getSegTo(g.seg))+' ('+fmtDate(getSegStart(g.seg))+')</p></div>';
    }
    if (gaps.inferredSegments.length) {
        html += '<div class="gap-section-title">Inferred Segments ('+gaps.inferredSegments.length+')</div>';
        for (const g of gaps.inferredSegments) html += '<div class="gap-card"><h3>'+segIcon(g.seg.SegmentType)+' '+esc(getSegDetail(g.seg).trim())+'</h3><p>Trip: '+esc(g.trip)+'</p><p>Inferred, not confirmed from booking source.</p><p>'+esc(getSegFrom(g.seg))+' &rarr; '+esc(getSegTo(g.seg))+' ('+fmtDate(getSegStart(g.seg))+')</p></div>';
    }
    if (gaps.timeGaps.length) {
        html += '<div class="gap-section-title">Time Gaps Between Segments ('+gaps.timeGaps.length+')</div>';
        for (const g of gaps.timeGaps) html += '<div class="gap-card"><h3>'+g.days+'-day gap</h3><p>Trip: '+esc(g.trip)+'</p><p>Between: '+esc(getSegDetail(g.from).trim())+' (ends '+fmtDate(getSegEnd(g.from))+') and '+esc(getSegDetail(g.to).trim())+' (starts '+fmtDate(getSegStart(g.to))+')</p></div>';
    }
    if (gaps.missingFields.length) {
        html += '<div class="gap-section-title">Missing Fields ('+gaps.missingFields.length+')</div>';
        for (const g of gaps.missingFields) html += '<div class="gap-card"><h3>'+segIcon(g.seg.SegmentType)+' '+esc(getSegDetail(g.seg).trim())+'</h3><p>Trip: '+esc(g.trip)+'</p><p>Missing: '+g.fields.join(', ')+'</p></div>';
    }
    c.innerHTML = html;
}

function getFilteredTrips() {
    const search = (document.getElementById('search-input').value||'').toLowerCase();
    const yf = document.getElementById('year-filter').value;
    const tf = document.getElementById('type-filter').value;
    const sf = document.getElementById('source-filter').value;
    return tripsData.filter(trip => {
        if (search) { const hay = (trip.TripName+' '+(trip.Segments||[]).map(s=>getSegDetail(s)+' '+getSegFrom(s)+' '+getSegTo(s)+' '+(s.BookingNumber||'')).join(' ')).toLowerCase(); if (!hay.includes(search)) return false; }
        if (yf !== 'all' && String(getTripYear(trip)) !== yf) return false;
        if (tf !== 'all' && !(trip.Segments||[]).some(s=>s.SegmentType===tf)) return false;
        if (sf !== 'all' && !(trip.Segments||[]).some(s=>s.Source===sf)) return false;
        return true;
    });
}

function populateYearFilter() {
    const sel = document.getElementById('year-filter');
    const years = [...new Set(tripsData.map(t=>getTripYear(t)))].sort((a,b)=>b-a);
    sel.innerHTML = '<option value="all">All Years</option>'+years.map(y=>'<option value="'+y+'">'+y+'</option>').join('');
}

function switchView(view) {
    currentView = view;
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(view+'-view').classList.add('active');
    renderCurrentView();
}

function renderCurrentView() {
    const filtered = [...getFilteredTrips()].sort((a,b) => new Date(getTripDateRange(b).start||0)-new Date(getTripDateRange(a).start||0));
    if (currentView === 'table') renderTableView(filtered);
    else if (currentView === 'timeline') renderTimelineView(filtered);
    else if (currentView === 'gaps') renderGapsView();
}

async function init() {
    try {
        const [tr, er] = await Promise.all([fetch('data/trips.json'), fetch('data/events.json')]);
        tripsData = await tr.json();
        eventsData = await er.json();
    } catch(e) {
        console.error('Failed to load data:', e);
        document.getElementById('table-wrapper').innerHTML = '<p class="empty-msg">Failed to load travel data.</p>';
        return;
    }
    populateYearFilter();
    renderStats();
    renderCurrentView();
    document.querySelectorAll('.nav-btn').forEach(b => b.addEventListener('click', () => switchView(b.dataset.view)));
    document.getElementById('search-input').addEventListener('input', renderCurrentView);
    document.getElementById('year-filter').addEventListener('change', renderCurrentView);
    document.getElementById('type-filter').addEventListener('change', renderCurrentView);
    document.getElementById('source-filter').addEventListener('change', renderCurrentView);
}
document.addEventListener('DOMContentLoaded', init);
