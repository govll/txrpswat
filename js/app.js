// Logic to sync with Supabase tables: portal_state
const { RANK_ORDER, RANK_LABELS, ROLE_NAMES, COMMAND_RANKS, COMMAND_CALLSIGNS } = INITIAL_CONFIG;

async function getState() {
    const { data } = await supabase.from('portal_state').select('state').eq('id', 1).single();
    return data ? data.state : { shiftActive: false, roster: [] };
}

async function saveState(newState) {
    await supabase.from('portal_state').update({ state: newState }).eq('id', 1);
}

async function renderPortal() {
    const state = await getState();
    const pill = document.getElementById("statusPill");
    if(state.shiftActive) {
        pill.textContent = "Shift Active"; pill.className = "status-pill active";
        document.getElementById("viewOffline").style.display = "none";
        document.getElementById("viewCheckin").style.display = "block";
    } else {
        pill.textContent = "Offline"; pill.className = "status-pill inactive";
        document.getElementById("viewOffline").style.display = "block";
        document.getElementById("viewCheckin").style.display = "none";
    }
    // Update Roster Table...
    const tbody = document.getElementById("rosterBody");
    tbody.innerHTML = state.roster.map(u => `<tr><td>${u.callsign}</td><td>${u.username}</td><td>${RANK_LABELS[u.rank]}</td><td>${u.roleName}</td><td>${u.squad}</td></tr>`).join("");
}

// Real-time listener
supabase.channel('state-changes').on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'portal_state' }, renderPortal).subscribe();

async function handleCheckin() {
    const user = document.getElementById("inputUsername").value.trim();
    const rank = document.getElementById("inputRank").value;
    const state = await getState();
    // (Recalculate logic here...)
    state.roster.push({ username: user, rank: rank, callsign: "TBD", roleName: "TBD", squad: "D Squad" });
    await saveState(state);
}

renderPortal();