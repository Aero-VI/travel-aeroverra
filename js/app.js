// Travel Verification Tool - app.js
// Source of truth: data/trips.json and data/events.json
// DO NOT modify data files. Gap detection is script-side only.

let tripsData = [];
let eventsData = [];

const esc = s => { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; };
const segIcon = t => ({Cruise:'\u{1F6A2}',Flight:'\u2708\uFE0F',Train:'\u{1F686}',Bus:'\u{1F68C}',Accommodation:'\u{1F3E8}'}[t]||'\u{1F4CD}');
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '';
const fmtShort = d => d ? new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '';
const fmtTime = d => d ? new Date(d).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}) : '';
const daysBetween = (a,b) => a && b ? Math.round((new Date(b)-new Date(a))/86400000) : 0;

function getSegStart(seg) {
    return (seg.DeparturePort && seg.DeparturePort.Time) || (seg.Departure && seg.Departure.Time) || seg.CheckInDate || null;
}
function getSegEnd(seg) {
    return (seg.ArrivalPort && seg.ArrivalPort.Time) || (seg.Arrival && seg.Arrival.Time) || seg.CheckOutDate || null;
}
function getSegFrom(seg) {
    if (seg.DeparturePort) return (seg.DeparturePort.City||seg.DeparturePort.PortName||'') + ', ' + (seg.DeparturePort.CountryCode||'');
    if (seg.Departure) return seg.Departure.Code ? seg.Departure.City+' ('+seg.Departure.Code+')' : (seg.Departure.City||'');
    if (seg.City) return seg.City + (seg.CountryCode ? ', '+seg.CountryCode : '');
    return '';
}
function getSegTo(seg) {
    if (seg.ArrivalPort) return (seg.ArrivalPort.City||seg.ArrivalPort.PortName||'') + ', ' + (seg.ArrivalPort.CountryCode||'');
    if (seg.Arrival) return seg.Arrival.Code ? seg.Arrival.City+' ('+seg.Arrival.Code+')' : (seg.Arrival.City||'');
    if (seg.City) return seg.City + (seg.CountryCode ? ', '+seg.CountryCode : '');
    return '';
}
function getSegDetail(seg) {
    switch(seg.SegmentType) {
        case 'Cruise': return (seg.CruiseLine||'')+' '+(seg.Ship||'');
        case 'Flight': return (seg.Airline||'')+(seg.FlightNumber?' '+seg.FlightNumber:'');
        case 'Train': return (seg.Operator||'Train')+(seg.TrainNumber?' '+seg.TrainNumber:'');
        case 'Bus': return (seg.Operator||'Bus')+' '+(seg.Route||'');
        case 'Accommodation': return seg.DisplayName||seg.City||'';
        default: return seg.SegmentType||'';
    }
}
function getTripDateRange(trip) {
    let min=null,max=null;
    for (const seg of trip.Segments||[]) {
        const s=getSegStart(seg),e=getSegEnd(seg);
        if (s && (!min||new Date(s)<new Date(min))) min=s;
        if (e && (!max||new Date(e)>new Date(max))) max=e;
    }
    return {start:min,end:max};
}
function getTripYear(trip) {
    const {start}=getTripDateRange(trip);
    return start ? new Date(start).getFullYear() : 'Unknown';
}

// Group flights with same booking as connections; back-to-back trains (<3h gap) as connections
function groupSegments(segments) {
    const sorted = [...segments].sort((a,b) => new Date(getSegStart(a)||0) - new Date(getSegStart(b)||0));
    const groups = [];
    const used = new Set();
    for (let i=0; i<sorted.length; i++) {
        if (used.has(i)) continue;
        const seg = sorted[i];
        if (seg.SegmentType === 'Flight' && seg.BookingNumber) {
            const legs = [seg]; used.add(i);
            for (let j=i+1; j<sorted.length; j++) {
                if (used.has(j)) continue;
                if (sorted[j].SegmentType==='Flight' && sorted[j].BookingNumber===seg.BookingNumber) {
                    legs.push(sorted[j]); used.add(j);
                }
            }
            if (legs.length>1) { legs.sort((a,b)=>new Date(getSegStart(a)||0)-new Date(getSegStart(b)||0)); groups.push({type:'connection',segType:'Flight',legs}); }
            else groups.push({type:'single',seg});
        } else if (seg.SegmentType==='Train') {
            const legs=[seg]; used.add(i);
            let lastEnd=getSegEnd(seg);
            for (let j=i+1; j<sorted.length; j++) {
                if (used.has(j)||sorted[j].SegmentType!=='Train') break;
                const ns=getSegStart(sorted[j]);
                if (lastEnd && ns && (new Date(ns)-new Date(lastEnd))/3600000<=3) {
                    legs.push(sorted[j]); used.add(j); lastEnd=getSegEnd(sorted[j]);
                } else break;
            }
            if (legs.length>1) groups.push({type:'connection',segType:'Train',legs});
            else groups.push({type:'single',seg});
        } else { used.add(i); groups.push({type:'single',seg}); }
    }
    return groups;
}

function detectGaps() {
    const gaps = [];
    for (const trip of tripsData) {
        for (const seg of trip.Segments||[]) {
            if ((!seg.BookingNumber||seg.BookingNumber==='???') && seg.SegmentType!=='Accommodation')
                gaps.push({cat:'missing-booking',trip:trip.TripName,seg,sev:'warning'});
            if (seg.Source==='inferred' && seg.BookingNumber!=='HOME')
                gaps.push({cat:'inferred',trip:trip.TripName,seg,sev:'info'});
        }
        const sorted=[...(trip.Segments||[])].filter(s=>getSegStart(s)&&getSegEnd(s)).sort((a,b)=>new Date(getSegStart(a))-new Date(getSegStart(b)));
        for (let i=0;i<sorted.length-1;i++) {
            const gapD=(new Date(getSegStart(sorted[i+1]))-new Date(getSegEnd(sorted[i])))/86400000;
            if (gapD>2 && sorted[i].SegmentType!=='Accommodation' && sorted[i+1].SegmentType!=='Accommodation')
                gaps.push({cat:'time-gap',trip:trip.TripName,days:Math.round(gapD),afterSeg:sorted[i],beforeSeg:sorted[i+1],sev:'error'});
        }
    }
    return gaps;
}

// ==================== RENDER STATS ====================
function renderStats() {
    const el = document.getElementById('stats-bar');
    if (!el) return;
    const segs = tripsData.reduce((n,t)=>n+(t.Segments||[]).length,0);
    const gaps = detectGaps();
    el.innerHTML = `
        <span class="stat-pill"><span class="num">${tripsData.length}</span>Trips</span>
        <span class="stat-pill"><span class="num">${segs}</span>Segments</span>
        <span class="stat-pill"><span class="num">${eventsData.length}</span>Events</span>
        <span class="stat-pill"><span class="num">${gaps.length}</span>Gaps</span>`;
}

// ==================== TABLE VIEW ====================
function renderTable() {
    const wrapper = document.getElementById('table-wrapper');
    if (!wrapper) return;
    const filter = getFilters();
    let filtered = [...tripsData];
    if (filter.year && filter.year!=='all') filtered=filtered.filter(t=>String(getTripYear(t))===filter.year);
    if (filter.type && filter.type!=='all') filtered=filtered.filter(t=>(t.Segments||[]).some(s=>s.SegmentType===filter.type));
    if (filter.source && filter.source!=='all') filtered=filtered.filter(t=>(t.Segments||[]).some(s=>s.Source===filter.source));
    if (filter.search) { const q=filter.search.toLowerCase(); filtered=filtered.filter(t=>[t.TripName,...(t.Segments||[]).map(s=>getSegDetail(s)+' '+getSegFrom(s)+' '+getSegTo(s)+' '+(s.BookingNumber||''))].join(' ').toLowerCase().includes(q)); }
    filtered.sort((a,b)=>new Date(getTripDateRange(b).start||0)-new Date(getTripDateRange(a).start||0));

    let html='';
    for (const trip of filtered) {
        const range=getTripDateRange(trip);
        const types=[...new Set((trip.Segments||[]).map(s=>s.SegmentType))];
        const hasInferred=(trip.Segments||[]).some(s=>s.Source==='inferred'&&s.BookingNumber!=='HOME');
        const hasMissing=(trip.Segments||[]).some(s=>(!s.BookingNumber||s.BookingNumber==='???')&&s.SegmentType!=='Accommodation');

        html+='<div class="trip-group'+(hasMissing?' has-missing':hasInferred?' has-gaps':'')+'">';
        html+='<div class="trip-header" onclick="this.parentElement.classList.toggle(\'expanded\')">';
        html+='<span class="expand-icon">\u25B6</span>';
        html+='<span class="trip-title">'+esc(trip.TripName)+'</span>';
        html+='<span class="trip-badges">'+types.map(t=>'<span class="badge badge-'+t.toLowerCase()+'">'+segIcon(t)+' '+t+'</span>').join('');
        if (hasInferred) html+='<span class="badge badge-inferred">Inferred</span>';
        if (hasMissing) html+='<span class="badge badge-gap">Missing Data</span>';
        html+='</span>';
        html+='<span class="trip-dates">'+fmtShort(range.start)+' - '+fmtShort(range.end)+'</span>';
        html+='</div>';
        html+='<div class="trip-body">';

        if (trip.HomeAtStart||trip.HomeAtEnd) {
            html+='<div class="home-info">';
            if (trip.HomeAtStart) html+='Home start: <strong>'+esc(trip.HomeAtStart)+'</strong>';
            if (trip.HomeAtStart&&trip.HomeAtEnd) html+=' | ';
            if (trip.HomeAtEnd) html+='Home end: <strong>'+esc(trip.HomeAtEnd)+'</strong>';
            html+='</div>';
        }

        html+='<div class="seg-grid-header"><div>Date</div><div>Type</div><div>Detail</div><div>From</div><div>To</div><div>Source</div><div>Booking</div></div>';

        const groups=groupSegments(trip.Segments||[]);
        for (const g of groups) {
            if (g.type==='connection') {
                const first=g.legs[0],last=g.legs[g.legs.length-1];
                const stops=g.legs.length-1;
                const label=g.segType==='Train'?'Train Connection':'Connection';
                html+='<div class="connection-group">';
                html+='<div class="connection-header" onclick="this.parentElement.classList.toggle(\'expanded\')">';
                html+='<span class="expand-icon">\u25B6</span>';
                html+='<div class="seg-row connection-summary">';
                html+='<div class="seg-date">'+fmtShort(getSegStart(first))+'</div>';
                html+='<div class="seg-type"><span class="badge badge-'+g.segType.toLowerCase()+'">'+segIcon(g.segType)+' '+label+'</span></div>';
                html+='<div class="seg-detail">'+stops+' stop'+(stops>1?'s':'')+'</div>';
                html+='<div class="seg-from">'+esc(getSegFrom(first))+'</div>';
                html+='<div class="seg-to">'+esc(getSegTo(last))+'</div>';
                html+='<div class="seg-source"></div>';
                html+='<div class="seg-booking">'+(first.BookingNumber||'')+'</div>';
                html+='</div></div>';
                html+='<div class="connection-legs">';
                for (const leg of g.legs) html+=segRowHTML(leg,true);
                html+='</div></div>';
            } else {
                const seg=g.seg;
                if (seg.SegmentType==='Cruise'&&seg.PortsOfCall&&seg.PortsOfCall.length>0) {
                    html+='<div class="cruise-expandable">';
                    html+='<div class="cruise-header" onclick="this.parentElement.classList.toggle(\'expanded\')">';
                    html+='<span class="expand-icon">\u25B6</span>';
                    html+=segRowHTML(seg,false);
                    html+='</div>';
                    html+='<div class="cruise-ports">';
                    for (const p of seg.PortsOfCall) html+='<span class="port-chip"><span class="port-date">'+fmtShort(p.Date)+'</span>'+esc(p.City||p.PortName||'')+', '+(p.CountryCode||'')+'</span>';
                    html+='</div></div>';
                } else {
                    html+=segRowHTML(seg,false);
                }
            }
        }

        const tripEvents=eventsData.filter(e=>e.TripId===trip.TripId);
        if (tripEvents.length>0) {
            html+='<div class="events-section"><div class="events-label">Events ('+tripEvents.length+')</div>';
            for (const ev of tripEvents) html+='<div class="event-chip"><span class="port-date">'+fmtShort(ev.StartTime)+'</span>'+esc(ev.Title)+' ('+(ev.City||'')+', '+(ev.CountryCode||'')+')</div>';
            html+='</div>';
        }
        html+='</div></div>';
    }
    if (!filtered.length) html='<p class="empty-msg">No trips match filters</p>';
    wrapper.innerHTML=html;
}

function segRowHTML(seg,isLeg) {
    const src=seg.Source||'manual';
    const bk=seg.BookingNumber;
    const isMissing=(!bk||bk==='???')&&seg.SegmentType!=='Accommodation';
    const isInferred=src==='inferred'&&bk!=='HOME';
    const cls='seg-row'+(isMissing?' gap-row':isInferred?' inferred-row':'')+(isLeg?' leg-row':'');
    let html='<div class="'+cls+'">';
    html+='<div class="seg-date">'+fmtShort(getSegStart(seg))+'</div>';
    html+='<div class="seg-type"><span class="badge badge-'+seg.SegmentType.toLowerCase()+'">'+segIcon(seg.SegmentType)+' '+seg.SegmentType+'</span></div>';
    html+='<div class="seg-detail">'+esc(getSegDetail(seg))+'</div>';
    html+='<div class="seg-from">'+esc(getSegFrom(seg))+'</div>';
    html+='<div class="seg-to">'+esc(getSegTo(seg))+'</div>';
    html+='<div class="seg-source"><span class="badge badge-'+src+'">'+src+'</span></div>';
    html+='<div class="seg-booking">'+(bk&&bk!=='???'?'<span class="booking-ref">'+esc(bk)+'</span>':'<span class="missing-tag">MISSING</span>')+'</div>';
    html+='</div>';
    return html;
}

// ==================== TIMELINE VIEW ====================
function renderTimeline() {
    const container = document.getElementById('timeline-container');
    if (!container) return;
    const byYear = {};
    for (const trip of tripsData) {
        const y = getTripYear(trip);
        if (!byYear[y]) byYear[y]=[];
        byYear[y].push(trip);
    }
    const years = Object.keys(byYear).sort((a,b)=>b-a);
    let html = '';
    for (const year of years) {
        const yearTrips = byYear[year].sort((a,b)=>new Date(getTripDateRange(b).start||0)-new Date(getTripDateRange(a).start||0));
        html+='<div class="timeline-year">';
        html+='<div class="year-label" onclick="this.parentElement.classList.toggle(\'collapsed\')">'+year+' <span class="year-count">('+yearTrips.length+' trips)</span></div>';
        for (const trip of yearTrips) {
            const range=getTripDateRange(trip);
            const days=daysBetween(range.start,range.end);
            const hasGaps=(trip.Segments||[]).some(s=>s.Source==='inferred'&&s.BookingNumber!=='HOME');
            html+='<div class="timeline-trip'+(hasGaps?' has-gaps':'')+'">';
            html+='<div class="timeline-header" onclick="this.parentElement.classList.toggle(\'expanded\')">';
            html+='<span class="arrow">\u25B6</span>';
            html+='<span class="trip-name">'+esc(trip.TripName)+'</span>';
            html+='<span class="trip-badges">';
            const types=[...new Set((trip.Segments||[]).map(s=>s.SegmentType))];
            html+=types.map(t=>'<span class="badge badge-'+t.toLowerCase()+'">'+segIcon(t)+'</span>').join('');
            html+='</span>';
            html+='<span class="trip-dates">'+fmtShort(range.start)+' - '+fmtShort(range.end)+' ('+days+'d)</span>';
            html+='</div>';
            html+='<div class="timeline-body">';

            if (trip.HomeAtStart||trip.HomeAtEnd) {
                html+='<div class="home-info">';
                if (trip.HomeAtStart) html+='Home start: <strong>'+esc(trip.HomeAtStart)+'</strong>';
                if (trip.HomeAtStart&&trip.HomeAtEnd) html+=' | ';
                if (trip.HomeAtEnd) html+='Home end: <strong>'+esc(trip.HomeAtEnd)+'</strong>';
                html+='</div>';
            }

            const groups=groupSegments(trip.Segments||[]);
            for (const g of groups) {
                if (g.type==='connection') {
                    const first=g.legs[0],last=g.legs[g.legs.length-1];
                    const stops=g.legs.length-1;
                    const bgColor = ({Cruise:'#1a73e8',Flight:'#e67c00',Train:'#0f9d58',Bus:'#ab47bc',Accommodation:'#5f6368'})[g.segType]||'#999';
                    html+='<div class="tl-segment connection-tl" onclick="this.classList.toggle(\'expanded\')">';
                    html+='<div class="seg-icon" style="background:'+bgColor+'22;color:'+bgColor+'">'+segIcon(g.segType)+'</div>';
                    html+='<div class="seg-content">';
                    html+='<div class="seg-title">'+esc(getSegFrom(first))+' \u2192 '+esc(getSegTo(last))+' ('+stops+' stop'+(stops>1?'s':'')+')</div>';
                    html+='<div class="seg-meta">'+fmtShort(getSegStart(first))+' - '+fmtShort(getSegEnd(last))+'</div>';
                    html+='<div class="connection-detail">';
                    for (const leg of g.legs) {
                        html+='<div class="conn-leg">'+segIcon(leg.SegmentType)+' '+esc(getSegDetail(leg))+': '+esc(getSegFrom(leg))+' \u2192 '+esc(getSegTo(leg))+' ('+fmtShort(getSegStart(leg))+')</div>';
                    }
                    html+='</div></div></div>';
                } else {
                    const seg=g.seg;
                    const hasPorts=seg.SegmentType==='Cruise'&&seg.PortsOfCall&&seg.PortsOfCall.length>0;
                    const bgColor=({Cruise:'#1a73e8',Flight:'#e67c00',Train:'#0f9d58',Bus:'#ab47bc',Accommodation:'#5f6368'})[seg.SegmentType]||'#999';
                    html+='<div class="tl-segment'+(hasPorts?' has-ports':'')+'"'+(hasPorts?' onclick="this.classList.toggle(\'expanded\')"':'')+'>';
                    html+='<div class="seg-icon" style="background:'+bgColor+'22;color:'+bgColor+'">'+segIcon(seg.SegmentType)+'</div>';
                    html+='<div class="seg-content">';
                    html+='<div class="seg-title">'+esc(getSegDetail(seg))+'</div>';
                    html+='<div class="seg-meta">'+fmtShort(getSegStart(seg))+' - '+fmtShort(getSegEnd(seg))+' | '+esc(getSegFrom(seg))+' \u2192 '+esc(getSegTo(seg))+'</div>';
                    html+='<div class="seg-meta"><span class="badge badge-'+(seg.Source||'manual')+'">'+(seg.Source||'manual')+'</span> ';
                    html+=seg.BookingNumber?'<span class="booking-ref">'+esc(seg.BookingNumber)+'</span>':'';
                    html+='</div>';
                    if (hasPorts) {
                        html+='<div class="tl-ports">';
                        for (const p of seg.PortsOfCall) html+='<span class="port-chip"><span class="port-date">'+fmtShort(p.Date)+'</span>'+esc(p.City||p.PortName||'')+', '+(p.CountryCode||'')+'</span>';
                        html+='</div>';
                    }
                    html+='</div></div>';
                }
            }

            const tripEvents=eventsData.filter(e=>e.TripId===trip.TripId);
            if (tripEvents.length>0) {
                html+='<div class="events-section"><div class="events-label">Events</div>';
                for (const ev of tripEvents) html+='<div class="event-chip"><span class="port-date">'+fmtShort(ev.StartTime)+'</span>'+esc(ev.Title)+' ('+(ev.City||'')+', '+(ev.CountryCode||'')+')</div>';
                html+='</div>';
            }
            html+='</div></div>';
        }
        html+='</div>';
    }
    container.innerHTML=html;
}

// ==================== GAPS VIEW ====================
function renderGaps() {
    const container = document.getElementById('gaps-container');
    if (!container) return;
    const gaps = detectGaps();
    const missing = gaps.filter(g=>g.cat==='missing-booking');
    const inferred = gaps.filter(g=>g.cat==='inferred');
    const timeGaps = gaps.filter(g=>g.cat==='time-gap');

    let html='<div class="gaps-summary">Total issues: <strong>'+gaps.length+'</strong></div>';

    if (missing.length) {
        html+='<h3 class="gap-section-title">\u26A0 Missing Booking Numbers ('+missing.length+')</h3>';
        for (const g of missing) {
            html+='<div class="gap-card"><h4>'+segIcon(g.seg.SegmentType)+' '+g.seg.SegmentType+': '+esc(getSegDetail(g.seg))+'</h4>';
            html+='<p>'+esc(getSegFrom(g.seg))+' \u2192 '+esc(getSegTo(g.seg))+'</p>';
            html+='<p class="gap-trip">Trip: '+esc(g.trip)+'</p></div>';
        }
    }
    if (inferred.length) {
        html+='<h3 class="gap-section-title">\u{1F50D} Inferred Segments ('+inferred.length+')</h3>';
        for (const g of inferred) {
            html+='<div class="gap-card inferred-card"><h4>'+segIcon(g.seg.SegmentType)+' '+g.seg.SegmentType+': '+esc(getSegDetail(g.seg))+'</h4>';
            html+='<p>'+esc(getSegFrom(g.seg))+' \u2192 '+esc(getSegTo(g.seg))+'</p>';
            html+='<p class="gap-trip">Trip: '+esc(g.trip)+'</p></div>';
        }
    }
    if (timeGaps.length) {
        html+='<h3 class="gap-section-title">\u23F0 Time Gaps ('+timeGaps.length+')</h3>';
        for (const g of timeGaps) {
            html+='<div class="gap-card"><h4>'+g.days+' day gap</h4>';
            html+='<p>After: '+esc(getSegDetail(g.afterSeg))+' ('+esc(getSegTo(g.afterSeg))+')</p>';
            html+='<p>Before: '+esc(getSegDetail(g.beforeSeg))+' ('+esc(getSegFrom(g.beforeSeg))+')</p>';
            html+='<p class="gap-trip">Trip: '+esc(g.trip)+'</p></div>';
        }
    }
    if (!gaps.length) html+='<div style="text-align:center;padding:3rem;color:#0f9d58;font-size:1.2rem;">\u2705 No gaps detected!</div>';
    container.innerHTML=html;
}

// ==================== NAV & FILTERS ====================
function getFilters() {
    return {
        search:(document.getElementById('search-input')||{}).value||'',
        year:(document.getElementById('year-filter')||{}).value||'all',
        type:(document.getElementById('type-filter')||{}).value||'all',
        source:(document.getElementById('source-filter')||{}).value||'all'
    };
}
function populateYearFilter() {
    const sel=document.getElementById('year-filter');
    if (!sel) return;
    const years=new Set();
    tripsData.forEach(t=>{const y=getTripYear(t);if(y&&y!=='Unknown')years.add(y);});
    [...years].sort((a,b)=>b-a).forEach(y=>{const o=document.createElement('option');o.value=y;o.textContent=y;sel.appendChild(o);});
}

async function init() {
    const [tr,ev] = await Promise.all([fetch('data/trips.json'),fetch('data/events.json')]);
    tripsData = await tr.json();
    eventsData = await ev.json();

    document.querySelectorAll('.nav-btn').forEach(btn=>{
        btn.addEventListener('click',()=>{
            document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
            document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(btn.dataset.view+'-view').classList.add('active');
        });
    });

    populateYearFilter();
    renderStats();
    renderTable();
    renderTimeline();
    renderGaps();

    const rerender=()=>renderTable();
    document.getElementById('search-input').addEventListener('input',rerender);
    document.getElementById('year-filter').addEventListener('change',rerender);
    document.getElementById('type-filter').addEventListener('change',rerender);
    document.getElementById('source-filter').addEventListener('change',rerender);
}

document.addEventListener('DOMContentLoaded', init);

// ======================== TIMELINE VIEW ========================
function renderTimelineView(trips) {
    const container = document.getElementById('timeline-container');
    if (!trips.length) { container.innerHTML = '<p class="empty-msg">No trips match your filters.</p>'; return; }

    // Group by year descending
    const byYear = {};
    for (const trip of trips) {
        const yr = getTripYear(trip);
        if (!byYear[yr]) byYear[yr] = [];
        byYear[yr].push(trip);
    }
    const years = Object.keys(byYear).sort((a,b) => b - a);

    let html = '';
    for (const year of years) {
        const yearTrips = byYear[year].sort((a,b) => {
            const sa = getTripDateRange(a).start;
            const sb = getTripDateRange(b).start;
            return new Date(sb||0) - new Date(sa||0);
        });

        html += `<div class="timeline-year" id="tl-year-${year}">`;
        html += `<div class="year-label" onclick="document.getElementById('tl-year-${year}').classList.toggle('collapsed')">`;
        html += `${year} <span class="year-count">(${yearTrips.length} trip${yearTrips.length>1?'s':''})</span>`;
        html += `</div>`;

        for (const trip of yearTrips) {
            const { start, end } = getTripDateRange(trip);
            const events = getEventsForTrip(trip.TripId);
            const segGroups = groupSegments(trip.Segments || []);
            const hasInferred = (trip.Segments||[]).some(s => s.Source === 'inferred');
            const tripId = 'tl-trip-' + Math.random().toString(36).substr(2, 8);

            html += `<div class="timeline-trip ${hasInferred?'has-gaps':''}" id="${tripId}">`;
            html += `<div class="timeline-header" onclick="document.getElementById('${tripId}').classList.toggle('expanded')">`;
            html += `<span class="arrow">&#9654;</span>`;
            html += `<span class="trip-name">${trip.TripName}</span>`;
            html += `<span class="trip-dates">${fmtDate(start)} - ${fmtDate(end)}</span>`;
            html += `</div>`;
            html += `<div class="timeline-body">`;

            if (trip.HomeAtStart) {
                html += `<div class="home-info"><strong>Home:</strong> ${trip.HomeAtStart}${trip.HomeAtEnd && trip.HomeAtEnd !== trip.HomeAtStart ? ' &rarr; '+trip.HomeAtEnd : ''}</div>`;
            }

            for (const grp of segGroups) {
                if (grp.type === 'flight-group' || grp.type === 'train-group') {
                    html += renderTimelineConnection(grp);
                } else {
                    const seg = grp.segment;
                    if (seg.SegmentType === 'Cruise' && seg.PortsOfCall && seg.PortsOfCall.length > 0) {
                        html += renderTimelineCruise(seg);
                    } else {
                        html += renderTimelineSegment(seg);
                    }
                }
            }

            // Events
            if (events.length) {
                for (const ev of events) {
                    html += `<div class="tl-segment">`;
                    html += `<div class="seg-icon" style="background:rgba(236,72,153,0.15);color:var(--excursion)">\u{1F3AF}</div>`;
                    html += `<div class="seg-content">`;
                    html += `<div class="seg-title">${ev.Title}</div>`;
                    html += `<div class="seg-meta">${ev.City}, ${ev.CountryCode} - ${fmtDate(ev.StartTime)}${ev.Notes ? ' - '+ev.Notes.substring(0,100) : ''}</div>`;
                    html += `</div></div>`;
                }
            }

            html += `</div></div>`;
        }
        html += `</div>`;
    }
    container.innerHTML = html;
}

function renderTimelineSegment(seg) {
    const colors = { Cruise:'rgba(59,130,246,0.15)', Flight:'rgba(245,158,11,0.15)', Train:'rgba(139,92,246,0.15)', Bus:'rgba(239,68,68,0.15)', Accommodation:'rgba(16,185,129,0.15)' };
    const textColors = { Cruise:'var(--cruise)', Flight:'var(--flight)', Train:'var(--train)', Bus:'var(--bus)', Accommodation:'var(--accommodation)' };
    let html = `<div class="tl-segment">`;
    html += `<div class="seg-icon" style="background:${colors[seg.SegmentType]||'rgba(79,143,255,0.15)'};color:${textColors[seg.SegmentType]||'var(--accent)'}">${segIcon(seg.SegmentType)}</div>`;
    html += `<div class="seg-content">`;
    html += `<div class="seg-title">${getSegDetail(seg)}</div>`;
    html += `<div class="seg-meta">${getSegFrom(seg)} &rarr; ${getSegTo(seg)} | ${fmtShort(getSegStart(seg))} - ${fmtShort(getSegEnd(seg))}`;
    if (seg.BookingNumber && seg.BookingNumber !== 'HOME') html += ` | <span class="booking-ref">${seg.BookingNumber}</span>`;
    if (seg.Source) html += ` | ${getSourceBadge(seg.Source)}`;
    html += `</div></div></div>`;
    return html;
}

function renderTimelineConnection(grp) {
    const segments = grp.segments;
    const first = segments[0], last = segments[segments.length-1];
    const type = first.SegmentType;
    const label = type === 'Flight' ? 'Flight Connection' : 'Train Connection';
    const colors = { Flight:'rgba(245,158,11,0.15)', Train:'rgba(139,92,246,0.15)' };
    const textColors = { Flight:'var(--flight)', Train:'var(--train)' };
    const id = 'tl-conn-' + Math.random().toString(36).substr(2, 8);

    let html = `<div class="tl-segment connection-tl" onclick="document.getElementById('${id}').classList.toggle('expanded')" id="${id}">`;
    html += `<div class="seg-icon" style="background:${colors[type]||'rgba(79,143,255,0.15)'};color:${textColors[type]||'var(--accent)'}">${segIcon(type)}</div>`;
    html += `<div class="seg-content">`;
    html += `<div class="seg-title">${label} (${segments.length} legs): ${getSegFrom(first)} &rarr; ${getSegTo(last)}</div>`;
    html += `<div class="seg-meta">${fmtShort(getSegStart(first))} - ${fmtShort(getSegEnd(last))}`;
    if (grp.booking) html += ` | <span class="booking-ref">${grp.booking}</span>`;
    html += `</div>`;
    html += `<div class="connection-detail">`;
    for (const leg of segments) {
        html += `<div class="conn-leg">${segIcon(type)} ${getSegDetail(leg)}: ${getSegFrom(leg)} &rarr; ${getSegTo(leg)} | ${fmtShort(getSegStart(leg))} - ${fmtShort(getSegEnd(leg))}</div>`;
    }
    html += `</div></div></div>`;
    return html;
}

function renderTimelineCruise(seg) {
    const id = 'tl-cruise-' + Math.random().toString(36).substr(2, 8);
    let html = `<div class="tl-segment has-ports" onclick="document.getElementById('${id}').classList.toggle('expanded')" id="${id}">`;
    html += `<div class="seg-icon" style="background:rgba(59,130,246,0.15);color:var(--cruise)">\u{1F6A2}</div>`;
    html += `<div class="seg-content">`;
    html += `<div class="seg-title">${getSegDetail(seg)}</div>`;
    html += `<div class="seg-meta">${getSegFrom(seg)} &rarr; ${getSegTo(seg)} | ${fmtShort(getSegStart(seg))} - ${fmtShort(getSegEnd(seg))} | ${seg.PortsOfCall.length} ports`;
    if (seg.BookingNumber) html += ` | <span class="booking-ref">${seg.BookingNumber}</span>`;
    html += `</div>`;
    html += `<div class="tl-ports">`;
    for (const port of seg.PortsOfCall) {
        html += `<span class="port-chip"><span class="port-date">${fmtShort(port.Date)}</span> ${port.City||port.PortName}, ${port.CountryCode}</span>`;
    }
    html += `</div></div></div>`;
    return html;
}

// ======================== GAPS VIEW ========================
function renderGapsView(trips) {
    const container = document.getElementById('gaps-container');
    const gaps = detectGaps(trips);
    const totalIssues = gaps.missingBooking.length + gaps.inferredSegments.length + gaps.timeGaps.length + gaps.missingFields.length;

    let html = `<div class="gap-summary">`;
    html += `<div class="gap-stat ${gaps.missingBooking.length?'warning':''}"><div class="num">${gaps.missingBooking.length}</div><div class="label">Missing Booking Refs</div></div>`;
    html += `<div class="gap-stat ${gaps.inferredSegments.length?'warning':''}"><div class="num">${gaps.inferredSegments.length}</div><div class="label">Inferred Segments</div></div>`;
    html += `<div class="gap-stat ${gaps.timeGaps.length?'warning':''}"><div class="num">${gaps.timeGaps.length}</div><div class="label">Time Gaps</div></div>`;
    html += `<div class="gap-stat ${gaps.missingFields.length?'warning':''}"><div class="num">${gaps.missingFields.length}</div><div class="label">Missing Fields</div></div>`;
    html += `<div class="gap-stat"><div class="num">${totalIssues}</div><div class="label">Total Issues</div></div>`;
    html += `</div>`;

    if (gaps.missingBooking.length) {
        html += `<div class="gap-section-title">Missing Booking References</div>`;
        for (const g of gaps.missingBooking) {
            html += `<div class="gap-card"><h3>${segIcon(g.type)} ${g.segment || g.type}</h3><p>Trip: ${g.trip}</p></div>`;
        }
    }

    if (gaps.inferredSegments.length) {
        html += `<div class="gap-section-title">Inferred Segments (no confirmation email)</div>`;
        for (const g of gaps.inferredSegments) {
            html += `<div class="gap-card"><h3>${segIcon(g.type)} ${g.segment}</h3><p>Trip: ${g.trip}</p></div>`;
        }
    }

    if (gaps.timeGaps.length) {
        html += `<div class="gap-section-title">Time Gaps Between Segments</div>`;
        for (const g of gaps.timeGaps) {
            html += `<div class="gap-card"><h3>${g.days} day gap</h3><p>Between "${g.after}" and "${g.before}" in trip: ${g.trip}</p></div>`;
        }
    }

    if (gaps.missingFields.length) {
        html += `<div class="gap-section-title">Missing Fields</div>`;
        for (const g of gaps.missingFields) {
            html += `<div class="gap-card"><h3>${g.field}</h3><p>${g.segment} in trip: ${g.trip}</p></div>`;
        }
    }

    if (totalIssues === 0) {
        html += `<p class="empty-msg">No gaps or issues detected. All data looks clean!</p>`;
    }

    container.innerHTML = html;
}

// ======================== STATS BAR ========================
function renderStats(trips) {
    const bar = document.getElementById('stats-bar');
    let totalSegs = 0, cruises = 0, flights = 0, trains = 0, hotels = 0, buses = 0, inferred = 0, missing = 0;
    for (const trip of trips) {
        for (const seg of trip.Segments||[]) {
            totalSegs++;
            if (seg.SegmentType === 'Cruise') cruises++;
            else if (seg.SegmentType === 'Flight') flights++;
            else if (seg.SegmentType === 'Train') trains++;
            else if (seg.SegmentType === 'Accommodation') hotels++;
            else if (seg.SegmentType === 'Bus') buses++;
            if (seg.Source === 'inferred') inferred++;
            if (!seg.BookingNumber && seg.SegmentType !== 'Accommodation' && seg.BookingNumber !== 'HOME') missing++;
        }
    }
    bar.innerHTML = `
        <span class="stat-pill"><span class="num">${trips.length}</span>Trips</span>
        <span class="stat-pill"><span class="num">${totalSegs}</span>Segments</span>
        <span class="stat-pill"><span class="num">${cruises}</span>Cruises</span>
        <span class="stat-pill"><span class="num">${flights}</span>Flights</span>
        <span class="stat-pill"><span class="num">${trains}</span>Trains</span>
        <span class="stat-pill"><span class="num">${hotels}</span>Stays</span>
        <span class="stat-pill"><span class="num">${buses}</span>Buses</span>
        <span class="stat-pill"><span class="num">${eventsData.length}</span>Events</span>
        <span class="stat-pill warning"><span class="num">${inferred}</span>Inferred</span>
        <span class="stat-pill danger"><span class="num">${missing}</span>Missing Refs</span>
    `;
}

// ======================== FILTERING ========================
function getFilteredTrips() {
    const search = (document.getElementById('search-input').value || '').toLowerCase();
    const yearFilter = document.getElementById('year-filter').value;
    const typeFilter = document.getElementById('type-filter').value;
    const sourceFilter = document.getElementById('source-filter').value;

    return tripsData.filter(trip => {
        // Search
        if (search) {
            const haystack = (trip.TripName + ' ' + (trip.Segments||[]).map(s => getSegDetail(s) + ' ' + getSegFrom(s) + ' ' + getSegTo(s)).join(' ')).toLowerCase();
            if (!haystack.includes(search)) return false;
        }
        // Year
        if (yearFilter !== 'all') {
            if (String(getTripYear(trip)) !== yearFilter) return false;
        }
        // Type
        if (typeFilter !== 'all') {
            if (!(trip.Segments||[]).some(s => s.SegmentType === typeFilter)) return false;
        }
        // Source
        if (sourceFilter !== 'all') {
            if (!(trip.Segments||[]).some(s => s.Source === sourceFilter)) return false;
        }
        return true;
    });
}

function sortTripsDescending(trips) {
    return [...trips].sort((a, b) => {
        const sa = getTripDateRange(a).start;
        const sb = getTripDateRange(b).start;
        return new Date(sb||0) - new Date(sa||0);
    });
}

function populateYearFilter() {
    const sel = document.getElementById('year-filter');
    const years = new Set();
    for (const t of tripsData) years.add(getTripYear(t));
    const sorted = [...years].sort((a,b) => b - a);
    sel.innerHTML = '<option value="all">All Years</option>';
    for (const y of sorted) {
        sel.innerHTML += `<option value="${y}">${y}</option>`;
    }
}

function renderAll() {
    const filtered = sortTripsDescending(getFilteredTrips());
    renderStats(tripsData);
    renderTableView(filtered);
    renderTimelineView(filtered);
    renderGapsView(tripsData);
}

// ======================== INIT ========================
async function init() {
    try {
        const [tripsRes, eventsRes] = await Promise.all([
            fetch('data/trips.json'),
            fetch('data/events.json')
        ]);
        tripsData = await tripsRes.json();
        eventsData = await eventsRes.json();
    } catch (err) {
        console.error('Failed to load data:', err);
        document.querySelector('main').innerHTML = '<p class="empty-msg">Failed to load trip data. Check console.</p>';
        return;
    }

    populateYearFilter();
    renderAll();

    // Nav buttons
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentView = btn.dataset.view;
            document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
            document.getElementById(currentView + '-view').classList.add('active');
        });
    });

    // Filters
    document.getElementById('search-input').addEventListener('input', renderAll);
    document.getElementById('year-filter').addEventListener('change', renderAll);
    document.getElementById('type-filter').addEventListener('change', renderAll);
    document.getElementById('source-filter').addEventListener('change', renderAll);
}

document.addEventListener('DOMContentLoaded', init);
