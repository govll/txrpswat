/**
 * FWPD SWAT | Admin Logic
 * Enhanced Logging: Captures every specific supervisor action.
 */

let currentAdmin = null;

function openAdmin() { document.getElementById("adminModal").classList.add("open"); }
function closeAdmin() { document.getElementById("adminModal").classList.remove("open"); }

async function doLogin() {
    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value.trim();

    if (!email || !password) return alert("Please enter credentials.");

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
    
    // LOG: Session Start
    await addLog(`SUPERVISOR SESSION STARTED`);
    syncAdminPanel();
}

// --- CORE LOGGING ENGINE ---

async function addLog(action) {
    const adminName = currentAdmin ? (currentAdmin.name || currentAdmin.email) : "System";
    try {
        await sbClient.from('logs').insert([{ 
            admin_name: adminName, 
            action: action 
        }]);
        renderLogs();
    } catch (err) {
        console.error("Logging failed:", err);
    }
}

async function renderLogs() {
    const { data: logs } = await sbClient.from('logs')
        .select('*')
        .order('created_at', {ascending: false})
        .limit(25);
        
    const container = document.getElementById("logContainer");
    if (container && logs) {
        container.innerHTML = logs.map(l => `
            <div style="margin-bottom:4px; border-bottom:1px solid #111; padding-bottom:2px;">
                <span style="color:#555;">[${new Date(l.created_at).toLocaleTimeString()}]</span> 
                <span style="color:#0a84ff;">${l.admin_name}:</span> 
                <span style="color:#eee;">${l.action}</span>
            </div>
        `).join("");
    }
}

// --- SUPERVISOR ACTIONS (WITH DETAILED LOGGING) ---

async function toggleShift() {
    const state = await getState();
    state.shiftActive = !state.shiftActive;
    
    // Log the change and the roster count at time of closure
    const unitCount = state.roster ? state.roster.length : 0;
    const actionText = state.shiftActive 
        ? `STARTED SHIFT: Portal opened for check-ins.` 
        : `ENDED SHIFT: Portal closed. Cleared ${unitCount} units from roster.`;
    
    if(!state.shiftActive) state.roster = [];
    
    await saveState(state);
    await addLog(actionText);
    syncAdminPanel();
}

async function updateMaxUnits() {
    const val = parseInt(document.getElementById("maxUnitsInput").value);
    if (isNaN(val)) return;

    const state = await getState();
    const oldMax = state.maxUnits || 20;
    state.maxUnits = val;
    
    await saveState(state);
    await addLog(`SET MAX CAPACITY: Changed from ${oldMax} to ${val} units.`);
    syncAdminPanel();
}

async function toggleSplitMode() {
    const state = await getState();
    state.splitMode = !state.splitMode;
    
    const modeText = state.splitMode 
        ? `SQUAD OVERRIDE: Forced Multi-Squad (Squad B active).` 
        : `SQUAD OVERRIDE: Returned to Automatic Squad allocation.`;
    
    recalculate(state); 
    await saveState(state);
    await addLog(modeText);
    syncAdminPanel();
}

async function kickUnit(unitId, username) {
    if(!confirm(`Are you sure you want to kick ${username}?`)) return;
    
    const state = await getState();
    const unitToKick = state.roster.find(u => u.id === unitId);
    const callsign = unitToKick ? unitToKick.callsign : "Unknown";
    
    state.roster = state.roster.filter(u => u.id !== unitId);
    
    recalculate(state); 
    await saveState(state);
    await addLog(`MANUAL KICK: Removed [${callsign}] ${username} from the shift.`);
    syncAdminPanel();
}

async function applyManualRole() {
    const unitId = document.getElementById("targetUnit").value;
    const role = document.getElementById("manualRole").value;
    if(!unitId) return;

    const state = await getState();
    const unit = state.roster.find(u => u.id === unitId);
    if(!unit) return;

    const oldRole = unit.roleName || "Auto-assigned";
    
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
    
    const newRole = unit.roleName || role || "Auto-assigned";
    await addLog(`ROLE UPDATE: Changed ${unit.username} to ${newRole} (Previously ${oldRole}).`);
    syncAdminPanel();
}

async function syncAdminPanel() {
    const state = await getState();
    const list = document.getElementById("adminRosterList");
    const select = document.getElementById("targetUnit");
    
    if(!list || !select) return;

    list.innerHTML = state.roster.length === 0 ? 
        `<div style="color:#444; text-align:center; padding:10px;">No units active</div>` : 
        state.roster.map(u => `
            <div style="display:flex; justify-content:space-between; padding:6px; border-bottom:1px solid #111; align-items:center;">
                <span style="font-size:12px; font-family:'Share Tech Mono';">
                    <span style="color:#0a84ff;">[${u.callsign}]</span> ${u.username}
                </span>
                <button onclick="kickUnit('${u.id}', '${u.username}')" style="background:#cc0000; color:white; border:none; padding:2px 10px; cursor:pointer; font-family:'Rajdhani'; font-weight:bold; font-size:10px;">KICK</button>
            </div>
        `).join("");

    select.innerHTML = state.roster.map(u => `<option value="${u.id}">${u.username} (${u.callsign})</option>`).join("");
    
    const btn = document.getElementById("splitModeBtn");
    if(btn) btn.textContent = state.splitMode ? "Disable Multi-Squad" : "Enable Multi-Squad";
    
    renderLogs();
}