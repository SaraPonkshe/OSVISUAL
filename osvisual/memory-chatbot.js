(function () {
  "use strict";

  // ── State ──────────────────────────────────────────────────
  let memoryContext = null;
  let messages = [];
  let isLoading = false;

  const GROQ_API_KEY = "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";

  const SUGGESTIONS = [
    "Which processes were allocated?",
    "Explain the algorithm used",
    "Which process couldn't fit?",
    "How does First Fit differ from Best Fit?",
  ];

  // ── Build system prompt ────────────────────────────────────
  function buildSystemPrompt(ctx) {
    const holesList = ctx.holes
      .map(h => `  • ${h.name}: size=${h.size}, from ${h.startingAt} to ${h.endingAt}`)
      .join("\n");

    const processList = ctx.processes
      .map(p => `  • ${p.name}: size=${p.size}, state=${p.state}${p.state === "allocated" ? `, from ${p.startingAt} to ${p.endingAt}` : ""}`)
      .join("\n");

    const failedList = ctx.failed.length > 0
      ? ctx.failed.join(", ")
      : "None — all processes allocated successfully";

    const memoryLayout = ctx.memory
      .map(b => `  [${b.startingAt}-${b.endingAt}] ${b.blockType === "process" ? b.blockName : b.blockType} (size=${b.size})`)
      .join("\n");

    return `You are Schedulix Assistant, an expert in OS Memory Allocation techniques, embedded inside the Schedulix visualization tool.

The user just ran a memory allocation simulation. Here is the EXACT result:

Algorithm: ${ctx.algorithm}
Total Memory Range: 0 to ${ctx.lastMemoryPosition}

Holes (free memory blocks):
${holesList}

Processes to allocate:
${processList}

Processes that FAILED to allocate: ${failedList}

Final Memory Layout:
${memoryLayout}

Rules:
- Answer questions about THIS specific simulation using the data above.
- Reference actual hole sizes, process sizes, and positions when explaining.
- Be concise (under 120 words) unless the user asks for more detail.
- Use plain text, no markdown headers or bullet symbols — write naturally.
- If a process failed, explain why (too large for any available hole).
- If asked to compare algorithms, explain what First Fit, Best Fit, and Worst Fit would do differently with these same holes and processes.`;
  }

  // ── Render bubble (no push to messages[]) ─────────────────
  function renderBubble(role, text) {
    const container = document.getElementById("mac-messages");
    if (!container) return;
    const div = document.createElement("div");
    div.className = `mac-msg mac-msg-${role}`;
    div.innerHTML = `<div class="mac-bubble">${escapeHtml(text)}</div>`;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  // ── Add to state AND render ────────────────────────────────
  function addMessage(role, text) {
    messages.push({ role, content: text });
    renderBubble(role, text);
  }

  // ── Groq API call ──────────────────────────────────────────
  async function askGroq() {
    if (!memoryContext) {
      return "Please run a simulation first by clicking Calculate, then I can explain the results!";
    }

    const systemPrompt = buildSystemPrompt(memoryContext);

    const apiMessages = [];
    for (const m of messages) {
      const role = m.role === "assistant" ? "assistant" : "user";
      if (apiMessages.length > 0 && apiMessages[apiMessages.length - 1].role === role) {
        apiMessages[apiMessages.length - 1].content += "\n" + m.content;
      } else {
        apiMessages.push({ role, content: m.content });
      }
    }

    while (apiMessages.length > 0 && apiMessages[0].role === "assistant") {
      apiMessages.shift();
    }

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        max_tokens: 1000,
        messages: [
          { role: "system", content: systemPrompt },
          ...apiMessages,
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  // ── DOM Helpers ────────────────────────────────────────────
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function showTyping() {
    const container = document.getElementById("mac-messages");
    if (!container) return;
    const div = document.createElement("div");
    div.className = "mac-msg mac-msg-assistant";
    div.id = "mac-typing";
    div.innerHTML = `<div class="mac-bubble mac-typing-bubble">
      <span></span><span></span><span></span>
    </div>`;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  function hideTyping() {
    const el = document.getElementById("mac-typing");
    if (el) el.remove();
  }

  function updateContextPill() {
    const pill = document.getElementById("mac-context-pill");
    if (!pill) return;
    if (memoryContext) {
      pill.style.display = "flex";
      const allocated = memoryContext.processes.filter(p => p.state === "allocated").length;
      pill.innerHTML = `<span class="mac-algo-badge">${memoryContext.algorithm}</span>
        <span class="mac-pill-dot">·</span>
        <span>${memoryContext.processes.length} processes</span>
        <span class="mac-pill-dot">·</span>
        <span>${allocated} allocated</span>`;
    } else {
      pill.style.display = "none";
    }
  }

  function updateSuggestions() {
    const el = document.getElementById("mac-suggestions");
    if (!el) return;
    el.style.display = messages.filter((m) => m.role === "user").length === 0 ? "flex" : "none";
  }

  // ── Send message ───────────────────────────────────────────
  async function sendMessage(text) {
    const input = document.getElementById("mac-input");
    const userText = text || (input ? input.value.trim() : "");
    if (!userText || isLoading) return;
    if (input) input.value = "";

    isLoading = true;
    const btn = document.getElementById("mac-send-btn");
    if (btn) btn.disabled = true;

    addMessage("user", userText);
    updateSuggestions();
    showTyping();

    try {
      const reply = await askGroq();
      hideTyping();
      addMessage("assistant", reply);
    } catch (e) {
      hideTyping();
      addMessage("assistant", "⚠️ Couldn't reach AI. Check your connection and try again. (" + e.message + ")");
    } finally {
      isLoading = false;
      if (btn) btn.disabled = false;
      updateSuggestions();
    }
  }

  // ── Inject CSS ─────────────────────────────────────────────
  function injectStyles() {
    const style = document.createElement("style");
    style.textContent = `
      #mac-fab {
        position: fixed !important; bottom: 28px !important; right: 28px !important;
        width: 58px; height: 58px; border-radius: 50%;
        background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%);
        border: none; cursor: pointer; z-index: 99999 !important;
        box-shadow: 0 4px 20px rgba(139,92,246,0.45);
        display: flex !important; align-items: center; justify-content: center;
        font-size: 24px; transition: transform 0.2s, box-shadow 0.2s;
        color: #fff;
      }
      #mac-fab:hover { transform: scale(1.08); box-shadow: 0 6px 28px rgba(139,92,246,0.55); }
      #mac-fab.open { background: #374151; box-shadow: 0 4px 20px rgba(0,0,0,0.3); }
      #mac-fab.has-context::after {
        content: ''; position: absolute; top: -4px; right: -4px;
        width: 16px; height: 16px; background: #10b981;
        border-radius: 50%; border: 2px solid #fff;
        animation: mac-pulse 2s infinite;
      }
      @keyframes mac-pulse {
        0%,100% { transform: scale(1); opacity: 1; }
        50% { transform: scale(1.3); opacity: 0.7; }
      }
      #mac-panel {
        position: fixed !important; bottom: 100px !important; right: 28px !important;
        width: 370px; height: 530px;
        background: #fff; border-radius: 18px;
        box-shadow: 0 12px 50px rgba(0,0,0,0.18);
        display: flex; flex-direction: column;
        font-family: 'Segoe UI', system-ui, sans-serif;
        z-index: 99998 !important; overflow: hidden;
        border: 1px solid #e5e7eb;
        transition: opacity 0.2s, transform 0.2s;
        transform-origin: bottom right;
      }
      #mac-panel.hidden {
        opacity: 0; transform: scale(0.92) translateY(12px);
        pointer-events: none;
      }
      #mac-header {
        background: linear-gradient(135deg, #4c1d95 0%, #6d28d9 100%);
        padding: 14px 18px;
        display: flex; align-items: center; gap: 10px;
        flex-shrink: 0;
      }
      #mac-avatar {
        width: 38px; height: 38px; border-radius: 50%;
        background: linear-gradient(135deg, #8b5cf6, #6d28d9);
        display: flex; align-items: center; justify-content: center;
        font-size: 18px; flex-shrink: 0;
      }
      #mac-header-text { flex: 1; }
      #mac-header-title { color: #fff; font-weight: 700; font-size: 14px; }
      #mac-header-sub { color: #c4b5fd; font-size: 11px; }
      #mac-status-dot {
        width: 9px; height: 9px; border-radius: 50%;
        background: #10b981; box-shadow: 0 0 8px #10b981;
        flex-shrink: 0;
      }
      #mac-context-pill {
        background: #f9fafb; border-bottom: 1px solid #e5e7eb;
        padding: 7px 14px; font-size: 11px; color: #6b7280;
        display: none; align-items: center; gap: 6px; flex-shrink: 0;
      }
      .mac-algo-badge {
        background: #ede9fe; color: #6d28d9;
        border-radius: 4px; padding: 1px 7px; font-weight: 700; font-size: 11px;
      }
      .mac-pill-dot { color: #d1d5db; }
      #mac-messages {
        flex: 1; overflow-y: auto; padding: 14px 14px 6px;
        display: flex; flex-direction: column; gap: 10px;
        scroll-behavior: smooth;
      }
      #mac-messages::-webkit-scrollbar { width: 5px; }
      #mac-messages::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 4px; }
      .mac-msg { display: flex; }
      .mac-msg-user { justify-content: flex-end; }
      .mac-msg-assistant { justify-content: flex-start; }
      .mac-bubble {
        max-width: 82%; padding: 10px 14px;
        font-size: 13.5px; line-height: 1.55;
        white-space: pre-wrap; word-break: break-word;
      }
      .mac-msg-user .mac-bubble {
        background: linear-gradient(135deg, #8b5cf6, #6d28d9);
        color: #fff; border-radius: 16px 16px 4px 16px;
      }
      .mac-msg-assistant .mac-bubble {
        background: #f3f4f6; color: #1f2937;
        border-radius: 16px 16px 16px 4px;
      }
      .mac-typing-bubble {
        display: flex; align-items: center; gap: 5px;
        padding: 12px 16px !important;
      }
      .mac-typing-bubble span {
        width: 7px; height: 7px; border-radius: 50%;
        background: #9ca3af; display: block;
        animation: mac-bounce 1.2s infinite;
      }
      .mac-typing-bubble span:nth-child(2) { animation-delay: 0.2s; }
      .mac-typing-bubble span:nth-child(3) { animation-delay: 0.4s; }
      @keyframes mac-bounce {
        0%,60%,100% { transform: translateY(0); }
        30% { transform: translateY(-7px); }
      }
      #mac-suggestions {
        padding: 6px 12px; gap: 6px; flex-wrap: wrap;
        display: flex; flex-shrink: 0;
      }
      .mac-suggestion {
        background: #fff; border: 1px solid #e5e7eb;
        border-radius: 20px; padding: 4px 11px;
        font-size: 11.5px; cursor: pointer; color: #374151;
        transition: border-color 0.15s, color 0.15s;
        font-family: inherit;
      }
      .mac-suggestion:hover { border-color: #8b5cf6; color: #6d28d9; }
      #mac-input-area {
        padding: 10px 12px; border-top: 1px solid #e5e7eb;
        display: flex; gap: 8px; align-items: center; flex-shrink: 0;
      }
      #mac-input {
        flex: 1; padding: 9px 13px; border-radius: 10px;
        border: 1.5px solid #e5e7eb; outline: none;
        font-size: 13.5px; color: #1f2937;
        font-family: inherit; transition: border-color 0.15s;
        background: #fff;
      }
      #mac-input:focus { border-color: #8b5cf6; }
      #mac-send-btn {
        width: 38px; height: 38px; border-radius: 10px; border: none;
        background: linear-gradient(135deg, #8b5cf6, #6d28d9);
        cursor: pointer; font-size: 17px; color: #fff;
        display: flex; align-items: center; justify-content: center;
        transition: opacity 0.2s; flex-shrink: 0;
      }
      #mac-send-btn:disabled { opacity: 0.45; cursor: not-allowed; }
      #mac-no-context {
        margin: 0 14px; padding: 10px 13px;
        background: #f5f3ff; border: 1px solid #c4b5fd;
        border-radius: 10px; font-size: 12px; color: #4c1d95;
        flex-shrink: 0;
      }
      @media (max-width: 480px) {
        #mac-panel { width: calc(100vw - 24px) !important; right: 12px !important; bottom: 88px !important; }
        #mac-fab { bottom: 18px !important; right: 18px !important; }
      }
    `;
    document.head.appendChild(style);
  }

  // ── Inject HTML ────────────────────────────────────────────
  function injectHTML() {
    const fab = document.createElement("button");
    fab.id = "mac-fab";
    fab.title = "Ask Memory Allocation AI";
    fab.textContent = "💬";

    const panel = document.createElement("div");
    panel.id = "mac-panel";
    panel.className = "hidden";
    panel.innerHTML = `
      <div id="mac-header">
        <div id="mac-avatar">🧠</div>
        <div id="mac-header-text">
          <div id="mac-header-title">Schedulix Assistant</div>
          <div id="mac-header-sub">Memory Allocation · Fit Analysis</div>
        </div>
        <div id="mac-status-dot"></div>
      </div>
      <div id="mac-context-pill"></div>
      <div id="mac-no-context">
        ⚡ Add holes & processes, then click <b>Calculate</b> to enable AI explanations.
      </div>
      <div id="mac-messages"></div>
      <div id="mac-suggestions">
        ${SUGGESTIONS.map(
          (s) => `<button class="mac-suggestion" data-suggestion="${s.replace(/"/g, "&quot;")}">${s}</button>`
        ).join("")}
      </div>
      <div id="mac-input-area">
        <input id="mac-input" type="text" placeholder="Ask about memory allocation..." autocomplete="off" />
        <button id="mac-send-btn" title="Send">↑</button>
      </div>
    `;

    document.body.appendChild(fab);
    document.body.appendChild(panel);

    fab.addEventListener("click", togglePanel);
    document.getElementById("mac-send-btn").addEventListener("click", () => sendMessage());
    document.getElementById("mac-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });
    document.querySelectorAll(".mac-suggestion").forEach((btn) => {
      btn.addEventListener("click", () => sendMessage(btn.dataset.suggestion));
    });
  }

  // ── Toggle panel ───────────────────────────────────────────
  function togglePanel() {
    const panel = document.getElementById("mac-panel");
    const fab = document.getElementById("mac-fab");
    const isOpen = !panel.classList.contains("hidden");

    if (isOpen) {
      panel.classList.add("hidden");
      fab.classList.remove("open");
      fab.textContent = "💬";
    } else {
      panel.classList.remove("hidden");
      fab.classList.add("open");
      fab.textContent = "✕";

      if (messages.length === 0) {
        const welcomeText = memoryContext
          ? `Hey! I can explain how ${memoryContext.algorithm} allocated the processes into memory. What would you like to know?`
          : "Hey! Add your holes and processes, then click Calculate — I'll explain the allocation decisions in detail.";
        renderBubble("assistant", welcomeText);
      }

      setTimeout(() => document.getElementById("mac-input").focus(), 100);
    }
  }

  // ── Public API ─────────────────────────────────────────────
  window.MemoryChat = {
    updateContext: function (ctx) {
      memoryContext = ctx;
      messages = [];

      const fab = document.getElementById("mac-fab");
      const noCtx = document.getElementById("mac-no-context");
      const msgsEl = document.getElementById("mac-messages");

      if (fab) fab.classList.add("has-context");
      if (noCtx) noCtx.style.display = "none";
      if (msgsEl) {
        msgsEl.style.display = "flex";
        msgsEl.innerHTML = "";
      }

      updateContextPill();
      updateSuggestions();

      const panel = document.getElementById("mac-panel");
      if (panel && !panel.classList.contains("hidden")) {
        const allocated = ctx.processes.filter(p => p.state === "allocated").length;
        renderBubble("assistant",
          `I've loaded the new ${ctx.algorithm} simulation with ${ctx.processes.length} processes and ${ctx.holes.length} holes. ${allocated} of ${ctx.processes.length} processes were allocated. What would you like to know?`
        );
      }
    },
    send: sendMessage,
  };

  // ── Init ───────────────────────────────────────────────────
  function init() {
    injectStyles();
    injectHTML();
    updateContextPill();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();