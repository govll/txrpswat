/**
 * FWPD SWAT | Global App Logic
 * Optimized for real-time reactivity and rank-based sorting.
 */

const { RANK_ORDER, RANK_LABELS, ROLE_NAMES, COMMAND_RANKS, COMMAND_CALLSIGNS } = INITIAL_CONFIG;

// Persistent session tracking
let currentUserId = localStorage.getItem("swat_session_id") || null;

// --- DATABASE COMMUNICATION ---

async function getState() {
    try {
        const { data, error } = await sbClient.from('portal_state').select('state').eq('id', 1).single();
        // Default maxUnits is now 5
        if (error || !data) return { roster: [], shiftActive: false, maxUnits: 5, splitMode: false };
        return data.state;
    } catch (err) { return { roster: [], shiftActive: false }; }
}

async function saveState(newState) {
    try {
        // We recalculate right before saving to ensure the DB is always correct
        recalculate(newState);
        await sbClient.from('portal_state').update({ state: newState }).eq('id', 1);
    } catch (err) { console.error("Database Save Failed", err); }
}

// --- CORE LOGIC: Rank Order & Specialist Pinning ---

function recalculate(state) {
    if (!state || !state.roster) return;
    const roster = state.roster;
    
    // --- START RELEVANT CHANGE ---
    // AUTO-SWAP: When roster hits 5+, automatically enable splitMode
    if (roster.length >= 5 && !state.splitMode) {
        state.splitMode = true;
    }
    // --- END RELEVANT CHANGE ---
    
    // 1. Separate into pools
    const cmdMembers = roster.filter(u => COMMAND_RANKS.includes(u.rank));
    const specialPool = roster.filter(u => (u.specialRole === "SNIPER" || u.specialRole === "NEGOTIATOR") && !COMMAND_RANKS.includes(u.rank));
    const squadPool = roster.filter(u => !COMMAND_RANKS.includes(u.rank) && !u.specialRole);

    // 2. Sort Squad units by Rank Order (High to Low), then Check-in Order
    squadPool.sort((a, b) => {
        const ri = RANK_ORDER.indexOf(a.rank) - RANK_ORDER.indexOf(b.rank);
        return ri !== 0 ? ri : a.checkInOrder - b.checkInOrder;
    });

    // 3. Assign Command IDs (K-01...)
    cmdMembers.forEach(u => {
        u.callsign = COMMAND_CALLSIGNS[u.rank] || "K-??";
        u.squad = "Command";
        u.roleName = "Command";
    });

    // 4. Assign Squad IDs (D-01... / B-01...)
    squadPool.forEach((u, i) => {
        const isSquadB = state.splitMode || i >= 4;
        const slot = (i % 4) + 1;
        u.callsign = `${isSquadB ? "B" : "D"}-0${slot}`;
        u.squad = isSquadB ? "Squad 2" : "Squad 1";
        // Manual override takes priority, else use standard roles (Point, Assault, etc)
        u.roleName = u.manualRoleName || ROLE_NAMES[slot] || "Operator";
    });

    // 5. Assign Specialist IDs (S-01... / F-01...)
    let sCount = 1, fCount = 1;
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

    // 6. FINAL ASSEMBLY: This ensures the table order is: Command -> Squads -> Specialists
    state.roster = [
        ...cmdMembers.sort((a, b) => RANK_ORDER.indexOf(a.rank) - RANK_ORDER.indexOf(b.rank)),
        ...squadPool,
        ...specialPool
    ];
}

// --- RENDER ENGINE ---

function renderPortal(state) {
    if (!state) return;

    // Update Shift Status
    const pill = document.getElementById("statusPill");
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

    // Update Capacity
    const max = state.maxUnits || 5; // Defaulted to 5
    const cur = (state.roster || []).length;
    if(document.getElementById("capacityText")) document.getElementById("capacityText").textContent = `${cur} / ${max}`;
    if(document.getElementById("capacityFill")) document.getElementById("capacityFill").style.width = Math.min(100, (cur/max)*100) + "%";

    // Update Personal Assignment Result (Auto-syncs when supervisor changes your role)
    const personalCard = document.getElementById("assignmentResult");
    if (currentUserId) {
        const myData = state.roster.find(u => u.id === currentUserId);
        if (myData) {
            personalCard.style.display = "block";
            document.getElementById("displayCallsign").textContent = myData.callsign;
            document.getElementById("displayRole").textContent = myData.roleName;
            document.getElementById("displaySquad").textContent = myData.squad;
        } else {
            personalCard.style.display = "none";
        }
    }

    // Update Main Table
    const tbody = document.getElementById("rosterBody");
    if (!tbody) return;

    if (cur === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:30px; color:#6b7a8d;">No units currently on duty.</td></tr>`;
    } else {
        tbody.innerHTML = state.roster.map(u => `
            <tr style="${u.id === currentUserId ? 'background: rgba(10, 132, 255, 0.08);' : ''}">
                <td class="callsign-cell" style="font-weight:bold; color:#0a84ff;">${u.callsign || "TBD"}</td>
                <td style="${u.id === currentUserId ? 'color:#fff; font-weight:bold;' : ''}">${u.username} ${u.id === currentUserId ? '<span style="font-size:8px; opacity:0.5;">(YOU)</span>' : ''}</td>
                <td><span class="rank-badge rank-${u.rank}">${RANK_LABELS[u.rank]}</span></td>
                <td class="role-cell">${u.roleName || "Operator"}</td>
                <td style="color:#6b7a8d">${u.squad}</td>
            </tr>
        `).join("");
    }
}

// --- USER ACTIONS ---

async function handleCheckin() {
    const username = document.getElementById("inputUsername").value.trim();
    const rank = document.getElementById("inputRank").value;
    if (!username || !rank) return;

    const state = await getState();
    // Default capacity check is now 5
    if (state.roster.length >= (state.maxUnits || 5)) return alert("Shift full.");
    if (state.roster.find(u => u.username.toLowerCase() === username.toLowerCase())) return alert("Already checked in.");

    const newId = "u_" + Date.now();
    currentUserId = newId;
    localStorage.setItem("swat_session_id", newId);

    state.roster.push({
        id: newId,
        username, rank,
        checkInOrder: state.roster.length,
        manualRoleName: null, specialRole: null
    });

    await saveState(state);
    document.getElementById("inputUsername").value = "";
}

// REAL-TIME SYNC ENGINE
sbClient.channel('portal-sync').on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'portal_state' }, (payload) => {
    const newState = payload.new.state;
    // We recalculate locally on sync to ensure UI logic matches exactly
    recalculate(newState);
    renderPortal(newState);
    if(typeof syncAdminPanel === "function") syncAdminPanel(newState);
}).subscribe();

// Initial Load
getState().then(s => { recalculate(s); renderPortal(s); });