import { supabase } from "./supabaseClient.js";
import { PAGE } from "./pageGame.js";

async function getRoomByCode(join_code){
  const { data, error } = await supabase
    .from("game_rooms")
    .select("id, join_code, status")
    .eq("join_code", join_code)
    .single();
  if(error) return null;
  return data;
}

async function joinRoom(join_code, display_name){
  const room = await getRoomByCode(join_code);
  if(!room) throw new Error("Invalid code");

  // IMPORTANT: insert player immediately (this is the “waiting room entry”)
  const { data: player, error } = await supabase
    .from("game_players")
    .insert({ room_id: room.id, display_name })
    .select()
    .single();
  if(error) throw error;

  localStorage.setItem("room_id", room.id);
  localStorage.setItem("player_id", player.id);
  localStorage.setItem("player_name", display_name);
  localStorage.setItem("join_code", join_code);

  return room;
}

async function loadQuestions(room_id){
  const { data, error } = await supabase
    .from("game_questions")
    .select("id, q_index, payload")
    .eq("room_id", room_id)
    .order("q_index");
  if(error) throw error;
  return data || [];
}

async function fetchLeaderboard(room_id){
  const { data } = await supabase
    .from("v_leaderboard")
    .select("*")
    .eq("room_id", room_id)
    .order("score",{ascending:false})
    .order("total_time_ms",{ascending:true});
  return data || [];
}

function renderLeaderboard(rows){
  const tbody=document.getElementById("lbBody");
  if(!tbody) return;
  tbody.innerHTML = rows.map((r,i)=>`
    <tr>
      <td>${i+1}</td>
      <td>${r.display_name}</td>
      <td>${r.score}</td>
      <td>${Math.round((r.accuracy||0)*100)}%</td>
      <td>${(r.total_time_ms/1000).toFixed(2)}s</td>
      <td>${r.answered}</td>
    </tr>
  `).join("");
}

export async function initJoinPage(){
  const params=new URLSearchParams(location.search);
  document.getElementById("code").value = params.get("code") || "";

  document.getElementById("joinBtn").onclick = async ()=>{
    const code = document.getElementById("code").value.trim().toUpperCase();
    const name = document.getElementById("name").value.trim();
    if(!code || !name) return alert("Enter code and name.");

    try{
      const room = await joinRoom(code, name);
      // go to waiting room page (play.html) with code
      location.href = `play.html?code=${room.join_code}`;
    }catch(e){
      alert(e.message || String(e));
    }
  };
}

export async function initPlayPage(){
  const params=new URLSearchParams(location.search);
  const join_code = (params.get("code") || localStorage.getItem("join_code") || "").toUpperCase();
  if(!join_code) return alert("Missing code");

  const room = await getRoomByCode(join_code);
  if(!room) return alert("Room not found");

  const room_id = room.id;
  const player_id = localStorage.getItem("player_id");
  if(!player_id){
    // If they opened play.html directly, send them to join
    return location.href = `join.html?code=${join_code}`;
  }

  const statusEl=document.getElementById("status");
  const waitingBox=document.getElementById("waitingBox");
  const gameBox=document.getElementById("gameBox");
  const finalBox=document.getElementById("finalBox");
  const fb=document.getElementById("feedback");

  let questions=[];
  let idx=0;
  let startMs=null;

  function setStatus(s){
    if(statusEl) statusEl.innerHTML = `<span class="badge">Status: ${s}</span>`;
  }

  async function beginIfLive(){
    const latest = await getRoomByCode(join_code);
    if(!latest) return;
    setStatus(latest.status);

    if(latest.status === "ended"){
      waitingBox.style.display="none";
      gameBox.style.display="none";
      finalBox.style.display="block";
      renderLeaderboard(await fetchLeaderboard(room_id));
      return;
    }

    if(latest.status !== "live") return;

    if(!questions.length){
      questions = await loadQuestions(room_id);
      if(!questions.length) return; // host may still be inserting
    }

    waitingBox.style.display="none";
    gameBox.style.display="block";

    if(startMs === null) loadCurrent();
  }

  function loadCurrent(){
    const q = questions[idx];
    document.getElementById("qNum").textContent = `${q.q_index} / 10`;
    PAGE.loadQuestion(q.payload);
    startMs = Date.now();
    if(fb) fb.textContent = "";
  }

  document.getElementById("submitBtn").onclick = async ()=>{
    if(!questions.length) return;

    const q = questions[idx];
    const ok = PAGE.isCorrectAndMark();     // marks green/red
    PAGE.lockBoard();

    const time_ms = startMs ? (Date.now()-startMs) : 0;
    const points = ok ? 10 : 0;

    const { error } = await supabase.from("game_answers").upsert({
      room_id,
      player_id,
      question_id: q.id,
      answer: PAGE.getAnswerPayload(),
      is_correct: ok,
      time_ms,
      points
    });
    if(error) return alert("Submit failed: " + error.message);

    if(fb) fb.textContent = ok ? "✅ Submitted (Correct)" : "✅ Submitted (Wrong)";

    idx++;
    startMs = null;

    if(idx >= questions.length){
      gameBox.style.display="none";
      finalBox.style.display="block";
      renderLeaderboard(await fetchLeaderboard(room_id));
      return;
    }

    loadCurrent();
  };

  // Realtime start without refresh
  supabase.channel("room-"+room_id)
    .on("postgres_changes",{event:"*",schema:"public",table:"game_rooms",filter:`id=eq.${room_id}`}, beginIfLive)
    .subscribe();

  // Live leaderboard updates (optional)
  supabase.channel("answers-"+room_id)
    .on("postgres_changes",{event:"*",schema:"public",table:"game_answers",filter:`room_id=eq.${room_id}`}, async ()=>{
      if(finalBox.style.display==="block"){
        renderLeaderboard(await fetchLeaderboard(room_id));
      }
    })
    .subscribe();

  // Poll fallback (fixes refresh-only problems)
  setInterval(beginIfLive, 1200);

  setStatus(room.status);
  await beginIfLive();
}
