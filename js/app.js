/**
 * FWPD SWAT | Global App Logic
 */

const { RANK_ORDER, RANK_LABELS, ROLE_NAMES, COMMAND_RANKS, COMMAND_CALLSIGNS } = INITIAL_CONFIG;

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
                ...baseDefaults, ...data.state,
                slots: { ...baseDefaults.slots, ...(data.state.slots || {}) },
                roster: data.state.roster || []
            };
        }
        return baseDefaults;
    } catch (err) { return getDefaults(); }
}

async function saveState(newState) {
    try {
        await sbClient.from('portal_state').update({ state: newState }).eq('id', 1);
    } catch (err) { console.error("Save Error", err); }
}

function recalculate(state) {
    const roster = state.roster || [];
    const cmdMembers = roster.filter(u => COMMAND_RANKS.includes(u.rank));
    const specialPool = roster.filter(u => u.specialRole === "SNIPER" || u.specialRole === "NEGOTIATOR");
    const squadPool = roster.filter(u => !COMMAND_RANKS.includes(u.rank) && !u.specialRole);

    squadPool.sort((a, b) => (RANK_ORDER.indexOf(a.rank) - RANK_ORDER.indexOf(b.rank)) || (a.checkInOrder - b.checkInOrder));

    cmdMembers.forEach(u => {
        u.callsign = COMMAND_CALLSIGNS[u.rank] || "K-??";
        u.squad = "Command";
        u.roleName = "Command";
    });

    squadPool.forEach((u, i) => {
        const isSquadB = state.splitMode || i >= 4;
        const slot = (i % 4) + 1;
        u.callsign = `${isSquadB ? "B" : "D"}-0${slot}`;
        u.squad = isSquadB ? "Squad 2" : "Squad 1";
        u.roleName = u.manualRoleName || ROLE_NAMES[slot] || "Operator";
    });

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
}

async function renderPortal() {
    const state = await getState();
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

    const max = state.maxUnits || 20;
    const cur = (state.roster || []).length;
    const capText = document.getElementById("capacityText");
    const capFill = document.getElementById("capacityFill");
    if(capText) capText.textContent = `${cur} / ${max}`;
    if(capFill) capFill.style.width = Math.min(100, (cur/max)*100) + "%";

    const tbody = document.getElementById("rosterBody");
    if (!tbody) return;

    if (cur === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:30px; color:#6b7a8d;">No units currently on duty.</td></tr>`;
    } else {
        tbody.innerHTML = state.roster.sort((a,b) => a.checkInOrder - b.checkInOrder).map(u => `
            <tr>
                <td class="callsign-cell" style="font-weight:bold; color:#0a84ff;">${u.callsign || "TBD"}</td>
                <td>${u.username}</td>
                <td><span class="rank-badge rank-${u.rank}">${RANK_LABELS[u.rank]}</span></td>
                <td class="role-cell">${u.roleName || "Operator"}</td>
                <td style="color:#6b7a8d">${u.squad}</td>
            </tr>
        `).join("");
    }
}

async function handleCheckin() {
    const username = document.getElementById("inputUsername").value.trim();
    const rank = document.getElementById("inputRank").value;
    const msgEl = document.getElementById("checkinMsg");
    
    if (!username || !rank) return;

    const state = await getState();
    if (state.roster.length >= (state.maxUnits || 20)) return alert("Shift full.");

    state.roster.push({
        id: "u_" + Date.now(),
        username, rank,
        checkInOrder: state.roster.length,
        manualRoleName: null, specialRole: null
    });

    recalculate(state);
    await saveState(state);
    
    document.getElementById("inputUsername").value = "";
    msgEl.textContent = "Check-in Successful!";
    renderPortal(); 
}

sbClient.channel('portal-sync').on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'portal_state' }, () => {
    renderPortal();
    if(typeof syncAdminPanel === "function") syncAdminPanel();
}).subscribe();

renderPortal();