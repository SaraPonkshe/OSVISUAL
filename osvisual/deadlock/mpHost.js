import { supabase } from "./supabaseClient.js";
import { BankerLogic } from "./bankersGame.js";

function randomCode(len = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}
function randomHostKey() {
  const uuid = () =>
    window.crypto?.randomUUID
      ? window.crypto.randomUUID()
      : Math.random().toString(36).substring(2, 10) + Date.now();

  return uuid() + "-" + uuid();
}

async function createRoom() {
  console.log("🔧 createRoom() called");
  const join_code = randomCode(6);
  const host_key = randomHostKey();
  
  console.log("📝 Attempting to insert room with code:", join_code);
  console.log("Supabase config test - URL:", supabase.supabaseUrl);

  try {
    const { data, error } = await supabase
      .from("game_rooms")
      .insert({ join_code, host_key, status: "waiting" })
      .select()
      .single();

    if (error) {
      console.error("❌ Supabase insert error:", error);
      console.error("Error details:", {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint
      });
      alert("Error creating room:\n" + (error.message || JSON.stringify(error)));
      return null;
    }

    console.log("✓ Room created in Supabase:", data);
    localStorage.setItem("room_id", data.id);
    localStorage.setItem("join_code", join_code);
    localStorage.setItem("host_key", host_key);

    return data;
  } catch (err) {
    console.error("❌ Network/fetch error:", err);
    alert("Network error: " + err.message + "\n\nMake sure your Supabase project has the 'game_rooms' table created.");
    return null;
  }
}

async function fetchPlayers(room_id) {
  const { data, error } = await supabase
    .from("game_players")
    .select("display_name, joined_at")
    .eq("room_id", room_id)
    .order("joined_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

function renderPlayers(players) {
  const el = document.getElementById("playersList");
  el.innerHTML = players.length
    ? players.map(p => `<div class="player-badge">${p.display_name}</div>`).join(" ")
    : `<span class="small">No players yet…</span>`;
}

async function fetchLeaderboard(room_id) {
  const { data, error } = await supabase
    .from("v_leaderboard")
    .select("*")
    .eq("room_id", room_id)
    .order("score", { ascending: false })
    .order("total_time_ms", { ascending: true });
  if (error) throw error;
  return data || [];
}

function renderLeaderboard(rows) {
  const tbody = document.getElementById("lbBody");
  tbody.innerHTML = rows.map((r, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${r.display_name}</td>
      <td>${r.score}</td>
      <td>${Math.round((r.accuracy || 0) * 100)}%</td>
      <td>${(r.total_time_ms / 1000).toFixed(2)}s</td>
      <td>${r.answered}</td>
    </tr>
  `).join("");
}

function downloadCSV(rows) {
  const header = ["rank","name","score","accuracy","total_time_ms","answered"];
  const lines = [header.join(",")];
  rows.forEach((r, idx) => {
    lines.push([
      idx + 1,
      `"${String(r.display_name).replaceAll('"','""')}"`,
      r.score,
      r.accuracy,
      r.total_time_ms,
      r.answered
    ].join(","));
  });
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "leaderboard.csv";
  a.click();
  URL.revokeObjectURL(url);
}

async function startGame(room_id) {
  await supabase.from("game_questions").delete().eq("room_id", room_id);

  const numProcesses = parseInt(document.getElementById("numProcesses").value, 10) || 4;
  const numResources = parseInt(document.getElementById("numResources").value, 10) || 3;

  const questions = [];
  for (let i = 1; i <= 10; i++) {
    const q = BankerLogic.generateQuestionFromUI(numProcesses, numResources);
    questions.push({ room_id, q_index: i, payload: q, correct: {} });
  }

  const ins = await supabase.from("game_questions").insert(questions);
  if (ins.error) throw ins.error;

  const upd = await supabase
    .from("game_rooms")
    .update({ status: "live", started_at: new Date().toISOString() })
    .eq("id", room_id);

  if (upd.error) throw upd.error;
}

let activeChannels = [];
let pollTimer = null;

function cleanupLive() {
  activeChannels.forEach(ch => supabase.removeChannel(ch));
  activeChannels = [];
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

async function setupLive(room_id, setLastLB) {
  console.log("🔄 Setting up live updates for room:", room_id);
  cleanupLive();

  try {
    const players = await fetchPlayers(room_id);
    console.log("✓ Initial player fetch:", players);
    renderPlayers(players);
  } catch (e) {
    console.warn("⚠️ Could not fetch players:", e.message);
    renderPlayers([]);
  }

  try {
    const lb0 = await fetchLeaderboard(room_id);
    console.log("✓ Initial leaderboard fetch:", lb0);
    renderLeaderboard(lb0);
    setLastLB(lb0);
  } catch (e) {
    console.warn("⚠️ Could not fetch leaderboard:", e.message);
    renderLeaderboard([]);
  }

  try {
    console.log("📡 Subscribing to player changes...");
    const chPlayers = supabase
      .channel("players-" + room_id)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "game_players", filter: `room_id=eq.${room_id}` },
        async () => {
          console.log("🔔 Player change detected");
          try {
            const updated = await fetchPlayers(room_id);
            console.log("✓ Players updated:", updated);
            renderPlayers(updated);
          } catch (e) {
            console.error("Error updating players:", e.message);
          }
        }
      )
      .subscribe((status) => {
        console.log("📡 Players subscription status:", status);
      });

    const chAnswers = supabase
      .channel("answers-" + room_id)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "game_answers", filter: `room_id=eq.${room_id}` },
        async () => {
          console.log("🔔 Answer change detected");
          try {
            const lb = await fetchLeaderboard(room_id);
            console.log("✓ Leaderboard updated:", lb);
            renderLeaderboard(lb);
            setLastLB(lb);
          } catch (e) {
            console.error("Error updating leaderboard:", e.message);
          }
        }
      )
      .subscribe((status) => {
        console.log("📡 Answers subscription status:", status);
      });

    activeChannels.push(chPlayers, chAnswers);
    console.log("✓ Real-time subscriptions active");
  } catch (e) {
    console.warn("⚠️ Real-time subscriptions failed:", e.message);
  }

  // Polling to ensure we catch updates if subscriptions fail
  pollTimer = setInterval(async () => {
    try {
      const players = await fetchPlayers(room_id);
      renderPlayers(players);
      
      const lb = await fetchLeaderboard(room_id);
      renderLeaderboard(lb);
      setLastLB(lb);
    } catch (e) {
      console.warn("Poll update error:", e.message);
    }
  }, 2000); // Poll every 2 seconds to reduce flickering
  
  console.log("✓ Live polling started (2s interval)");
}

export async function initHostPage() {
  console.log("🎮 initHostPage called - setting up host dashboard");
  
  const createBtn = document.getElementById("createRoomBtn");
  const startBtn = document.getElementById("startBtn");
  const dlBtn = document.getElementById("downloadBtn");
  const clearBtn = document.getElementById("clearBtn");
  
  console.log("✓ Buttons found:", { createBtn: !!createBtn, startBtn: !!startBtn, dlBtn: !!dlBtn, clearBtn: !!clearBtn });

  let room_id = localStorage.getItem("room_id") || null;
  let lastLB = [];
  const setLastLB = (rows) => (lastLB = rows || []);

  dlBtn.onclick = () => downloadCSV(lastLB);
  
  clearBtn.onclick = () => {
    if (confirm("Clear game session and create a new room?")) {
      localStorage.removeItem("room_id");
      localStorage.removeItem("join_code");
      localStorage.removeItem("host_key");
      room_id = null;
      document.getElementById("codeBox").innerHTML = "";
      document.getElementById("joinLink").href = "";
      document.getElementById("joinLink").textContent = "";
      alert("Game cleared. Click 'Create Game Room' to start fresh.");
    }
  };

  const storedCode = localStorage.getItem("join_code");
  if (storedCode) {
    document.getElementById("codeBox").innerHTML = `<span class="badge">CODE: ${storedCode}</span>`;
    document.getElementById("joinLink").textContent = `Open join.html?code=${storedCode}`;
    document.getElementById("joinLink").href = `join.html?code=${storedCode}`;
  }

  if (room_id) {
    await setupLive(room_id, setLastLB);
  }

  createBtn.onclick = async () => {
    console.log("🔘 Create Room button clicked");
    try {
      const room = await createRoom();
      console.log("✓ Room created:", room);
      if (!room) return;

      room_id = room.id;

      document.getElementById("codeBox").innerHTML = `<span class="badge">CODE: ${room.join_code}</span>`;
      document.getElementById("joinLink").textContent = `Open join.html?code=${room.join_code}`;
      document.getElementById("joinLink").href = `join.html?code=${room.join_code}`;

      await setupLive(room_id, setLastLB);
    } catch(err) {
      console.error("❌ Unexpected error in createBtn handler:", err);
      alert("Unexpected error: " + err.message);
    }
  };

  startBtn.onclick = async () => {
    if (!room_id) return alert("Create a room first.");
    await startGame(room_id);
    alert("Game started! Players will start WITHOUT refreshing now.");
  };
}
