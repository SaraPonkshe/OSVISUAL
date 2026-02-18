import { supabase } from "./supabaseClient.js";
import { MEM } from "./memoryGame.js";

function randomCode(len=6){
  const chars="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({length:len},()=>chars[Math.floor(Math.random()*chars.length)]).join("");
}
function randomHostKey(){
  return crypto.randomUUID()+"-"+crypto.randomUUID();
}

async function createRoom(){
  const join_code = randomCode(6);
  const host_key = randomHostKey();

  const { data, error } = await supabase
    .from("game_rooms")
    .insert({ join_code, host_key, status:"waiting" })
    .select()
    .single();
  if(error) throw error;

  localStorage.setItem("room_id", data.id);
  localStorage.setItem("join_code", join_code);
  localStorage.setItem("host_key", host_key);
  return data;
}

async function fetchPlayers(room_id){
  const { data } = await supabase
    .from("game_players")
    .select("display_name, joined_at")
    .eq("room_id", room_id)
    .order("joined_at",{ascending:true});
  return data || [];
}
function renderPlayers(players){
  const el = document.getElementById("playersList");
  el.innerHTML = players.length
    ? players.map(p=>`<span class="badge">${p.display_name}</span>`).join(" ")
    : `<span class="small">No players yet…</span>`;
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
  const tbody = document.getElementById("lbBody");
  tbody.innerHTML = rows.map((r,i)=>`
    <tr>
      <td>${i+1}</td><td>${r.display_name}</td><td>${r.score}</td>
      <td>${Math.round((r.accuracy||0)*100)}%</td>
      <td>${(r.total_time_ms/1000).toFixed(2)}s</td>
      <td>${r.answered}</td>
    </tr>
  `).join("");
}

function downloadCSV(rows){
  const header=["rank","name","score","accuracy","total_time_ms","answered"];
  const lines=[header.join(",")];
  rows.forEach((r,idx)=>{
    lines.push([
      idx+1,
      `"${String(r.display_name).replaceAll('"','""')}"`,
      r.score,r.accuracy,r.total_time_ms,r.answered
    ].join(","));
  });
  const blob=new Blob([lines.join("\n")],{type:"text/csv;charset=utf-8;"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url; a.download="leaderboard.csv"; a.click();
  URL.revokeObjectURL(url);
}

async function startGame(room_id){
  await supabase.from("game_questions").delete().eq("room_id", room_id);

  const questions=[];
  for(let i=1;i<=10;i++){
    const q = MEM.generateQuestionFromUI();
    questions.push({ room_id, q_index:i, payload:q, correct:{} });
  }
  const ins = await supabase.from("game_questions").insert(questions);
  if(ins.error) throw ins.error;

  const upd = await supabase
    .from("game_rooms")
    .update({ status:"live", started_at:new Date().toISOString() })
    .eq("id", room_id);
  if(upd.error) throw upd.error;
}

let channels=[];
let pollTimer=null;

function cleanup(){
  channels.forEach(ch=>supabase.removeChannel(ch));
  channels=[];
  if(pollTimer) clearInterval(pollTimer);
  pollTimer=null;
}

async function setupLive(room_id, setLastLB){
  cleanup();

  const pullPlayers = async ()=>renderPlayers(await fetchPlayers(room_id));
  const pullLB = async ()=>{
    const lb = await fetchLeaderboard(room_id);
    renderLeaderboard(lb);
    setLastLB(lb);
  };

  await pullPlayers();
  await pullLB();

  const chP = supabase.channel("players-"+room_id)
    .on("postgres_changes",{event:"*",schema:"public",table:"game_players",filter:`room_id=eq.${room_id}`}, pullPlayers)
    .subscribe();

  const chA = supabase.channel("answers-"+room_id)
    .on("postgres_changes",{event:"*",schema:"public",table:"game_answers",filter:`room_id=eq.${room_id}`}, pullLB)
    .subscribe();

  channels.push(chP,chA);

  // Poll fallback (fixes refresh-only issues if any)
  pollTimer = setInterval(async ()=>{
    try { await pullPlayers(); await pullLB(); } catch {}
  }, 1200);
}

export async function initHostPage(){
  const createBtn=document.getElementById("createRoomBtn");
  const startBtn=document.getElementById("startBtn");
  const dlBtn=document.getElementById("downloadBtn");

  let room_id = localStorage.getItem("room_id") || null;
  let lastLB=[];
  const setLastLB=(x)=>lastLB=x||[];

  dlBtn.onclick=()=>downloadCSV(lastLB);

  const storedCode = localStorage.getItem("join_code");
  if(storedCode){
    document.getElementById("codeBox").innerHTML=`<span class="badge">CODE: ${storedCode}</span>`;
    document.getElementById("joinLink").textContent=`Open join.html?code=${storedCode}`;
    document.getElementById("joinLink").href=`join.html?code=${storedCode}`;
  }

  if(room_id) await setupLive(room_id, setLastLB);

  createBtn.onclick = async ()=>{
    const room = await createRoom();
    room_id = room.id;

    document.getElementById("codeBox").innerHTML=`<span class="badge">CODE: ${room.join_code}</span>`;
    document.getElementById("joinLink").textContent=`Open join.html?code=${room.join_code}`;
    document.getElementById("joinLink").href=`join.html?code=${room.join_code}`;

    await setupLive(room_id, setLastLB);
  };

  startBtn.onclick = async ()=>{
    if(!room_id) return alert("Create a room first.");
    await startGame(room_id);
    alert("Game started!");
  };
}
