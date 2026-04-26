/**
 * FWPD SWAT | Admin Logic
 */

let currentAdmin = null;

function openAdmin() { document.getElementById("adminModal").classList.add("open"); }
function closeAdmin() { document.getElementById("adminModal").classList.remove("open"); }

async function doLogin() {
    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value.trim();

    const { data, error } = await sbClient.from('supervisors').select('*').eq('email', email).eq('password', password).single();

    if (error || !data) return alert("Access Denied: Invalid Credentials.");

    currentAdmin = data;
    document.getElementById("adminLogin").style.display = "none";
    document.getElementById("adminPanel").style.display = "block";
    
    await addLog("Supervisor Logged In");
    syncAdminPanel();
}

async function addLog(action) {
    const adminName = currentAdmin ? (currentAdmin.name || currentAdmin.email) : "System";
    await sbClient.from('logs').insert([{ admin_name: adminName, action: action }]);
    renderLogs();
}

async function renderLogs() {
    const { data: logs } = await sbClient.from('logs').select('*').order('created_at', {ascending: false}).limit(25);
    const container = document.getElementById("logContainer");
    if (container && logs) {
        container.innerHTML = logs.map(l => `<div>[${new Date(l.created_at).toLocaleTimeString()}] ${l.admin_name}: ${l.action}</div>`).join("");
    }
}

async function toggleShift() {
    const state = await getState();
    state.shiftActive = !state.shiftActive;
    if(!state.shiftActive) state.roster = [];
    
    await saveState(state);
    await addLog(state.shiftActive ? "STARTED SHIFT" : "TERMINATED SHIFT");
    syncAdminPanel();
}

async function updateMaxUnits() {
    const val = parseInt(document.getElementById("maxUnitsInput").value);
    const state = await getState();
    const old = state.maxUnits;
    state.maxUnits = val;
    await saveState(state);
    await addLog(`MAX UNITS: ${old} -> ${val}`);
}

async function toggleSplitMode() {
    const state = await getState();
    state.splitMode = !state.splitMode;
    recalculate(state);
    await saveState(state);
    await addLog(state.splitMode ? "FORCED MULTI-SQUAD" : "AUTO SQUAD MODE");
    syncAdminPanel();
}

async function kickUnit(unitId, username) {
    if(!confirm(`Kick ${username}?`)) return;
    const state = await getState();
    state.roster = state.roster.filter(u => u.id !== unitId);
    recalculate(state);
    await saveState(state);
    await addLog(`KICKED: ${username}`);
    syncAdminPanel();
}

async function applyManualRole() {
    const unitId = document.getElementById("targetUnit").value;
    const role = document.getElementById("manualRole").value;
    if(!unitId) return;

    const state = await getState();
    const unit = state.roster.find(u => u.id === unitId);
    if(!unit) return;

    if(role === "SNIPER" || role === "NEGOTIATOR") {
        unit.specialRole = role;
        unit.manualRoleName = null;
    } else {
        unit.specialRole = null;
        unit.manualRoleName = role || null;
    }

    recalculate(state);
    await saveState(state);
    await addLog(`OVERRIDE: ${unit.username} set to ${role || 'Auto'}`);
    syncAdminPanel();
}

async function syncAdminPanel() {
    const state = await getState();
    const list = document.getElementById("adminRosterList");
    const select = document.getElementById("targetUnit");
    
    // Sort select menu alphabetically for supervisor convenience
    const sortedRoster = [...state.roster].sort((a,b) => a.username.localeCompare(b.username));

    list.innerHTML = state.roster.map(u => `
        <div style="display:flex; justify-content:space-between; padding:5px; border-bottom:1px solid #111; align-items:center;">
            <span style="font-size:11px;">[${u.callsign}] ${u.username}</span>
            <button onclick="kickUnit('${u.id}', '${u.username}')" style="background:red; color:white; border:none; padding:2px 8px; font-size:10px; cursor:pointer;">KICK</button>
        </div>
    `).join("");

    select.innerHTML = sortedRoster.map(u => `<option value="${u.id}">${u.username} (${u.callsign})</option>`).join("");
    document.getElementById("splitModeBtn").textContent = state.splitMode ? "Disable Multi-Squad" : "Enable Multi-Squad";
    renderLogs();
}