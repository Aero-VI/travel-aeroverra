// Globe/Map View - Hacker aesthetic interactive travel map
// Segment-level filtering, country highlighting, rich popups, seamless wrapping

let map = null;
let mapLayers = { flights: null, cruises: null, trains: null, markers: null, glow: null, countries: null };
let countryGeoData = null;

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

// ISO 3166-1 alpha-2 to alpha-3 mapping for GeoJSON matching
const ISO2_TO_ISO3 = {
  AU:'AUS',BS:'BHS',CA:'CAN',CO:'COL',CR:'CRI',DE:'DEU',DK:'DNK',DO:'DOM',
  EE:'EST',ES:'ESP',FI:'FIN',FR:'FRA',GB:'GBR',GI:'GIB',GR:'GRC',GU:'GUM',
  ID:'IDN',IE:'IRL',IS:'ISL',IT:'ITA',JP:'JPN',KR:'KOR',KY:'CYM',LV:'LVA',
  MX:'MEX',MY:'MYS',NL:'NLD',NO:'NOR',PA:'PAN',PH:'PHL',PL:'POL',PR:'PRI',
  PT:'PRT',SE:'SWE',SG:'SGP',SX:'SXM',TC:'TCA',TR:'TUR',US:'USA',VI:'VIR',
  VN:'VNM',HK:'HKG',TW:'TWN',TH:'THA',NZ:'NZL',CN:'CHN',IN:'IND',AE:'ARE',
  BR:'BRA',AR:'ARG',CL:'CHL',PE:'PER',EC:'ECU',JM:'JAM',HT:'HTI',CU:'CUB',
  BZ:'BLZ',HN:'HND',GT:'GTM',SV:'SLV',NI:'NIC',BB:'BRB',TT:'TTO',AW:'ABW',
  CW:'CUW',BM:'BMU',LC:'LCA',AG:'ATG',KN:'KNA',DM:'DMA',GD:'GRD',VC:'VCT',
  MT:'MLT',CY:'CYP',HR:'HRV',ME:'MNE',AL:'ALB',MK:'MKD',RS:'SRB',BA:'BIH',
  SI:'SVN',SK:'SVK',CZ:'CZE',HU:'HUN',RO:'ROU',BG:'BGR',LT:'LTU',UA:'UKR',
  BY:'BLR',MD:'MDA',AT:'AUT',CH:'CHE',BE:'BEL',LU:'LUX',MC:'MCO',NC:'NCL',
  VU:'VUT',WS:'WSM',FJ:'FJI'
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
    maxBounds: [[-90, -Infinity], [90, Infinity]],
    maxBoundsViscosity: 0,
    zoomAnimation: true,
    fadeAnimation: true
  });

  L.control.zoom({ position: 'topright' }).addTo(map);

  // Dark tiles, no wrapping limits
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
    subdomains: 'abcd',
    maxZoom: 19,
    opacity: 0.7,
    noWrap: false
  }).addTo(map);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png', {
    subdomains: 'abcd',
    maxZoom: 19,
    opacity: 0.35,
    noWrap: false
  }).addTo(map);

  L.control.attribution({ position: 'bottomright', prefix: false })
    .addAttribution('&copy; <a href="https://carto.com" style="color:#4a5568">CARTO</a>')
    .addTo(map);

  mapLayers.countries = L.layerGroup().addTo(map);
  mapLayers.glow = L.layerGroup().addTo(map);
  mapLayers.cruises = L.layerGroup().addTo(map);
  mapLayers.trains = L.layerGroup().addTo(map);
  mapLayers.flights = L.layerGroup().addTo(map);
  mapLayers.markers = L.layerGroup().addTo(map);

  // Load world GeoJSON for country highlighting
  loadCountryBoundaries();
}

function loadCountryBoundaries() {
  if (countryGeoData) return;
  fetch('https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      countryGeoData = data;
      // Re-render if map is visible
      if (map && document.getElementById('globe-view').classList.contains('active')) {
        var shipVal = document.getElementById('map-ship-filter').value;
        var yearVal = document.getElementById('map-year-filter').value;
        var tripVal = document.getElementById('map-trip-filter').value;
        var typeVal = document.getElementById('map-type-filter').value;
        if (shipVal === 'all' && yearVal === 'all' && tripVal === 'all' && typeVal === 'all') {
          renderCountryHighlights(getAllVisitedCountries(tripsData));
        }
      }
    })
    .catch(function(err) { console.warn('Country boundaries unavailable:', err); });
}

function getAllVisitedCountries(trips) {
  var codes = new Set();
  trips.forEach(function(trip) {
    (trip.Segments || []).forEach(function(seg) {
      ['DeparturePort','ArrivalPort','Departure','Arrival'].forEach(function(key) {
        var obj = seg[key];
        if (obj && obj.CountryCode) codes.add(obj.CountryCode);
      });
      if (seg.CountryCode) codes.add(seg.CountryCode);
      (seg.PortsOfCall || []).forEach(function(p) {
        if (p.CountryCode) codes.add(p.CountryCode);
      });
    });
  });
  return codes;
}

function renderCountryHighlights(countryCodes) {
  if (!mapLayers.countries) return;
  mapLayers.countries.clearLayers();
  if (!countryGeoData) return;

  // Convert ISO2 codes to ISO3
  var iso3Set = new Set();
  countryCodes.forEach(function(c) {
    var iso3 = ISO2_TO_ISO3[c];
    if (iso3) iso3Set.add(iso3);
  });

  var layer = L.geoJSON(countryGeoData, {
    filter: function(feature) {
      var props = feature.properties || {};
      var code = props.ISO_A3 || props['ISO3166-1-Alpha-3'] || '';
      return iso3Set.has(code);
    },
    style: function() {
      return {
        fillColor: '#22d3ee',
        fillOpacity: 0.06,
        color: '#22d3ee',
        weight: 0.8,
        opacity: 0.25
      };
    },
    interactive: false
  });
  mapLayers.countries.addLayer(layer);
}

function clearMap() {
  if (!map) return;
  Object.values(mapLayers).forEach(function(lg) { if (lg) lg.clearLayers(); });
}

// Great circle arc
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

function esc(s) { if (!s) return ''; var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

function fmtPopupDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Styled popup HTML with richer details
function buildPopup(icon, title, lines) {
  var html = '<div class="map-popup">';
  html += '<div class="mp-title">' + icon + ' ' + title + '</div>';
  for (var i = 0; i < lines.length; i++) {
    if (lines[i].cls) {
      html += '<div class="' + lines[i].cls + '">' + lines[i].text + '</div>';
    } else {
      html += '<div class="mp-sub">' + lines[i] + '</div>';
    }
  }
  html += '</div>';
  return html;
}

function addGlowRoute(layer, coords, color, weight, opacity, dashArray) {
  // Outer glow
  mapLayers.glow.addLayer(L.polyline(coords, {
    color: color, weight: weight * 3, opacity: opacity * 0.15,
    smoothFactor: 1, lineCap: 'round', lineJoin: 'round'
  }));

  var line = L.polyline(coords, {
    color: color, weight: weight, opacity: opacity,
    dashArray: dashArray || null,
    smoothFactor: 1, lineCap: 'round', lineJoin: 'round'
  });
  layer.addLayer(line);
  return line;
}

// Get active map filter state
function getMapFilterState() {
  return {
    ship: document.getElementById('map-ship-filter').value,
    year: document.getElementById('map-year-filter').value,
    trip: document.getElementById('map-trip-filter').value,
    type: document.getElementById('map-type-filter').value
  };
}

// Check if a segment passes the current filters
function segPassesFilter(seg, filters) {
  // Ship filter: only show segments matching the selected ship
  if (filters.ship !== 'all') {
    if (seg.SegmentType === 'Cruise') {
      if (seg.Ship !== filters.ship) return false;
    } else {
      // Non-cruise segments are hidden when filtering by ship
      return false;
    }
  }
  // Type filter: only show segments of that type
  if (filters.type !== 'all') {
    if (seg.SegmentType !== filters.type) return false;
  }
  return true;
}

function buildMapData(trips, events) {
  clearMap();
  if (!map) initMap();

  var filters = getMapFilterState();
  var visitedLocations = {};
  var visitedCountries = new Set();

  function addLocation(latlng, label, type, detail, countryCode) {
    if (!latlng) return;
    var key = latlng[0].toFixed(3) + ',' + latlng[1].toFixed(3);
    if (!visitedLocations[key]) {
      visitedLocations[key] = { latlng: latlng, label: label, types: new Set(), details: [], count: 0, countries: new Set() };
    }
    visitedLocations[key].types.add(type);
    if (detail) visitedLocations[key].details.push(detail);
    visitedLocations[key].count++;
    if (countryCode) {
      visitedLocations[key].countries.add(countryCode);
      visitedCountries.add(countryCode);
    }
  }

  trips.forEach(function(trip) {
    var isHome = trip.TripName && trip.TripName.toLowerCase().startsWith('home in');
    var segs = trip.Segments || [];
    var tripName = trip.TripName || '';

    segs.forEach(function(seg) {
      // Segment-level filtering
      if (!segPassesFilter(seg, filters)) return;

      if (seg.SegmentType === 'Flight') {
        var depCode = (seg.Departure || {}).Code || '';
        var arrCode = (seg.Arrival || {}).Code || '';
        var depCity = (seg.Departure || {}).City || '';
        var arrCity = (seg.Arrival || {}).City || '';
        var depCountry = (seg.Departure || {}).CountryCode || '';
        var arrCountry = (seg.Arrival || {}).CountryCode || '';
        var from = geocode('Flight', '', depCity, depCode);
        var to = geocode('Flight', '', arrCity, arrCode);

        if (from && to) {
          var arc = createArc(from, to);
          var airline = seg.Airline || 'Flight';
          var dateStr = seg.Departure && seg.Departure.Time ? fmtPopupDate(seg.Departure.Time) : '';
          var arrDateStr = seg.Arrival && seg.Arrival.Time ? fmtPopupDate(seg.Arrival.Time) : '';

          var popupLines = [
            depCity + ' (' + depCode + ') \u2192 ' + arrCity + ' (' + arrCode + ')'
          ];
          if (seg.FlightNumber) popupLines.push({ cls: 'mp-detail', text: '\u2708\uFE0F ' + esc(airline) + ' ' + esc(seg.FlightNumber) });
          if (seg.SeatClass) popupLines.push({ cls: 'mp-detail', text: '\uD83D\uDCBA ' + esc(seg.SeatClass) });
          if (dateStr) popupLines.push({ cls: 'mp-detail', text: '\uD83D\uDCC5 ' + dateStr + (arrDateStr && arrDateStr !== dateStr ? ' \u2192 ' + arrDateStr : '') });
          if (seg.BookingNumber) popupLines.push({ cls: 'mp-booking', text: seg.BookingNumber });
          popupLines.push({ cls: 'mp-trip-ref', text: '\uD83C\uDF0D ' + esc(tripName) });

          var line = addGlowRoute(mapLayers.flights, arc, ROUTE_COLORS.Flight, 1.2, 0.5, '8 5');
          line.bindPopup(buildPopup('\u2708\uFE0F', esc(airline), popupLines), { className: 'dark-popup', closeButton: false, maxWidth: 350 });

          if (depCountry) visitedCountries.add(depCountry);
          if (arrCountry) visitedCountries.add(arrCountry);
          addLocation(from, depCity + ' (' + depCode + ')', 'Flight', '\u2708\uFE0F ' + airline + ' \u2192 ' + arrCity, depCountry);
          addLocation(to, arrCity + ' (' + arrCode + ')', 'Flight', '\u2708\uFE0F ' + airline + ' \u2190 ' + depCity, arrCountry);
        }

      } else if (seg.SegmentType === 'Cruise') {
        var ports = [];
        var depPort = seg.DeparturePort || {};
        var arrPort = seg.ArrivalPort || {};
        var depCoord = geocode('Cruise', depPort.PortName || '', depPort.City || '', '');
        var arrCoord = geocode('Cruise', arrPort.PortName || '', arrPort.City || '', '');
        var shipName = seg.Ship || 'Cruise';
        var cruiseLine = seg.CruiseLine || '';
        var cruiseTitle = (cruiseLine + ' ' + shipName).trim();
        var cruiseStart = seg.DeparturePort && seg.DeparturePort.Time ? fmtPopupDate(seg.DeparturePort.Time) : '';
        var cruiseEnd = seg.ArrivalPort && seg.ArrivalPort.Time ? fmtPopupDate(seg.ArrivalPort.Time) : '';

        if (depCoord) {
          ports.push({ coord: depCoord, name: depPort.PortName || depPort.City || 'Departure', country: depPort.CountryCode || '' });
          if (depPort.CountryCode) visitedCountries.add(depPort.CountryCode);
          addLocation(depCoord, depPort.City || depPort.PortName || '', 'Cruise',
            '\uD83D\uDEA2 ' + cruiseTitle + ' (departure)', depPort.CountryCode);
        }

        (seg.PortsOfCall || []).forEach(function(p) {
          var coord = geocode('Cruise', p.PortName || '', p.City || '', '');
          if (coord) {
            ports.push({ coord: coord, name: p.PortName || p.City || '', country: p.CountryCode || '', date: p.Date });
            if (p.CountryCode) visitedCountries.add(p.CountryCode);
            addLocation(coord, p.City || p.PortName || '', 'Cruise',
              '\uD83D\uDEA2 ' + shipName + ' \u2022 ' + (p.Date ? fmtPopupDate(p.Date) : ''), p.CountryCode);
          }
        });

        if (arrCoord) {
          ports.push({ coord: arrCoord, name: arrPort.PortName || arrPort.City || 'Arrival', country: arrPort.CountryCode || '' });
          if (arrPort.CountryCode) visitedCountries.add(arrPort.CountryCode);
          addLocation(arrCoord, arrPort.City || arrPort.PortName || '', 'Cruise',
            '\uD83D\uDEA2 ' + cruiseTitle + ' (arrival)', arrPort.CountryCode);
        }

        for (var ci = 0; ci < ports.length - 1; ci++) {
          var cruiseArc = createArc(ports[ci].coord, ports[ci + 1].coord, 40);

          var cruisePopupLines = [
            esc(ports[ci].name) + ' \u2192 ' + esc(ports[ci + 1].name)
          ];
          if (cruiseStart) cruisePopupLines.push({ cls: 'mp-detail', text: '\uD83D\uDCC5 ' + cruiseStart + (cruiseEnd ? ' \u2192 ' + cruiseEnd : '') });
          if (seg.Stateroom) cruisePopupLines.push({ cls: 'mp-detail', text: '\uD83D\uDECF\uFE0F Rm ' + esc(seg.Stateroom) + (seg.RoomType ? ' (' + esc(seg.RoomType) + ')' : '') });
          if (seg.BookingNumber) cruisePopupLines.push({ cls: 'mp-booking', text: seg.BookingNumber });
          cruisePopupLines.push({ cls: 'mp-trip-ref', text: '\uD83C\uDF0D ' + esc(tripName) });

          var cruiseLine2 = addGlowRoute(mapLayers.cruises, cruiseArc, ROUTE_COLORS.Cruise, 2, 0.6, null);
          cruiseLine2.bindPopup(buildPopup('\uD83D\uDEA2', esc(cruiseTitle), cruisePopupLines), { className: 'dark-popup', closeButton: false, maxWidth: 350 });
        }

      } else if (seg.SegmentType === 'Train') {
        var tdepName = (seg.Departure || {}).LocationName || '';
        var tarrName = (seg.Arrival || {}).LocationName || '';
        var tdepCity = (seg.Departure || {}).City || '';
        var tarrCity = (seg.Arrival || {}).City || '';
        var tdepCountry = (seg.Departure || {}).CountryCode || '';
        var tarrCountry = (seg.Arrival || {}).CountryCode || '';
        var tfrom = geocode('Train', tdepName, tdepCity, '');
        var tto = geocode('Train', tarrName, tarrCity, '');

        if (tfrom && tto) {
          var op = seg.Operator || 'Train';
          var tn = seg.TrainNumber || '';
          var trainDateStr = seg.Departure && seg.Departure.Time ? fmtPopupDate(seg.Departure.Time) : '';

          var trainPopupLines = [
            (tdepCity || tdepName) + ' \u2192 ' + (tarrCity || tarrName)
          ];
          if (tn) trainPopupLines.push({ cls: 'mp-detail', text: '\uD83D\uDE86 ' + esc(op) + ' ' + esc(tn) });
          if (seg.SeatClass) trainPopupLines.push({ cls: 'mp-detail', text: '\uD83D\uDCBA ' + esc(seg.SeatClass) });
          if (trainDateStr) trainPopupLines.push({ cls: 'mp-detail', text: '\uD83D\uDCC5 ' + trainDateStr });
          if (seg.BookingNumber) trainPopupLines.push({ cls: 'mp-booking', text: seg.BookingNumber });
          trainPopupLines.push({ cls: 'mp-trip-ref', text: '\uD83C\uDF0D ' + esc(tripName) });

          var trainLine = addGlowRoute(mapLayers.trains, [tfrom, tto], ROUTE_COLORS.Train, 2, 0.5, '3 5');
          trainLine.bindPopup(buildPopup('\uD83D\uDE86', esc(op + (tn ? ' ' + tn : '')), trainPopupLines), { className: 'dark-popup', closeButton: false, maxWidth: 350 });

          if (tdepCountry) visitedCountries.add(tdepCountry);
          if (tarrCountry) visitedCountries.add(tarrCountry);
          addLocation(tfrom, tdepCity || tdepName, 'Train', '\uD83D\uDE86 ' + op + ' \u2192 ' + (tarrCity || tarrName), tdepCountry);
          addLocation(tto, tarrCity || tarrName, 'Train', '\uD83D\uDE86 ' + op + ' \u2190 ' + (tdepCity || tdepName), tarrCountry);
        }

      } else if (seg.SegmentType === 'Accommodation' && !isHome) {
        var aCity = seg.City || '';
        var aCountry = seg.CountryCode || '';
        var aCoord = geocode('', '', aCity, '');
        if (aCoord) {
          if (aCountry) visitedCountries.add(aCountry);
          addLocation(aCoord, aCity, 'Home', '\uD83C\uDFE8 ' + (seg.DisplayName || aCity), aCountry);
        }
      }
    });
  });

  // Events (only show if type filter is 'all')
  if (filters.type === 'all' && filters.ship === 'all') {
    (events || []).forEach(function(ev) {
      var evCity = ev.City || '';
      var evCountry = ev.CountryCode || '';
      var evCoord = geocode('', '', evCity, '');
      if (evCoord) {
        if (evCountry) visitedCountries.add(evCountry);
        addLocation(evCoord, evCity, 'Event', '\uD83C\uDFAD ' + (ev.Title || ev.EventName || ''), evCountry);
      }
    });
  }

  // Render country highlights
  renderCountryHighlights(visitedCountries);

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

    // Outer glow
    mapLayers.glow.addLayer(L.circleMarker(loc.latlng, {
      radius: size * 3, fillColor: color, fillOpacity: 0.06, stroke: false
    }));
    // Mid glow
    mapLayers.glow.addLayer(L.circleMarker(loc.latlng, {
      radius: size + 3, fillColor: color, fillOpacity: 0.15,
      color: color, weight: 1, opacity: 0.15
    }));
    // Core marker
    var marker = L.circleMarker(loc.latlng, {
      radius: size, fillColor: color, fillOpacity: 0.9,
      color: '#fff', weight: 0.5, opacity: 0.35
    });

    // Build rich popup
    var uniqueDetails = [];
    var seen = {};
    loc.details.forEach(function(d) { if (!seen[d]) { uniqueDetails.push(d); seen[d] = true; } });
    uniqueDetails = uniqueDetails.slice(0, 15);

    var typeBadges = '';
    loc.types.forEach(function(t) {
      var tc = (MARKER_COLORS[t] || '#58a6ff');
      typeBadges += '<span class="mp-type-badge" style="border-color:' + tc + ';color:' + tc + '">' + t + '</span>';
    });

    // Country names for this location
    var countryNames = [];
    loc.countries.forEach(function(c) {
      var name = typeof countryName === 'function' ? countryName(c) : c;
      if (name) countryNames.push(name);
    });

    var popupHtml = '<div class="map-popup">';
    popupHtml += '<div class="mp-title">' + loc.label + '</div>';
    if (countryNames.length > 0) {
      popupHtml += '<div class="mp-country">\uD83C\uDFF3\uFE0F ' + countryNames.join(', ') + '</div>';
    }
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

    marker.bindPopup(popupHtml, { className: 'dark-popup', closeButton: false, maxWidth: 350 });
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
