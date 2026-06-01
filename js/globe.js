// Globe/Map View - Cyberpunk interactive travel map
// Glowing routes, animated markers, dark aesthetic

let map = null;
let mapLayers = { flights: null, cruises: null, trains: null, markers: null };

const COLORS = {
  Flight: '#e040fb',
  Cruise: '#00e5ff',
  Train: '#ff9100',
  Bus: '#69f0ae'
};

const MARKER_COLORS = {
  Flight: '#e040fb',
  Cruise: '#00e5ff',
  Train: '#ff9100',
  Event: '#00e676',
  Home: '#ff5252'
};

function initMap() {
  if (map) return;
  var container = document.getElementById('globe-container');
  if (!container) return;

  map = L.map('globe-container', {
    center: [20, 0],
    zoom: 2,
    minZoom: 2,
    maxZoom: 15,
    zoomControl: true,
    attributionControl: false,
    worldCopyJump: true
  });

  // Stamen Toner or CartoDB Dark - very minimal dark tiles
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
    subdomains: 'abcd',
    maxZoom: 19
  }).addTo(map);

  // Separate label layer on top (so routes render between terrain and labels)
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png', {
    subdomains: 'abcd',
    maxZoom: 19,
    pane: 'overlayPane'
  }).addTo(map);

  L.control.attribution({ position: 'bottomright', prefix: false })
    .addAttribution('&copy; <a href="https://carto.com" style="color:#6e7681">CARTO</a>')
    .addTo(map);

  mapLayers.cruises = L.layerGroup().addTo(map);
  mapLayers.trains = L.layerGroup().addTo(map);
  mapLayers.flights = L.layerGroup().addTo(map);
  mapLayers.markers = L.layerGroup().addTo(map);
}

function clearMap() {
  if (!map) return;
  Object.values(mapLayers).forEach(function(lg) { if (lg) lg.clearLayers(); });
}

// Great circle arc
function createArc(from, to, numPoints) {
  numPoints = numPoints || 60;
  var latlngs = [];
  var lat1 = from[0] * Math.PI / 180, lng1 = from[1] * Math.PI / 180;
  var lat2 = to[0] * Math.PI / 180, lng2 = to[1] * Math.PI / 180;
  for (var i = 0; i <= numPoints; i++) {
    var f = i / numPoints;
    var d = Math.acos(
      Math.sin(lat1) * Math.sin(lat2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.cos(lng2 - lng1)
    );
    if (d === 0 || isNaN(d)) { latlngs.push([from[0], from[1]]); continue; }
    var A = Math.sin((1 - f) * d) / Math.sin(d);
    var B = Math.sin(f * d) / Math.sin(d);
    var x = A * Math.cos(lat1) * Math.cos(lng1) + B * Math.cos(lat2) * Math.cos(lng2);
    var y = A * Math.cos(lat1) * Math.sin(lng1) + B * Math.cos(lat2) * Math.sin(lng2);
    var z = A * Math.sin(lat1) + B * Math.sin(lat2);
    latlngs.push([
      Math.atan2(z, Math.sqrt(x * x + y * y)) * 180 / Math.PI,
      Math.atan2(y, x) * 180 / Math.PI
    ]);
  }
  return latlngs;
}

// Create a glowing route line (two layers: outer glow + inner line)
function createGlowLine(latlngs, color, weight, dashArray, opacity, layer) {
  // Outer glow (wider, transparent, same color)
  var glow = L.polyline(latlngs, {
    color: color,
    weight: weight + 6,
    opacity: 0.08,
    smoothFactor: 1,
    lineCap: 'round',
    lineJoin: 'round'
  });
  layer.addLayer(glow);

  // Mid glow
  var mid = L.polyline(latlngs, {
    color: color,
    weight: weight + 2,
    opacity: 0.15,
    smoothFactor: 1,
    lineCap: 'round',
    lineJoin: 'round'
  });
  layer.addLayer(mid);

  // Core line
  var core = L.polyline(latlngs, {
    color: color,
    weight: weight,
    opacity: opacity,
    dashArray: dashArray || null,
    smoothFactor: 1,
    lineCap: 'round',
    lineJoin: 'round'
  });
  layer.addLayer(core);

  return core; // return core for popup binding
}

function popupHTML(icon, title, subtitle, extra) {
  var html = '<div style="font-family:\'JetBrains Mono\',monospace;color:#c9d1d9;min-width:180px;">';
  html += '<div style="font-weight:700;font-size:0.9rem;margin-bottom:4px;">' + icon + ' ' + title + '</div>';
  if (subtitle) html += '<div style="color:#6e7681;font-size:0.78rem;">' + subtitle + '</div>';
  if (extra) html += '<div style="color:#00e5ff;font-size:0.75rem;font-family:monospace;margin-top:4px;">' + extra + '</div>';
  html += '</div>';
  return html;
}

function buildMapData(trips, events) {
  clearMap();
  if (!map) initMap();

  var visited = {}; // key -> { latlng, label, types, details, count }

  function addLoc(ll, label, type, detail) {
    if (!ll) return;
    var k = ll[0].toFixed(3) + ',' + ll[1].toFixed(3);
    if (!visited[k]) visited[k] = { latlng: ll, label: label, types: {}, details: [], count: 0 };
    visited[k].types[type] = true;
    if (detail) visited[k].details.push(detail);
    visited[k].count++;
  }

  trips.forEach(function(trip) {
    var isHome = trip.TripName && trip.TripName.toLowerCase().indexOf('home in') === 0;
    (trip.Segments || []).forEach(function(seg) {

      if (seg.SegmentType === 'Flight') {
        var dc = (seg.Departure || {}).Code || '';
        var ac = (seg.Arrival || {}).Code || '';
        var dci = (seg.Departure || {}).City || '';
        var aci = (seg.Arrival || {}).City || '';
        var from = geocode('Flight', '', dci, dc);
        var to = geocode('Flight', '', aci, ac);
        if (from && to) {
          var arc = createArc(from, to);
          var line = createGlowLine(arc, COLORS.Flight, 1.5, '8 5', 0.6, mapLayers.flights);
          var airline = seg.Airline || 'Flight';
          var dateStr = seg.Departure && seg.Departure.Time ?
            new Date(seg.Departure.Time).toLocaleDateString('en-US', {month:'short',day:'numeric',year:'numeric'}) : '';
          line.bindPopup(
            popupHTML('\u2708\uFE0F', airline, dci + ' (' + dc + ') \u2192 ' + aci + ' (' + ac + ')',
              (dateStr ? dateStr + ' ' : '') + (seg.BookingNumber || '')),
            { className: 'dark-popup' }
          );
          addLoc(from, dci + ' (' + dc + ')', 'Flight', '\u2708\uFE0F ' + airline + ' to ' + aci);
          addLoc(to, aci + ' (' + ac + ')', 'Flight', '\u2708\uFE0F ' + airline + ' from ' + dci);
        }

      } else if (seg.SegmentType === 'Cruise') {
        var ports = [];
        var dp = seg.DeparturePort || {};
        var ap = seg.ArrivalPort || {};
        var dpc = geocode('Cruise', dp.PortName || '', dp.City || '', '');
        var apc = geocode('Cruise', ap.PortName || '', ap.City || '', '');

        if (dpc) {
          ports.push({ coord: dpc, name: dp.PortName || dp.City || 'Departure' });
          addLoc(dpc, dp.City || dp.PortName || '', 'Cruise',
            '\u{1F6A2} ' + (seg.CruiseLine || '') + ' ' + (seg.Ship || '') + ' departure');
        }
        (seg.PortsOfCall || []).forEach(function(p) {
          var coord = geocode('Cruise', p.PortName || '', p.City || '', '');
          if (coord) {
            ports.push({ coord: coord, name: p.PortName || p.City || '' });
            addLoc(coord, p.City || p.PortName || '', 'Cruise',
              '\u{1F6A2} ' + (seg.Ship || 'Cruise') + ' port call');
          }
        });
        if (apc) {
          ports.push({ coord: apc, name: ap.PortName || ap.City || 'Arrival' });
          addLoc(apc, ap.City || ap.PortName || '', 'Cruise',
            '\u{1F6A2} ' + (seg.CruiseLine || '') + ' ' + (seg.Ship || '') + ' arrival');
        }

        for (var i = 0; i < ports.length - 1; i++) {
          var cruiseArc = createArc(ports[i].coord, ports[i + 1].coord, 30);
          var cruiseLine = createGlowLine(cruiseArc, COLORS.Cruise, 2, null, 0.7, mapLayers.cruises);
          cruiseLine.bindPopup(
            popupHTML('\u{1F6A2}', (seg.CruiseLine || '') + ' ' + (seg.Ship || ''),
              ports[i].name + ' \u2192 ' + ports[i + 1].name, seg.BookingNumber || ''),
            { className: 'dark-popup' }
          );
        }

      } else if (seg.SegmentType === 'Train') {
        var dn = (seg.Departure || {}).LocationName || '';
        var an = (seg.Arrival || {}).LocationName || '';
        var dtc = (seg.Departure || {}).City || '';
        var atc = (seg.Arrival || {}).City || '';
        var tf = geocode('Train', dn, dtc, '');
        var tt = geocode('Train', an, atc, '');
        if (tf && tt) {
          var trainLine = createGlowLine([tf, tt], COLORS.Train, 2, '3 6', 0.65, mapLayers.trains);
          var op = seg.Operator || 'Train';
          var tn = seg.TrainNumber || '';
          trainLine.bindPopup(
            popupHTML('\u{1F686}', op + (tn ? ' ' + tn : ''),
              (dtc || dn) + ' \u2192 ' + (atc || an)),
            { className: 'dark-popup' }
          );
          addLoc(tf, dtc || dn, 'Train', '\u{1F686} ' + op + ' to ' + (atc || an));
          addLoc(tt, atc || an, 'Train', '\u{1F686} ' + op + ' from ' + (dtc || dn));
        }

      } else if (seg.SegmentType === 'Accommodation' && !isHome) {
        var city = seg.City || '';
        var coord = geocode('', '', city, '');
        if (coord) addLoc(coord, city, 'Home', '\u{1F3E8} ' + (seg.DisplayName || city));
      }
    });
  });

  // Events
  (events || []).forEach(function(ev) {
    var city = ev.City || '';
    var coord = geocode('', '', city, '');
    if (coord) addLoc(coord, city, 'Event', '\u{1F3AD} ' + (ev.EventName || ''));
  });

  // Render markers with glow
  var allCoords = [];
  Object.keys(visited).forEach(function(key) {
    var loc = visited[key];
    var color = '#00e5ff';
    var size = 5;
    if (loc.types['Cruise']) { color = MARKER_COLORS.Cruise; size = 5; }
    if (loc.types['Flight']) { color = MARKER_COLORS.Flight; size = 5; }
    if (loc.types['Train']) { color = MARKER_COLORS.Train; size = 5; }
    if (loc.types['Event']) { color = MARKER_COLORS.Event; size = 5; }
    if (loc.count > 3) size = 7;
    if (loc.count > 6) size = 9;
    if (loc.count > 10) size = 11;

    // Outer glow marker
    var glowMarker = L.circleMarker(loc.latlng, {
      radius: size + 6,
      fillColor: color,
      fillOpacity: 0.08,
      color: color,
      weight: 0,
      opacity: 0
    });
    mapLayers.markers.addLayer(glowMarker);

    // Core marker
    var marker = L.circleMarker(loc.latlng, {
      radius: size,
      fillColor: color,
      fillOpacity: 0.85,
      color: color,
      weight: 1.5,
      opacity: 0.4
    });

    var uniqueDetails = [];
    var seen = {};
    for (var d = 0; d < loc.details.length && uniqueDetails.length < 8; d++) {
      if (!seen[loc.details[d]]) {
        seen[loc.details[d]] = true;
        uniqueDetails.push(loc.details[d]);
      }
    }

    var popupContent = '<div style="font-family:\'JetBrains Mono\',monospace;color:#c9d1d9;min-width:180px;">';
    popupContent += '<div style="font-weight:700;font-size:0.95rem;margin-bottom:2px;color:#e6edf3;">' + loc.label + '</div>';
    popupContent += '<div style="color:#00e5ff;font-size:0.72rem;margin-bottom:6px;">' + loc.count + ' visit' + (loc.count !== 1 ? 's' : '') + '</div>';
    for (var dd = 0; dd < uniqueDetails.length; dd++) {
      popupContent += '<div style="font-size:0.75rem;color:#6e7681;padding:1px 0;">' + uniqueDetails[dd] + '</div>';
    }
    popupContent += '</div>';

    marker.bindPopup(popupContent, { className: 'dark-popup', closeButton: true, autoPan: true });
    mapLayers.markers.addLayer(marker);
    allCoords.push(loc.latlng);
  });

  // Fit bounds
  if (allCoords.length > 0) {
    map.fitBounds(L.latLngBounds(allCoords).pad(0.1));
  }

  // Update HUD
  updateHUD(trips, events);
}

function updateHUD(trips, events) {
  var hud = document.getElementById('hud-stats');
  if (!hud) return;

  var nonHome = 0, cruises = 0, flights = 0, trains = 0, countries = {}, cities = {};
  for (var i = 0; i < trips.length; i++) {
    var t = trips[i];
    if (!(t.TripName && t.TripName.toLowerCase().indexOf('home in') === 0)) nonHome++;
    var segs = t.Segments || [];
    for (var j = 0; j < segs.length; j++) {
      var s = segs[j];
      if (s.SegmentType === 'Cruise') cruises++;
      if (s.SegmentType === 'Flight') flights++;
      if (s.SegmentType === 'Train') trains++;
      // Count countries
      var cc1 = '', cc2 = '';
      if (s.DeparturePort) cc1 = s.DeparturePort.CountryCode || '';
      else if (s.Departure) cc1 = s.Departure.CountryCode || '';
      if (s.ArrivalPort) cc2 = s.ArrivalPort.CountryCode || '';
      else if (s.Arrival) cc2 = s.Arrival.CountryCode || '';
      if (s.CountryCode) cc1 = s.CountryCode;
      if (cc1) countries[cc1] = true;
      if (cc2) countries[cc2] = true;
      // Count cities
      var ci1 = '', ci2 = '';
      if (s.DeparturePort) ci1 = s.DeparturePort.City || '';
      else if (s.Departure) ci1 = s.Departure.City || '';
      if (s.ArrivalPort) ci2 = s.ArrivalPort.City || '';
      else if (s.Arrival) ci2 = s.Arrival.City || '';
      if (s.City) ci1 = s.City;
      if (ci1) cities[ci1] = true;
      if (ci2) cities[ci2] = true;
    }
  }

  var countryCount = Object.keys(countries).length;
  var cityCount = Object.keys(cities).length;
  var eventCount = (events || []).length;

  hud.innerHTML =
    '<div class="hud-title">TRAVEL STATS</div>' +
    '<div class="hud-row"><span class="hud-label">Trips</span><span class="hud-value">' + nonHome + '</span></div>' +
    '<div class="hud-row"><span class="hud-label">Countries</span><span class="hud-value">' + countryCount + '</span></div>' +
    '<div class="hud-row"><span class="hud-label">Cities</span><span class="hud-value">' + cityCount + '</span></div>' +
    '<div class="hud-row"><span class="hud-label">Cruises</span><span class="hud-value cyan">' + cruises + '</span></div>' +
    '<div class="hud-row"><span class="hud-label">Flights</span><span class="hud-value purple">' + flights + '</span></div>' +
    '<div class="hud-row"><span class="hud-label">Trains</span><span class="hud-value orange">' + trains + '</span></div>' +
    '<div class="hud-row"><span class="hud-label">Events</span><span class="hud-value green">' + eventCount + '</span></div>';
}

function refreshMap(trips, events) {
  if (!document.getElementById('globe-container')) return;
  initMap();
  buildMapData(trips, events);
}

function handleMapResize() {
  if (map) setTimeout(function() { map.invalidateSize(); }, 100);
}
