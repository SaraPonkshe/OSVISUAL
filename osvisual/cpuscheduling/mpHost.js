import { supabase } from "./supabaseClient.js";
import { CPU } from "./cpuGame.js";

/* ---------------- RANDOM CODE GENERATORS ---------------- */

function randomCode(len = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  return Array.from({ length: len }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join("");
}

function randomHostKey() {
  const uuid = () =>
    window.crypto?.randomUUID
      ? window.crypto.randomUUID()
      : Math.random().toString(36).substring(2, 10) + Date.now();

  return uuid() + "-" + uuid();
}

/* ---------------- ROOM CREATION ---------------- */

async function createRoom() {
  const join_code = randomCode(6);
  const host_key = randomHostKey();

  const { data, error } = await supabase
    .from("game_rooms")
    .insert({
      join_code,
      host_key,
      status: "waiting"
    })
    .select()
    .single();

  if (error) throw error;

  localStorage.setItem("room_id", data.id);
  localStorage.setItem("join_code", join_code);
  localStorage.setItem("host_key", host_key);

  return data;
}

/* ---------------- PLAYERS ---------------- */

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

  if (!el) return;

  el.innerHTML = players.length
    ? players
        .map(p => `<span class="player-badge">${p.display_name}</span>`)
        .join("")
    : `<span class="small">No players yet…</span>`;
}

/* ---------------- LEADERBOARD ---------------- */

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

  if (!tbody) return;

  tbody.innerHTML = rows
    .map(
      (r, i) => `
<tr>
<td>${i + 1}</td>
<td>${r.display_name}</td>
<td>${r.score}</td>
<td>${Math.round((r.accuracy || 0) * 100)}%</td>
<td>${(r.total_time_ms / 1000).toFixed(2)}s</td>
<td>${r.answered}</td>
</tr>`
    )
    .join("");
}

/* ---------------- DOWNLOAD CSV ---------------- */

function downloadCSV(rows) {

  const header = [
    "rank",
    "name",
    "score",
    "accuracy",
    "total_time_ms",
    "answered"
  ];

  const lines = [header.join(",")];

  rows.forEach((r, idx) => {
    lines.push(
      [
        idx + 1,
        `"${String(r.display_name).replaceAll('"','""')}"`,
        r.score,
        r.accuracy,
        r.total_time_ms,
        r.answered
      ].join(",")
    );
  });

  const blob = new Blob([lines.join("\n")], {
    type: "text/csv;charset=utf-8;"
  });

  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "leaderboard.csv";
  a.click();

  URL.revokeObjectURL(url);
}

/* ---------------- START GAME ---------------- */

async function startGame(room_id) {

  await supabase
    .from("game_questions")
    .delete()
    .eq("room_id", room_id);

  const questions = [];

  for (let i = 1; i <= 10; i++) {

    const q = CPU.randomQuestionFromUI();

    questions.push({
      room_id,
      q_index: i,
      payload: q,
      correct: {}
    });
  }

  const ins = await supabase
    .from("game_questions")
    .insert(questions);

  if (ins.error) throw ins.error;

  const upd = await supabase
    .from("game_rooms")
    .update({
      status: "live",
      started_at: new Date().toISOString()
    })
    .eq("id", room_id);

  if (upd.error) throw upd.error;
}

/* ---------------- LIVE SYSTEM ---------------- */

let channels = [];
let pollTimer = null;

function cleanup() {

  channels.forEach(ch => supabase.removeChannel(ch));
  channels = [];

  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

async function setupLive(room_id, setLastLB) {

  cleanup();

  const pullPlayers = async () =>
    renderPlayers(await fetchPlayers(room_id));

  const pullLB = async () => {

    const lb = await fetchLeaderboard(room_id);

    renderLeaderboard(lb);

    setLastLB(lb);
  };

  await pullPlayers();
  await pullLB();

  const chPlayers = supabase
    .channel("players-" + room_id)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "game_players",
        filter: `room_id=eq.${room_id}`
      },
      pullPlayers
    )
    .subscribe();

  const chAnswers = supabase
    .channel("answers-" + room_id)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "game_answers",
        filter: `room_id=eq.${room_id}`
      },
      pullLB
    )
    .subscribe();

  channels.push(chPlayers, chAnswers);

  pollTimer = setInterval(async () => {

    try {

      await pullPlayers();
      await pullLB();

    } catch {}
    
  }, 1200);
}

/* ---------------- PAGE INIT ---------------- */

export async function initHostPage() {

  CPU.algorithmChanged();

  document
    .getElementById("algorithm")
    ?.addEventListener("change", CPU.algorithmChanged);

  const createBtn = document.getElementById("createRoomBtn");
  const startBtn = document.getElementById("startBtn");
  const dlBtn = document.getElementById("downloadBtn");

  let room_id = localStorage.getItem("room_id") || null;

  let lastLB = [];
  const setLastLB = rows => (lastLB = rows || []);

  dlBtn.onclick = () => downloadCSV(lastLB);

  const storedCode = localStorage.getItem("join_code");

  if (storedCode) {

    document.getElementById("codeBox").innerHTML =
      `<span class="player-badge">CODE: ${storedCode}</span>`;

    document.getElementById("joinLink").textContent =
      `Open join.html?code=${storedCode}`;

    document.getElementById("joinLink").href =
      `join.html?code=${storedCode}`;
  }

  if (room_id) {
    await setupLive(room_id, setLastLB);
  }

  createBtn.onclick = async () => {

    const room = await createRoom();
    room_id = room.id;

    document.getElementById("codeBox").innerHTML =
      `<span class="player-badge">CODE: ${room.join_code}</span>`;

    document.getElementById("joinLink").textContent =
      `Open join.html?code=${room.join_code}`;

    document.getElementById("joinLink").href =
      `join.html?code=${room.join_code}`;

    await setupLive(room_id, setLastLB);
  };

  startBtn.onclick = async () => {

    if (!room_id) {
      alert("Create a room first.");
      return;
    }

    await startGame(room_id);

    alert("Game started!");
  };
}