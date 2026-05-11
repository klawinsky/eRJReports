// Klucz localStorage
const STORAGE_KEY = 'erj_report_v1';

// Stan aplikacji
let state = {
  trainId: '',
  date: '',
  employees: [],
  vehicles: [],
  stops: [],
  notes: [],
  schedule: [] // załadowany rozkład
};

// Utility: load/save
function saveState(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function loadState(){
  const raw = localStorage.getItem(STORAGE_KEY);
  if(raw) state = JSON.parse(raw);
  renderAll();
}

// Format czasu HH:MM -> minutes
function timeToMinutes(t){
  if(!t) return null;
  const [h,m] = t.split(':').map(Number);
  return h*60 + m;
}
function minutesToTime(m){
  if(m===null || m===undefined) return '';
  m = Math.round(m);
  const hh = String(Math.floor(m/60)).padStart(2,'0');
  const mm = String(m%60).padStart(2,'0');
  return `${hh}:${mm}`;
}

// DOM refs
const trainSelect = document.getElementById('trainSelect');
const trainDate = document.getElementById('trainDate');
const btnLoadSchedule = document.getElementById('btnLoadSchedule');
const employeesList = document.getElementById('employeesList');
const vehiclesList = document.getElementById('vehiclesList');
const stopsTableBody = document.querySelector('#stopsTable tbody');
const notesList = document.getElementById('notesList');

const employeeModal = new bootstrap.Modal(document.getElementById('employeeModal'));
const vehicleModal = new bootstrap.Modal(document.getElementById('vehicleModal'));
const stopModal = new bootstrap.Modal(document.getElementById('stopModal'));
const noteModal = new bootstrap.Modal(document.getElementById('noteModal'));

// Init
document.addEventListener('DOMContentLoaded', ()=>{
  bindUI();
  loadState();
});

// Bindowanie UI
function bindUI(){
  document.getElementById('btnAddEmployee').addEventListener('click', ()=>openEmployeeModal());
  document.getElementById('employeeForm').addEventListener('submit', onEmployeeSave);

  document.getElementById('btnAddVehicle').addEventListener('click', ()=>openVehicleModal());
  document.getElementById('vehicleForm').addEventListener('submit', onVehicleSave);
  document.getElementById('vehType').addEventListener('change', onVehicleTypeChange);

  document.getElementById('btnAddStop').addEventListener('click', ()=>openStopModal());
  document.getElementById('stopForm').addEventListener('submit', onStopSave);

  document.getElementById('btnAddNote').addEventListener('click', ()=>openNoteModal());
  document.getElementById('noteForm').addEventListener('submit', onNoteSave);

  document.getElementById('btnNewReport').addEventListener('click', onNewReport);
  document.getElementById('btnGeneratePDF').addEventListener('click', generatePDF);

  btnLoadSchedule.addEventListener('click', loadScheduleForSelectedTrain);

  trainSelect.addEventListener('change', ()=>{
    state.trainId = trainSelect.value;
    // clear schedule and stops when train changes
    state.schedule = [];
    state.stops = [];
    saveState();
    renderAll();
  });
  trainDate.addEventListener('change', ()=>{
    state.date = trainDate.value;
    saveState();
  });
}

// Render everything
function renderAll(){
  trainSelect.value = state.trainId || '';
  trainDate.value = state.date || '';

  // Employees
  employeesList.innerHTML = '';
  state.employees.forEach((e,i)=>{
    const li = document.createElement('li');
    li.className = 'list-group-item d-flex justify-content-between align-items-start';
    li.innerHTML = `<div>
      <div class="fw-bold">${escapeHtml(e.firstName)} ${escapeHtml(e.lastName)}</div>
      <div class="text-muted">${escapeHtml(e.role)} ${e.notes?'- '+escapeHtml(e.notes):''}</div>
    </div>
    <div>
      <button class="btn btn-sm btn-outline-secondary me-1" onclick="editEmployee(${i})"><i class="bi bi-pencil"></i></button>
      <button class="btn btn-sm btn-outline-danger" onclick="deleteEmployee(${i})"><i class="bi bi-trash"></i></button>
    </div>`;
    employeesList.appendChild(li);
  });

  // Vehicles
  vehiclesList.innerHTML = '';
  state.vehicles.forEach((v,i)=>{
    const li = document.createElement('li');
    li.className = 'list-group-item d-flex justify-content-between align-items-start';
    li.innerHTML = `<div>
      <div class="fw-bold">${escapeHtml(v.id)} <small class="text-muted">(${escapeHtml(v.type)})</small></div>
      <div class="text-muted">${v.commercial?escapeHtml(v.commercial):''}</div>
    </div>
    <div>
      <button class="btn btn-sm btn-outline-secondary me-1" onclick="editVehicle(${i})"><i class="bi bi-pencil"></i></button>
      <button class="btn btn-sm btn-outline-danger" onclick="deleteVehicle(${i})"><i class="bi bi-trash"></i></button>
    </div>`;
    vehiclesList.appendChild(li);
  });

  // Stops
  stopsTableBody.innerHTML = '';
  state.stops.forEach((s,i)=>{
    const plannedArr = s.plannedArrival || '';
    const plannedDep = s.plannedDeparture || '';
    const actualArr = s.actualArrival || '';
    const actualDep = s.actualDeparture || '';

    const arrDev = computeDeviationMinutes(plannedArr, actualArr);
    const depDev = computeDeviationMinutes(plannedDep, actualDep);

    const arrClass = deviationClass(arrDev);
    const depClass = deviationClass(depDev);

    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${escapeHtml(s.station)}</td>
      <td>${plannedArr}</td>
      <td>${plannedDep}</td>
      <td>${actualArr}</td>
      <td>${actualDep}</td>
      <td class="${arrClass}">${arrDev===null?'':(arrDev>0?`+${arrDev}`:arrDev)}</td>
      <td class="${depClass}">${depDev===null?'':(depDev>0?`+${depDev}`:depDev)}</td>
      <td>${escapeHtml(s.notes||'')}</td>
      <td>
        <button class="btn btn-sm btn-outline-secondary me-1" onclick="editStop(${i})"><i class="bi bi-pencil"></i></button>
        <button class="btn btn-sm btn-outline-danger" onclick="deleteStop(${i})"><i class="bi bi-trash"></i></button>
      </td>`;
    stopsTableBody.appendChild(tr);
  });

  // Notes
  notesList.innerHTML = '';
  state.notes.forEach((n,i)=>{
    const li = document.createElement('li');
    li.className = 'list-group-item d-flex justify-content-between align-items-start';
    li.innerHTML = `<div>${escapeHtml(n.text)}</div>
      <div>
        <button class="btn btn-sm btn-outline-secondary me-1" onclick="editNote(${i})"><i class="bi bi-pencil"></i></button>
        <button class="btn btn-sm btn-outline-danger" onclick="deleteNote(${i})"><i class="bi bi-trash"></i></button>
      </div>`;
    notesList.appendChild(li);
  });

  // Fill datalist of stations from schedule
  const datalist = document.getElementById('stationsList');
  datalist.innerHTML = '';
  (state.schedule || []).forEach(s=>{
    const opt = document.createElement('option');
    opt.value = s.station;
    datalist.appendChild(opt);
  });
}

// Escape HTML
function escapeHtml(s){ if(!s) return ''; return s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'); }

// Employee handlers
function openEmployeeModal(index){
  document.getElementById('employeeIndex').value = index ?? '';
  if(index!==undefined && index!==null){
    const e = state.employees[index];
    document.getElementById('empFirstName').value = e.firstName;
    document.getElementById('empLastName').value = e.lastName;
    document.getElementById('empRole').value = e.role;
    document.getElementById('empNotes').value = e.notes;
  } else {
    document.getElementById('employeeForm').reset();
    document.getElementById('employeeIndex').value = '';
  }
  employeeModal.show();
}
function onEmployeeSave(e){
  e.preventDefault();
  const idx = document.getElementById('employeeIndex').value;
  const obj = {
    firstName: document.getElementById('empFirstName').value.trim(),
    lastName: document.getElementById('empLastName').value.trim(),
    role: document.getElementById('empRole').value.trim(),
    notes: document.getElementById('empNotes').value.trim()
  };
  if(idx==='') state.employees.push(obj); else state.employees[idx]=obj;
  saveState();
  employeeModal.hide();
  renderAll();
}
window.editEmployee = function(i){ openEmployeeModal(i); }
window.deleteEmployee = function(i){ if(confirm('Usuń pracownika?')){ state.employees.splice(i,1); saveState(); renderAll(); } }

// Vehicle handlers
function openVehicleModal(index){
  document.getElementById('vehicleIndex').value = index ?? '';
  if(index!==undefined && index!==null){
    const v = state.vehicles[index];
    document.getElementById('vehId').value = v.id;
    document.getElementById('vehType').value = v.type;
    document.getElementById('vehCommercial').value = v.commercial || '';
  } else {
    document.getElementById('vehicleForm').reset();
    document.getElementById('vehicleIndex').value = '';
  }
  onVehicleTypeChange();
  vehicleModal.show();
}
function onVehicleSave(e){
  e.preventDefault();
  const idx = document.getElementById('vehicleIndex').value;
  const obj = {
    id: document.getElementById('vehId').value.trim(),
    type: document.getElementById('vehType').value,
    commercial: document.getElementById('vehCommercial').value.trim()
  };
  if(idx==='') state.vehicles.push(obj); else state.vehicles[idx]=obj;
  saveState();
  vehicleModal.hide();
  renderAll();
}
function onVehicleTypeChange(){
  const t = document.getElementById('vehType').value;
  document.getElementById('commercialNumberWrap').style.display = (t==='wagon') ? 'block' : 'none';
}
window.editVehicle = function(i){ openVehicleModal(i); }
window.deleteVehicle = function(i){ if(confirm('Usuń pojazd?')){ state.vehicles.splice(i,1); saveState(); renderAll(); } }

// Stop handlers
function openStopModal(index){
  document.getElementById('stopIndex').value = index ?? '';
  if(index!==undefined && index!==null){
    const s = state.stops[index];
    document.getElementById('stopStation').value = s.station;
    document.getElementById('plannedArrival').value = s.plannedArrival || '';
    document.getElementById('plannedDeparture').value = s.plannedDeparture || '';
    document.getElementById('actualArrival').value = s.actualArrival || '';
    document.getElementById('actualDeparture').value = s.actualDeparture || '';
    document.getElementById('delayArrivalReason').value = s.delayArrivalReason || '';
    document.getElementById('delayDepartureReason').value = s.delayDepartureReason || '';
    document.getElementById('stopNotes').value = s.notes || '';
  } else {
    document.getElementById('stopForm').reset();
    document.getElementById('stopIndex').value = '';
  }
  stopModal.show();
}
function onStopSave(e){
  e.preventDefault();
  const idx = document.getElementById('stopIndex').value;
  const station = document.getElementById('stopStation').value.trim();
  const plannedArrival = document.getElementById('plannedArrival').value;
  const plannedDeparture = document.getElementById('plannedDeparture').value;
  const actualArrival = document.getElementById('actualArrival').value;
  const actualDeparture = document.getElementById('actualDeparture').value;
  const obj = {
    station,
    plannedArrival,
    plannedDeparture,
    actualArrival,
    actualDeparture,
    delayArrivalReason: document.getElementById('delayArrivalReason').value.trim(),
    delayDepartureReason: document.getElementById('delayDepartureReason').value.trim(),
    notes: document.getElementById('stopNotes').value.trim()
  };
  if(idx==='') state.stops.push(obj); else state.stops[idx]=obj;
  saveState();
  stopModal.hide();
  renderAll();
}
window.editStop = function(i){ openStopModal(i); }
window.deleteStop = function(i){ if(confirm('Usuń wpis rozkładowy?')){ state.stops.splice(i,1); saveState(); renderAll(); } }

// Note handlers
function openNoteModal(index){
  document.getElementById('noteIndex').value = index ?? '';
  if(index!==undefined && index!==null){
    document.getElementById('noteText').value = state.notes[index].text;
  } else {
    document.getElementById('noteForm').reset();
    document.getElementById('noteIndex').value = '';
  }
  noteModal.show();
}
function onNoteSave(e){
  e.preventDefault();
  const idx = document.getElementById('noteIndex').value;
  const obj = { text: document.getElementById('noteText').value.trim() };
  if(idx==='') state.notes.push(obj); else state.notes[idx]=obj;
  saveState();
  noteModal.hide();
  renderAll();
}
window.editNote = function(i){ openNoteModal(i); }
window.deleteNote = function(i){ if(confirm('Usuń uwagę?')){ state.notes.splice(i,1); saveState(); renderAll(); } }

// Compute deviation in minutes: actual - planned
function computeDeviationMinutes(planned, actual){
  if(!planned || !actual) return null;
  const p = timeToMinutes(planned);
  const a = timeToMinutes(actual);
  if(p===null || a===null) return null;
  return a - p;
}
function deviationClass(dev){
  if(dev===null) return '';
  if(dev>0) return 'deviation-negative';
  if(dev<0) return 'deviation-positive';
  return 'deviation-zero';
}

// Load schedule JSON from /data
async function loadScheduleForSelectedTrain(){
  const id = trainSelect.value;
  if(!id){ alert('Wybierz numer pociągu'); return; }
  try{
    const res = await fetch(`data/${id}.json`);
    if(!res.ok) throw new Error('Brak pliku rozkładu');
    const json = await res.json();
    state.schedule = json;
    // optionally prefill stops with schedule
    state.stops = json.map(s => ({
      station: s.station,
      plannedArrival: s.arrival,
      plannedDeparture: s.departure,
      actualArrival: '',
      actualDeparture: '',
      delayArrivalReason: '',
      delayDepartureReason: '',
      notes: ''
    }));
    state.trainId = id;
    saveState();
    renderAll();
    alert('Rozkład załadowany i wstawiony do sekcji D');
  }catch(err){
    alert('Błąd ładowania rozkładu: ' + err.message);
  }
}

// New report
function onNewReport(){
  if(!confirm('Czy na pewno chcesz wyczyścić raport i rozpocząć nowy?')) return;
  state = { trainId:'', date:'', employees:[], vehicles:[], stops:[], notes:[], schedule:[] };
  saveState();
  renderAll();
}

// PDF generation
function generatePDF(){
  // Przygotuj zawartość raportu w formacie A4
  const container = document.createElement('div');
  container.className = 'report-a4';

  // Header
  const header = document.createElement('div');
  header.className = 'report-header';
  header.innerHTML = `<div>
    <div class="report-title">Raport jazdy pociągu</div>
    <div>Data: <strong>${state.date || ''}</strong></div>
    <div>Pociąg: <strong>${state.trainId || ''}</strong></div>
  </div>
  <div>
    <img src="assets/logo.png" alt="logo" style="height:48px;opacity:0.9" onerror="this.style.display='none'">
  </div>`;
  container.appendChild(header);

  // Employees
  const empSection = document.createElement('div');
  empSection.className = 'report-section';
  empSection.innerHTML = `<div><strong>Pracownicy</strong></div>`;
  const empTable = document.createElement('table');
  empTable.className = 'report-table';
  empTable.innerHTML = `<thead><tr><th>Imię</th><th>Nazwisko</th><th>Stanowisko</th><th>Uwagi</th></tr></thead>`;
  const empBody = document.createElement('tbody');
  state.employees.forEach(e=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${escapeHtml(e.firstName)}</td><td>${escapeHtml(e.lastName)}</td><td>${escapeHtml(e.role)}</td><td>${escapeHtml(e.notes)}</td>`;
    empBody.appendChild(tr);
  });
  empTable.appendChild(empBody);
  empSection.appendChild(empTable);
  container.appendChild(empSection);

  // Vehicles
  const vehSection = document.createElement('div');
  vehSection.className = 'report-section';
  vehSection.innerHTML = `<div><strong>Skład pociągu</strong></div>`;
  const vehTable = document.createElement('table');
  vehTable.className = 'report-table';
  vehTable.innerHTML = `<thead><tr><th>Oznaczenie</th><th>Typ</th><th>Nr handlowy</th></tr></thead>`;
  const vehBody = document.createElement('tbody');
  state.vehicles.forEach(v=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${escapeHtml(v.id)}</td><td>${escapeHtml(v.type)}</td><td>${escapeHtml(v.commercial||'')}</td>`;
    vehBody.appendChild(tr);
  });
  vehTable.appendChild(vehBody);
  vehSection.appendChild(vehTable);
  container.appendChild(vehSection);

  // Stops
  const stopsSection = document.createElement('div');
  stopsSection.className = 'report-section';
  stopsSection.innerHTML = `<div><strong>Realizacja rozkładu</strong></div>`;
  const stopsTable = document.createElement('table');
  stopsTable.className = 'report-table';
  stopsTable.innerHTML = `<thead><tr>
    <th>Stacja</th><th>Rozkł. przyj.</th><th>Rozkł. odj.</th><th>Rzecz. przyj.</th><th>Rzecz. odj.</th><th>Odchyłka przyj. (min)</th><th>Odchyłka odj. (min)</th><th>Uwagi</th>
  </tr></thead>`;
  const stopsBody = document.createElement('tbody');
  state.stops.forEach(s=>{
    const arrDev = computeDeviationMinutes(s.plannedArrival, s.actualArrival);
    const depDev = computeDeviationMinutes(s.plannedDeparture, s.actualDeparture);
    const arrClass = deviationClass(arrDev);
    const depClass = deviationClass(depDev);
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${escapeHtml(s.station)}</td>
      <td>${s.plannedArrival||''}</td>
      <td>${s.plannedDeparture||''}</td>
      <td>${s.actualArrival||''}</td>
      <td>${s.actualDeparture||''}</td>
      <td class="${arrClass}">${arrDev===null?'':(arrDev>0?`+${arrDev}`:arrDev)}</td>
      <td class="${depClass}">${depDev===null?'':(depDev>0?`+${depDev}`:depDev)}</td>
      <td>${escapeHtml(s.notes||'')}</td>`;
    stopsBody.appendChild(tr);
  });
  stopsTable.appendChild(stopsBody);
  stopsSection.appendChild(stopsTable);
  container.appendChild(stopsSection);

  // Notes
  const notesSection = document.createElement('div');
  notesSection.className = 'report-section';
  notesSection.innerHTML = `<div><strong>Uwagi</strong></div>`;
  const notesUl = document.createElement('ul');
  notesUl.style.paddingLeft = '16px';
  state.notes.forEach(n=>{
    const li = document.createElement('li');
    li.textContent = n.text;
    notesUl.appendChild(li);
  });
  notesSection.appendChild(notesUl);
  container.appendChild(notesSection);

  // Generowanie PDF A4
  const opt = {
    margin:       10,
    filename:     `eRJ_report_${state.trainId || 'report' }_${state.date || ''}.pdf`,
    image:        { type: 'jpeg', quality: 0.98 },
    html2canvas:  { scale: 2, useCORS: true },
    jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };
  // Wyświetl podgląd w nowej karcie i pobierz
  html2pdf().set(opt).from(container).save();
}

// Load schedule files exist in /data folder. Example files provided in repo.

// Helper: when user types station name in stop modal, auto-fill planned times if in schedule
document.getElementById('stopStation').addEventListener('change', function(){
  const name = this.value.trim();
  if(!name) return;
  const found = (state.schedule || []).find(s => s.station.toLowerCase() === name.toLowerCase());
  if(found){
    document.getElementById('plannedArrival').value = found.arrival || '';
    document.getElementById('plannedDeparture').value = found.departure || '';
  }
});

// Simple escape for innerText usage in PDF generation
// Save on unload
window.addEventListener('beforeunload', saveState);
