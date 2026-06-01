// Globe/Map View - Hacker aesthetic interactive travel map
// Glowing arcs, pulsing markers, layered glow effects, dark cyberpunk feel

let map = null;
let mapLayers = { flights: null, cruises: null, trains: null, markers: null, glow: null };
let animationFrames = [];

const ROUTE_COLORS = {
  Flight: '#c084fc',
  Cruise: '#22d3ee',
  Train: '#fbbf24',
  Bus: '#4ade80'
};

const MARKER_COLORS = {
  Flight: '#c084fc',
  Cruise: '#22d3ee',
  Train: '#fbbf24',
  Event: '#34d399',
  Home: '#f87171'
};

function initMap() {
  if (map) return;
  var container = document.getElementById('globe-container');
  if (!container) return;

  map = L.map('globe-container', {
    center: [20, 10],
    zoom: 3,
    minZoom: 2,
    maxZoom: 15,
    zoomControl: false,
    attributionControl: false,
    worldCopyJump: true,
    zoomAnimation: true,
    fadeAnimation: true
  });

  L.control.zoom({ position: 'topright' }).addTo(map);

  // Base: dark tiles without labels for clean look
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
    subdomains: 'abcd',
    maxZoom: 19,
    opacity: 0.7
  }).addTo(map);

  // Labels overlay at low opacity
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png', {
    subdomains: 'abcd',
    maxZoom: 19,
    opacity: 0.35
  }).addTo(map);

  L.control.attribution({ position: 'bottomright', prefix: false })
    .addAttribution('&copy; <a href="https://carto.com" style="color:#4a5568">CARTO</a>')
    .addTo(map);

  mapLayers.glow = L.layerGroup().addTo(map);
  mapLayers.cruises = L.layerGroup().addTo(map);
  mapLayers.trains = L.layerGroup().addTo(map);
  mapLayers.flights = L.layerGroup().addTo(map);
  mapLayers.markers = L.layerGroup().addTo(map);
}

function clearMap() {
  if (!map) return;
  Object.values(mapLayers).forEach(function(lg) { if (lg) lg.clearLayers(); });
  animationFrames.forEach(function(id) { cancelAnimationFrame(id); });
  animationFrames = [];
}

// Great circle arc between two lat/lng points
function createArc(from, to, numPoints) {
  numPoints = numPoints || 60;
  var latlngs = [];
  var lat1 = from[0] * Math.PI / 180;
  var lng1 = from[1] * Math.PI / 180;
  var lat2 = to[0] * Math.PI / 180;
  var lng2 = to[1] * Math.PI / 180;

  var d = Math.acos(
    Math.sin(lat1) * Math.sin(lat2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.cos(lng2 - lng1)
  );

  if (d === 0 || isNaN(d)) {
    latlngs.push([from[0], from[1]]);
    return latlngs;
  }

  for (var i = 0; i <= numPoints; i++) {
    var f = i / numPoints;
    var A = Math.sin((1 - f) * d) / Math.sin(d);
    var B = Math.sin(f * d) / Math.sin(d);
    var x = A * Math.cos(lat1) * Math.cos(lng1) + B * Math.cos(lat2) * Math.cos(lng2);
    var y = A * Math.cos(lat1) * Math.sin(lng1) + B * Math.cos(lat2) * Math.sin(lng2);
    var z = A * Math.sin(lat1) + B * Math.sin(lat2);
    var lat = Math.atan2(z, Math.sqrt(x * x + y * y)) * 180 / Math.PI;
    var lng = Math.atan2(y, x) * 180 / Math.PI;
    latlngs.push([lat, lng]);
  }
  return latlngs;
}

// Build styled popup HTML
function buildPopup(icon, title, subtitle, extra) {
  var html = '<div class="map-popup">';
  html += '<div class="mp-title">' + icon + ' ' + title + '</div>';
  if (subtitle) html += '<div class="mp-sub">' + subtitle + '</div>';
  if (extra) html += '<div class="mp-extra">' + extra + '</div>';
  html += '</div>';
  return html;
}

// Add a route with glow effect
function addGlowRoute(layer, coords, color, weight, opacity, dashArray) {
  // Outer glow (wide, transparent)
  var glow = L.polyline(coords, {
    color: color,
    weight: weight * 3,
    opacity: opacity * 0.15,
    smoothFactor: 1,
    lineCap: 'round',
    lineJoin: 'round'
  });
  mapLayers.glow.addLayer(glow);

  // Main line
  var line = L.polyline(coords, {
    color: color,
    weight: weight,
    opacity: opacity,
    dashArray: dashArray || null,
    smoothFactor: 1,
    lineCap: 'round',
    lineJoin: 'round'
  });
  layer.addLayer(line);
  return line;
}

function buildMapData(trips, events) {
  clearMap();
  if (!map) initMap();

  var visitedLocations = {};

  function addLocation(latlng, label, type, detail) {
    if (!latlng) return;
    var key = latlng[0].toFixed(3) + ',' + latlng[1].toFixed(3);
    if (!visitedLocations[key]) {
      visitedLocations[key] = { latlng: latlng, label: label, types: new Set(), details: [], count: 0 };
    }
    visitedLocations[key].types.add(type);
    if (detail) visitedLocations[key].details.push(detail);
    visitedLocations[key].count++;
  }

  trips.forEach(function(trip) {
    var isHome = trip.TripName && trip.TripName.toLowerCase().startsWith('home in');
    var segs = trip.Segments || [];

    segs.forEach(function(seg) {
      if (seg.SegmentType === 'Flight') {
        var depCode = (seg.Departure || {}).Code || '';
        var arrCode = (seg.Arrival || {}).Code || '';
        var depCity = (seg.Departure || {}).City || '';
        var arrCity = (seg.Arrival || {}).City || '';
        var from = geocode('Flight', '', depCity, depCode);
        var to = geocode('Flight', '', arrCity, arrCode);

        if (from && to) {
          var arc = createArc(from, to);
          var airline = seg.Airline || 'Flight';
          var dateStr = seg.Departure && seg.Departure.Time ?
            new Date(seg.Departure.Time).toLocaleDateString('en-US', {month:'short',day:'numeric',year:'numeric'}) : '';

          var line = addGlowRoute(mapLayers.flights, arc, ROUTE_COLORS.Flight, 1.2, 0.5, '8 5');
          line.bindPopup(
            buildPopup('\u2708\uFE0F', airline,
              depCity + ' (' + depCode + ') \u2192 ' + arrCity + ' (' + arrCode + ')',
              (dateStr ? dateStr : '') + (seg.BookingNumber ? '<br><span class="mp-booking">' + seg.BookingNumber + '</span>' : '')
            ),
            { className: 'dark-popup', closeButton: false }
          );

          addLocation(from, depCity + ' (' + depCode + ')', 'Flight', '\u2708\uFE0F ' + airline + ' \u2192 ' + arrCity);
          addLocation(to, arrCity + ' (' + arrCode + ')', 'Flight', '\u2708\uFE0F ' + airline + ' \u2190 ' + depCity);
        }

      } else if (seg.SegmentType === 'Cruise') {
        var ports = [];
        var depPort = seg.DeparturePort || {};
        var arrPort = seg.ArrivalPort || {};
        var depCoord = geocode('Cruise', depPort.PortName || '', depPort.City || '', '');
        var arrCoord = geocode('Cruise', arrPort.PortName || '', arrPort.City || '', '');

        if (depCoord) {
          ports.push({ coord: depCoord, name: depPort.PortName || depPort.City || 'Departure' });
          addLocation(depCoord, depPort.City || depPort.PortName || '', 'Cruise',
            '\uD83D\uDEA2 ' + (seg.CruiseLine || '') + ' ' + (seg.Ship || '') + ' departure');
        }

        (seg.PortsOfCall || []).forEach(function(p) {
          var coord = geocode('Cruise', p.PortName || '', p.City || '', '');
          if (coord) {
            ports.push({ coord: coord, name: p.PortName || p.City || '' });
            addLocation(coord, p.City || p.PortName || '', 'Cruise',
              '\uD83D\uDEA2 ' + (seg.Ship || 'Cruise') + ' port call');
          }
        });

        if (arrCoord) {
          ports.push({ coord: arrCoord, name: arrPort.PortName || arrPort.City || 'Arrival' });
          addLocation(arrCoord, arrPort.City || arrPort.PortName || '', 'Cruise',
            '\uD83D\uDEA2 ' + (seg.CruiseLine || '') + ' ' + (seg.Ship || '') + ' arrival');
        }

        for (var ci = 0; ci < ports.length - 1; ci++) {
          var cruiseArc = createArc(ports[ci].coord, ports[ci + 1].coord, 40);
          var cruiseLine = addGlowRoute(mapLayers.cruises, cruiseArc, ROUTE_COLORS.Cruise, 2, 0.6, null);
          cruiseLine.bindPopup(
            buildPopup('\uD83D\uDEA2', (seg.CruiseLine || '') + ' ' + (seg.Ship || ''),
              ports[ci].name + ' \u2192 ' + ports[ci + 1].name,
              seg.BookingNumber ? '<span class="mp-booking">' + seg.BookingNumber + '</span>' : ''
            ),
            { className: 'dark-popup', closeButton: false }
          );
        }

      } else if (seg.SegmentType === 'Train') {
        var tdepName = (seg.Departure || {}).LocationName || '';
        var tarrName = (seg.Arrival || {}).LocationName || '';
        var tdepCity = (seg.Departure || {}).City || '';
        var tarrCity = (seg.Arrival || {}).City || '';
        var tfrom = geocode('Train', tdepName, tdepCity, '');
        var tto = geocode('Train', tarrName, tarrCity, '');

        if (tfrom && tto) {
          var trainLine = addGlowRoute(mapLayers.trains, [tfrom, tto], ROUTE_COLORS.Train, 2, 0.5, '3 5');
          var op = seg.Operator || 'Train';
          var tn = seg.TrainNumber || '';
          trainLine.bindPopup(
            buildPopup('\uD83D\uDE86', op + (tn ? ' ' + tn : ''),
              (tdepCity || tdepName) + ' \u2192 ' + (tarrCity || tarrName), ''
            ),
            { className: 'dark-popup', closeButton: false }
          );

          addLocation(tfrom, tdepCity || tdepName, 'Train', '\uD83D\uDE86 ' + op + ' \u2192 ' + (tarrCity || tarrName));
          addLocation(tto, tarrCity || tarrName, 'Train', '\uD83D\uDE86 ' + op + ' \u2190 ' + (tdepCity || tdepName));
        }

      } else if (seg.SegmentType === 'Accommodation' && !isHome) {
        var aCity = seg.City || '';
        var aCoord = geocode('', '', aCity, '');
        if (aCoord) {
          addLocation(aCoord, aCity, 'Home', '\uD83C\uDFE8 ' + (seg.DisplayName || aCity));
        }
      }
    });
  });

  // Events
  (events || []).forEach(function(ev) {
    var evCity = ev.City || '';
    var evCoord = geocode('', '', evCity, '');
    if (evCoord) {
      addLocation(evCoord, evCity, 'Event', '\uD83C\uDFAD ' + (ev.EventName || ''));
    }
  });

  // Render markers with multi-layer glow
  var locationEntries = Object.values(visitedLocations);
  locationEntries.forEach(function(loc) {
    var color = '#58a6ff';
    var size = 4;

    if (loc.types.has('Event')) { color = MARKER_COLORS.Event; size = 4; }
    if (loc.types.has('Train')) { color = MARKER_COLORS.Train; size = 4; }
    if (loc.types.has('Flight')) { color = MARKER_COLORS.Flight; size = 5; }
    if (loc.types.has('Cruise')) { color = MARKER_COLORS.Cruise; size = 5; }

    if (loc.count > 3) size += 2;
    if (loc.count > 6) size += 2;
    if (loc.count > 10) size += 2;

    // Outer glow ring
    mapLayers.glow.addLayer(L.circleMarker(loc.latlng, {
      radius: size * 3,
      fillColor: color,
      fillOpacity: 0.06,
      stroke: false
    }));

    // Mid glow
    mapLayers.glow.addLayer(L.circleMarker(loc.latlng, {
      radius: size + 3,
      fillColor: color,
      fillOpacity: 0.15,
      color: color,
      weight: 1,
      opacity: 0.15
    }));

    // Core marker
    var marker = L.circleMarker(loc.latlng, {
      radius: size,
      fillColor: color,
      fillOpacity: 0.9,
      color: '#fff',
      weight: 0.5,
      opacity: 0.35
    });

    // Build popup
    var uniqueDetails = [];
    var seen = {};
    loc.details.forEach(function(d) { if (!seen[d]) { uniqueDetails.push(d); seen[d] = true; } });
    uniqueDetails = uniqueDetails.slice(0, 12);

    var typeBadges = '';
    loc.types.forEach(function(t) {
      var tc = (MARKER_COLORS[t] || '#58a6ff');
      typeBadges += '<span class="mp-type-badge" style="border-color:' + tc + ';color:' + tc + '">' + t + '</span>';
    });

    var popupHtml = '<div class="map-popup">';
    popupHtml += '<div class="mp-title">' + loc.label + '</div>';
    popupHtml += '<div class="mp-visit-count">' + loc.count + ' visit' + (loc.count !== 1 ? 's' : '') + '</div>';
    popupHtml += '<div class="mp-types">' + typeBadges + '</div>';
    if (uniqueDetails.length > 0) {
      popupHtml += '<div class="mp-details">';
      uniqueDetails.forEach(function(d) {
        popupHtml += '<div class="mp-detail">' + d + '</div>';
      });
      popupHtml += '</div>';
    }
    popupHtml += '</div>';

    marker.bindPopup(popupHtml, { className: 'dark-popup', closeButton: false, maxWidth: 320 });
    mapLayers.markers.addLayer(marker);
  });

  // Fit bounds
  var allCoords = locationEntries.map(function(l) { return l.latlng; });
  if (allCoords.length > 0) {
    map.fitBounds(L.latLngBounds(allCoords).pad(0.1));
  }
}

function refreshMap(trips, events) {
  if (!document.getElementById('globe-container')) return;
  initMap();
  buildMapData(trips, events);
}

function handleMapResize() {
  if (map) {
    setTimeout(function() { map.invalidateSize(); }, 100);
  }
}
