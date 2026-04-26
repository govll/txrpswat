let currentAdmin = null;

function openAdmin() { document.getElementById("adminModal").classList.add("open"); }
function closeAdmin() { document.getElementById("adminModal").classList.remove("open"); }

async function doLogin() {
    const email = document.getElementById("loginEmail").value;
    const password = document.getElementById("loginPassword").value;

    // SECURE LOGIN: We check against the Supabase 'supervisors' table
    const { data, error } = await supabase
        .from('supervisors')
        .select('*')
        .eq('email', email)
        .eq('password', password)
        .single();

    if (data) {
        currentAdmin = data;
        document.getElementById("adminLogin").style.display = "none";
        document.getElementById("adminPanel").style.display = "block";
        addLog("Supervisor Login");
    } else {
        alert("Access Denied");
    }
}

async function addLog(action) {
    await supabase.from('logs').insert([{ admin_name: currentAdmin ? currentAdmin.name : "System", action: action }]);
}

async function toggleShift() {
    const state = await (async () => {
        const { data } = await supabase.from('portal_state').select('state').eq('id', 1).single();
        return data.state;
    })();
    state.shiftActive = !state.shiftActive;
    if(!state.shiftActive) state.roster = [];
    await supabase.from('portal_state').update({ state: state }).eq('id', 1);
    addLog(state.shiftActive ? "Started Shift" : "Ended Shift");
}