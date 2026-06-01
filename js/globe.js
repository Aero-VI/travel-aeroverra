// Globe/Map View - MapLibre GL JS with globe projection
// Seamless globe-to-flat transition, vector tiles, no antimeridian issues
// Dark hacker aesthetic with glowing routes

let map = null;
let mapPopup = null;
let mapSourcesAdded = false;

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
  Bus: '#4ade80',
  Event: '#34d399',
  Home: '#f87171'
};

// ISO Alpha-2 to Alpha-3 for country highlighting
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
  SM:'SMR',VA:'VAT',AD:'AND',NC:'NCL',VU:'VUT'
};

// Great circle arc (returns GeoJSON coordinate pairs [lng, lat])
function createGeoArc(from, to, numPoints) {
  numPoints = numPoints || 80;
  var coords = [];
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
    coords.push([from[1], from[0]]);
    return coords;
  }

  var prevLng = null;
  for (var i = 0; i <= numPoints; i++) {
    var f = i / numPoints;
    var A = Math.sin((1 - f) * d) / Math.sin(d);
    var B = Math.sin(f * d) / Math.sin(d);
    var x = A * Math.cos(lat1) * Math.cos(lng1) + B * Math.cos(lat2) * Math.cos(lng2);
    var y = A * Math.cos(lat1) * Math.sin(lng1) + B * Math.cos(lat2) * Math.sin(lng2);
    var z = A * Math.sin(lat1) + B * Math.sin(lat2);
    var lat = Math.atan2(z, Math.sqrt(x * x + y * y)) * 180 / Math.PI;
    var lng = Math.atan2(y, x) * 180 / Math.PI;

    if (prevLng !== null) {
      while (lng - prevLng > 180) lng -= 360;
      while (lng - prevLng < -180) lng += 360;
    }
    prevLng = lng;
    coords.push([lng, lat]);
  }
  return coords;
}

function initMap() {
  if (map) return;
  var container = document.getElementById('globe-container');
  if (!container) return;

  map = new maplibregl.Map({
    container: 'globe-container',
    style: {
      version: 8,
      glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
      sources: {
        'carto-dark': {
          type: 'raster',
          tiles: [
            'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
            'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
            'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png'
          ],
          tileSize: 256,
          attribution: '&copy; <a href="https://carto.com">CARTO</a>'
        }
      },
      layers: [
        {
          id: 'background',
          type: 'background',
          paint: { 'background-color': '#0a0e17' }
        },
        {
          id: 'carto-dark-layer',
          type: 'raster',
          source: 'carto-dark',
          paint: { 'raster-opacity': 0.85 }
        }
      ]
    },
    center: [10, 25],
    zoom: 1.8,
    minZoom: 1,
    maxZoom: 18,
    projection: { type: 'globe' },
    attributionControl: false
  });

  map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');
  map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

  mapPopup = new maplibregl.Popup({
    closeButton: true,
    closeOnClick: true,
    className: 'dark-popup',
    maxWidth: '360px'
  });

  map.on('load', function() {
    if (map.setSky) {
      map.setSky({
        'sky-color': '#0a0e17',
        'sky-horizon-blend': 0.5,
        'horizon-color': '#0d1526',
        'horizon-fog-blend': 0.8,
        'fog-color': '#0a0e17',
        'fog-ground-blend': 0.9
      });
    }
    mapSourcesAdded = false;
  });
}

function clearMapLayers() {
  if (!map || !map.isStyleLoaded()) return;
  var layerIds = [
    'flight-glow', 'flight-lines', 'cruise-glow', 'cruise-lines',
    'train-glow', 'train-lines', 'bus-glow', 'bus-lines',
    'markers-glow', 'markers-core',
    'country-fill', 'country-border'
  ];
  layerIds.forEach(function(id) {
    if (map.getLayer(id)) map.removeLayer(id);
  });
  var sourceIds = ['flights', 'cruises', 'trains', 'buses', 'markers', 'visited-countries'];
  sourceIds.forEach(function(id) {
    if (map.getSource(id)) map.removeSource(id);
  });
  mapSourcesAdded = false;
}

function buildPopupHtml(icon, title, subtitle, extra) {
  var html = '<div class="map-popup">';
  html += '<div class="mp-title">' + icon + ' ' + title + '</div>';
  if (subtitle) html += '<div class="mp-sub">' + subtitle + '</div>';
  if (extra) html += '<div class="mp-extra">' + extra + '</div>';
  html += '</div>';
  return html;
}

function buildMapData(trips, events, filterShip, filterType) {
  if (!map) initMap();

  if (!map.isStyleLoaded()) {
    map.once('load', function() {
      buildMapData(trips, events, filterShip, filterType);
    });
    return new Set();
  }

  clearMapLayers();

  var flightFeatures = [];
  var cruiseFeatures = [];
  var trainFeatures = [];
  var busFeatures = [];
  var markerMap = {};
  var visitedCountryCodes = new Set();

  function addCountry(code) { if (code) visitedCountryCodes.add(code); }

  function addMarker(latlng, label, type, detail, countryCode, tripName, dateStr) {
    if (!latlng) return;
    var key = latlng[0].toFixed(3) + ',' + latlng[1].toFixed(3);
    if (!markerMap[key]) {
      markerMap[key] = {
        latlng: latlng, label: label, types: new Set(),
        details: [], count: 0, countries: new Set(), trips: new Set()
      };
    }
    markerMap[key].types.add(type);
    if (detail) markerMap[key].details.push(detail);
    if (countryCode) markerMap[key].countries.add(countryCode);
    if (tripName) markerMap[key].trips.add(tripName);
    markerMap[key].count++;
    addCountry(countryCode);
  }

  trips.forEach(function(trip) {
    var isHome = trip.TripName && trip.TripName.toLowerCase().startsWith('home in');
    var segs = trip.Segments || [];
    var tripName = trip.TripName || '';

    segs.forEach(function(seg) {
      // Segment-level filtering
      if (filterShip && filterShip !== 'all') {
        if (seg.SegmentType === 'Cruise' && seg.Ship !== filterShip) return;
        if (seg.SegmentType !== 'Cruise' && (!filterType || filterType === 'all')) return;
      }
      if (filterType && filterType !== 'all' && seg.SegmentType !== filterType) return;

      if (seg.SegmentType === 'Flight') {
        var dep = seg.Departure || {};
        var arr = seg.Arrival || {};
        var from = geocode('Flight', '', dep.City || '', dep.Code || '');
        var to = geocode('Flight', '', arr.City || '', arr.Code || '');
        if (from && to) {
          var arc = createGeoArc(from, to);
          var airline = seg.Airline || 'Flight';
          var dateStr = dep.Time ? new Date(dep.Time).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '';
          flightFeatures.push({
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: arc },
            properties: {
              icon: '\u2708\uFE0F', airline: airline,
              from: (dep.City||'') + ' (' + (dep.Code||'') + ')',
              to: (arr.City||'') + ' (' + (arr.Code||'') + ')',
              date: dateStr, trip: tripName,
              booking: seg.BookingNumber || ''
            }
          });
          addMarker(from, (dep.City||'') + ' (' + (dep.Code||'') + ')', 'Flight',
            '\u2708\uFE0F ' + airline + ' \u2192 ' + (arr.City||''), dep.CountryCode, tripName, dateStr);
          addMarker(to, (arr.City||'') + ' (' + (arr.Code||'') + ')', 'Flight',
            '\u2708\uFE0F ' + airline + ' \u2190 ' + (dep.City||''), arr.CountryCode, tripName, dateStr);
          addCountry(dep.CountryCode); addCountry(arr.CountryCode);
        }

      } else if (seg.SegmentType === 'Cruise') {
        var ports = [];
        var depPort = seg.DeparturePort || {};
        var arrPort = seg.ArrivalPort || {};
        var shipLabel = ((seg.CruiseLine||'') + ' ' + (seg.Ship||'')).trim();
        var cDateStart = depPort.Time ? new Date(depPort.Time).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '';
        var cDateEnd = arrPort.Time ? new Date(arrPort.Time).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '';
        var cDateRange = cDateStart + (cDateEnd ? ' - ' + cDateEnd : '');

        var depCoord = geocode('Cruise', depPort.PortName||'', depPort.City||'', '');
        if (depCoord) {
          ports.push({ coord: depCoord, name: depPort.PortName || depPort.City || 'Departure' });
          addMarker(depCoord, depPort.City || depPort.PortName || '', 'Cruise',
            '\uD83D\uDEA2 ' + shipLabel + ' departure', depPort.CountryCode, tripName, cDateRange);
          addCountry(depPort.CountryCode);
        }

        (seg.PortsOfCall || []).forEach(function(p) {
          var coord = geocode('Cruise', p.PortName||'', p.City||'', '');
          var pd = p.Date ? new Date(p.Date).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '';
          if (coord) {
            ports.push({ coord: coord, name: p.PortName || p.City || '' });
            addMarker(coord, p.City || p.PortName || '', 'Cruise',
              '\uD83D\uDEA2 ' + (seg.Ship||'Cruise') + ' (' + pd + ')', p.CountryCode, tripName, pd);
            addCountry(p.CountryCode);
          }
        });

        var arrCoord = geocode('Cruise', arrPort.PortName||'', arrPort.City||'', '');
        if (arrCoord) {
          ports.push({ coord: arrCoord, name: arrPort.PortName || arrPort.City || 'Arrival' });
          addMarker(arrCoord, arrPort.City || arrPort.PortName || '', 'Cruise',
            '\uD83D\uDEA2 ' + shipLabel + ' arrival', arrPort.CountryCode, tripName, cDateRange);
          addCountry(arrPort.CountryCode);
        }

        for (var ci = 0; ci < ports.length - 1; ci++) {
          var cruiseArc = createGeoArc(ports[ci].coord, ports[ci + 1].coord, 40);
          cruiseFeatures.push({
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: cruiseArc },
            properties: {
              icon: '\uD83D\uDEA2', ship: shipLabel,
              from: ports[ci].name, to: ports[ci + 1].name,
              date: cDateRange, trip: tripName,
              booking: seg.BookingNumber || ''
            }
          });
        }

      } else if (seg.SegmentType === 'Train') {
        var tdep = seg.Departure || {};
        var tarr = seg.Arrival || {};
        var tfrom = geocode('Train', tdep.LocationName||'', tdep.City||'', '');
        var tto = geocode('Train', tarr.LocationName||'', tarr.City||'', '');
        if (tfrom && tto) {
          var tArc = createGeoArc(tfrom, tto, 30);
          var tDateStr = tdep.Time ? new Date(tdep.Time).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '';
          trainFeatures.push({
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: tArc },
            properties: {
              icon: '\uD83D\uDE86', operator: seg.Operator || 'Train',
              trainNum: seg.TrainNumber || '',
              from: tdep.City || tdep.LocationName || '',
              to: tarr.City || tarr.LocationName || '',
              date: tDateStr, trip: tripName
            }
          });
          addMarker(tfrom, tdep.City || tdep.LocationName || '', 'Train',
            '\uD83D\uDE86 ' + (seg.Operator||'') + ' \u2192 ' + (tarr.City||tarr.LocationName||''),
            tdep.CountryCode, tripName, tDateStr);
          addMarker(tto, tarr.City || tarr.LocationName || '', 'Train',
            '\uD83D\uDE86 ' + (seg.Operator||'') + ' \u2190 ' + (tdep.City||tdep.LocationName||''),
            tarr.CountryCode, tripName, tDateStr);
          addCountry(tdep.CountryCode); addCountry(tarr.CountryCode);
        }

      } else if (seg.SegmentType === 'Bus') {
        var bdep = seg.Departure || {};
        var barr = seg.Arrival || {};
        var bfrom = geocode('Bus', bdep.LocationName||'', bdep.City||'', '');
        var bto = geocode('Bus', barr.LocationName||'', barr.City||'', '');
        if (bfrom && bto) {
          var bArc = createGeoArc(bfrom, bto, 20);
          var bDateStr = bdep.Time ? new Date(bdep.Time).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '';
          busFeatures.push({
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: bArc },
            properties: {
              icon: '\uD83D\uDE8C', operator: seg.Operator || 'Bus',
              route: seg.Route || '',
              from: bdep.City || bdep.LocationName || '',
              to: barr.City || barr.LocationName || '',
              date: bDateStr, trip: tripName
            }
          });
          addMarker(bfrom, bdep.City || bdep.LocationName || '', 'Bus',
            '\uD83D\uDE8C ' + (seg.Operator||'') + ' \u2192 ' + (barr.City||barr.LocationName||''),
            bdep.CountryCode, tripName, bDateStr);
          addMarker(bto, barr.City || barr.LocationName || '', 'Bus',
            '\uD83D\uDE8C ' + (seg.Operator||'') + ' \u2190 ' + (bdep.City||bdep.LocationName||''),
            barr.CountryCode, tripName, bDateStr);
          addCountry(bdep.CountryCode); addCountry(barr.CountryCode);
        }

      } else if (seg.SegmentType === 'Accommodation' && !isHome) {
        var aCoord = geocode('', '', seg.City||'', '');
        if (aCoord) {
          addMarker(aCoord, seg.City||'', 'Home',
            '\uD83C\uDFE8 ' + (seg.DisplayName || seg.City || ''), seg.CountryCode, tripName, '');
          addCountry(seg.CountryCode);
        }
      }
    });
  });

  // Events
  if (!filterType || filterType === 'all') {
    (events || []).forEach(function(ev) {
      var evCoord = geocode('', '', ev.City||'', '');
      var evDate = ev.StartTime ? new Date(ev.StartTime).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '';
      if (evCoord) {
        addMarker(evCoord, ev.City||'', 'Event',
          '\uD83C\uDFAD ' + (ev.EventName || ev.Title || ''), ev.CountryCode, '', evDate);
        addCountry(ev.CountryCode);
      }
    });
  }

  // Build marker GeoJSON
  var markerFeatures = [];
  var entries = Object.values(markerMap);
  entries.forEach(function(loc) {
    var color = '#58a6ff';
    var size = 4;
    if (loc.types.has('Event')) { color = MARKER_COLORS.Event; size = 4; }
    if (loc.types.has('Bus')) { color = MARKER_COLORS.Bus; size = 4; }
    if (loc.types.has('Train')) { color = MARKER_COLORS.Train; size = 4; }
    if (loc.types.has('Flight')) { color = MARKER_COLORS.Flight; size = 5; }
    if (loc.types.has('Cruise')) { color = MARKER_COLORS.Cruise; size = 5; }
    if (loc.count > 3) size += 2;
    if (loc.count > 6) size += 2;
    if (loc.count > 10) size += 2;

    var typesArr = []; loc.types.forEach(function(t) { typesArr.push(t); });
    var countriesArr = []; loc.countries.forEach(function(c) { countriesArr.push(c); });
    var tripsArr = []; loc.trips.forEach(function(t) { if (t) tripsArr.push(t); });
    var uniqueDetails = [];
    var seen = {};
    loc.details.forEach(function(d) { if (!seen[d]) { uniqueDetails.push(d); seen[d] = true; } });

    markerFeatures.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [loc.latlng[1], loc.latlng[0]] },
      properties: {
        label: loc.label, color: color, size: size,
        count: loc.count, types: typesArr.join(','),
        countries: countriesArr.join(','),
        trips: tripsArr.slice(0, 8).join('|'),
        details: uniqueDetails.slice(0, 10).join('|')
      }
    });
  });

  // Add sources and layers
  try {
    map.addSource('flights', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: flightFeatures }
    });
    map.addSource('cruises', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: cruiseFeatures }
    });
    map.addSource('trains', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: trainFeatures }
    });
    map.addSource('buses', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: busFeatures }
    });
    map.addSource('markers', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: markerFeatures }
    });

    // Cruise glow + line
    map.addLayer({
      id: 'cruise-glow', type: 'line', source: 'cruises',
      paint: { 'line-color': ROUTE_COLORS.Cruise, 'line-width': 6, 'line-opacity': 0.15, 'line-blur': 4 }
    });
    map.addLayer({
      id: 'cruise-lines', type: 'line', source: 'cruises',
      paint: { 'line-color': ROUTE_COLORS.Cruise, 'line-width': 2, 'line-opacity': 0.65 }
    });

    // Train glow + line
    map.addLayer({
      id: 'train-glow', type: 'line', source: 'trains',
      paint: { 'line-color': ROUTE_COLORS.Train, 'line-width': 5, 'line-opacity': 0.12, 'line-blur': 3 }
    });
    map.addLayer({
      id: 'train-lines', type: 'line', source: 'trains',
      paint: { 'line-color': ROUTE_COLORS.Train, 'line-width': 2, 'line-opacity': 0.55, 'line-dasharray': [2, 3] }
    });

    // Bus glow + line
    map.addLayer({
      id: 'bus-glow', type: 'line', source: 'buses',
      paint: { 'line-color': ROUTE_COLORS.Bus, 'line-width': 5, 'line-opacity': 0.12, 'line-blur': 3 }
    });
    map.addLayer({
      id: 'bus-lines', type: 'line', source: 'buses',
      paint: { 'line-color': ROUTE_COLORS.Bus, 'line-width': 2, 'line-opacity': 0.55, 'line-dasharray': [4, 3] }
    });

    // Flight glow + line
    map.addLayer({
      id: 'flight-glow', type: 'line', source: 'flights',
      paint: { 'line-color': ROUTE_COLORS.Flight, 'line-width': 5, 'line-opacity': 0.12, 'line-blur': 3 }
    });
    map.addLayer({
      id: 'flight-lines', type: 'line', source: 'flights',
      paint: { 'line-color': ROUTE_COLORS.Flight, 'line-width': 1.5, 'line-opacity': 0.55, 'line-dasharray': [6, 4] }
    });

    // Marker glow + core
    map.addLayer({
      id: 'markers-glow', type: 'circle', source: 'markers',
      paint: {
        'circle-radius': ['*', ['get', 'size'], 2.5],
        'circle-color': ['get', 'color'],
        'circle-opacity': 0.12,
        'circle-blur': 0.8
      }
    });
    map.addLayer({
      id: 'markers-core', type: 'circle', source: 'markers',
      paint: {
        'circle-radius': ['get', 'size'],
        'circle-color': ['get', 'color'],
        'circle-opacity': 0.9,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 0.5,
        'circle-stroke-opacity': 0.35
      }
    });
  } catch (e) {
    console.error('Error adding map layers:', e);
  }

  // Country highlights (async, non-blocking)
  loadCountryHighlights(visitedCountryCodes);

  // Interactive popups
  setupInteractions();

  // Fit bounds to markers
  if (markerFeatures.length > 0) {
    var bounds = new maplibregl.LngLatBounds();
    markerFeatures.forEach(function(f) {
      bounds.extend(f.geometry.coordinates);
    });
    var maxZ = markerFeatures.length <= 4 ? 12 : (markerFeatures.length <= 10 ? 8 : 6);
    map.fitBounds(bounds, { padding: 60, maxZoom: maxZ, duration: 1000 });
  }

  mapSourcesAdded = true;
  return visitedCountryCodes;
}

function loadCountryHighlights(visitedCodes) {
  if (!map || visitedCodes.size === 0) return;

  var iso3Set = new Set();
  visitedCodes.forEach(function(code) {
    var iso3 = ISO2_TO_ISO3[code];
    if (iso3) iso3Set.add(iso3);
  });

  // Use Natural Earth 110m GeoJSON (~800KB, has iso_a3 property)
  fetch('https://d2ad6b4ur7yvpq.cloudfront.net/naturalearth-3.3.0/ne_110m_admin_0_countries.geojson')
    .then(function(r) {
      if (!r.ok) throw new Error('Failed to fetch countries');
      return r.json();
    })
    .then(function(data) {
      var features = data.features || [];
      var visited = features.filter(function(f) {
        var props = f.properties || {};
        var iso3 = props.iso_a3 || props.ISO_A3 || props.adm0_a3 || '';
        return iso3Set.has(iso3);
      });

      if (visited.length === 0) return;
      if (!map || !map.isStyleLoaded()) return;
      if (map.getSource('visited-countries')) return;

      map.addSource('visited-countries', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: visited }
      });

      // Insert country layers below route layers if possible
      var beforeLayer = map.getLayer('cruise-glow') ? 'cruise-glow' : undefined;
      map.addLayer({
        id: 'country-fill', type: 'fill', source: 'visited-countries',
        paint: { 'fill-color': '#22d3ee', 'fill-opacity': 0.12 }
      }, beforeLayer);
      map.addLayer({
        id: 'country-border', type: 'line', source: 'visited-countries',
        paint: { 'line-color': '#22d3ee', 'line-width': 1.2, 'line-opacity': 0.4 }
      }, beforeLayer);
    })
    .catch(function(err) { console.warn('Country highlights failed:', err); });
}

function setupInteractions() {
  if (!map) return;

  ['flight-lines', 'cruise-lines', 'train-lines', 'bus-lines', 'markers-core'].forEach(function(layerId) {
    map.on('mouseenter', layerId, function() { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', layerId, function() { map.getCanvas().style.cursor = ''; });
  });

  // Flight popup
  map.on('click', 'flight-lines', function(e) {
    var f = e.features[0];
    var p = f.properties;
    mapPopup.setLngLat(e.lngLat).setHTML(
      buildPopupHtml(p.icon, p.airline, p.from + ' \u2192 ' + p.to,
        (p.date || '') +
        (p.trip ? '<br><span class="mp-trip-name">' + p.trip + '</span>' : '') +
        (p.booking ? '<br><span class="mp-booking">' + p.booking + '</span>' : ''))
    ).addTo(map);
  });

  // Cruise popup
  map.on('click', 'cruise-lines', function(e) {
    var f = e.features[0];
    var p = f.properties;
    mapPopup.setLngLat(e.lngLat).setHTML(
      buildPopupHtml(p.icon, p.ship, p.from + ' \u2192 ' + p.to,
        (p.date || '') +
        (p.trip ? '<br><span class="mp-trip-name">' + p.trip + '</span>' : '') +
        (p.booking ? '<br><span class="mp-booking">' + p.booking + '</span>' : ''))
    ).addTo(map);
  });

  // Train popup
  map.on('click', 'train-lines', function(e) {
    var f = e.features[0];
    var p = f.properties;
    mapPopup.setLngLat(e.lngLat).setHTML(
      buildPopupHtml(p.icon, p.operator + (p.trainNum ? ' ' + p.trainNum : ''),
        p.from + ' \u2192 ' + p.to,
        (p.date || '') +
        (p.trip ? '<br><span class="mp-trip-name">' + p.trip + '</span>' : ''))
    ).addTo(map);
  });

  // Bus popup
  map.on('click', 'bus-lines', function(e) {
    var f = e.features[0];
    var p = f.properties;
    mapPopup.setLngLat(e.lngLat).setHTML(
      buildPopupHtml(p.icon, p.operator + (p.route ? ' ' + p.route : ''),
        p.from + ' \u2192 ' + p.to,
        (p.date || '') +
        (p.trip ? '<br><span class="mp-trip-name">' + p.trip + '</span>' : ''))
    ).addTo(map);
  });

  // Marker popup
  map.on('click', 'markers-core', function(e) {
    var f = e.features[0];
    var p = f.properties;
    var html = '<div class="map-popup">';
    html += '<div class="mp-title">' + p.label + '</div>';

    if (p.countries) {
      var cnames = p.countries.split(',').map(function(c) {
        // countryName is defined in app.js, loaded before this runs
        return typeof countryName === 'function' ? countryName(c) : c;
      }).filter(Boolean);
      if (cnames.length) html += '<div class="mp-country">' + cnames.join(', ') + '</div>';
    }

    html += '<div class="mp-visit-count">' + p.count + ' visit' + (p.count != 1 ? 's' : '') + '</div>';

    if (p.types) {
      var typeBadges = p.types.split(',').map(function(t) {
        var tc = MARKER_COLORS[t] || '#58a6ff';
        return '<span class="mp-type-badge" style="border-color:' + tc + ';color:' + tc + '">' + t + '</span>';
      }).join('');
      html += '<div class="mp-types">' + typeBadges + '</div>';
    }

    if (p.trips) {
      var tripList = p.trips.split('|').filter(Boolean);
      if (tripList.length > 0) {
        html += '<div class="mp-trips-section"><div class="mp-section-label">TRIPS</div>';
        tripList.slice(0, 6).forEach(function(t) {
          html += '<div class="mp-trip-item">' + (t.length > 50 ? t.substring(0, 47) + '...' : t) + '</div>';
        });
        if (tripList.length > 6) html += '<div class="mp-trip-item mp-more">+ ' + (tripList.length - 6) + ' more</div>';
        html += '</div>';
      }
    }

    if (p.details) {
      var detailList = p.details.split('|').filter(Boolean);
      if (detailList.length > 0) {
        html += '<div class="mp-details"><div class="mp-section-label">ACTIVITY</div>';
        detailList.forEach(function(d) { html += '<div class="mp-detail">' + d + '</div>'; });
        html += '</div>';
      }
    }

    html += '</div>';
    mapPopup.setLngLat(e.lngLat).setHTML(html).addTo(map);
  });
}

function refreshMap(trips, events, filterShip, filterType) {
  if (!document.getElementById('globe-container')) return;
  initMap();
  return buildMapData(trips, events, filterShip, filterType);
}

function handleMapResize() {
  if (map) {
    setTimeout(function() { map.resize(); }, 150);
  }
}
