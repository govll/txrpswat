/**
 * FWPD SWAT | Global App Logic
 * Integrated with Supervisor Tools & Capacity Management
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
    
    // Separate units into categories based on Supervisor manual assignments
    const cmdMembers = roster.filter(u => COMMAND_RANKS.includes(u.rank));
    const specialPool = roster.filter(u => u.specialRole === "SNIPER" || u.specialRole === "NEGOTIATOR");
    const squadPool = roster.filter(u => !COMMAND_RANKS.includes(u.rank) && !u.specialRole);

    // Sort squad pool by Rank then Check-in time
    squadPool.sort((a, b) => {
        const ri = RANK_ORDER.indexOf(a.rank) - RANK_ORDER.indexOf(b.rank);
        return ri !== 0 ? ri : a.checkInOrder - b.checkInOrder;
    });

    // 1. Assign Command (K-01, K-02)
    cmdMembers.forEach(u => {
        u.callsign = COMMAND_CALLSIGNS[u.rank] || "K-??";
        u.squad = "Command";
        u.roleName = "Command";
    });

    // 2. Assign Squads (D-01 thru D-04, then B-01 thru B-04)
    squadPool.forEach((u, i) => {
        // If splitMode is on, or we have more than 4 units, start Squad 2 (B)
        const isSquadB = state.splitMode || i >= 4;
        const squadIndex = i % 4; // Reset 1-4 for each squad
        const slot = squadIndex + 1;
        
        u.callsign = `${isSquadB ? "B" : "D"}-0${slot}`;
        u.squad = isSquadB ? "Squad 2" : "Squad 1";
        
        // Use manual role (Point/Assault etc) if supervisor set one, otherwise auto-assign
        u.roleName = u.manualRoleName || ROLE_NAMES[slot] || "Operator";
    });

    // 3. Assign Specials (S-01, F-01)
    let sCount = 1;
    let fCount = 1;
    specialPool.forEach(u => {
        if (u.specialRole === "SNIPER") {
            u.callsign = `S-0${sCount++}`;
            u.squad = "Specialist";
            u.roleName = "Sniper";
        } else {
            u.callsign = `F-0${fCount++}`;
            u.squad = "Specialist";
            u.roleName = "Negotiator";
        }
    });
}

// --- RENDER ENGINE ---

async function renderPortal() {
    const state = await getState();
    const pill = document.getElementById("statusPill");
    
    // 1. Update Shift Status View
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

    // 2. Update Capacity UI
    const max = state.maxUnits || 20;
    const cur = (state.roster || []).length;
    const pct = Math.min(100, (cur / max) * 100);
    
    const capText = document.getElementById("capacityText");
    const capFill = document.getElementById("capacityFill");
    if(capText) capText.textContent = `${cur} / ${max}`;
    if(capFill) {
        capFill.style.width = pct + "%";
        capFill.style.background = pct >= 100 ? "#ff4444" : (pct >= 80 ? "#ffbb33" : "#0a84ff");
    }

    // 3. Update Squad Mode Badge
    const badge = document.getElementById("squadModeBadge");
    if(badge) {
        badge.textContent = state.splitMode ? "■ Multi-Squad Mode (Forced)" : (cur > 5 ? "■ Multi-Squad Mode (Auto)" : "■ Single Squad Mode");
        badge.className = "squad-mode-badge " + (state.splitMode || cur > 5 ? "split" : "single");
    }

    // 4. Update Roster Table
    const tbody = document.getElementById("rosterBody");
    if (!tbody) return;

    const roster = state.roster || [];
    if (roster.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:30px; color:#6b7a8d;">No units currently on duty.</td></tr>`;
    } else {
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
    const usernameInput = document.getElementById("inputUsername");
    const rankInput = document.getElementById("inputRank");
    const msgEl = document.getElementById("checkinMsg");
    
    const username = usernameInput.value.trim();
    const rank = rankInput.value;
    
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

    // CHECK CAPACITY
    if (state.roster.length >= (state.maxUnits || 20)) {
        alert("Shift is currently full. Capacity reached.");
        return;
    }

    if (state.roster.find(u => u.username.toLowerCase() === username.toLowerCase())) {
        alert("You are already checked in.");
        return;
    }

    const entry = {
        id: "u_" + Date.now(),
        username: username,
        rank: rank,
        checkInOrder: state.roster.length,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        manualRoleName: null,
        specialRole: null
    };

    state.roster.push(entry);
    recalculate(state);
    
    await saveState(state);
    
    // UI Feedback
    usernameInput.value = "";
    msgEl.textContent = "Check-in Successful!";
    msgEl.className = "msg success";
    
    // Show user their personal result
    const assigned = state.roster.find(u => u.id === entry.id);
    if(assigned) {
        document.getElementById("assignmentResult").style.display = "block";
        document.getElementById("displayCallsign").textContent = assigned.callsign;
        document.getElementById("displayRole").textContent = assigned.roleName;
        document.getElementById("displaySquad").textContent = assigned.squad;
    }

    renderPortal(); 
}

// --- REAL-TIME SYNC ---

sbClient.channel('portal-live')
    .on('postgres_changes', { 
        event: 'UPDATE', 
        schema: 'public', 
        table: 'portal_state' 
    }, payload => {
        renderPortal();
        // If supervisor was open, sync the list too
        if(typeof syncAdminPanel === "function") syncAdminPanel();
    })
    .subscribe();

renderPortal();