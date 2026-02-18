import { supabase } from "./supabaseClient.js";
import { CPU } from "./cpuGame.js";

async function getRoomByCode(join_code) {
  const { data, error } = await supabase
    .from("game_rooms")
    .select("id, join_code, status")
    .eq("join_code", join_code)
    .single();
  if (error) return null;
  return data;
}

async function joinRoom(join_code, display_name) {
  const room = await getRoomByCode(join_code);
  if (!room) throw new Error("Invalid code");

  const { data: player, error } = await supabase
    .from("game_players")
    .insert({ room_id: room.id, display_name })
    .select()
    .single();

  if (error) throw error;

  localStorage.setItem("room_id", room.id);
  localStorage.setItem("player_id", player.id);
  localStorage.setItem("player_name", display_name);
  localStorage.setItem("join_code", join_code);

  return { room, player };
}

async function loadQuestions(room_id) {
  const { data, error } = await supabase
    .from("game_questions")
    .select("id, q_index, payload")
    .eq("room_id", room_id)
    .order("q_index");
  if (error) throw error;
  return data || [];
}

async function submitAnswer({ room_id, player_id, question_id, answer, is_correct, time_ms, points }) {
  const { error } = await supabase
    .from("game_answers")
    .upsert({ room_id, player_id, question_id, answer, is_correct, time_ms, points });
  if (error) throw error;
}

async function fetchLeaderboard(room_id) {
  const { data } = await supabase
    .from("v_leaderboard")
    .select("*")
    .eq("room_id", room_id)
    .order("score", { ascending: false })
    .order("total_time_ms", { ascending: true });
  return data || [];
}

function renderLeaderboard(rows) {
  const tbody = document.getElementById("lbBody");
  if (!tbody) return;
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

export async function initJoinPage() {
  const params = new URLSearchParams(location.search);
  const codePrefill = params.get("code") || "";
  document.getElementById("code").value = codePrefill;

  document.getElementById("joinBtn").onclick = async () => {
    const code = document.getElementById("code").value.trim().toUpperCase();
    const name = document.getElementById("name").value.trim();
    if (!code || !name) return alert("Enter code and name.");

    try {
      const { room } = await joinRoom(code, name);
      location.href = `play.html?code=${room.join_code}`;
    } catch (e) {
      alert(e.message || String(e));
    }
  };
}

export async function initPlayPage() {
  CPU.algorithmChanged();

  const params = new URLSearchParams(location.search);
  const join_code = (params.get("code") || localStorage.getItem("join_code") || "").toUpperCase();
  if (!join_code) return alert("Missing code.");

  const room = await getRoomByCode(join_code);
  if (!room) return alert("Room not found.");

  const room_id = room.id;
  const player_id = localStorage.getItem("player_id");
  if (!player_id) return location.href = `join.html?code=${join_code}`;

  const statusEl = document.getElementById("status");
  const waitingBox = document.getElementById("waitingBox");
  const gameBox = document.getElementById("gameBox");
  const finalBox = document.getElementById("finalBox");

  let questions = [];
  let currentIndex = 0;
  let startMs = null;

  function setStatus(s) {
    if (statusEl) statusEl.innerHTML = `<span class="badge">Status: ${s}</span>`;
  }

  async function beginGameIfLive() {
    const latest = await getRoomByCode(join_code);
    if (!latest) return;

    setStatus(latest.status);

    if (latest.status !== "live") return;

    // load questions once
    if (!questions.length) {
      questions = await loadQuestions(room_id);
      if (!questions.length) return; // host might still be inserting
    }

    // show game UI
    if (waitingBox) waitingBox.style.display = "none";
    if (gameBox) gameBox.style.display = "block";

    // load first question
    if (currentIndex === 0 && startMs === null) {
      loadCurrent();
    }
  }

  function loadCurrent() {
    const q = questions[currentIndex];
    document.getElementById("qNum").textContent = `${q.q_index} / 10`;
    CPU.loadQuestion(q.payload);
    startMs = Date.now();
  }

  document.getElementById("submitBtn").onclick = async () => {
    if (!questions.length) return;

    const q = questions[currentIndex];
    const totalTime = 30;

    const student = CPU.studentGanttArray(totalTime);
    const correct = CPU.correctGanttArray(totalTime);

    let ok = true;
    for (let t = 0; t < totalTime; t++) {
      if (student[t] !== correct[t]) { ok = false; break; }
    }

    const time_ms = startMs ? (Date.now() - startMs) : 0;
    const points = ok ? 10 : 0;

    await submitAnswer({
      room_id,
      player_id,
      question_id: q.id,
      answer: { gantt: student },
      is_correct: ok,
      time_ms,
      points
    });

    CPU.localCheckAndPaint(totalTime);

    currentIndex++;
    startMs = null;

    if (currentIndex >= questions.length) {
      document.getElementById("submitBtn").disabled = true;
      document.getElementById("qNum").textContent = "Finished!";
      if (finalBox) finalBox.style.display = "block";
      renderLeaderboard(await fetchLeaderboard(room_id));
      return;
    }

    loadCurrent();
  };

  // ✅ Realtime listeners (if they work)
  supabase.channel("room-" + room_id)
    .on("postgres_changes", { event: "*", schema: "public", table: "game_rooms", filter: `id=eq.${room_id}` }, beginGameIfLive)
    .subscribe();

  supabase.channel("answers-" + room_id)
    .on("postgres_changes", { event: "*", schema: "public", table: "game_answers", filter: `room_id=eq.${room_id}` }, async () => {
      renderLeaderboard(await fetchLeaderboard(room_id));
    })
    .subscribe();

  // ✅ POLL fallback (fixes “game starts only after refresh”)
  setInterval(beginGameIfLive, 1000);
  setInterval(async () => {
    renderLeaderboard(await fetchLeaderboard(room_id));
  }, 1500);

  // initial
  setStatus(room.status);
  await beginGameIfLive();
}