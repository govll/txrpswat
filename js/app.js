const { RANK_ORDER, RANK_LABELS, ROLE_NAMES, COMMAND_RANKS, COMMAND_CALLSIGNS } = INITIAL_CONFIG;

async function getState() {
    try {
        const { data, error } = await sbClient.from('portal_state').select('state').eq('id', 1).single();
        if (error) throw error;
        return data ? data.state : { shiftActive: false, roster: [] };
    } catch (err) {
        console.error("Error fetching state:", err);
        return { shiftActive: false, roster: [] };
    }
}

async function saveState(newState) {
    await sbClient.from('portal_state').update({ state: newState }).eq('id', 1);
}

function recalculate(state) {
    const cmdMembers = state.roster.filter(u => COMMAND_RANKS.includes(u.rank));
    const squadPool = state.roster.filter(u => !COMMAND_RANKS.includes(u.rank));

    squadPool.sort((a,b) => RANK_ORDER.indexOf(a.rank) - RANK_ORDER.indexOf(b.rank));

    cmdMembers.forEach(u => {
        u.callsign = COMMAND_CALLSIGNS[u.rank] || "K-??";
        u.squad = "Command";
        u.roleName = "Command";
    });

    squadPool.forEach((u, i) => {
        const num = i + 1;
        u.callsign = `D-0${num}`;
        u.squad = "D Squad";
        u.roleName = ROLE_NAMES[num] || "Operator";
    });
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

    const tbody = document.getElementById("rosterBody");
    if (!state.roster || state.roster.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:20px; color:gray;">No units checked in</td></tr>`;
    } else {
        tbody.innerHTML = state.roster.map(u => `
            <tr>
                <td class="callsign-cell">${u.callsign}</td>
                <td>${u.username}</td>
                <td>${RANK_LABELS[u.rank]}</td>
                <td>${u.roleName}</td>
                <td>${u.squad}</td>
            </tr>
        `).join("");
    }
}

// Live Listener
sbClient.channel('state-changes')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'portal_state' }, renderPortal)
    .subscribe();

async function handleCheckin() {
    const user = document.getElementById("inputUsername").value.trim();
    const rank = document.getElementById("inputRank").value;
    if(!user || !rank) return alert("Please enter username and rank");

    const state = await getState();
    if(state.roster.find(u => u.username.toLowerCase() === user.toLowerCase())) return alert("Already checked in");

    state.roster.push({ username: user, rank: rank });
    recalculate(state);
    await saveState(state);
    renderPortal();
}

renderPortal();