// memoryGame.js
export const MEM = (() => {
  let memoryBlocks = [];
  let processes = [];
  let selectedProcess = null;
  let algorithm = "FirstFit";
  let correctAllocation = [];

  const colors = ["#111","#00ffaa","#ffaa00","#ff5555","#55ff55","#aa00ff"];

  function generateQuestionFromUI() {
    algorithm = document.getElementById("algorithm").value;
    const numBlocks = parseInt(document.getElementById("numBlocks").value, 10);
    const numProcesses = parseInt(document.getElementById("numProcesses").value, 10);

    memoryBlocks = [];
    for (let i = 0; i < numBlocks; i++) {
      memoryBlocks.push({ size: Math.floor(Math.random()*20)+10, allocated: -1 });
    }

    processes = [];
    for (let i = 0; i < numProcesses; i++) {
      processes.push({ pid: "P"+(i+1), size: Math.floor(Math.random()*15)+5 });
    }

    selectedProcess = null;
    computeCorrectAllocation();

    // payload stored in Supabase
    return {
      algorithm,
      memoryBlocks: memoryBlocks.map(b => ({ size: b.size })),
      processes: processes.map(p => ({ pid: p.pid, size: p.size }))
    };
  }

  function loadQuestion(payload) {
    algorithm = payload.algorithm;
    memoryBlocks = payload.memoryBlocks.map(b => ({ size: b.size, allocated: -1 }));
    processes = payload.processes.map(p => ({ pid: p.pid, size: p.size }));
    selectedProcess = null;

    computeCorrectAllocation();
    renderMemory();
    renderProcessSelector();
    setFeedback("");
  }

  function setFeedback(msg) {
    const fb = document.getElementById("feedback");
    if (fb) fb.textContent = msg;
  }

  function renderMemory() {
    const memDiv = document.getElementById("memory");
    memDiv.innerHTML = "";

    memoryBlocks.forEach((block, i) => {
      const div = document.createElement("div");
      div.className = "mem-block";
      div.dataset.index = i;

      const bgColor = block.allocated === -1 ? "#111" : colors[block.allocated+1];
      div.style.background = bgColor;

      div.innerHTML = `Block ${i+1}<br>Size:${block.size}<br>${
        block.allocated === -1 ? "Free" : processes[block.allocated].pid
      }`;

      div.onclick = () => allocateProcess(i);
      memDiv.appendChild(div);
    });
  }

  function renderProcessSelector() {
    const selDiv = document.getElementById("processSelector");
    selDiv.innerHTML = "<b>Select Process:</b> ";

    processes.forEach((p, i) => {
      const btn = document.createElement("button");
      btn.textContent = `${p.pid}(${p.size})`;
      btn.onclick = () => { selectedProcess = i; highlightSelected(btn); };
      selDiv.appendChild(btn);
    });
  }

  function highlightSelected(btn) {
    const selDiv = document.getElementById("processSelector");
    [...selDiv.children].forEach(b => {
      if (b.tagName === "BUTTON") b.style.border = "1px solid #00d4ff";
    });
    btn.style.border = "2px solid #00ffaa";
  }

  function allocateProcess(blockIndex) {
    if (selectedProcess === null) return;

    if (memoryBlocks[blockIndex].allocated !== -1) {
      setFeedback("❌ Block already allocated!");
      return;
    }
    if (memoryBlocks[blockIndex].size < processes[selectedProcess].size) {
      setFeedback("❌ Process does not fit!");
      return;
    }

    memoryBlocks[blockIndex].allocated = selectedProcess;
    renderMemory();
  }

  function computeCorrectAllocation() {
    correctAllocation = memoryBlocks.map(() => -1);
    const memCopy = memoryBlocks.map(b => b.size);

    processes.forEach((p, i) => {
      if (algorithm === "FirstFit") {
        for (let j = 0; j < memCopy.length; j++) {
          if (memCopy[j] >= p.size && correctAllocation[j] === -1) {
            correctAllocation[j] = i;
            memCopy[j] -= p.size;
            break;
          }
        }
      } else if (algorithm === "BestFit") {
        let best = -1, bestSize = Infinity;
        for (let j = 0; j < memCopy.length; j++) {
          if (memCopy[j] >= p.size && correctAllocation[j] === -1 && memCopy[j] < bestSize) {
            best = j; bestSize = memCopy[j];
          }
        }
        if (best !== -1) { correctAllocation[best] = i; memCopy[best] -= p.size; }
      } else if (algorithm === "WorstFit") {
        let worst = -1, worstSize = -1;
        for (let j = 0; j < memCopy.length; j++) {
          if (memCopy[j] >= p.size && correctAllocation[j] === -1 && memCopy[j] > worstSize) {
            worst = j; worstSize = memCopy[j];
          }
        }
        if (worst !== -1) { correctAllocation[worst] = i; memCopy[worst] -= p.size; }
      }
    });
  }

  function getPlayerAllocation() {
    return memoryBlocks.map(b => b.allocated);
  }

  function isCorrect() {
    const alloc = getPlayerAllocation();
    if (alloc.length !== correctAllocation.length) return false;
    for (let i = 0; i < alloc.length; i++) {
      if (alloc[i] !== correctAllocation[i]) return false;
    }
    return true;
  }

  return { generateQuestionFromUI, loadQuestion, getPlayerAllocation, isCorrect, setFeedback };
})();
