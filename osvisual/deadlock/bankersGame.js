export const BankerLogic = (() => {
  let currentQuestion = null;

  function generateQuestionFromUI(numProcesses = 4, numResources = 3) {
    // Generate random allocation and max matrices
    const allocation = [];
    const max = [];
    const available = Array(numResources).fill(0);
    let totalAllocated = 0;

    for (let i = 0; i < numProcesses; i++) {
      const alloc = Array.from({ length: numResources }, () => Math.floor(Math.random() * 3));
      allocation.push(alloc);
      totalAllocated += alloc.reduce((a, b) => a + b, 0);
    }

    for (let i = 0; i < numProcesses; i++) {
      const m = Array.from({ length: numResources }, () => Math.floor(Math.random() * 5) + 2);
      max.push(m);
    }

    // Calculate available based on total - allocated
    const totalResources = totalAllocated + Math.floor(Math.random() * 5) + 3;
    for (let i = 0; i < numResources; i++) {
      let sum = 0;
      for (let j = 0; j < numProcesses; j++) {
        sum += allocation[j][i];
      }
      available[i] = totalResources - sum;
    }

    const question = {
      numProcesses,
      numResources,
      allocation,
      max,
      available
    };

    currentQuestion = question;
    return question;
  }

  function isSafe(allocation, max, available, numProcesses, numResources) {
    const need = [];
    for (let i = 0; i < numProcesses; i++) {
      need[i] = [];
      for (let j = 0; j < numResources; j++) {
        need[i][j] = max[i][j] - allocation[i][j];
      }
    }

    const work = [...available];
    const finished = Array(numProcesses).fill(false);
    const sequence = [];

    for (let count = 0; count < numProcesses; count++) {
      let found = false;
      for (let i = 0; i < numProcesses; i++) {
        if (!finished[i]) {
          let canAllocate = true;
          for (let j = 0; j < numResources; j++) {
            if (need[i][j] > work[j]) {
              canAllocate = false;
              break;
            }
          }

          if (canAllocate) {
            for (let j = 0; j < numResources; j++) {
              work[j] += allocation[i][j];
            }
            finished[i] = true;
            sequence.push(`P${i}`);
            found = true;
            break;
          }
        }
      }
      if (!found) return { safe: false, sequence: null };
    }

    return { safe: true, sequence };
  }

  function computeSafeSequence(payload) {
    const result = isSafe(
      payload.allocation,
      payload.max,
      payload.available,
      payload.numProcesses,
      payload.numResources
    );
    return result;
  }

  function evaluateAnswer(userAnswer) {
    if (!currentQuestion) return { isCorrect: false, message: "No question loaded" };
    
    const result = computeSafeSequence(currentQuestion);
    const correctSequence = result.sequence;
    
    if (!correctSequence) {
      return { isCorrect: false, message: "No safe sequence exists" };
    }
    
    // Parse user input - remove spaces and convert to array
    const userSequence = userAnswer
      .trim()
      .split(",")
      .map(s => s.trim().toUpperCase())
      .filter(s => s.length > 0);
    
    console.log("🔍 Evaluating answer:", {
      user: userSequence,
      correct: correctSequence,
      match: JSON.stringify(userSequence) === JSON.stringify(correctSequence)
    });
    
    // Check if sequences match exactly
    const isCorrect = 
      userSequence.length === correctSequence.length &&
      userSequence.every((p, i) => p === correctSequence[i]);
    
    return { 
      isCorrect, 
      correctSequence,
      userSequence,
      message: isCorrect ? "Correct!" : `Expected: ${correctSequence.join(", ")}`
    };
  }

  function questionText(q) {
    return `Processes: ${q.numProcesses} | Resources: ${q.numResources}`;
  }

  function renderTables(payload) {
    const { allocation, max, available, numProcesses, numResources } = payload;
    
    console.log("🎲 renderTables called with:", { numProcesses, numResources, allocation, max, available });

    // Render Allocation Table
    const allocTable = document.getElementById("allocationTable");
    if (allocTable) {
      let html = "<thead><tr><th>Process</th>";
      for (let j = 0; j < numResources; j++) {
        html += `<th>R${j}</th>`;
      }
      html += "</tr></thead><tbody>";
      for (let i = 0; i < numProcesses; i++) {
        html += `<tr><td>P${i}</td>`;
        for (let j = 0; j < numResources; j++) {
          html += `<td>${allocation[i][j]}</td>`;
        }
        html += "</tr>";
      }
      html += "</tbody>";
      allocTable.innerHTML = html;
      console.log("✓ Allocation table rendered");
    } else {
      console.warn("⚠️ allocationTable element not found");
    }

    // Render Max Table
    const maxTable = document.getElementById("maxTable");
    if (maxTable) {
      let html = "<thead><tr><th>Process</th>";
      for (let j = 0; j < numResources; j++) {
        html += `<th>R${j}</th>`;
      }
      html += "</tr></thead><tbody>";
      for (let i = 0; i < numProcesses; i++) {
        html += `<tr><td>P${i}</td>`;
        for (let j = 0; j < numResources; j++) {
          html += `<td>${max[i][j]}</td>`;
        }
        html += "</tr>";
      }
      html += "</tbody>";
      maxTable.innerHTML = html;
      console.log("✓ Max table rendered");
    } else {
      console.warn("⚠️ maxTable element not found");
    }

    // Render Available Table
    const availTable = document.getElementById("availableTable");
    if (availTable) {
      let html = "<thead><tr>";
      for (let j = 0; j < numResources; j++) {
        html += `<th>R${j}</th>`;
      }
      html += "</tr></thead><tbody><tr>";
      for (let j = 0; j < numResources; j++) {
        html += `<td>${available[j]}</td>`;
      }
      html += "</tr></tbody>";
      availTable.innerHTML = html;
      console.log("✓ Available table rendered");
    } else {
      console.warn("⚠️ availableTable element not found");
    }
  }

  function loadQuestion(payload) {
    currentQuestion = payload;
    renderTables(payload);
  }

  return {
    generateQuestionFromUI,
    computeSafeSequence,
    evaluateAnswer,
    questionText,
    loadQuestion,
    renderTables,
    getCurrentQuestion: () => currentQuestion
  };
})();
