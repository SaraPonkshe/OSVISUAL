// cpuGame.js
export const CPU = (() => {
  let processes = [];
  let algorithm = "FCFS", quantum = 2, numProcesses = 4;
  let simulationSteps = [];
  let selectedProcess = null;
  let ganttBlocks = [];

  const colors = ["#111","#00ffaa","#ffaa00","#ff5555","#55ff55","#aa00ff"];

  function algorithmChanged() {
    const alg = document.getElementById("algorithm").value;
    const qDiv = document.getElementById("quantumDiv");
    if (qDiv) qDiv.style.display = (alg === "RR") ? "inline-block" : "none";
  }

  function randomQuestionFromUI() {
    algorithm = document.getElementById("algorithm").value;
    quantum = parseInt(document.getElementById("quantum")?.value || "2", 10);
    numProcesses = parseInt(document.getElementById("numProcesses").value, 10);

    processes = [];
    for (let i = 0; i < numProcesses; i++) {
      let p = {
        pid: "P" + (i + 1),
        arrival: Math.floor(Math.random() * 5),
        burst: Math.floor(Math.random() * 7) + 1,
        priority: Math.floor(Math.random() * 5) + 1,
        remaining: 0
      };
      p.remaining = p.burst;
      processes.push(p);
    }
    return packQuestion();
  }

  function packQuestion() {
    return {
      algorithm,
      quantum,
      numProcesses,
      processes: processes.map(p => ({
        pid: p.pid,
        arrival: p.arrival,
        burst: p.burst,
        priority: p.priority
      }))
    };
  }

  function loadQuestion(question) {
    algorithm = question.algorithm;
    quantum = question.quantum;
    numProcesses = question.numProcesses;
    processes = question.processes.map(p => ({ ...p, remaining: p.burst }));

    // reflect in UI if elements exist
    const algSel = document.getElementById("algorithm");
    const qInput = document.getElementById("quantum");
    const nInput = document.getElementById("numProcesses");
    if (algSel) algSel.value = algorithm;
    if (qInput) qInput.value = quantum;
    if (nInput) nInput.value = numProcesses;

    algorithmChanged();

    showProcesses();
    renderProcessSelector();
    renderGanttChart();
    clearFeedback();
  }

  function showProcesses() {
    const processDiv = document.getElementById("processes");
    if (!processDiv) return;
    processDiv.innerHTML = "<b>Processes:</b><br>" + processes.map(p =>
      `${p.pid}: Arrival=${p.arrival}, Burst=${p.burst}, Priority=${p.priority}<br>`
    ).join("");
  }

  function clearFeedback() {
    const fb = document.getElementById("feedback");
    const fm = document.getElementById("finalMsg");
    if (fb) fb.textContent = "";
    if (fm) fm.textContent = "";
    const r = document.getElementById("replayBtn");
    if (r) r.style.display = "none";
    selectedProcess = null;
  }

  function renderProcessSelector() {
    const selDiv = document.getElementById("processSelector");
    if (!selDiv) return;
    selDiv.innerHTML = "<b>Select Process:</b> ";
    processes.forEach((p, i) => {
      const btn = document.createElement("button");
      btn.textContent = p.pid;
      btn.onclick = () => { selectedProcess = i; highlightSelected(btn); };
      selDiv.appendChild(btn);
    });
  }

  function highlightSelected(btn) {
    const selDiv = document.getElementById("processSelector");
    if (!selDiv) return;
    [...selDiv.children].forEach(b => {
      if (b.tagName === "BUTTON") b.style.border = "1px solid #00d4ff";
    });
    btn.style.border = "2px solid #00ffaa";
  }

  function renderGanttChart(totalTime = 30) {
    const gantt = document.getElementById("gantt");
    if (!gantt) return;
    gantt.innerHTML = "";
    ganttBlocks = [];
    for (let t = 0; t < totalTime; t++) {
      const div = document.createElement("div");
      div.className = "block";
      div.style.width = "40px";
      div.style.background = "#111";
      div.dataset.time = String(t);
      div.dataset.proc = "-1";
      div.textContent = String(t);
      div.onclick = () => placeProcess(div);
      gantt.appendChild(div);
      ganttBlocks.push(div);
    }
  }

  function placeProcess(block) {
    if (selectedProcess === null) return;
    block.dataset.proc = String(selectedProcess);
    block.style.background = colors[selectedProcess + 1] || "#111";
    block.textContent = processes[selectedProcess].pid;
  }

  function computeGanttSteps() {
    simulationSteps = [];
    let time = 0;
    let rem = JSON.parse(JSON.stringify(processes));
    rem.forEach(p => p.remaining = p.burst);

    if (algorithm === "FCFS") {
      rem.sort((a, b) => a.arrival - b.arrival);
      rem.forEach(p => {
        const start = Math.max(time, p.arrival);
        const finish = start + p.burst;
        simulationSteps.push({ pid: p.pid, start, finish });
        time = finish;
      });
    } else if (algorithm === "SJF") {
      let completed = 0, t = 0;
      let procList = [...rem];
      while (completed < numProcesses) {
        let available = procList.filter(p => p.arrival <= t && p.remaining > 0);
        if (available.length === 0) { t++; continue; }
        available.sort((a, b) => a.burst - b.burst);
        let p = available[0];
        simulationSteps.push({ pid: p.pid, start: t, finish: t + p.burst });
        t += p.burst;
        p.remaining = 0;
        completed++;
      }
    } else if (algorithm === "SRTF") {
      let t = 0, completed = 0;
      let procList = [...rem];
      while (completed < numProcesses) {
        let available = procList.filter(p => p.arrival <= t && p.remaining > 0);
        if (available.length === 0) { t++; continue; }
        available.sort((a, b) => a.remaining - b.remaining);
        let p = available[0];
        simulationSteps.push({ pid: p.pid, start: t, finish: t + 1 });
        p.remaining -= 1;
        if (p.remaining === 0) completed++;
        t++;
      }
      let merged = [];
      simulationSteps.forEach(s => {
        if (merged.length && merged[merged.length - 1].pid === s.pid && merged[merged.length - 1].finish === s.start) {
          merged[merged.length - 1].finish = s.finish;
        } else merged.push({ ...s });
      });
      simulationSteps = merged;
    } else if (algorithm === "Priority") {
      let completed = 0, t = 0;
      let procList = [...rem];
      while (completed < numProcesses) {
        let available = procList.filter(p => p.arrival <= t && p.remaining > 0);
        if (available.length === 0) { t++; continue; }
        available.sort((a, b) => a.priority - b.priority);
        let p = available[0];
        simulationSteps.push({ pid: p.pid, start: t, finish: t + p.burst });
        t += p.burst;
        p.remaining = 0;
        completed++;
      }
    } else if (algorithm === "RR") {
      let t = 0, completed = 0;
      let procList = JSON.parse(JSON.stringify(rem));
      let readyQueue = [];
      procList.sort((a, b) => a.arrival - b.arrival);
      let i = 0;

      while (completed < numProcesses) {
        while (i < numProcesses && procList[i].arrival <= t) {
          readyQueue.push(procList[i]);
          i++;
        }
        if (readyQueue.length === 0) {
          if (i < numProcesses) t = procList[i].arrival;
          continue;
        }

        let current = readyQueue.shift();
        let execTime = Math.min(quantum, current.remaining);
        let startTime = t;
        let finishTime = t + execTime;

        simulationSteps.push({ pid: current.pid, start: startTime, finish: finishTime });

        current.remaining -= execTime;
        t = finishTime;

        while (i < numProcesses && procList[i].arrival <= t) {
          readyQueue.push(procList[i]);
          i++;
        }

        if (current.remaining > 0) readyQueue.push(current);
        else completed++;
      }
    }

    return simulationSteps;
  }

  function correctGanttArray(totalTime = 30) {
    computeGanttSteps();
    const correct = Array(totalTime).fill(-1);
    simulationSteps.forEach(step => {
      const idx = processes.findIndex(p => p.pid === step.pid);
      for (let t = step.start; t < step.finish && t < totalTime; t++) {
        correct[t] = idx;
      }
    });
    return correct;
  }

  function studentGanttArray(totalTime = 30) {
    // ensure blocks exist
    if (!ganttBlocks.length) return Array(totalTime).fill(-1);
    return ganttBlocks.slice(0, totalTime).map(b => parseInt(b.dataset.proc, 10));
  }

  function localCheckAndPaint(totalTime = 30) {
    const correct = correctGanttArray(totalTime);
    const student = studentGanttArray(totalTime);

    let ok = true;
    for (let t = 0; t < totalTime; t++) {
      if (student[t] !== correct[t]) {
        ok = false;
        if (ganttBlocks[t]) ganttBlocks[t].style.border = "2px solid red";
      } else {
        if (ganttBlocks[t]) ganttBlocks[t].style.border = "1px solid #00d4ff";
      }
    }
    const fb = document.getElementById("feedback");
    if (fb) fb.textContent = ok ? "✅ You solved correctly!" : "❌ Wrong answer.";
    return ok;
  }

  async function replaySimulation(totalTime = 30) {
    computeGanttSteps();
    renderGanttChart(totalTime);
    for (let step of simulationSteps) {
      const idx = processes.findIndex(p => p.pid === step.pid);
      for (let t = step.start; t < step.finish && t < totalTime; t++) {
        const block = ganttBlocks.find(b => parseInt(b.dataset.time, 10) === t);
        if (!block) continue;
        block.style.background = colors[idx + 1];
        block.textContent = step.pid;
        await new Promise(res => setTimeout(res, 120));
      }
    }
    const fb = document.getElementById("feedback");
    const fm = document.getElementById("finalMsg");
    if (fb) fb.textContent = "🎬 Simulation Complete!";
    if (fm) fm.textContent = `Algorithm: ${algorithm}`;
  }

  // public api
  return {
    algorithmChanged,
    randomQuestionFromUI,
    loadQuestion,
    packQuestion,
    correctGanttArray,
    studentGanttArray,
    localCheckAndPaint,
    replaySimulation
  };
})();
