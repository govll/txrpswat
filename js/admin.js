/**
 * FWPD SWAT | Admin Logic
 * Features: Manual Role Overrides, Activity Logging, and State Sync.
 */

let currentAdmin = null;
let isSaving = false; // Prevent race conditions

function openAdmin() { document.getElementById("adminModal").classList.add("open"); }
function closeAdmin() { document.getElementById("adminModal").classList.remove("open"); }

async function doLogin() {
    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value.trim();
    const { data, error } = await sbClient.from('supervisors').select('*').eq('email', email).eq('password', password).single();

    if (error || !data) return alert("Access Denied.");
    currentAdmin = data;
    document.getElementById("adminLogin").style.display = "none";
    document.getElementById("adminPanel").style.display = "block";
    await addLog("Supervisor Authenticated");
    getState().then(syncAdminPanel);
}

// --- LOGGING ---

async function addLog(action) {
    const adminName = currentAdmin ? (currentAdmin.name || currentAdmin.email) : "System";
    await sbClient.from('logs').insert([{ admin_name: adminName, action: action }]);
    renderLogs();
}

async function renderLogs() {
    const { data: logs } = await sbClient.from('logs').select('*').order('created_at', {ascending: false}).limit(20);
    const container = document.getElementById("logContainer");
    if (container && logs) {
        container.innerHTML = logs.map(l => `
            <div style="border-bottom:1px solid #111; padding:2px 0;">
                <span style="color:#555;">[${new Date(l.created_at).toLocaleTimeString()}]</span> 
                <span style="color:#0a84ff;">${l.admin_name}:</span> ${l.action}
            </div>`).join("");
    }
}

// --- ACTIONS ---

async function toggleShift() {
    const state = await getState();
    state.shiftActive = !state.shiftActive;
    if(!state.shiftActive) {
        state.roster = [];
        state.splitMode = false;
    } else {
        // --- START RELEVANT CHANGE ---
        // Ensure every new shift defaults to capacity 5
        state.maxUnits = 5;
        // --- END RELEVANT CHANGE ---
    }
    await saveState(state);
    await addLog(state.shiftActive ? "SHIFT STARTED" : "SHIFT CLOSED / ROSTER RESET");
}

async function updateMaxUnits() {
    const val = parseInt(document.getElementById("maxUnitsInput").value);
    const state = await getState();
    state.maxUnits = val;
    await saveState(state);
    await addLog(`MAX CAPACITY SET TO: ${val}`);
}

async function toggleSplitMode() {
    const state = await getState();
    state.splitMode = !state.splitMode;
    await saveState(state);
    await addLog(state.splitMode ? "FORCED MULTI-SQUAD" : "AUTO SQUAD ALLOCATION");
}

async function kickUnit(unitId, username) {
    if(!confirm(`Remove ${username} from duty?`)) return;
    const state = await getState();
    state.roster = state.roster.filter(u => u.id !== unitId);
    await saveState(state);
    await addLog(`MANUAL KICK: ${username}`);
}

async function applyManualRole() {
    if(isSaving) return;
    const unitId = document.getElementById("targetUnit").value;
    const role = document.getElementById("manualRole").value;
    if(!unitId) return;

    isSaving = true;
    const state = await getState();
    const unit = state.roster.find(u => u.id === unitId);
    
    if(unit) {
        // Reset both manual flags first to clear any previous specialist or custom role
        unit.specialRole = null;
        unit.manualRoleName = null;

        if(role === "SNIPER" || role === "NEGOTIATOR") {
            unit.specialRole = role;
        } else if (role !== "") {
            unit.manualRoleName = role;
        }
        // If role is "", they stay in squad pool with auto-assigned role names

        await saveState(state);
        await addLog(`ROLE UPDATE: ${unit.username} -> ${role || 'Auto'}`);
    }
    isSaving = false;
}

// --- UI SYNC ---

function syncAdminPanel(state) {
    if(!state) return;
    const list = document.getElementById("adminRosterList");
    const select = document.getElementById("targetUnit");
    
    if(!list || !select) return;

    // Roster List (with Kick buttons)
    list.innerHTML = state.roster.map(u => `
        <div style="display:flex; justify-content:space-between; padding:5px; border-bottom:1px solid #111; align-items:center;">
            <span style="font-size:11px;">[${u.callsign}] ${u.username}</span>
            <button onclick="kickUnit('${u.id}', '${u.username}')" style="background:#cc0000; color:white; border:none; padding:2px 8px; font-size:9px; cursor:pointer; font-weight:bold;">KICK</button>
        </div>
    `).join("");

    // Dropdown Selection (Maintains selection if possible)
    const prevVal = select.value;
    select.innerHTML = `<option value="">-- Select Unit --</option>` + 
        [...state.roster].sort((a,b)=>a.username.localeCompare(b.username)).map(u => 
            `<option value="${u.id}">${u.username} (${u.callsign})</option>`
        ).join("");
    if (prevVal) select.value = prevVal;

    document.getElementById("splitModeBtn").textContent = state.splitMode ? "Disable Multi-Squad" : "Enable Multi-Squad";
    
    // Ensure input reflects the current state (defaults to 5)
    if (document.getElementById("maxUnitsInput")) {
        document.getElementById("maxUnitsInput").value = state.maxUnits || 5;
    }
    
    renderLogs();
}