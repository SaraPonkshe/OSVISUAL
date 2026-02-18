\import { supabase } from "./supabaseClient.js";
import { CPU } from "./cpuGame.js";

function randomCode(len = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}
function randomHostKey() {
  return crypto.randomUUID() + "-" + crypto.randomUUID();
}

async function createRoom() {
  const join_code = randomCode(6);
  const host_key = randomHostKey();

  const { data, error } = await supabase
    .from("game_rooms")
    .insert({ join_code, host_key, status: "waiting" })
    .select()
    .single();

  if (error) throw error;

  localStorage.setItem("room_id", data.id);
  localStorage.setItem("join_code", join_code);
  localStorage.setItem("host_key", host_key);

  return data;
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
    ? players.map(p => `<div class="badge">${p.display_name}</div>`).join(" ")
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
  // clear old questions if host starts again
  await supabase.from("game_questions").delete().eq("room_id", room_id);

  // generate 10 questions
  const questions = [];
  for (let i = 1; i <= 10; i++) {
    const q = CPU.randomQuestionFromUI();
    questions.push({ room_id, q_index: i, payload: q, correct: {} });
  }

  const ins = await supabase.from("game_questions").insert(questions);
  if (ins.error) throw ins.error;

  // mark room live AFTER questions exist
  const upd = await supabase
    .from("game_rooms")
    .update({ status: "live", started_at: new Date().toISOString() })
    .eq("id", room_id);

  if (upd.error) throw upd.error;
}

/* -------------------- LIVE UPDATES (Realtime + Poll fallback) -------------------- */

let activeChannels = [];
let pollTimer = null;

function cleanupLive() {
  activeChannels.forEach(ch => supabase.removeChannel(ch));
  activeChannels = [];
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

async function setupLive(room_id, setLastLB) {
  cleanupLive();

  // 1) initial paint
  renderPlayers(await fetchPlayers(room_id));
  const lb0 = await fetchLeaderboard(room_id);
  renderLeaderboard(lb0);
  setLastLB(lb0);

  // 2) realtime subscriptions (if they work, great)
  const chPlayers = supabase
    .channel("players-" + room_id)
    .on("postgres_changes",
      { event: "*", schema: "public", table: "game_players", filter: `room_id=eq.${room_id}` },
      async () => renderPlayers(await fetchPlayers(room_id))
    )
    .subscribe();

  const chAnswers = supabase
    .channel("answers-" + room_id)
    .on("postgres_changes",
      { event: "*", schema: "public", table: "game_answers", filter: `room_id=eq.${room_id}` },
      async () => {
        const lb = await fetchLeaderboard(room_id);
        renderLeaderboard(lb);
        setLastLB(lb);
      }
    )
    .subscribe();

  activeChannels.push(chPlayers, chAnswers);

  // 3) POLL fallback every 1 second (fixes “updates only after refresh”)
  pollTimer = setInterval(async () => {
    try {
      renderPlayers(await fetchPlayers(room_id));
      const lb = await fetchLeaderboard(room_id);
      renderLeaderboard(lb);
      setLastLB(lb);
    } catch (e) {
      // ignore intermittent errors
    }
  }, 1000);
}

export async function initHostPage() {
  CPU.algorithmChanged();
  document.getElementById("algorithm").addEventListener("change", CPU.algorithmChanged);

  const createBtn = document.getElementById("createRoomBtn");
  const startBtn = document.getElementById("startBtn");
  const dlBtn = document.getElementById("downloadBtn");

  let room_id = localStorage.getItem("room_id") || null;
  let lastLB = [];
  const setLastLB = (rows) => (lastLB = rows || []);

  dlBtn.onclick = () => downloadCSV(lastLB);

  // show code if exists
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
    const room = await createRoom();
    room_id = room.id;

    document.getElementById("codeBox").innerHTML = `<span class="badge">CODE: ${room.join_code}</span>`;
    document.getElementById("joinLink").textContent = `Open join.html?code=${room.join_code}`;
    document.getElementById("joinLink").href = `join.html?code=${room.join_code}`;

    await setupLive(room_id, setLastLB);
  };

  startBtn.onclick = async () => {
    if (!room_id) return alert("Create a room first.");
    await startGame(room_id);
    alert("Game started! Players will start WITHOUT refreshing now.");
  };
}