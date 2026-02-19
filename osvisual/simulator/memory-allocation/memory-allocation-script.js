//Adding a new Hole Info Inputs
function addAHole(){
    handleAddAHole();
}

//Adding a new Process Info Inputs
function addAProcess(){
    handleAddAProcess();
}

//Showing the result
function impress(){
    inputError='';
    allocationError=[];
    absorbInfoFromInputs();
    constructMemory();
    mixConsecutiveHoles();
    mixConsecutiveHoles();
    mixConsecutiveHoles();
    draw();
    addFunctionalButtons();

    // ── Chatbot integration ──
    if (window.MemoryChat) {
        MemoryChat.updateContext({
            algorithm: { firstFit: "First Fit", bestFit: "Best Fit", worstFit: "Worst Fit" }[type] || type,
            holes: holesArray.map(h => ({ name: h.name, size: h.size, startingAt: h.startingAt, endingAt: h.endingAt })),
            processes: processesArray.map(p => ({ name: p.name, size: p.size, state: p.state, startingAt: p.startingAt, endingAt: p.endingAt })),
            memory: memory.map(b => ({ blockType: b.blockType, blockName: b.blockName, startingAt: b.startingAt, endingAt: b.endingAt, size: b.size })),
            failed: [...allocationError],
            lastMemoryPosition: lastMemoryPosition,
        });
    }
}