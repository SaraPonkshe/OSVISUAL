export const PAGE = (() => {
  let pages = [];
  let numFrames = 3;
  let algorithm = "FIFO";

  let simulationSteps = [];
  let studentAnswer = [];
  let frameRows = [];
  let pageFaults = 0;

  function randomPages(){
    const arr=[];
    for(let i=0;i<10;i++) arr.push(Math.floor(Math.random()*8));
    return arr;
  }

  // Host uses these inputs to generate each question
  function generateQuestionFromUI(){
    algorithm = document.getElementById("algorithm").value;
    numFrames = parseInt(document.getElementById("frames").value,10);
    pages = randomPages();
    return { algorithm, frames: numFrames, pages };
  }

  function loadQuestion(payload){
    algorithm = payload.algorithm;
    numFrames = payload.frames;
    pages = payload.pages;

    studentAnswer = Array(numFrames).fill(null).map(()=>Array(pages.length).fill(null));
    simulationSteps = [];
    pageFaults = 0;

    generateTable();
    precomputeCorrectSteps();

    const fb = document.getElementById("feedback");
    if(fb) fb.textContent = "";
    const fm = document.getElementById("finalMsg");
    if(fm) fm.textContent = "";
  }

  function generateTable(){
    const gameArea = document.getElementById("gameArea");
    gameArea.innerHTML = "";

    const title = document.createElement("h3");
    title.textContent = "Reference String: " + pages.join(", ");
    gameArea.appendChild(title);

    const table = document.createElement("table");
    const header = document.createElement("tr");
    const th = document.createElement("th");
    th.textContent = "Frame ↓ / Step →";
    header.appendChild(th);

    for(const page of pages){
      const th2 = document.createElement("th");
      th2.textContent = page;
      header.appendChild(th2);
    }
    table.appendChild(header);

    frameRows = [];
    for(let i=0;i<numFrames;i++){
      const row = document.createElement("tr");
      const frameLabel = document.createElement("th");
      frameLabel.textContent = "Frame " + (i+1);
      row.appendChild(frameLabel);

      for(let j=0;j<pages.length;j++){
        const td = document.createElement("td");
        td.classList.add("clickable");
        td.onclick = () => fillStudentCell(i,j,td);
        row.appendChild(td);
      }
      frameRows.push(row);
      table.appendChild(row);
    }

    gameArea.appendChild(table);
  }

  function fillStudentCell(i,j,cell){
    let val = prompt(`Enter page for Frame ${i+1}, Step ${j+1} (use - for empty)`);
    if(val===null) return;
    if(val.trim()==="") val="-";
    studentAnswer[i][j] = val;
    cell.textContent = val;
  }

  // Your “correct” engine (FIFO / LRU / Optimal with safe behavior)
  function precomputeCorrectSteps(){
    let simFrames = Array(numFrames).fill(null);
    let useMap = {};
    let fifoQueue = [];

    pageFaults = 0;
    simulationSteps = [];

    for(let step=0; step<pages.length; step++){
      const page = pages[step];

      if(!simFrames.includes(page)){
        if(algorithm==="FIFO"){
          const empty = simFrames.indexOf(null);
          if(empty!==-1){
            simFrames[empty]=page;
            fifoQueue.push(page);
          }else{
            const out=fifoQueue.shift();
            const outIndex=simFrames.indexOf(out);
            simFrames[outIndex]=page;
            fifoQueue.push(page);
          }
        }

        else if(algorithm==="LRU"){
          let least=Infinity, victim=0;
          for(let i=0;i<numFrames;i++){
            const lastUsed = useMap[simFrames[i]] ?? -1;
            if(lastUsed<least){least=lastUsed; victim=i;}
          }
          simFrames[victim]=page;
        }

        else if(algorithm==="Optimal"){
          const empty = simFrames.indexOf(null);
          if(empty!==-1){
            simFrames[empty]=page;
            fifoQueue.push(page);
          }else{
            let neverUsedIndexes=[];
            let farthest=-1, victim=-1;

            for(let i=0;i<numFrames;i++){
              const nextUse = pages.slice(step+1).indexOf(simFrames[i]);
              if(nextUse===-1) neverUsedIndexes.push(i);
              if(nextUse>farthest){farthest=nextUse; victim=i;}
            }

            if(neverUsedIndexes.length===1){
              victim=neverUsedIndexes[0];
            }else if(neverUsedIndexes.length>1){
              // FIFO fallback among never-used pages (consistent & deterministic)
              const candidates = neverUsedIndexes.map(idx => simFrames[idx]);
              for(const outPage of fifoQueue){
                const k = candidates.indexOf(outPage);
                if(k!==-1){victim=neverUsedIndexes[k]; break;}
              }
              if(victim===-1) victim=neverUsedIndexes[0];
            }

            const oldPage = simFrames[victim];
            simFrames[victim]=page;

            // update fifoQueue
            const fi = fifoQueue.indexOf(oldPage);
            if(fi!==-1) fifoQueue.splice(fi,1);
            fifoQueue.push(page);
          }
        }

        pageFaults++;
      }

      useMap[page]=step;
      simulationSteps.push({ frames:[...simFrames] });
    }
  }

  function normalize(v){
    if(v===null || v===undefined) return "-";
    const s = String(v).trim();
    return s==="" ? "-" : s;
  }

  // We compute correctness WITHOUT revealing any “replay”
  function isCorrectAndMark(){
    let ok = true;

    for(let i=0;i<numFrames;i++){
      for(let j=0;j<pages.length;j++){
        const studentVal = normalize(studentAnswer[i][j]);
        const correctVal = normalize(simulationSteps[j].frames[i]);

        const cell = frameRows[i].children[j+1];
        cell.classList.remove("correct","wrong");

        if(studentVal !== correctVal){
          cell.classList.add("wrong");
          ok=false;
        }else{
          cell.classList.add("correct");
        }
      }
    }

    const fm = document.getElementById("finalMsg");
    if(fm) fm.textContent = `Algorithm: ${algorithm} | Correct Faults: ${pageFaults}`;

    return ok;
  }

  function lockBoard(){
    for(let i=0;i<numFrames;i++){
      for(let j=0;j<pages.length;j++){
        const cell = frameRows[i].children[j+1];
        cell.onclick = null;
        cell.classList.remove("clickable");
      }
    }
  }

  function getAnswerPayload(){
    return { matrix: studentAnswer };
  }

  return {
    generateQuestionFromUI,
    loadQuestion,
    isCorrectAndMark,
    lockBoard,
    getAnswerPayload
  };
})();
