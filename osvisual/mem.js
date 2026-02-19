const startBtn = document.getElementById("startBtn");
const memoryContainer = document.getElementById("memoryContainer");
const processContainer = document.getElementById("processContainer");
const processDetails = document.getElementById("processDetails");
const algorithmSelect = document.getElementById("algorithm");

const memoryBlocks = [150, 300, 200, 250, 400]; // memory block sizes
const processes = [120, 220, 180, 300];        // process sizes
const colors = ["#e63946","#fcbf49","#2a9d8f","#8d99ae","#ff6b6b"];

function setupMemory() {
  memoryContainer.innerHTML = "";
  memoryBlocks.forEach((size, index) => {
    const block = document.createElement("div");
    block.classList.add("memory-block");
    block.dataset.size = size;
    block.dataset.free = size;

    const label = document.createElement("div");
    label.classList.add("memory-label");
    label.textContent = `Block ${index+1} | Size: ${size}`;
    block.appendChild(label);

    const freeSpace = document.createElement("div");
    freeSpace.classList.add("free-space");
    freeSpace.style.width = "100%";
    block.appendChild(freeSpace);

    memoryContainer.appendChild(block);
  });
}

function setupProcesses() {
  processContainer.innerHTML = "";
  processDetails.innerHTML = "";
  processes.forEach((pSize, i) => {
    const p = document.createElement("div");
    p.classList.add("process-block");
    p.textContent = `${pSize}`;
    p.dataset.size = pSize;
    p.style.backgroundColor = colors[i % colors.length];
    processContainer.appendChild(p);

    const detailDiv = document.createElement("div");
    detailDiv.id = `detail-${i}`;
    detailDiv.textContent = `Process P${pSize} | Size: ${pSize} | Status: Pending | Allocated Block: -`;
    processDetails.appendChild(detailDiv);
  });
}

async function allocateProcess(order) {
  const processElems = Array.from(processContainer.children);

  for (let i = 0; i < order.length; i++) {
    const { blockIndex, processSize } = order[i];
    const processElem = processElems[i];
    const detailDiv = document.getElementById(`detail-${i}`);

    if (blockIndex === null) {
      processElem.style.backgroundColor = "#555";
      detailDiv.textContent = `Process P${processSize} | Size: ${processSize} | Status: Not Allocated | Allocated Block: -`;
      continue;
    }

    const block = memoryContainer.children[blockIndex];
    const freeDiv = block.querySelector(".free-space");
    const free = parseInt(block.dataset.free);
    block.dataset.free = free - processSize;

    const procDiv = document.createElement("div");
    procDiv.classList.add("process-block");
    procDiv.style.backgroundColor = processElem.style.backgroundColor;
    procDiv.textContent = `${processSize}`;
    procDiv.style.left = "0";
    procDiv.style.top = "-70px";
    procDiv.style.width = `${(processSize/block.dataset.size)*100}%`;
    procDiv.style.height = `calc(100% - 25px)`; // leave label space
    procDiv.style.zIndex = "2";

    block.appendChild(procDiv);
    await new Promise(r => setTimeout(r, 100));
    procDiv.style.top = "25px"; // falls below label

    freeDiv.style.width = `${(free - processSize)/block.dataset.size*100}%`;
    processElem.remove();
    detailDiv.textContent = `Process P${processSize} | Size: ${processSize} | Status: Allocated | Allocated Block: Block ${blockIndex+1} | Remaining Memory: ${free-processSize}`;
    await new Promise(r => setTimeout(r, 700));
  }
}

// Allocation algorithms
function firstFit() {
  const order = [];
  const allocation = Array(memoryBlocks.length).fill(null);
  for (let i = 0; i < processes.length; i++) {
    let allocated = false;
    const pSize = processes[i];
    for (let j = 0; j < memoryBlocks.length; j++) {
      const free = parseInt(memoryContainer.children[j].dataset.free);
      if (free >= pSize && allocation[j] === null) {
        allocation[j] = pSize;
        order.push({ blockIndex: j, processSize: pSize });
        allocated = true;
        break;
      }
    }
    if (!allocated) order.push({ blockIndex: null, processSize: pSize });
  }
  return order;
}

function bestFit() {
  const order = [];
  const allocation = Array(memoryBlocks.length).fill(null);
  for (let i = 0; i < processes.length; i++) {
    const pSize = processes[i];
    let bestIndex = null;
    let minWaste = Infinity;
    for (let j = 0; j < memoryBlocks.length; j++) {
      const free = parseInt(memoryContainer.children[j].dataset.free);
      if (free >= pSize && allocation[j] === null) {
        const waste = free - pSize;
        if (waste < minWaste) { minWaste = waste; bestIndex = j; }
      }
    }
    if (bestIndex !== null) allocation[bestIndex] = pSize;
    order.push({ blockIndex: bestIndex, processSize: pSize });
  }
  return order;
}

function worstFit() {
  const order = [];
  const allocation = Array(memoryBlocks.length).fill(null);
  for (let i = 0; i < processes.length; i++) {
    const pSize = processes[i];
    let worstIndex = null;
    let maxFree = -1;
    for (let j = 0; j < memoryBlocks.length; j++) {
      const free = parseInt(memoryContainer.children[j].dataset.free);
      if (free >= pSize && allocation[j] === null) {
        if (free > maxFree) { maxFree = free; worstIndex = j; }
      }
    }
    if (worstIndex !== null) allocation[worstIndex] = pSize;
    order.push({ blockIndex: worstIndex, processSize: pSize });
  }
  return order;
}

// Event listener
startBtn.addEventListener("click", async () => {
  setupMemory();
  setupProcesses();
  const algo = algorithmSelect.value;

  if (algo === "none") { alert("Select an algorithm!"); return; }

  let order;
  if (algo === "firstfit") order = firstFit();
  else if (algo === "bestfit") order = bestFit();
  else if (algo === "worstfit") order = worstFit();

  await allocateProcess(order);
});

