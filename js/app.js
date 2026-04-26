/**
 * FWPD SWAT | Global App Logic
 * Final Version: Fixed Roster Visibility
 */

const { RANK_ORDER, RANK_LABELS, ROLE_NAMES, COMMAND_RANKS, COMMAND_CALLSIGNS } = INITIAL_CONFIG;

// --- DATABASE COMMUNICATION ---

function getDefaults() {
    return {
        shiftActive: false,
        splitMode: false,
        maxUnits: 20,
        slots: {
            COMMANDER: 1, ASST_COMMANDER: 1, LIEUTENANT: 2, 
            SERGEANT: 4, CORPORAL: 4, SENIOR_OPERATOR: 6, OPERATOR: 12
        },
        roster: []
    };
}

async function getState() {
    try {
        const { data, error } = await sbClient.from('portal_state').select('state').eq('id', 1).single();
        if (error) throw error;
        const baseDefaults = getDefaults();
        if (data && data.state) {
            return {
                ...baseDefaults,
                ...data.state,
                slots: { ...baseDefaults.slots, ...(data.state.slots || {}) },
                roster: data.state.roster || []
            };
        }
        return baseDefaults;
    } catch (err) {
        console.error("Database fetch error:", err);
        return getDefaults();
    }
}

async function saveState(newState) {
    try {
        const { error } = await sbClient.from('portal_state').update({ state: newState }).eq('id', 1);
        if (error) throw error;
    } catch (err) {
        console.error("Database save error:", err);
    }
}

// --- CORE LOGIC ---

function recalculate(state) {
    const roster = state.roster || [];
    const cmdMembers = roster.filter(u => COMMAND_RANKS.includes(u.rank));
    const squadPool = roster.filter(u => !COMMAND_RANKS.includes(u.rank));

    squadPool.sort((a, b) => {
        const ri = RANK_ORDER.indexOf(a.rank) - RANK_ORDER.indexOf(b.rank);
        return ri !== 0 ? ri : a.checkInOrder - b.checkInOrder;
    });

    cmdMembers.forEach(u => {
        u.callsign = COMMAND_CALLSIGNS[u.rank] || "K-??";
        u.squad = "Command";
        u.roleName = "Command";
    });

    squadPool.forEach((u, i) => {
        const slot = i + 1;
        u.callsign = `D-0${slot}`;
        u.squad = "D Squad";
        u.roleName = ROLE_NAMES[slot] || `Operator`;
    });
}

// --- RENDER ENGINE ---

async function renderPortal() {
    const state = await getState();
    const pill = document.getElementById("statusPill");
    
    // 1. Update Shift Status
    if (state.shiftActive) {
        pill.textContent = "Shift Active";
        pill.className = "status-pill active";
        document.getElementById("viewOffline").style.display = "none";
        document.getElementById("viewCheckin").style.display = "block";
    } else {
        pill.textContent = "Portal Offline";
        pill.className = "status-pill inactive";
        document.getElementById("viewOffline").style.display = "block";
        document.getElementById("viewCheckin").style.display = "none";
    }

    // 2. Update the Roster Table
    const tbody = document.getElementById("rosterBody");
    if (!tbody) return;

    const roster = state.roster || [];
    
    if (roster.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:30px; color:#6b7a8d;">No units currently on duty.</td></tr>`;
    } else {
        // Sort roster by check-in order for the display
        const displayRoster = [...roster].sort((a,b) => a.checkInOrder - b.checkInOrder);
        
        tbody.innerHTML = displayRoster.map(u => `
            <tr>
                <td class="callsign-cell" style="font-weight:bold; color:#0a84ff;">${u.callsign || "TBD"}</td>
                <td>${u.username}</td>
                <td><span class="rank-badge rank-${u.rank}">${RANK_LABELS[u.rank]}</span></td>
                <td class="role-cell">${u.roleName || "Operator"}</td>
                <td style="color:#6b7a8d">${u.squad || "D Squad"}</td>
            </tr>
        `).join("");
    }
}

// --- USER ACTIONS ---

async function handleCheckin() {
    const username = document.getElementById("inputUsername").value.trim();
    const rank = document.getElementById("inputRank").value;
    const msgEl = document.getElementById("checkinMsg");
    
    if (!username || !rank) {
        msgEl.textContent = "Please enter username and rank.";
        msgEl.className = "msg error";
        return;
    }

    const state = await getState();
    if (!state.shiftActive) {
        alert("Shift is currently offline.");
        return;
    }

    // Duplicate check
    if (state.roster.find(u => u.username.toLowerCase() === username.toLowerCase())) {
        alert("You are already checked in.");
        return;
    }

    const entry = {
        id: "u_" + Date.now(),
        username: username,
        rank: rank,
        checkInOrder: state.roster.length,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    state.roster.push(entry);
    recalculate(state);
    await saveState(state);
    
    // Clear form
    document.getElementById("inputUsername").value = "";
    
    // Show confirmation and refresh
    msgEl.textContent = "Check-in Successful!";
    msgEl.className = "msg success";
    
    renderPortal(); 
}

// --- REAL-TIME SYNC ---

sbClient.channel('portal-live')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'portal_state' }, () => {
        console.log("Global Update Received");
        renderPortal();
    })
    .subscribe();

// Initial load
renderPortal();