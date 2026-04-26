/**
 * FWPD SWAT | Global App Logic
 * Synchronizes portal state with Supabase
 */

const { RANK_ORDER, RANK_LABELS, ROLE_NAMES, COMMAND_RANKS, COMMAND_CALLSIGNS } = INITIAL_CONFIG;

// --- DATABASE COMMUNICATION ---

/**
 * Fetches the current state from the cloud
 */
async function getState() {
    try {
        const { data, error } = await sbClient
            .from('portal_state')
            .select('state')
            .eq('id', 1)
            .single();

        if (error) throw error;
        
        // Return database state, or fallback to default if empty
        return data ? data.state : {
            shiftActive: false,
            splitMode: false,
            maxUnits: 20,
            slots: {
                COMMANDER: 1, ASST_COMMANDER: 1, LIEUTENANT: 2, 
                SERGEANT: 4, CORPORAL: 4, SENIOR_OPERATOR: 6, OPERATOR: 12
            },
            roster: []
        };
    } catch (err) {
        console.error("Database fetch error:", err);
        return { shiftActive: false, roster: [] };
    }
}

/**
 * Saves a new state to the cloud
 */
async function saveState(newState) {
    try {
        const { error } = await sbClient
            .from('portal_state')
            .update({ state: newState })
            .eq('id', 1);
        
        if (error) throw error;
    } catch (err) {
        console.error("Database save error:", err);
    }
}

// --- CORE LOGIC ---

function isEffectivelySplit(state) {
    if (state.splitMode) return true;
    const squadCount = state.roster.filter(u => !COMMAND_RANKS.includes(u.rank) && !u.specialRole).length;
    return squadCount >= 5;
}

/**
 * Assigns callsigns and roles based on rank and check-in order
 */
function recalculate(state) {
    const cmdMembers = state.roster.filter(u => COMMAND_RANKS.includes(u.rank));
    const squadPool = state.roster.filter(u => !COMMAND_RANKS.includes(u.rank) && !u.specialRole);
    const special = state.roster.filter(u => u.specialRole);

    // Sort by rank priority, then check-in time
    squadPool.sort((a, b) => {
        const ri = RANK_ORDER.indexOf(a.rank) - RANK_ORDER.indexOf(b.rank);
        return ri !== 0 ? ri : a.checkInOrder - b.checkInOrder;
    });

    const split = isEffectivelySplit(state);

    // 1. Command
    cmdMembers.forEach(u => {
        u.callsign = COMMAND_CALLSIGNS[u.rank] || "K-??";
        u.squad = "Command";
        u.roleName = "Command";
    });

    // 2. Squad Pool (D or B/D split)
    if (!split) {
        squadPool.forEach((u, i) => {
            const slot = i + 1;
            u.callsign = `D-0${slot}`;
            u.squad = "D Squad";
            u.roleName = ROLE_NAMES[slot] || `Position ${slot}`;
        });
    } else {
        squadPool.forEach((u, i) => {
            const pairIdx = Math.floor(i / 2);
            const isB = i % 2 === 1;
            const slot = pairIdx + 1;
            u.callsign = `${isB ? "B" : "D"}-0${slot}`;
            u.squad = isB ? "B Squad" : "D Squad";
            u.roleName = ROLE_NAMES[slot] || `Position ${slot}`;
        });
    }

    // 3. Special Units
    let sn = 1, fn = 1;
    special.forEach(u => {
        if (u.specialRole === "SNIPER") {
            u.callsign = `S-0${sn++}`;
            u.squad = "Sniper";
            u.roleName = "Sniper";
        } else if (u.specialRole === "NEGOTIATOR") {
            u.callsign = `F-0${fn++}`;
            u.squad = "Negotiator";
            u.roleName = "Negotiator";
        }
    });
}

// --- RENDER ENGINE ---

async function renderPortal() {
    const state = await getState();
    const pill = document.getElementById("statusPill");
    
    // Status Pill and Views
    if (state.shiftActive) {
        pill.textContent = "Shift Active";
        pill.className = "status-pill active";
        showView("viewCheckin");
    } else {
        pill.textContent = "Portal Offline";
        pill.className = "status-pill inactive";
        showView("viewOffline");
    }

    // Split Mode Badge
    const split = isEffectivelySplit(state);
    const badge = document.getElementById("squadModeBadge");
    if (badge) {
        badge.textContent = split ? "⬛ Split Squad Mode (D + B Active)" : "■ Single Squad Mode (D Only)";
        badge.className = "squad-mode-badge " + (split ? "split" : "single");
    }

    renderRoster(state);
    renderCapacity(state);
}

function showView(id) {
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    const target = document.getElementById(id);
    if (target) target.classList.add("active");
}

function renderRoster(state) {
    const tbody = document.getElementById("rosterBody");
    const countEl = document.getElementById("rosterCount");
    const roster = state.roster || [];
    
    countEl.textContent = `${roster.length} unit${roster.length !== 1 ? "s" : ""} checked in`;
    
    if (!roster.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="empty-state">No units checked in yet</td></tr>`;
        return;
    }
    
    const sorted = [...roster].sort((a, b) => a.checkInOrder - b.checkInOrder);
    tbody.innerHTML = sorted.map(u => `
        <tr>
            <td class="callsign-cell">${u.callsign || "--"}</td>
            <td>${esc(u.username)}</td>
            <td><span class="rank-badge rank-${u.rank}">${RANK_LABELS[u.rank]}</span></td>
            <td class="role-cell">${u.roleName || "--"}</td>
            <td style="font-size:0.85rem;color:var(--text-dim)">${u.squad || "--"}</td>
            <td style="font-family:'Share Tech Mono',monospace;font-size:0.72rem;color:var(--text-dim)">${u.time}</td>
        </tr>
    `).join("");
}

function renderCapacity(state) {
    const max = state.maxUnits || 20;
    const cur = (state.roster || []).length;
    const pct = Math.min(100, (cur / max) * 100);
    
    document.getElementById("capacityText").textContent = `${cur} / ${max}`;
    const fill = document.getElementById("capacityFill");
    fill.style.width = pct + "%";
    fill.className = "capacity-fill" + (pct >= 100 ? " full" : pct >= 75 ? " warn" : "");
}

// --- USER ACTIONS ---

async function handleCheckin() {
    const username = document.getElementById("inputUsername").value.trim();
    const rank = document.getElementById("inputRank").value;
    const msgEl = document.getElementById("checkinMsg");
    
    msgEl.className = "msg";
    if (!username || !rank) return showMsg(msgEl, "error", "Enter username and rank.");

    const state = await getState();
    if (!state.shiftActive) return showMsg(msgEl, "error", "Portal is offline.");

    // Check for duplicates
    const existing = state.roster.find(u => u.username.toLowerCase() === username.toLowerCase());
    if (existing) {
        showMsg(msgEl, "info", `Already checked in as ${existing.callsign}.`);
        showAssignmentCard(existing);
        return;
    }

    // Check capacity
    if (state.roster.length >= state.maxUnits) {
        return showMsg(msgEl, "error", "Maximum unit capacity reached.");
    }

    // Check rank slots
    const usedForRank = state.roster.filter(u => u.rank === rank).length;
    if (usedForRank >= (state.slots[rank] || 0)) {
        return showMsg(msgEl, "error", `No available slots for ${RANK_LABELS[rank]}.`);
    }

    const now = new Date();
    const entry = {
        id: "u_" + Date.now(),
        username,
        rank,
        checkInOrder: state.roster.length,
        time: now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true }),
        callsign: null, squad: null, roleName: null, specialRole: null
    };

    state.roster.push(entry);
    recalculate(state);
    await saveState(state);
    
    const assigned = state.roster.find(u => u.id === entry.id);
    showMsg(msgEl, "success", `Assignment Confirmed: ${assigned.callsign}`);
    showAssignmentCard(assigned);
    renderPortal();
}

function showAssignmentCard(u) {
    document.getElementById("assignmentResult").style.display = "block";
    const parts = (u.callsign || "--").split("-");
    document.getElementById("displayCallsign").innerHTML = parts.length === 2 ? `<span>${parts[0]}</span>-${parts[1]}` : u.callsign;
    document.getElementById("displayRole").textContent = u.roleName || "--";
    document.getElementById("displayUsername").textContent = u.username;
    document.getElementById("displayRank").textContent = RANK_LABELS[u.rank] || u.rank;
    document.getElementById("displaySquad").textContent = u.squad || "--";
    document.getElementById("displayTime").textContent = u.time;
}

// --- REAL-TIME SYNC ---

// Listen for changes from other users
sbClient.channel('portal-live')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'portal_state' }, () => {
        renderPortal();
        // If the admin is open, sync those lists too
        if (typeof syncAdminPanel === "function" && document.getElementById("adminPanel").style.display !== "none") {
            syncAdminPanel();
        }
    })
    .subscribe();

// Helper Functions
function showMsg(el, type, text) { el.className = "msg " + type; el.textContent = text; }
function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

// Initial Launch
renderPortal();