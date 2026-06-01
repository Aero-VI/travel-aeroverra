// Globe/Map View - Hacker aesthetic interactive travel map
// Glowing arcs, pulsing markers, country highlights, dark cyberpunk feel

let map = null;
let mapLayers = { flights: null, cruises: null, trains: null, markers: null, glow: null, countries: null };
let animationFrames = [];
let countriesGeoJson = null;

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

// ISO Alpha-2 to Alpha-3 map for GeoJSON matching
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
  BY:'BLR',MD:'MDA',AT:'AUT',CH:'CHE',BE:'BEL',LU:'LUX',MC:'MCO',LI:'LIE',
  SM:'SMR',VA:'VAT',AD:'AND',NC:'NCL',VU:'VUT',FJ:'FJI',
  NC:'NCL',VU:'VUT'
};

// Country name helper
var COUNTRY_NAMES_MAP = {
  AU:'Australia',BS:'Bahamas',CA:'Canada',CO:'Colombia',CR:'Costa Rica',
  DE:'Germany',DK:'Denmark',DO:'Dominican Republic',EE:'Estonia',ES:'Spain',
  FI:'Finland',FR:'France',GB:'United Kingdom',GI:'Gibraltar',GR:'Greece',
  GU:'Guam',ID:'Indonesia',IE:'Ireland',IS:'Iceland',IT:'Italy',JP:'Japan',
  KR:'South Korea',KY:'Cayman Islands',LV:'Latvia',MX:'Mexico',MY:'Malaysia',
  NL:'Netherlands',NO:'Norway',PA:'Panama',PH:'Philippines',PL:'Poland',
  PR:'Puerto Rico',PT:'Portugal',SE:'Sweden',SG:'Singapore',SX:'Sint Maarten',
  TC:'Turks & Caicos',TR:'Turkey',US:'United States',VI:'US Virgin Islands',
  VN:'Vietnam',HK:'Hong Kong',TW:'Taiwan',NZ:'New Zealand',NC:'New Caledonia',
  VU:'Vanuatu',BB:'Barbados',AW:'Aruba',CW:'Curacao'
};
function getCountryName(code) {
  return code ? (COUNTRY_NAMES_MAP[code] || code) : '';
}

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
    fadeAnimation: true,
    maxBoundsViscosity: 0
  });

  L.control.zoom({ position: 'topright' }).addTo(map);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
    subdomains: 'abcd',
    maxZoom: 19,
    opacity: 0.7
  }).addTo(map);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png', {
    subdomains: 'abcd',
    maxZoom: 19,
    opacity: 0.35
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

  loadCountryBoundaries();
}

function loadCountryBoundaries() {
  if (countriesGeoJson) return;
  fetch('https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      countriesGeoJson = data;
    })
    .catch(function(err) {
      console.warn('Could not load country boundaries:', err);
    });
}

function clearMap() {
  if (!map) return;
  Object.values(mapLayers).forEach(function(lg) { if (lg) lg.clearLayers(); });
  animationFrames.forEach(function(id) { cancelAnimationFrame(id); });
  animationFrames = [];
}

// Great circle arc generator
function createArc(from, to, numPoints) {
  numPoints = numPoints || 60;
  var latlngs = [];
  var lat1 = from[0] * Math.PI / 180;
  var lng1 = from[1] * Math.PI / 180;
  var lat2 = to[0] * Math.PI / 180;
  var lng2 = to[1] * Math.PI / 180;

  var d = Math.acos(
    Math.min(1, Math.max(-1,
      Math.sin(lat1) * Math.sin(lat2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.cos(lng2 - lng1)
    ))
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

// Split an arc into multiple segments at the antimeridian so Leaflet
// draws the short way around the world instead of a line spanning 360 degrees.
// Returns an array of coordinate arrays (each is a valid polyline segment).
function splitArcAtAntimeridian(coords) {
  if (coords.length < 2) return [coords];

  var segments = [];
  var current = [coords[0]];

  for (var i = 1; i < coords.length; i++) {
    var prevLng = coords[i - 1][1];
    var currLng = coords[i][1];
    var diff = currLng - prevLng;

    // If the longitude jump is > 180 degrees, we crossed the antimeridian
    if (Math.abs(diff) > 180) {
      // Calculate the latitude at the crossing point
      var crossLng = diff > 0 ? -180 : 180;
      var ratio = (crossLng - prevLng) / (currLng - (diff > 0 ? currLng - 360 : currLng + 360) - prevLng + (diff > 0 ? -360 : 360));
      // Simplified: interpolate latitude
      var crossLat = coords[i - 1][0] + ratio * (coords[i][0] - coords[i - 1][0]);

      // End current segment at the boundary
      current.push([crossLat, crossLng]);
      segments.push(current);

      // Start new segment from the other side
      current = [[crossLat, -crossLng], coords[i]];
    } else {
      current.push(coords[i]);
    }
  }

  if (current.length > 0) {
    segments.push(current);
  }

  return segments;
}

function buildPopup(icon, title, subtitle, extra) {
  var html = '<div class="map-popup">';
  html += '<div class="mp-title">' + icon + ' ' + title + '</div>';
  if (subtitle) html += '<div class="mp-sub">' + subtitle + '</div>';
  if (extra) html += '<div class="mp-extra">' + extra + '</div>';
  html += '</div>';
  return html;
}

function addGlowRoute(layer, coords, color, weight, opacity, dashArray) {
  // Split coordinates at antimeridian crossings
  var segments = splitArcAtAntimeridian(coords);
  var lastLine = null;

  for (var si = 0; si < segments.length; si++) {
    var seg = segments[si];
    if (seg.length < 2) continue;

    // Glow layer
    mapLayers.glow.addLayer(L.polyline(seg, {
      color: color,
      weight: weight * 3,
      opacity: opacity * 0.15,
      smoothFactor: 1,
      lineCap: 'round',
      lineJoin: 'round'
    }));

    // Main line
    var line = L.polyline(seg, {
      color: color,
      weight: weight,
      opacity: opacity,
      dashArray: dashArray || null,
      smoothFactor: 1,
      lineCap: 'round',
      lineJoin: 'round'
    });
    layer.addLayer(line);
    lastLine = line;
  }

  return lastLine;
}

function buildMapData(trips, events, filterShip, filterType) {
  clearMap();
  if (!map) initMap();

  var visitedLocations = {};
  var visitedCountryCodes = new Set();

  function addCountry(code) {
    if (code) visitedCountryCodes.add(code);
  }

  function addLocation(latlng, label, type, detail, countryCode, tripName, dateStr) {
    if (!latlng) return;
    var key = latlng[0].toFixed(3) + ',' + latlng[1].toFixed(3);
    if (!visitedLocations[key]) {
      visitedLocations[key] = {
        latlng: latlng, label: label, types: new Set(),
        details: [], count: 0, countries: new Set(), trips: new Set(), dates: []
      };
    }
    visitedLocations[key].types.add(type);
    if (detail) visitedLocations[key].details.push(detail);
    if (countryCode) visitedLocations[key].countries.add(countryCode);
    if (tripName) visitedLocations[key].trips.add(tripName);
    if (dateStr) visitedLocations[key].dates.push(dateStr);
    visitedLocations[key].count++;
    addCountry(countryCode);
  }

  trips.forEach(function(trip) {
    var isHome = trip.TripName && trip.TripName.toLowerCase().startsWith('home in');
    var segs = trip.Segments || [];
    var tripName = trip.TripName || '';

    segs.forEach(function(seg) {
      // SEGMENT-LEVEL FILTERING
      if (filterShip && filterShip !== 'all') {
        if (seg.SegmentType === 'Cruise' && seg.Ship !== filterShip) return;
        if (seg.SegmentType !== 'Cruise' && (!filterType || filterType === 'all')) return;
      }
      if (filterType && filterType !== 'all' && seg.SegmentType !== filterType) return;

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
          var dateStr = seg.Departure && seg.Departure.Time ?
            new Date(seg.Departure.Time).toLocaleDateString('en-US', {month:'short',day:'numeric',year:'numeric'}) : '';

          var line = addGlowRoute(mapLayers.flights, arc, ROUTE_COLORS.Flight, 1.2, 0.5, '8 5');
          if (line) {
            line.bindPopup(
              buildPopup('\u2708\uFE0F', airline,
                depCity + ' (' + depCode + ') \u2192 ' + arrCity + ' (' + arrCode + ')',
                (dateStr ? dateStr : '') +
                (tripName ? '<br><span class="mp-trip-name">' + tripName + '</span>' : '') +
                (seg.BookingNumber ? '<br><span class="mp-booking">' + seg.BookingNumber + '</span>' : '')
              ),
              { className: 'dark-popup', closeButton: false }
            );
          }

          addLocation(from, depCity + ' (' + depCode + ')', 'Flight',
            '\u2708\uFE0F ' + airline + ' \u2192 ' + arrCity, depCountry, tripName, dateStr);
          addLocation(to, arrCity + ' (' + arrCode + ')', 'Flight',
            '\u2708\uFE0F ' + airline + ' \u2190 ' + depCity, arrCountry, tripName, dateStr);
          addCountry(depCountry);
          addCountry(arrCountry);
        }

      } else if (seg.SegmentType === 'Cruise') {
        var ports = [];
        var depPort = seg.DeparturePort || {};
        var arrPort = seg.ArrivalPort || {};
        var depCoord = geocode('Cruise', depPort.PortName || '', depPort.City || '', '');
        var arrCoord = geocode('Cruise', arrPort.PortName || '', arrPort.City || '', '');
        var shipName = (seg.CruiseLine || '') + ' ' + (seg.Ship || '');
        var cruiseDateStart = depPort.Time ? new Date(depPort.Time).toLocaleDateString('en-US', {month:'short',day:'numeric'}) : '';
        var cruiseDateEnd = arrPort.Time ? new Date(arrPort.Time).toLocaleDateString('en-US', {month:'short',day:'numeric',year:'numeric'}) : '';
        var cruiseDateRange = cruiseDateStart + (cruiseDateEnd ? ' - ' + cruiseDateEnd : '');

        if (depCoord) {
          ports.push({ coord: depCoord, name: depPort.PortName || depPort.City || 'Departure' });
          addLocation(depCoord, depPort.City || depPort.PortName || '', 'Cruise',
            '\uD83D\uDEA2 ' + shipName.trim() + ' departure',
            depPort.CountryCode, tripName, cruiseDateRange);
          addCountry(depPort.CountryCode);
        }

        (seg.PortsOfCall || []).forEach(function(p) {
          var coord = geocode('Cruise', p.PortName || '', p.City || '', '');
          var portDate = p.Date ? new Date(p.Date).toLocaleDateString('en-US', {month:'short',day:'numeric'}) : '';
          if (coord) {
            ports.push({ coord: coord, name: p.PortName || p.City || '' });
            addLocation(coord, p.City || p.PortName || '', 'Cruise',
              '\uD83D\uDEA2 ' + (seg.Ship || 'Cruise') + ' (' + portDate + ')',
              p.CountryCode, tripName, portDate);
            addCountry(p.CountryCode);
          }
        });

        if (arrCoord) {
          ports.push({ coord: arrCoord, name: arrPort.PortName || arrPort.City || 'Arrival' });
          addLocation(arrCoord, arrPort.City || arrPort.PortName || '', 'Cruise',
            '\uD83D\uDEA2 ' + shipName.trim() + ' arrival',
            arrPort.CountryCode, tripName, cruiseDateRange);
          addCountry(arrPort.CountryCode);
        }

        for (var ci = 0; ci < ports.length - 1; ci++) {
          var cruiseArc = createArc(ports[ci].coord, ports[ci + 1].coord, 40);
          var cruiseLine = addGlowRoute(mapLayers.cruises, cruiseArc, ROUTE_COLORS.Cruise, 2, 0.6, null);
          if (cruiseLine) {
            cruiseLine.bindPopup(
              buildPopup('\uD83D\uDEA2', shipName.trim(),
                ports[ci].name + ' \u2192 ' + ports[ci + 1].name,
                (cruiseDateRange ? cruiseDateRange : '') +
                (tripName ? '<br><span class="mp-trip-name">' + tripName + '</span>' : '') +
                (seg.BookingNumber ? '<br><span class="mp-booking">' + seg.BookingNumber + '</span>' : '')
              ),
              { className: 'dark-popup', closeButton: false }
            );
          }
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
          var trainLine = addGlowRoute(mapLayers.trains, [tfrom, tto], ROUTE_COLORS.Train, 2, 0.5, '3 5');
          var op = seg.Operator || 'Train';
          var tn = seg.TrainNumber || '';
          var trainDate = seg.Departure && seg.Departure.Time ?
            new Date(seg.Departure.Time).toLocaleDateString('en-US', {month:'short',day:'numeric',year:'numeric'}) : '';
          if (trainLine) {
            trainLine.bindPopup(
              buildPopup('\uD83D\uDE86', op + (tn ? ' ' + tn : ''),
                (tdepCity || tdepName) + ' \u2192 ' + (tarrCity || tarrName),
                (trainDate ? trainDate : '') +
                (tripName ? '<br><span class="mp-trip-name">' + tripName + '</span>' : '')
              ),
              { className: 'dark-popup', closeButton: false }
            );
          }

          addLocation(tfrom, tdepCity || tdepName, 'Train',
            '\uD83D\uDE86 ' + op + ' \u2192 ' + (tarrCity || tarrName), tdepCountry, tripName, trainDate);
          addLocation(tto, tarrCity || tarrName, 'Train',
            '\uD83D\uDE86 ' + op + ' \u2190 ' + (tdepCity || tdepName), tarrCountry, tripName, trainDate);
          addCountry(tdepCountry);
          addCountry(tarrCountry);
        }

      } else if (seg.SegmentType === 'Accommodation' && !isHome) {
        var aCity = seg.City || '';
        var aCountry = seg.CountryCode || '';
        var aCoord = geocode('', '', aCity, '');
        if (aCoord) {
          addLocation(aCoord, aCity, 'Home',
            '\uD83C\uDFE8 ' + (seg.DisplayName || aCity), aCountry, tripName, '');
          addCountry(aCountry);
        }
      }
    });
  });

  // Events (skip if type filter is active and not matching)
  if (!filterType || filterType === 'all') {
    (events || []).forEach(function(ev) {
      var evCity = ev.City || '';
      var evCountry = ev.CountryCode || '';
      var evCoord = geocode('', '', evCity, '');
      var evDate = ev.StartTime ? new Date(ev.StartTime).toLocaleDateString('en-US', {month:'short',day:'numeric',year:'numeric'}) : '';
      if (evCoord) {
        addLocation(evCoord, evCity, 'Event',
          '\uD83C\uDFAD ' + (ev.EventName || ev.Title || ''), evCountry, '', evDate);
        addCountry(evCountry);
      }
    });
  }

  // Render country highlights
  renderCountryHighlights(visitedCountryCodes);

  // Render markers
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

    // Build enriched popup with trip names, countries, details
    var uniqueDetails = [];
    var seen = {};
    loc.details.forEach(function(d) { if (!seen[d]) { uniqueDetails.push(d); seen[d] = true; } });
    uniqueDetails = uniqueDetails.slice(0, 15);

    var typeBadges = '';
    loc.types.forEach(function(t) {
      var tc = (MARKER_COLORS[t] || '#58a6ff');
      typeBadges += '<span class="mp-type-badge" style="border-color:' + tc + ';color:' + tc + '">' + t + '</span>';
    });

    var countryList = [];
    loc.countries.forEach(function(c) { countryList.push(getCountryName(c)); });

    var tripList = [];
    loc.trips.forEach(function(t) { if (t) tripList.push(t); });

    var popupHtml = '<div class="map-popup">';
    popupHtml += '<div class="mp-title">' + loc.label + '</div>';
    if (countryList.length > 0) {
      popupHtml += '<div class="mp-country">' + countryList.join(', ') + '</div>';
    }
    popupHtml += '<div class="mp-visit-count">' + loc.count + ' visit' + (loc.count !== 1 ? 's' : '') + '</div>';
    popupHtml += '<div class="mp-types">' + typeBadges + '</div>';

    if (tripList.length > 0) {
      popupHtml += '<div class="mp-trips-section">';
      popupHtml += '<div class="mp-section-label">TRIPS</div>';
      var shownTrips = tripList.slice(0, 6);
      shownTrips.forEach(function(t) {
        var shortName = t.length > 50 ? t.substring(0, 47) + '...' : t;
        popupHtml += '<div class="mp-trip-item">' + shortName + '</div>';
      });
      if (tripList.length > 6) {
        popupHtml += '<div class="mp-trip-item mp-more">+ ' + (tripList.length - 6) + ' more</div>';
      }
      popupHtml += '</div>';
    }

    if (uniqueDetails.length > 0) {
      popupHtml += '<div class="mp-details">';
      popupHtml += '<div class="mp-section-label">ACTIVITY</div>';
      uniqueDetails.forEach(function(d) {
        popupHtml += '<div class="mp-detail">' + d + '</div>';
      });
      popupHtml += '</div>';
    }
    popupHtml += '</div>';

    marker.bindPopup(popupHtml, { className: 'dark-popup', closeButton: false, maxWidth: 360 });
    mapLayers.markers.addLayer(marker);
  });

  // Fit bounds
  var allCoords = locationEntries.map(function(l) { return l.latlng; });
  if (allCoords.length > 0) {
    map.fitBounds(L.latLngBounds(allCoords).pad(0.1));
  }

  return visitedCountryCodes;
}

function renderCountryHighlights(visitedCodes) {
  if (!countriesGeoJson || !mapLayers.countries) return;

  var iso3Set = new Set();
  visitedCodes.forEach(function(code) {
    var iso3 = ISO2_TO_ISO3[code];
    if (iso3) iso3Set.add(iso3);
  });

  var layer = L.geoJSON(countriesGeoJson, {
    filter: function(feature) {
      var props = feature.properties || {};
      var iso3 = props.ISO_A3 || props.iso_a3 || '';
      return iso3Set.has(iso3);
    },
    style: function() {
      return {
        fillColor: '#22d3ee',
        fillOpacity: 0.06,
        color: '#22d3ee',
        weight: 0.8,
        opacity: 0.2
      };
    },
    interactive: false
  });

  mapLayers.countries.addLayer(layer);
}

function refreshMap(trips, events, filterShip, filterType) {
  if (!document.getElementById('globe-container')) return;
  initMap();
  return buildMapData(trips, events, filterShip, filterType);
}

function handleMapResize() {
  if (map) {
    setTimeout(function() { map.invalidateSize(); }, 100);
  }
}
