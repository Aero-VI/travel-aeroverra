// Globe/Map View - Interactive travel map using Leaflet
// Renders all trips as arcs, markers, and route lines on a dark map

let map = null;
let mapLayers = { flights: null, cruises: null, trains: null, markers: null };
let allMapData = { routes: [], markers: [] };

const ROUTE_COLORS = {
  Flight: '#ba68c8',
  Cruise: '#4fc3f7',
  Train: '#ffb74d',
  Bus: '#81c784'
};

const MARKER_COLORS = {
  Flight: '#ba68c8',
  Cruise: '#4fc3f7',
  Train: '#ffb74d',
  Event: '#3fb950',
  Home: '#e57373'
};

function initMap() {
  if (map) return;
  const container = document.getElementById('globe-container');
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

  // Dark tile layer (CartoDB Dark Matter - free, no API key)
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    subdomains: 'abcd',
    maxZoom: 19
  }).addTo(map);

  // Attribution (small, non-intrusive)
  L.control.attribution({ position: 'bottomright', prefix: false })
    .addAttribution('&copy; <a href="https://carto.com">CARTO</a>')
    .addTo(map);

  mapLayers.flights = L.layerGroup().addTo(map);
  mapLayers.cruises = L.layerGroup().addTo(map);
  mapLayers.trains = L.layerGroup().addTo(map);
  mapLayers.markers = L.layerGroup().addTo(map);
}

function clearMap() {
  if (!map) return;
  Object.values(mapLayers).forEach(lg => { if (lg) lg.clearLayers(); });
  allMapData = { routes: [], markers: [] };
}

// Create a curved arc between two points (for flights)
function createArc(from, to, numPoints) {
  numPoints = numPoints || 50;
  const latlngs = [];
  const lat1 = from[0] * Math.PI / 180;
  const lng1 = from[1] * Math.PI / 180;
  const lat2 = to[0] * Math.PI / 180;
  const lng2 = to[1] * Math.PI / 180;

  for (let i = 0; i <= numPoints; i++) {
    const f = i / numPoints;
    const d = Math.acos(
      Math.sin(lat1) * Math.sin(lat2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.cos(lng2 - lng1)
    );
    if (d === 0) { latlngs.push([from[0], from[1]]); continue; }
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(lat1) * Math.cos(lng1) + B * Math.cos(lat2) * Math.cos(lng2);
    const y = A * Math.cos(lat1) * Math.sin(lng1) + B * Math.cos(lat2) * Math.sin(lng2);
    const z = A * Math.sin(lat1) + B * Math.sin(lat2);
    const lat = Math.atan2(z, Math.sqrt(x * x + y * y)) * 180 / Math.PI;
    const lng = Math.atan2(y, x) * 180 / Math.PI;
    latlngs.push([lat, lng]);
  }
  return latlngs;
}

// Create a pulsing circle marker
function createMarker(latlng, color, label, details, size) {
  size = size || 6;
  const marker = L.circleMarker(latlng, {
    radius: size,
    fillColor: color,
    fillOpacity: 0.85,
    color: color,
    weight: 1,
    opacity: 0.5
  });

  let popupContent = '<div style="font-family:-apple-system,sans-serif;color:#e6edf3;min-width:180px;">';
  popupContent += '<div style="font-weight:700;font-size:1rem;margin-bottom:4px;">' + label + '</div>';
  if (details && details.length) {
    details.forEach(function(d) {
      popupContent += '<div style="font-size:0.82rem;color:#8b949e;padding:2px 0;">' + d + '</div>';
    });
  }
  popupContent += '</div>';

  marker.bindPopup(popupContent, {
    className: 'dark-popup',
    closeButton: true,
    autoPan: true
  });

  return marker;
}

function buildMapData(trips, events) {
  clearMap();
  if (!map) initMap();

  const visitedLocations = {};  // key: "lat,lng" -> { label, types: Set, details: [] }

  function addLocation(latlng, label, type, detail) {
    if (!latlng) return;
    const key = latlng[0].toFixed(3) + ',' + latlng[1].toFixed(3);
    if (!visitedLocations[key]) {
      visitedLocations[key] = { latlng: latlng, label: label, types: new Set(), details: [], count: 0 };
    }
    visitedLocations[key].types.add(type);
    if (detail) visitedLocations[key].details.push(detail);
    visitedLocations[key].count++;
  }

  // Process trips
  trips.forEach(function(trip) {
    const isHome = trip.TripName && trip.TripName.toLowerCase().startsWith('home in');
    const segs = trip.Segments || [];

    segs.forEach(function(seg) {
      if (seg.SegmentType === 'Flight') {
        const depCode = (seg.Departure || {}).Code || '';
        const arrCode = (seg.Arrival || {}).Code || '';
        const depCity = (seg.Departure || {}).City || '';
        const arrCity = (seg.Arrival || {}).City || '';
        const from = geocode('Flight', '', depCity, depCode);
        const to = geocode('Flight', '', arrCity, arrCode);

        if (from && to) {
          const arc = createArc(from, to);
          const line = L.polyline(arc, {
            color: ROUTE_COLORS.Flight,
            weight: 1.5,
            opacity: 0.5,
            dashArray: '6 4',
            smoothFactor: 1
          });
          const airline = seg.Airline || 'Flight';
          const dateStr = seg.Departure && seg.Departure.Time ?
            new Date(seg.Departure.Time).toLocaleDateString('en-US', {month:'short',day:'numeric',year:'numeric'}) : '';
          line.bindPopup(
            '<div style="font-family:-apple-system,sans-serif;color:#e6edf3;">' +
            '<div style="font-weight:700;">✈️ ' + airline + '</div>' +
            '<div style="color:#8b949e;font-size:0.85rem;">' + depCity + ' (' + depCode + ') → ' + arrCity + ' (' + arrCode + ')</div>' +
            (dateStr ? '<div style="color:#8b949e;font-size:0.82rem;">' + dateStr + '</div>' : '') +
            (seg.BookingNumber ? '<div style="color:#58a6ff;font-size:0.82rem;font-family:monospace;">' + seg.BookingNumber + '</div>' : '') +
            '</div>',
            { className: 'dark-popup' }
          );
          mapLayers.flights.addLayer(line);

          addLocation(from, depCity + ' (' + depCode + ')', 'Flight', '✈️ ' + airline + ' to ' + arrCity);
          addLocation(to, arrCity + ' (' + arrCode + ')', 'Flight', '✈️ ' + airline + ' from ' + depCity);
        }

      } else if (seg.SegmentType === 'Cruise') {
        const ports = [];
        const depPort = seg.DeparturePort || {};
        const arrPort = seg.ArrivalPort || {};
        const depCoord = geocode('Cruise', depPort.PortName || '', depPort.City || '', '');
        const arrCoord = geocode('Cruise', arrPort.PortName || '', arrPort.City || '', '');

        if (depCoord) {
          ports.push({ coord: depCoord, name: depPort.PortName || depPort.City || 'Departure' });
          addLocation(depCoord, depPort.City || depPort.PortName || '', 'Cruise',
            '🚢 ' + (seg.CruiseLine || '') + ' ' + (seg.Ship || '') + ' departure');
        }

        (seg.PortsOfCall || []).forEach(function(p) {
          const coord = geocode('Cruise', p.PortName || '', p.City || '', '');
          if (coord) {
            ports.push({ coord: coord, name: p.PortName || p.City || '' });
            addLocation(coord, p.City || p.PortName || '', 'Cruise',
              '🚢 ' + (seg.Ship || 'Cruise') + ' port call');
          }
        });

        if (arrCoord) {
          ports.push({ coord: arrCoord, name: arrPort.PortName || arrPort.City || 'Arrival' });
          addLocation(arrCoord, arrPort.City || arrPort.PortName || '', 'Cruise',
            '🚢 ' + (seg.CruiseLine || '') + ' ' + (seg.Ship || '') + ' arrival');
        }

        // Draw cruise route as connected line segments
        for (let i = 0; i < ports.length - 1; i++) {
          const arc = createArc(ports[i].coord, ports[i + 1].coord, 30);
          const line = L.polyline(arc, {
            color: ROUTE_COLORS.Cruise,
            weight: 2,
            opacity: 0.6,
            smoothFactor: 1
          });
          line.bindPopup(
            '<div style="font-family:-apple-system,sans-serif;color:#e6edf3;">' +
            '<div style="font-weight:700;">🚢 ' + (seg.CruiseLine || '') + ' ' + (seg.Ship || '') + '</div>' +
            '<div style="color:#8b949e;font-size:0.85rem;">' + ports[i].name + ' → ' + ports[i + 1].name + '</div>' +
            (seg.BookingNumber ? '<div style="color:#58a6ff;font-size:0.82rem;font-family:monospace;">' + seg.BookingNumber + '</div>' : '') +
            '</div>',
            { className: 'dark-popup' }
          );
          mapLayers.cruises.addLayer(line);
        }

      } else if (seg.SegmentType === 'Train') {
        const depName = (seg.Departure || {}).LocationName || '';
        const arrName = (seg.Arrival || {}).LocationName || '';
        const depCity = (seg.Departure || {}).City || '';
        const arrCity = (seg.Arrival || {}).City || '';
        const from = geocode('Train', depName, depCity, '');
        const to = geocode('Train', arrName, arrCity, '');

        if (from && to) {
          const line = L.polyline([from, to], {
            color: ROUTE_COLORS.Train,
            weight: 2.5,
            opacity: 0.6,
            dashArray: '4 6',
            smoothFactor: 1
          });
          const operator = seg.Operator || 'Train';
          const trainNum = seg.TrainNumber || '';
          line.bindPopup(
            '<div style="font-family:-apple-system,sans-serif;color:#e6edf3;">' +
            '<div style="font-weight:700;">🚆 ' + operator + (trainNum ? ' ' + trainNum : '') + '</div>' +
            '<div style="color:#8b949e;font-size:0.85rem;">' + (depCity || depName) + ' → ' + (arrCity || arrName) + '</div>' +
            '</div>',
            { className: 'dark-popup' }
          );
          mapLayers.trains.addLayer(line);

          addLocation(from, depCity || depName, 'Train', '🚆 ' + operator + ' to ' + (arrCity || arrName));
          addLocation(to, arrCity || arrName, 'Train', '🚆 ' + operator + ' from ' + (depCity || depName));
        }

      } else if (seg.SegmentType === 'Accommodation' && !isHome) {
        const city = seg.City || '';
        const coord = geocode('', '', city, '');
        if (coord) {
          addLocation(coord, city, 'Home', '🏨 ' + (seg.DisplayName || city));
        }
      }
    });
  });

  // Process events
  (events || []).forEach(function(ev) {
    const city = ev.City || '';
    const coord = geocode('', '', city, '');
    if (coord) {
      addLocation(coord, city, 'Event', '🎭 ' + (ev.EventName || ''));
    }
  });

  // Render markers
  Object.values(visitedLocations).forEach(function(loc) {
    // Determine primary type for color
    let color = '#58a6ff';
    let size = 5;
    if (loc.types.has('Cruise')) { color = MARKER_COLORS.Cruise; size = 6; }
    if (loc.types.has('Flight')) { color = MARKER_COLORS.Flight; size = 6; }
    if (loc.types.has('Train')) { color = MARKER_COLORS.Train; size = 5; }
    if (loc.types.has('Event')) { color = MARKER_COLORS.Event; size = 5; }
    if (loc.count > 3) size = 8;
    if (loc.count > 6) size = 10;

    // Deduplicate details
    const uniqueDetails = [...new Set(loc.details)].slice(0, 10);
    const marker = createMarker(loc.latlng, color, loc.label, uniqueDetails, size);
    mapLayers.markers.addLayer(marker);
  });

  // Fit bounds to all markers
  const allCoords = Object.values(visitedLocations).map(function(l) { return l.latlng; });
  if (allCoords.length > 0) {
    map.fitBounds(L.latLngBounds(allCoords).pad(0.1));
  }
}

function refreshMap(trips, events) {
  if (!document.getElementById('globe-container')) return;
  initMap();
  buildMapData(trips, events);
}

// Handle map resize when view becomes visible
function handleMapResize() {
  if (map) {
    setTimeout(function() { map.invalidateSize(); }, 100);
  }
}
