let currentAdmin = null;

function openAdmin() { document.getElementById("adminModal").classList.add("open"); }
function closeAdmin() { document.getElementById("adminModal").classList.remove("open"); }

async function doLogin() {
    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value.trim();

    if (!email || !password) {
        alert("Please enter both email and password.");
        return;
    }

    const { data, error } = await sbClient
        .from('supervisors')
        .select('*')
        .eq('email', email)
        .eq('password', password)
        .single();

    if (error || !data) {
        alert("Access Denied: Invalid Credentials.");
        return;
    }

    currentAdmin = data;
    document.getElementById("adminLogin").style.display = "none";
    document.getElementById("adminPanel").style.display = "block";
    addLog("Supervisor Login");
    syncAdminPanel();
}

async function addLog(action) {
    await sbClient.from('logs').insert([{ 
        admin_name: currentAdmin ? currentAdmin.name : "System", 
        action: action 
    }]);
    renderLogs();
}

async function renderLogs() {
    const { data: logs } = await sbClient.from('logs').select('*').order('created_at', {ascending: false}).limit(20);
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
    addLog(state.shiftActive ? "Started Shift" : "Ended Shift");
    syncAdminPanel();
}

// --- NEW TOOLS ---

async function updateMaxUnits() {
    const val = parseInt(document.getElementById("maxUnitsInput").value);
    const state = await getState();
    state.maxUnits = val;
    await saveState(state);
    addLog(`Updated max capacity to ${val}`);
}

async function toggleSplitMode() {
    const state = await getState();
    state.splitMode = !state.splitMode;
    await saveState(state);
    addLog(state.splitMode ? "Enabled Multi-Squad Mode" : "Disabled Multi-Squad Mode");
    syncAdminPanel();
}

async function kickUnit(unitId, username) {
    if(!confirm(`Kick ${username} from the shift?`)) return;
    const state = await getState();
    state.roster = state.roster.filter(u => u.id !== unitId);
    
    // Auto-recalculate callsigns for everyone left
    recalculate(state);
    await saveState(state);
    addLog(`Kicked unit: ${username}`);
    syncAdminPanel();
}

async function applyManualRole() {
    const unitId = document.getElementById("targetUnit").value;
    const role = document.getElementById("manualRole").value;
    if(!unitId) return;

    const state = await getState();
    const unit = state.roster.find(u => u.id === unitId);
    
    if(role === "SNIPER" || role === "NEGOTIATOR") {
        unit.specialRole = role;
        unit.manualRoleName = null;
    } else if (role !== "") {
        unit.specialRole = null;
        unit.manualRoleName = role;
    } else {
        unit.specialRole = null;
        unit.manualRoleName = null;
    }

    recalculate(state);
    await saveState(state);
    addLog(`Manually set role for ${unit.username} to ${role || 'Auto'}`);
    syncAdminPanel();
}

async function syncAdminPanel() {
    const state = await getState();
    const list = document.getElementById("adminRosterList");
    const select = document.getElementById("targetUnit");
    
    // Render Kick List
    list.innerHTML = state.roster.length === 0 ? "Empty Roster" : 
        state.roster.map(u => `
            <div style="display:flex; justify-content:between; padding:5px; border-bottom:1px solid #111; align-items:center;">
                <span style="flex:1; font-size:12px;">[${u.callsign}] ${u.username}</span>
                <button onclick="kickUnit('${u.id}', '${u.username}')" style="background:red; color:white; border:none; padding:2px 8px; cursor:pointer; font-size:10px;">KICK</button>
            </div>
        `).join("");

    // Render Dropdown
    select.innerHTML = state.roster.map(u => `<option value="${u.id}">${u.username} (${u.callsign})</option>`).join("");
    
    // Update Button State
    const btn = document.getElementById("splitModeBtn");
    btn.textContent = state.splitMode ? "Disable Multi-Squad" : "Enable Multi-Squad";
    document.getElementById("maxUnitsInput").value = state.maxUnits || 20;

    renderLogs();
}