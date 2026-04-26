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

    // Fixed: Using sbClient instead of supabase
    const { data, error } = await sbClient
        .from('supervisors')
        .select('*')
        .eq('email', email)
        .eq('password', password)
        .single();

    if (error) {
        console.error("Login error:", error);
        alert("Access Denied: Invalid Credentials or Table Missing.");
        return;
    }

    if (data) {
        currentAdmin = data;
        document.getElementById("adminLogin").style.display = "none";
        document.getElementById("adminPanel").style.display = "block";
        addLog("Supervisor Login");
        renderLogs();
    }
}

async function addLog(action) {
    await sbClient.from('logs').insert([{ 
        admin_name: currentAdmin ? currentAdmin.name : "System", 
        action: action 
    }]);
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
    renderPortal();
}