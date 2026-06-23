const CONFIG = window.FLIGHT_TRACKER_CONFIG || {};
const SUPABASE_REST_URL = String(CONFIG.SUPABASE_REST_URL || '').replace(/\/+$/, '');
const SUPABASE_API_KEY = CONFIG.SUPABASE_API_KEY || '';

const state = {
  traveller: 'Daniel',
  travellers: ['Daniel', 'Lidia', 'David', 'Alvaro'],
  flights: [],
  airports: {},
  editingId: null,
  activeTab: 'flightdata',
  routeMap: null,
  countryMap: null,
  countryLayer: null,
  countryGeoJson: null,
  dbOk: false,
};

const els = {
  travellerSelect: document.getElementById('travellerSelect'),
  databaseStatus: document.getElementById('databaseStatus'),
  setupStatus: document.getElementById('setupStatus'),
  tabs: document.querySelectorAll('.tab'),
  panels: document.querySelectorAll('.panel'),
  flightCountText: document.getElementById('flightCountText'),
  flightsTableBody: document.querySelector('#flightsTable tbody'),
  searchInput: document.getElementById('searchInput'),
  addFlightBtn: document.getElementById('addFlightBtn'),
  refreshBtn: document.getElementById('refreshBtn'),
  exportCsvBtn: document.getElementById('exportCsvBtn'),
  importNotice: document.getElementById('importNotice'),
  importDanielBtn: document.getElementById('importDanielBtn'),
  importDanielSetupBtn: document.getElementById('importDanielSetupBtn'),
  testDbBtn: document.getElementById('testDbBtn'),
  dialog: document.getElementById('flightDialog'),
  form: document.getElementById('flightForm'),
  dialogTitle: document.getElementById('dialogTitle'),
  closeDialogBtn: document.getElementById('closeDialogBtn'),
  cancelBtn: document.getElementById('cancelBtn'),
  formError: document.getElementById('formError'),
  fromInput: document.getElementById('fromInput'),
  toInput: document.getElementById('toInput'),
  airlineInput: document.getElementById('airlineInput'),
  seatClassInput: document.getElementById('seatClassInput'),
  purposeInput: document.getElementById('purposeInput'),
};

const CLASS_VALUES = ['Economy', 'Economy Plus', 'Business', 'First'];
const PURPOSE_VALUES = ['Personal', 'Business'];
const PIE_COLORS = ['#0f766e', '#d97706', '#6d5dfc', '#c2410c', '#0369a1', '#4d7c0f'];

init();

async function init() {
  wireEvents();
  els.travellerSelect.innerHTML = state.travellers.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
  els.travellerSelect.value = state.traveller;

  try {
    state.airports = await fetchJson('data/airports.json');
    setStatus('Airport database loaded. Connecting to Supabase...', 'pending');
    await testDatabaseConnection();
    await loadFlights();
  } catch (error) {
    setStatus(error.message, 'bad');
    renderErrorRow(error.message);
    renderSetupStatus(error.message);
  }
}

function wireEvents() {
  els.travellerSelect.addEventListener('change', async event => {
    state.traveller = event.target.value;
    await loadFlights();
  });
  els.tabs.forEach(tab => tab.addEventListener('click', () => setTab(tab.dataset.tab)));
  els.searchInput.addEventListener('input', renderFlightTable);
  els.addFlightBtn.addEventListener('click', () => openFlightDialog());
  els.refreshBtn.addEventListener('click', loadFlights);
  els.closeDialogBtn.addEventListener('click', closeFlightDialog);
  els.cancelBtn.addEventListener('click', closeFlightDialog);
  els.form.addEventListener('submit', saveFlight);
  els.exportCsvBtn.addEventListener('click', exportCsv);
  els.importDanielBtn.addEventListener('click', importDanielFlights);
  els.importDanielSetupBtn.addEventListener('click', importDanielFlights);
  els.testDbBtn.addEventListener('click', async () => {
    try {
      await testDatabaseConnection();
      await loadFlights();
    } catch (error) {
      setStatus(error.message, 'bad');
      renderSetupStatus(error.message);
    }
  });
}

async function fetchJson(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Could not load ${path}. Make sure the data folder was uploaded to GitHub.`);
  return response.json();
}

function setStatus(message, type = 'pending') {
  els.databaseStatus.textContent = message;
  els.databaseStatus.className = `status-pill ${type}`;
}

async function testDatabaseConnection() {
  if (!SUPABASE_REST_URL || !SUPABASE_API_KEY) {
    throw new Error('Supabase URL or API key is missing in config.js.');
  }
  const rows = await supabaseFetch('/flights?select=id&limit=1');
  state.dbOk = true;
  setStatus('Connected to Supabase. Changes are saved online.', 'good');
  renderSetupStatus('Connected successfully.');
  return rows;
}

async function supabaseFetch(path, options = {}) {
  const url = `${SUPABASE_REST_URL}${path.startsWith('/') ? path : `/${path}`}`;
  const headers = {
    apikey: SUPABASE_API_KEY,
    Authorization: `Bearer ${SUPABASE_API_KEY}`,
    ...options.headers,
  };
  if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';

  const response = await fetch(url, { ...options, headers });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    let message = `Supabase request failed (${response.status}).`;
    try {
      const parsed = JSON.parse(text);
      message = parsed.message || parsed.error_description || parsed.error || message;
    } catch (_) {
      if (text) message = text;
    }
    if (response.status === 404) message += ' Did you run sql/supabase-setup.sql in Supabase?';
    if (response.status === 401 || response.status === 403) message += ' Check your RLS policies and API key.';
    throw new Error(message);
  }
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function loadFlights() {
  try {
    setStatus('Loading flights from Supabase...', 'pending');
    const query = `/flights?select=*&traveller=eq.${encodeURIComponent(state.traveller)}&order=flight_number.desc.nullslast,created_at.desc`;
    const rows = await supabaseFetch(query);
    state.flights = (rows || []).map(rowToFlight);
    setStatus('Connected to Supabase. Changes are saved online.', 'good');
    renderAll();
    renderSetupStatus('Connected successfully.');
  } catch (error) {
    setStatus(error.message, 'bad');
    renderErrorRow(error.message);
    renderSetupStatus(error.message);
  }
}

function renderSetupStatus(message) {
  if (!els.setupStatus) return;
  els.setupStatus.innerHTML = statRows([
    ['Supabase URL', SUPABASE_REST_URL ? 'Set' : 'Missing'],
    ['API key', SUPABASE_API_KEY ? 'Set' : 'Missing'],
    ['Connection', message || (state.dbOk ? 'Connected' : 'Not tested')],
    ['Selected traveller', state.traveller],
    ['Flights loaded', formatNumber(state.flights.length)],
  ]);
}

function rowToFlight(row) {
  return {
    id: row.id,
    legacyId: row.legacy_id,
    flightNumber: row.flight_number,
    from: row.origin_code,
    to: row.destination_code,
    airline: row.airline || 'Unknown',
    purpose: normalizePurpose(row.purpose),
    seatClass: normalizeSeatClass(row.seat_class),
    distanceKm: Number(row.distance_km || 0),
    durationMinutes: Number(row.duration_minutes || 0),
    type: row.route_type || classifyRoute(row.origin_code, row.destination_code),
    source: row.source || 'supabase',
  };
}

function flightToRow(flight) {
  const origin = state.airports[flight.from] || {};
  const destination = state.airports[flight.to] || {};
  return {
    legacy_id: flight.legacyId || null,
    traveller: state.traveller,
    flight_number: flight.flightNumber || null,
    origin_code: flight.from,
    destination_code: flight.to,
    origin_name: origin.name || null,
    destination_name: destination.name || null,
    origin_country: origin.country || null,
    destination_country: destination.country || null,
    origin_continent: origin.continent || null,
    destination_continent: destination.continent || null,
    airline: flight.airline,
    seat_class: flight.seatClass,
    purpose: flight.purpose,
    distance_km: Math.round(Number(flight.distanceKm || 0)),
    duration_minutes: Math.round(Number(flight.durationMinutes || 0)),
    route_type: flight.type || classifyRoute(flight.from, flight.to),
    source: flight.source || 'manual',
  };
}

async function importDanielFlights() {
  if (!confirm('Import Daniel\'s 448 flights into Supabase? This can be run again safely; it will update matching imported rows rather than creating duplicates.')) return;
  try {
    setStatus('Importing Daniel flights to Supabase...', 'pending');
    const seed = await fetchJson('data/daniel.json');
    const rows = seed.map((flight, index) => seedFlightToRow(flight, index));
    const batchSize = 100;
    for (let start = 0; start < rows.length; start += batchSize) {
      const batch = rows.slice(start, start + batchSize);
      await supabaseFetch('/flights?on_conflict=legacy_id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(batch),
      });
      setStatus(`Imported ${Math.min(start + batch.length, rows.length)} of ${rows.length} Daniel flights...`, 'pending');
    }
    state.traveller = 'Daniel';
    els.travellerSelect.value = 'Daniel';
    await loadFlights();
    alert('Daniel flights imported into Supabase.');
  } catch (error) {
    setStatus(error.message, 'bad');
    alert(error.message);
  }
}

function seedFlightToRow(flight, index) {
  const from = normalizeCode(flight.from);
  const to = normalizeCode(flight.to);
  const origin = state.airports[from] || {};
  const destination = state.airports[to] || {};
  const seatClass = normalizeSeatClass(flight.seatClass);
  const purpose = normalizePurpose(flight.purpose);
  return {
    legacy_id: String(flight.id || `daniel-seed-${index + 1}`),
    traveller: 'Daniel',
    flight_number: Number(flight.flightNumber || index + 1),
    origin_code: from,
    destination_code: to,
    origin_name: origin.name || null,
    destination_name: destination.name || null,
    origin_country: origin.country || null,
    destination_country: destination.country || null,
    origin_continent: origin.continent || null,
    destination_continent: destination.continent || null,
    airline: String(flight.airline || 'Unknown').trim(),
    seat_class: seatClass,
    purpose,
    distance_km: Math.round(Number(flight.distanceKm || 0)),
    duration_minutes: Math.round(Number(flight.durationMinutes || 0)),
    route_type: flight.type || classifyRoute(from, to),
    source: 'Vuelos.xlsx',
  };
}

function setTab(tabName) {
  state.activeTab = tabName;
  els.tabs.forEach(tab => tab.classList.toggle('active', tab.dataset.tab === tabName));
  els.panels.forEach(panel => panel.classList.toggle('active-panel', panel.id === tabName));
  if (tabName === 'statistics') renderStats();
  if (tabName === 'routes') setTimeout(renderRouteMap, 20);
  if (tabName === 'countries') setTimeout(renderCountriesMap, 20);
  if (tabName === 'setup') renderSetupStatus(state.dbOk ? 'Connected successfully.' : 'Not connected.');
}

function renderAll() {
  const count = state.flights.length;
  els.flightCountText.textContent = `${state.traveller} has ${formatNumber(count)} ${count === 1 ? 'flight' : 'flights'} saved online.`;
  els.importNotice.classList.toggle('hidden', !(state.traveller === 'Daniel' && count === 0));
  renderFlightTable();
  renderStats();
  resetMaps();
  if (state.activeTab === 'routes') renderRouteMap();
  if (state.activeTab === 'countries') renderCountriesMap();
  renderSetupStatus('Connected successfully.');
}

function renderErrorRow(message) {
  els.flightsTableBody.innerHTML = `<tr><td colspan="10" class="empty-state">${escapeHtml(message)}</td></tr>`;
  els.flightCountText.textContent = 'Could not load flights.';
}

function renderFlightTable() {
  const query = els.searchInput.value.trim().toLowerCase();
  const rows = state.flights.filter(flight => {
    const haystack = [flight.flightNumber, flight.from, flight.to, flight.airline, flight.seatClass, flight.purpose, flight.type, airportName(flight.from), airportName(flight.to)].join(' ').toLowerCase();
    return !query || haystack.includes(query);
  });

  if (!rows.length) {
    els.flightsTableBody.innerHTML = `<tr><td colspan="10" class="empty-state">No flights found for ${escapeHtml(state.traveller)}.</td></tr>`;
    return;
  }

  els.flightsTableBody.innerHTML = rows.map(flight => `
    <tr>
      <td>${escapeHtml(flight.flightNumber || '')}</td>
      <td><span class="code" title="${escapeHtml(airportName(flight.from))}">${escapeHtml(flight.from)}</span></td>
      <td><span class="code" title="${escapeHtml(airportName(flight.to))}">${escapeHtml(flight.to)}</span></td>
      <td>${escapeHtml(flight.airline)}</td>
      <td>${escapeHtml(flight.seatClass)}</td>
      <td>${escapeHtml(flight.purpose)}</td>
      <td>${formatNumber(flight.distanceKm)} km</td>
      <td>${minutesToHHMM(flight.durationMinutes)}</td>
      <td>${escapeHtml(flight.type || 'Other')}</td>
      <td>
        <div class="action-row">
          <button type="button" onclick="editFlight('${escapeAttribute(flight.id)}')">Edit</button>
          <button type="button" class="danger" onclick="deleteFlight('${escapeAttribute(flight.id)}')">Delete</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function openFlightDialog(flight = null) {
  state.editingId = flight?.id || null;
  els.dialogTitle.textContent = flight ? 'Edit flight' : 'Add flight';
  els.fromInput.value = flight?.from || '';
  els.toInput.value = flight?.to || '';
  els.airlineInput.value = flight?.airline || '';
  els.seatClassInput.value = flight?.seatClass || 'Economy';
  els.purposeInput.value = flight?.purpose || 'Personal';
  els.formError.textContent = '';
  els.dialog.showModal();
  setTimeout(() => els.fromInput.focus(), 50);
}

function closeFlightDialog() {
  els.dialog.close();
}

window.editFlight = function editFlight(id) {
  const flight = state.flights.find(item => item.id === id);
  if (flight) openFlightDialog(flight);
};

window.deleteFlight = async function deleteFlight(id) {
  const flight = state.flights.find(item => item.id === id);
  if (!flight) return;
  if (!confirm(`Delete ${flight.from} to ${flight.to} with ${flight.airline}? This deletes it from Supabase.`)) return;
  try {
    await supabaseFetch(`/flights?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
    state.flights = state.flights.filter(item => item.id !== id);
    renderAll();
  } catch (error) {
    alert(error.message);
  }
};

async function saveFlight(event) {
  event.preventDefault();
  els.formError.textContent = '';
  const payload = {
    from: els.fromInput.value,
    to: els.toInput.value,
    airline: els.airlineInput.value,
    seatClass: els.seatClassInput.value,
    purpose: els.purposeInput.value,
  };
  try {
    if (state.editingId) {
      const existing = state.flights.find(item => item.id === state.editingId);
      if (!existing) throw new Error('Flight was not found.');
      const updated = buildFlight(payload, existing);
      updated.flightNumber = existing.flightNumber;
      updated.legacyId = existing.legacyId;
      const rows = await supabaseFetch(`/flights?id=eq.${encodeURIComponent(state.editingId)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(flightToRow(updated)),
      });
      const saved = rowToFlight(rows[0]);
      state.flights = state.flights.map(item => item.id === saved.id ? saved : item);
    } else {
      const flight = buildFlight(payload);
      const highest = state.flights.reduce((max, item) => Math.max(max, Number(item.flightNumber) || 0), 0);
      flight.flightNumber = highest + 1;
      const rows = await supabaseFetch('/flights', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(flightToRow(flight)),
      });
      state.flights.unshift(rowToFlight(rows[0]));
    }
    closeFlightDialog();
    renderAll();
  } catch (error) {
    els.formError.textContent = error.message;
  }
}

function calculateStats() {
  const flights = state.flights;
  const totalFlights = flights.length;
  const totalKm = flights.reduce((sum, f) => sum + Number(f.distanceKm || 0), 0);
  const totalMinutes = flights.reduce((sum, f) => sum + Number(f.durationMinutes || 0), 0);
  const airportCounts = new Map();
  const airlineCounts = new Map();
  const routeCounts = new Map();
  const countryCounts = new Map();
  const classCounts = new Map(CLASS_VALUES.map(item => [item, 0]));
  const purposeCounts = new Map(PURPOSE_VALUES.map(item => [item, 0]));
  const typeCounts = new Map([['Domestic', 0], ['Intra-continental', 0], ['Intercontinental', 0], ['Other', 0]]);

  for (const flight of flights) {
    increment(airportCounts, flight.from);
    increment(airportCounts, flight.to);
    increment(airlineCounts, flight.airline || 'Unknown');
    increment(routeCounts, `${flight.from} - ${flight.to}`);
    increment(classCounts, flight.seatClass || 'Economy');
    increment(purposeCounts, flight.purpose || 'Personal');
    increment(typeCounts, flight.type || 'Other');
    const origin = state.airports[flight.from];
    const destination = state.airports[flight.to];
    if (origin?.country) increment(countryCounts, origin.country);
    if (destination?.country) increment(countryCounts, destination.country);
  }

  const byDistance = flights.filter(f => Number(f.distanceKm) > 0).sort((a, b) => b.distanceKm - a.distanceKm);
  const byDuration = flights.filter(f => Number(f.durationMinutes) > 0).sort((a, b) => b.durationMinutes - a.durationMinutes);
  const bySpeed = flights
    .filter(f => Number(f.distanceKm) > 0 && Number(f.durationMinutes) > 0)
    .map(f => ({ ...f, speed: Math.round(f.distanceKm / (f.durationMinutes / 60)) }))
    .sort((a, b) => b.speed - a.speed);

  return {
    flights,
    totalFlights,
    totalKm,
    totalMiles: Math.round(totalKm * 0.621371),
    totalMinutes,
    airportCounts,
    airlineCounts,
    routeCounts,
    countryCounts,
    classCounts,
    purposeCounts,
    typeCounts,
    longestDistance: byDistance[0],
    shortestDistance: byDistance[byDistance.length - 1],
    longestDuration: byDuration[0],
    shortestDuration: byDuration[byDuration.length - 1],
    fastest: bySpeed[0],
    slowest: bySpeed[bySpeed.length - 1],
    averageKm: totalFlights ? Math.round(totalKm / totalFlights) : 0,
    averageMinutes: totalFlights ? Math.round(totalMinutes / totalFlights) : 0,
  };
}

function renderStats() {
  const stats = calculateStats();
  document.getElementById('statsSubhead').textContent = `${state.traveller} · ${formatNumber(stats.totalFlights)} flights saved online`;
  document.getElementById('kpiGrid').innerHTML = [
    ['Flights', formatNumber(stats.totalFlights)],
    ['Distance', `${formatNumber(stats.totalKm)} km`],
    ['Flight time', minutesToHoursLabel(stats.totalMinutes)],
    ['Countries', formatNumber(stats.countryCounts.size)],
  ].map(([label, value]) => `<div class="kpi"><strong>${value}</strong><span>${label}</span></div>`).join('');

  document.getElementById('distanceStats').innerHTML = statRows([
    ['In Miles', formatNumber(stats.totalMiles)],
    ['In Kilometer', formatNumber(stats.totalKm)],
    ['Earth Circumnavigation', `${(stats.totalKm / 40075).toFixed(2)} x`],
    ['Distance to the Moon', `${(stats.totalKm / 384400).toFixed(3)} x`],
    ['Distance to the Sun', `${(stats.totalKm / 149597870).toFixed(4)} x`],
  ]);

  document.getElementById('timeStats').innerHTML = statRows([
    ['Hours', minutesToHHMM(stats.totalMinutes)],
    ['Days', (stats.totalMinutes / 60 / 24).toFixed(1)],
    ['Weeks', (stats.totalMinutes / 60 / 24 / 7).toFixed(1)],
    ['Months', (stats.totalMinutes / 60 / 24 / 30).toFixed(2)],
    ['Years', (stats.totalMinutes / 60 / 24 / 365).toFixed(3)],
  ]);

  document.getElementById('countStats').innerHTML = statRows([
    ['All', formatNumber(stats.totalFlights)],
    ['Domestic', formatNumber(stats.typeCounts.get('Domestic') || 0)],
    ['Intra-Continental', formatNumber(stats.typeCounts.get('Intra-continental') || 0)],
    ['Intercontinental', formatNumber(stats.typeCounts.get('Intercontinental') || 0)],
    ['Other flights', formatNumber(stats.typeCounts.get('Other') || 0)],
  ]);

  document.getElementById('additionalStats').innerHTML = statRows([
    ['Total Airports', formatNumber(stats.airportCounts.size)],
    ['Total Airlines', formatNumber(stats.airlineCounts.size)],
    ['Total Routes', formatNumber(stats.routeCounts.size)],
    ['Total Countries', formatNumber(stats.countryCounts.size)],
  ]);

  document.getElementById('extremeStats').innerHTML = renderExtremes(stats);
  document.getElementById('topAirports').innerHTML = topTable(stats.airportCounts, stats.totalFlights * 2, code => `${escapeHtml(code)}<br><small>${escapeHtml(airportShortName(code))}</small>`);
  document.getElementById('topAirlines').innerHTML = topTable(stats.airlineCounts, stats.totalFlights, value => escapeHtml(value));
  document.getElementById('topRoutes').innerHTML = topTable(stats.routeCounts, stats.totalFlights, value => escapeHtml(value));

  renderPie('classChart', 'classLegend', stats.classCounts);
  renderPie('purposeChart', 'purposeLegend', stats.purposeCounts);
}

function renderExtremes(stats) {
  if (!stats.totalFlights) return '<p class="empty-state">Add flights to see extremes.</p>';
  const rows = [
    ['Longest Flight (distance)', describeFlight(stats.longestDistance)],
    ['Longest Flight (duration)', describeFlight(stats.longestDuration)],
    ['Shortest Flight (distance)', describeFlight(stats.shortestDistance)],
    ['Shortest Flight (duration)', describeFlight(stats.shortestDuration)],
    ['Fastest Flight', stats.fastest ? `${formatNumber(stats.fastest.speed)} km/h, ${describeFlight(stats.fastest)}` : '—'],
    ['Slowest Flight', stats.slowest ? `${formatNumber(stats.slowest.speed)} km/h, ${describeFlight(stats.slowest)}` : '—'],
    ['Average Flight', `${formatNumber(stats.averageKm)} km, ${minutesToHHMM(stats.averageMinutes)}`],
  ];
  return rows.map(([label, value]) => `<div class="extreme"><b>${label}</b><span>${value}</span></div>`).join('');
}

function describeFlight(flight) {
  if (!flight) return '—';
  return `${formatNumber(flight.distanceKm)} km, ${minutesToHHMM(flight.durationMinutes)}, ${escapeHtml(airportDisplay(flight.from))} - ${escapeHtml(airportDisplay(flight.to))}`;
}

function topTable(counts, denominator, labelFormatter) {
  if (!counts.size) return '<p class="empty-state">No data yet.</p>';
  const rows = [...counts.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))).slice(0, 10);
  return `<table class="mini-table"><thead><tr><th>#</th><th>Name</th><th>Number</th><th>%</th></tr></thead><tbody>${rows.map(([label, count], index) => `
    <tr><td>${index + 1}</td><td>${labelFormatter(label)}</td><td>${formatNumber(count)}</td><td>${denominator ? ((count / denominator) * 100).toFixed(1) : '0.0'}%</td></tr>
  `).join('')}</tbody></table>`;
}

function statRows(rows) {
  return rows.map(([label, value]) => `<div class="stat-row"><span>${escapeHtml(label)}</span><span>${value}</span></div>`).join('');
}

function renderPie(canvasId, legendId, counts) {
  const canvas = document.getElementById(canvasId);
  const ctx = canvas.getContext('2d');
  const entries = [...counts.entries()].filter(([, value]) => value > 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!entries.length) {
    ctx.fillStyle = '#66736f';
    ctx.font = '16px system-ui';
    ctx.fillText('No data yet', 125, 115);
    document.getElementById(legendId).innerHTML = '';
    return;
  }
  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  let angle = -Math.PI / 2;
  const cx = canvas.width / 2;
  const cy = 105;
  const radius = 82;
  entries.forEach(([label, value], index) => {
    const slice = (value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, angle, angle + slice);
    ctx.closePath();
    ctx.fillStyle = PIE_COLORS[index % PIE_COLORS.length];
    ctx.fill();
    angle += slice;
  });
  document.getElementById(legendId).innerHTML = entries.map(([label, value], index) => `
    <span class="legend-item"><span class="swatch" style="background:${PIE_COLORS[index % PIE_COLORS.length]}"></span>${escapeHtml(label)}: ${formatNumber(value)}</span>
  `).join('');
}

function resetMaps() {
  if (state.routeMap) {
    state.routeMap.remove();
    state.routeMap = null;
  }
  if (state.countryMap) {
    state.countryMap.remove();
    state.countryMap = null;
    state.countryLayer = null;
  }
}

function renderRouteMap() {
  const fallback = document.getElementById('routeMapFallback');
  fallback.textContent = '';
  if (!window.L) {
    fallback.textContent = 'Map library could not be loaded. Check your internet connection.';
    return;
  }
  if (state.routeMap) state.routeMap.remove();
  state.routeMap = L.map('routeMap', { worldCopyJump: true, scrollWheelZoom: true }).setView([35, 0], 2);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 8,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(state.routeMap);

  const points = [];
  const routeCounts = new Map();
  for (const flight of state.flights) {
    const origin = state.airports[flight.from];
    const destination = state.airports[flight.to];
    if (!origin || !destination) continue;
    points.push([origin.lat, origin.lon], [destination.lat, destination.lon]);
    const key = `${flight.from}-${flight.to}`;
    routeCounts.set(key, (routeCounts.get(key) || 0) + 1);
    const line = L.polyline([[origin.lat, origin.lon], [destination.lat, destination.lon]], {
      weight: Math.min(6, 1 + routeCounts.get(key) * 0.25),
      opacity: 0.28,
      color: '#0f766e'
    }).addTo(state.routeMap);
    line.bindPopup(`<b>${escapeHtml(flight.from)} → ${escapeHtml(flight.to)}</b><br>${escapeHtml(flight.airline)}<br>${formatNumber(flight.distanceKm)} km · ${minutesToHHMM(flight.durationMinutes)}`);
  }

  const uniqueAirports = new Set(state.flights.flatMap(f => [f.from, f.to]));
  for (const code of uniqueAirports) {
    const airport = state.airports[code];
    if (!airport) continue;
    L.circleMarker([airport.lat, airport.lon], {
      radius: 4,
      color: '#0a4f49',
      fillColor: '#0f766e',
      fillOpacity: 0.9,
      weight: 1
    }).addTo(state.routeMap).bindPopup(`<b>${escapeHtml(code)}</b><br>${escapeHtml(airport.city)}<br>${escapeHtml(airport.country)}`);
  }

  if (points.length) {
    state.routeMap.fitBounds(points, { padding: [30, 30] });
  } else {
    fallback.textContent = 'No routes to show yet.';
  }
}

async function renderCountriesMap() {
  renderCountryList();
  const fallback = document.getElementById('countryMapFallback');
  fallback.textContent = '';
  if (!window.L) {
    fallback.textContent = 'Map library could not be loaded. The country list below still works.';
    return;
  }
  if (state.countryMap) state.countryMap.remove();
  state.countryMap = L.map('countriesMap', { scrollWheelZoom: true }).setView([25, 0], 2);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 6,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(state.countryMap);

  try {
    if (!state.countryGeoJson) {
      const response = await fetch('https://cdn.jsdelivr.net/gh/johan/world.geo.json@master/countries.geo.json');
      if (!response.ok) throw new Error('Could not load country map.');
      state.countryGeoJson = await response.json();
    }
    const visited = visitedCountrySet();
    state.countryLayer = L.geoJSON(state.countryGeoJson, {
      style: feature => {
        const name = feature.properties?.name || '';
        const isVisited = visited.has(normalizeCountry(name));
        return {
          color: isVisited ? '#0a4f49' : '#b4afa5',
          fillColor: isVisited ? '#0f766e' : '#f3efe7',
          fillOpacity: isVisited ? 0.55 : 0.22,
          weight: isVisited ? 1.2 : 0.6
        };
      },
      onEachFeature: (feature, layer) => {
        const name = feature.properties?.name || 'Unknown';
        layer.bindPopup(escapeHtml(name));
      }
    }).addTo(state.countryMap);
  } catch (error) {
    fallback.textContent = 'Could not load the country boundary map. The visited country list below still works.';
  }
}

function renderCountryList() {
  const countries = [...visitedCountries()].sort((a, b) => a.localeCompare(b));
  const container = document.getElementById('countryList');
  if (!countries.length) {
    container.innerHTML = '<p class="empty-state">No countries yet.</p>';
    return;
  }
  container.innerHTML = countries.map(country => `<span class="country-chip">${escapeHtml(country)}</span>`).join('');
}

function visitedCountries() {
  const countries = new Set();
  for (const flight of state.flights) {
    const origin = state.airports[flight.from];
    const destination = state.airports[flight.to];
    if (origin?.country) countries.add(origin.country);
    if (destination?.country) countries.add(destination.country);
  }
  return countries;
}

function visitedCountrySet() {
  return new Set([...visitedCountries()].map(normalizeCountry));
}

function normalizeCountry(country) {
  const key = String(country || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/^the\s+/, '')
    .replace(/[^a-z0-9]/g, '');
  const aliases = {
    unitedstatesofamerica: 'unitedstates',
    usa: 'unitedstates',
    unitedstates: 'unitedstates',
    uk: 'unitedkingdom',
    greatbritain: 'unitedkingdom',
    russianfederation: 'russia',
    czechia: 'czechrepublic',
    unitedrepublicoftanzania: 'tanzania',
    republicofserbia: 'serbia',
    palestine: 'palestine',
    uae: 'unitedarabemirates',
    vietname: 'vietnam'
  };
  return aliases[key] || key;
}

function normalizeCode(code) {
  return String(code || '').trim().toUpperCase();
}

function normalizeSeatClass(value) {
  const normalized = String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, ' ');
  if (normalized === 'economy plus' || normalized === 'premium economy' || normalized === 'economyplus') return 'Economy Plus';
  if (normalized === 'business') return 'Business';
  if (normalized === 'first') return 'First';
  return 'Economy';
}

function normalizePurpose(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'business' ? 'Business' : 'Personal';
}

function haversineKm(a, b) {
  const R = 6371.0088;
  const toRad = degrees => degrees * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

function estimateDurationMinutes(distanceKm) {
  let speedKmh;
  let padding;
  if (distanceKm < 350) {
    speedKmh = 430;
    padding = 28;
  } else if (distanceKm < 1200) {
    speedKmh = 610;
    padding = 34;
  } else if (distanceKm < 3500) {
    speedKmh = 735;
    padding = 42;
  } else {
    speedKmh = 845;
    padding = 55;
  }
  return Math.max(25, Math.round((distanceKm / speedKmh) * 60 + padding));
}

function classifyRoute(from, to) {
  const origin = state.airports[from];
  const destination = state.airports[to];
  if (!origin || !destination) return 'Other';
  if (origin.country === destination.country) return 'Domestic';
  if (origin.continent && origin.continent === destination.continent && origin.continent !== 'Other') return 'Intra-continental';
  return 'Intercontinental';
}

function buildFlight(input, existing) {
  const from = normalizeCode(input.from);
  const to = normalizeCode(input.to);
  if (!from || !to) throw new Error('Origin and destination airport codes are required.');
  if (from.length !== 3 || to.length !== 3) throw new Error('Airport codes must be three-letter IATA codes.');
  if (!state.airports[from]) throw new Error(`Airport code ${from} was not found in the airport database.`);
  if (!state.airports[to]) throw new Error(`Airport code ${to} was not found in the airport database.`);
  if (from === to) throw new Error('Origin and destination cannot be the same airport.');

  const airline = String(input.airline || '').trim();
  if (!airline) throw new Error('Airline is required.');

  const routeChanged = !existing || existing.from !== from || existing.to !== to || !existing.distanceKm || !existing.durationMinutes;
  const distanceKm = routeChanged ? haversineKm(state.airports[from], state.airports[to]) : existing.distanceKm;
  const durationMinutes = routeChanged ? estimateDurationMinutes(distanceKm) : existing.durationMinutes;

  return {
    id: existing?.id || null,
    legacyId: existing?.legacyId || null,
    flightNumber: existing?.flightNumber || null,
    from,
    to,
    airline,
    purpose: normalizePurpose(input.purpose),
    seatClass: normalizeSeatClass(input.seatClass),
    distanceKm,
    durationMinutes,
    type: classifyRoute(from, to),
    source: existing?.source || 'manual',
  };
}

function exportCsv() {
  const headers = ['Flight number', 'Departure', 'Destination', 'Distance (km)', 'Duration (hh:mm)', 'Airline', 'Travel Reason', 'Seat Class', 'Type'];
  const rows = state.flights.map(f => [
    f.flightNumber,
    f.from,
    f.to,
    f.distanceKm,
    minutesToHHMM(f.durationMinutes),
    f.airline,
    f.purpose,
    f.seatClass,
    f.type,
  ]);
  const csv = [headers, ...rows].map(row => row.map(csvValue).join(',')).join('\n');
  downloadFile(`${state.traveller.toLowerCase()}-flights.csv`, 'text/csv;charset=utf-8', csv);
}

function downloadFile(filename, type, content) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function csvValue(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function increment(map, key) {
  if (!key) return;
  map.set(key, (map.get(key) || 0) + 1);
}

function airportName(code) {
  const airport = state.airports[code];
  return airport ? `${airport.city} ${airport.name} ${airport.country}` : code;
}

function airportShortName(code) {
  const airport = state.airports[code];
  return airport ? `${airport.city}` : code;
}

function airportDisplay(code) {
  const airport = state.airports[code];
  return airport ? `${airport.city} (${code})` : code;
}

function minutesToHHMM(minutes) {
  const total = Math.round(Number(minutes || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')} h`;
}

function minutesToHoursLabel(minutes) {
  const hours = Math.floor(Number(minutes || 0) / 60);
  const mins = Math.round(Number(minutes || 0) % 60);
  return `${formatNumber(hours)}:${String(mins).padStart(2, '0')}`;
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-GB').format(Math.round(Number(value || 0)));
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
}

function escapeAttribute(value) {
  return String(value ?? '').replace(/['\\]/g, '\\$&').replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
}
