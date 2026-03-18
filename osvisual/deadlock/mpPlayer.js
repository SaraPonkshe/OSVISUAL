import { supabase } from "./supabaseClient.js";
import { BankerLogic } from "./bankersGame.js";

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

  return room;
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
  console.log("🎮 initJoinPage called");
  
  const params = new URLSearchParams(location.search);
  const codeFromUrl = params.get("code");
  
  if (codeFromUrl) {
    document.getElementById("code").value = codeFromUrl.toUpperCase();
    console.log("✓ Code prefilled from URL:", codeFromUrl);
  }

  document.getElementById("joinBtn").onclick = async () => {
    const code = document.getElementById("code").value.trim().toUpperCase();
    const name = document.getElementById("name").value.trim();
    
    console.log("🔘 Join button clicked", { code, name });
    
    if (!code || !name) return alert("Enter code and name.");

    try {
      console.log("📝 Joining room with code:", code);
      const room = await joinRoom(code, name);
      console.log("✓ Successfully joined room:", room);
      location.href = `play.html?code=${room.join_code}`;
    } catch (e) {
      console.error("❌ Join error:", e);
      alert(e.message || String(e));
    }
  };
}

export async function initPlayPage() {
  console.log("🎮 initPlayPage called");
  
  const params = new URLSearchParams(location.search);
  const join_code = (params.get("code") || localStorage.getItem("join_code") || "").toUpperCase();
  
  if (!join_code) return alert("Missing code");

  const room = await getRoomByCode(join_code);
  if (!room) return alert("Room not found");

  const room_id = room.id;
  const player_id = localStorage.getItem("player_id");
  
  if (!player_id) return location.href = `join.html?code=${join_code}`;

  console.log("✓ Player session valid", { room_id, player_id, join_code });

  const waitingBox = document.getElementById("waitingBox");
  const gameBox = document.getElementById("gameBox");
  const finalBox = document.getElementById("finalBox");
  const statusEl = document.getElementById("status");

  let questions = [];
  let idx = 0;
  let startMs = null;

  function setStatus(s) {
    if (statusEl) statusEl.innerHTML = `<span class="badge">Status: ${s}</span>`;
  }

  async function beginIfLive() {
    const latest = await getRoomByCode(join_code);
    if (!latest) return;
    setStatus(latest.status);

    if (latest.status === "ended") {
      waitingBox.style.display = "none";
      gameBox.style.display = "none";
      finalBox.style.display = "block";
      renderLeaderboard(await fetchLeaderboard(room_id));
      return;
    }

    if (latest.status !== "live") return;

    if (!questions.length) {
      questions = await loadQuestions(room_id);
      if (!questions.length) return;
    }

    waitingBox.style.display = "none";
    gameBox.style.display = "block";

    if (startMs === null) loadCurrent();
  }

  function loadCurrent() {
    const q = questions[idx];
    document.getElementById("qNum").textContent = q.q_index;
    
    // For Banker's Algorithm, load the question payload
    const payload = q.payload;
    console.log("📖 Loading question", q.q_index, "with payload:", payload);
    console.log("Payload structure:", { 
      numProcesses: payload?.numProcesses, 
      numResources: payload?.numResources,
      allocationLength: payload?.allocation?.length,
      maxLength: payload?.max?.length,
      availableLength: payload?.available?.length
    });
    
    // Call BankerLogic to render the tables
    if (payload) {
      BankerLogic.loadQuestion(payload);
    } else {
      console.error("❌ No payload found for question", q.q_index);
    }
    
    // Store in a data attribute for the game logic
    const gameContainer = document.getElementById("gameBox");
    gameContainer.dataset.currentQuestion = JSON.stringify(payload);
    gameContainer.dataset.currentQuestionId = q.id;
    
    startMs = Date.now();
  }

  const submitBtn = document.getElementById("submitBtn");
  if (submitBtn) {
    submitBtn.onclick = async () => {
      if (!questions.length) return;

      const q = questions[idx];
      const sequenceInput = document.getElementById("sequenceInput");
      const answer = sequenceInput.value.trim();
      
      if (!answer) return alert("Please enter a safe sequence (e.g., P0,P1,P2)");
      
      // Evaluate answer using BankerLogic
      const evaluation = BankerLogic.evaluateAnswer(answer);
      const is_correct = evaluation.isCorrect;
      const time_ms = startMs ? (Date.now() - startMs) : 0;
      const points = is_correct ? 10 : 0;

      console.log("📤 Submitting answer", { answer, is_correct, time_ms, points, evaluation });

      const { error } = await supabase.from("game_answers").upsert({
        room_id,
        player_id,
        question_id: q.id,
        answer,
        is_correct,
        time_ms,
        points
      });
      
      if (error) return alert("Submit failed: " + error.message);

      // No feedback shown - results will be displayed in leaderboard

      idx++;
      startMs = null;
      sequenceInput.value = "";

      if (idx >= questions.length) {
        gameBox.style.display = "none";
        finalBox.style.display = "block";
        renderLeaderboard(await fetchLeaderboard(room_id));
        return;
      }

      loadCurrent();
    };
  }

  const clearBtn = document.getElementById("clearBtn");
  if (clearBtn) {
    clearBtn.onclick = () => {
      const sequenceInput = document.getElementById("sequenceInput");
      sequenceInput.value = "";
      console.log("🔄 Sequence cleared");
    };
  }

  supabase.channel("room-" + room_id)
    .on("postgres_changes", 
      { event: "*", schema: "public", table: "game_rooms", filter: `id=eq.${room_id}` }, 
      beginIfLive
    )
    .subscribe();

  supabase.channel("answers-" + room_id)
    .on("postgres_changes",
      { event: "*", schema: "public", table: "game_answers", filter: `room_id=eq.${room_id}` },
      async () => {
        if (finalBox.style.display === "block") {
          renderLeaderboard(await fetchLeaderboard(room_id));
        }
      }
    )
    .subscribe();

  setInterval(beginIfLive, 1200);

  setStatus(room.status);
  await beginIfLive();
}
