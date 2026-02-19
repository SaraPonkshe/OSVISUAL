(function () {
  "use strict";

  // ── State ──────────────────────────────────────────────────
  let diskContext = null;
  let messages = [];
  let isLoading = false;

  const GROQ_API_KEY = "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";

  const SUGGESTIONS = [
    "Which algorithm has least seek time?",
    "Explain the algorithm used",
    "What is seek time?",
    "How does SSTF differ from FCFS?",
  ];

  // ── Build system prompt ────────────────────────────────────
  function buildSystemPrompt(ctx) {
    const comparisonList = Object.entries(ctx.comparison || {})
      .map(([algo, seek]) => `  • ${algo}: ${seek} cylinders`)
      .join("\n");

    const traversalStr = ctx.traversalOrder
      ? ctx.traversalOrder.join(" → ")
      : "N/A";

    return `You are Schedulix Assistant, an expert in OS Disk Scheduling algorithms, embedded inside the Schedulix visualization tool.

The user just ran a disk scheduling simulation. Here is the EXACT result:

Algorithm: ${ctx.algorithm}
Initial Cylinder: ${ctx.initialCylinder}
Last Cylinder: ${ctx.lastCylinder}
${ctx.direction ? "Direction: " + ctx.direction : ""}
Request Queue: ${ctx.requestQueue.join(", ")}

Traversal Order: ${traversalStr}
Total Seek Time: ${ctx.seekTime} cylinders

Algorithm Comparison (seek times):
${comparisonList}

Rules:
- Answer questions about THIS specific simulation using the data above.
- Reference actual cylinder numbers and seek times when explaining.
- Be concise (under 120 words) unless the user asks for more detail.
- Use plain text, no markdown headers or bullet symbols — write naturally.
- If asked to compare algorithms, use the comparison data above.
- If asked about a different algorithm, reason about what WOULD happen with the same request queue.`;
  }

  // ── Render bubble (no push to messages[]) ─────────────────
  function renderBubble(role, text) {
    const container = document.getElementById("dsc-messages");
    if (!container) return;
    const div = document.createElement("div");
    div.className = `dsc-msg dsc-msg-${role}`;
    div.innerHTML = `<div class="dsc-bubble">${escapeHtml(text)}</div>`;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  // ── Add to state AND render ────────────────────────────────
  function addMessage(role, text) {
    messages.push({ role, content: text });
    renderBubble(role, text);
  }

  // ── Groq API call ──────────────────────────────────────────
  async function askGroq(userMessage) {
    if (!diskContext) {
      return "Please run a simulation first by clicking Calculate, then I can explain the results!";
    }

    const systemPrompt = buildSystemPrompt(diskContext);

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
    const container = document.getElementById("dsc-messages");
    if (!container) return;
    const div = document.createElement("div");
    div.className = "dsc-msg dsc-msg-assistant";
    div.id = "dsc-typing";
    div.innerHTML = `<div class="dsc-bubble dsc-typing-bubble">
      <span></span><span></span><span></span>
    </div>`;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  function hideTyping() {
    const el = document.getElementById("dsc-typing");
    if (el) el.remove();
  }

  function updateContextPill() {
    const pill = document.getElementById("dsc-context-pill");
    if (!pill) return;
    if (diskContext) {
      pill.style.display = "flex";
      pill.innerHTML = `<span class="dsc-algo-badge">${diskContext.algorithm}</span>
        <span class="dsc-pill-dot">·</span>
        <span>${diskContext.requestQueue.length} requests</span>
        <span class="dsc-pill-dot">·</span>
        <span>Seek: ${diskContext.seekTime}</span>`;
    } else {
      pill.style.display = "none";
    }
  }

  function updateSuggestions() {
    const el = document.getElementById("dsc-suggestions");
    if (!el) return;
    el.style.display = messages.filter((m) => m.role === "user").length === 0 ? "flex" : "none";
  }

  // ── Send message ───────────────────────────────────────────
  async function sendMessage(text) {
    const input = document.getElementById("dsc-input");
    const userText = text || (input ? input.value.trim() : "");
    if (!userText || isLoading) return;
    if (input) input.value = "";

    isLoading = true;
    const btn = document.getElementById("dsc-send-btn");
    if (btn) btn.disabled = true;

    addMessage("user", userText);
    updateSuggestions();
    showTyping();

    try {
      const reply = await askGroq(userText);
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
      #dsc-fab {
        position: fixed; bottom: 28px; right: 28px;
        width: 58px; height: 58px; border-radius: 50%;
        background: linear-gradient(135deg, #3b82f6 0%, #6366f1 100%);
        border: none; cursor: pointer; z-index: 9999;
        box-shadow: 0 4px 20px rgba(59,130,246,0.45);
        display: flex; align-items: center; justify-content: center;
        font-size: 24px; transition: transform 0.2s, box-shadow 0.2s;
        color: #fff;
      }
      #dsc-fab:hover { transform: scale(1.08); box-shadow: 0 6px 28px rgba(59,130,246,0.55); }
      #dsc-fab.open { background: #374151; box-shadow: 0 4px 20px rgba(0,0,0,0.3); }
      #dsc-fab.has-context::after {
        content: ''; position: absolute; top: -4px; right: -4px;
        width: 16px; height: 16px; background: #10b981;
        border-radius: 50%; border: 2px solid #fff;
        animation: dsc-pulse 2s infinite;
      }
      @keyframes dsc-pulse {
        0%,100% { transform: scale(1); opacity: 1; }
        50% { transform: scale(1.3); opacity: 0.7; }
      }
      #dsc-panel {
        position: fixed; bottom: 100px; right: 28px;
        width: 370px; height: 530px;
        background: #fff; border-radius: 18px;
        box-shadow: 0 12px 50px rgba(0,0,0,0.18);
        display: flex; flex-direction: column;
        font-family: 'Segoe UI', system-ui, sans-serif;
        z-index: 9998; overflow: hidden;
        border: 1px solid #e5e7eb;
        transition: opacity 0.2s, transform 0.2s;
        transform-origin: bottom right;
      }
      #dsc-panel.hidden {
        opacity: 0; transform: scale(0.92) translateY(12px);
        pointer-events: none;
      }
      #dsc-header {
        background: linear-gradient(135deg, #1e3a5f 0%, #1d4ed8 100%);
        padding: 14px 18px;
        display: flex; align-items: center; gap: 10px;
        flex-shrink: 0;
      }
      #dsc-avatar {
        width: 38px; height: 38px; border-radius: 50%;
        background: linear-gradient(135deg, #3b82f6, #6366f1);
        display: flex; align-items: center; justify-content: center;
        font-size: 18px; flex-shrink: 0;
      }
      #dsc-header-text { flex: 1; }
      #dsc-header-title { color: #fff; font-weight: 700; font-size: 14px; }
      #dsc-header-sub { color: #93c5fd; font-size: 11px; }
      #dsc-status-dot {
        width: 9px; height: 9px; border-radius: 50%;
        background: #10b981; box-shadow: 0 0 8px #10b981;
        flex-shrink: 0;
      }
      #dsc-context-pill {
        background: #f9fafb; border-bottom: 1px solid #e5e7eb;
        padding: 7px 14px; font-size: 11px; color: #6b7280;
        display: none; align-items: center; gap: 6px; flex-shrink: 0;
      }
      .dsc-algo-badge {
        background: #dbeafe; color: #1d4ed8;
        border-radius: 4px; padding: 1px 7px; font-weight: 700; font-size: 11px;
      }
      .dsc-pill-dot { color: #d1d5db; }
      #dsc-messages {
        flex: 1; overflow-y: auto; padding: 14px 14px 6px;
        display: flex; flex-direction: column; gap: 10px;
        scroll-behavior: smooth;
      }
      #dsc-messages::-webkit-scrollbar { width: 5px; }
      #dsc-messages::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 4px; }
      .dsc-msg { display: flex; }
      .dsc-msg-user { justify-content: flex-end; }
      .dsc-msg-assistant { justify-content: flex-start; }
      .dsc-bubble {
        max-width: 82%; padding: 10px 14px;
        font-size: 13.5px; line-height: 1.55;
        white-space: pre-wrap; word-break: break-word;
      }
      .dsc-msg-user .dsc-bubble {
        background: linear-gradient(135deg, #3b82f6, #6366f1);
        color: #fff; border-radius: 16px 16px 4px 16px;
      }
      .dsc-msg-assistant .dsc-bubble {
        background: #f3f4f6; color: #1f2937;
        border-radius: 16px 16px 16px 4px;
      }
      .dsc-typing-bubble {
        display: flex; align-items: center; gap: 5px;
        padding: 12px 16px !important;
      }
      .dsc-typing-bubble span {
        width: 7px; height: 7px; border-radius: 50%;
        background: #9ca3af; display: block;
        animation: dsc-bounce 1.2s infinite;
      }
      .dsc-typing-bubble span:nth-child(2) { animation-delay: 0.2s; }
      .dsc-typing-bubble span:nth-child(3) { animation-delay: 0.4s; }
      @keyframes dsc-bounce {
        0%,60%,100% { transform: translateY(0); }
        30% { transform: translateY(-7px); }
      }
      #dsc-suggestions {
        padding: 6px 12px; gap: 6px; flex-wrap: wrap;
        display: flex; flex-shrink: 0;
      }
      .dsc-suggestion {
        background: #fff; border: 1px solid #e5e7eb;
        border-radius: 20px; padding: 4px 11px;
        font-size: 11.5px; cursor: pointer; color: #374151;
        transition: border-color 0.15s, color 0.15s;
        font-family: inherit;
      }
      .dsc-suggestion:hover { border-color: #3b82f6; color: #1d4ed8; }
      #dsc-input-area {
        padding: 10px 12px; border-top: 1px solid #e5e7eb;
        display: flex; gap: 8px; align-items: center; flex-shrink: 0;
      }
      #dsc-input {
        flex: 1; padding: 9px 13px; border-radius: 10px;
        border: 1.5px solid #e5e7eb; outline: none;
        font-size: 13.5px; color: #1f2937;
        font-family: inherit; transition: border-color 0.15s;
        background: #fff;
      }
      #dsc-input:focus { border-color: #3b82f6; }
      #dsc-send-btn {
        width: 38px; height: 38px; border-radius: 10px; border: none;
        background: linear-gradient(135deg, #3b82f6, #6366f1);
        cursor: pointer; font-size: 17px; color: #fff;
        display: flex; align-items: center; justify-content: center;
        transition: opacity 0.2s; flex-shrink: 0;
      }
      #dsc-send-btn:disabled { opacity: 0.45; cursor: not-allowed; }
      #dsc-no-context {
        margin: 0 14px; padding: 10px 13px;
        background: #eff6ff; border: 1px solid #bfdbfe;
        border-radius: 10px; font-size: 12px; color: #1e40af;
        flex-shrink: 0;
      }
      @media (max-width: 480px) {
        #dsc-panel { width: calc(100vw - 24px); right: 12px; bottom: 88px; }
        #dsc-fab { bottom: 18px; right: 18px; }
      }
        #dsc-fab {
    position: fixed !important;
    bottom: 28px !important;
    right: 28px !important;
    z-index: 99999 !important;
    display: flex !important;
}

#dsc-panel {
    position: fixed !important;
    z-index: 99998 !important;
}
    `;
    document.head.appendChild(style);
  }

  // ── Inject HTML ────────────────────────────────────────────
  function injectHTML() {
    const fab = document.createElement("button");
    fab.id = "dsc-fab";
    fab.title = "Ask Disk Scheduling AI";
    fab.textContent = "💬";

    const panel = document.createElement("div");
    panel.id = "dsc-panel";
    panel.className = "hidden";
    panel.innerHTML = `
      <div id="dsc-header">
        <div id="dsc-avatar">💿</div>
        <div id="dsc-header-text">
          <div id="dsc-header-title">Schedulix Assistant</div>
          <div id="dsc-header-sub">Ask why · Explain disk decisions</div>
        </div>
        <div id="dsc-status-dot"></div>
      </div>
      <div id="dsc-context-pill"></div>
      <div id="dsc-no-context">
        ⚡ Run a simulation first — click <b>Calculate</b> to enable AI explanations.
      </div>
      <div id="dsc-messages"></div>
      <div id="dsc-suggestions">
        ${SUGGESTIONS.map(
          (s) => `<button class="dsc-suggestion" data-suggestion="${s.replace(/"/g, "&quot;")}">${s}</button>`
        ).join("")}
      </div>
      <div id="dsc-input-area">
        <input id="dsc-input" type="text" placeholder="Ask about the disk schedule..." autocomplete="off" />
        <button id="dsc-send-btn" title="Send">↑</button>
      </div>
    `;

    document.body.appendChild(fab);
    document.body.appendChild(panel);

    fab.addEventListener("click", togglePanel);
    document.getElementById("dsc-send-btn").addEventListener("click", () => sendMessage());
    document.getElementById("dsc-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });
    document.querySelectorAll(".dsc-suggestion").forEach((btn) => {
      btn.addEventListener("click", () => sendMessage(btn.dataset.suggestion));
    });
  }

  // ── Toggle panel ───────────────────────────────────────────
  function togglePanel() {
    const panel = document.getElementById("dsc-panel");
    const fab = document.getElementById("dsc-fab");
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
        const welcomeText = diskContext
          ? `Hey! I can explain how ${diskContext.algorithm} scheduled the disk requests. What would you like to know?`
          : "Hey! Run a simulation first by clicking Calculate, then I can explain the disk scheduling decisions in detail.";
        // Render only — do NOT push to messages[] so API conversation starts clean
        renderBubble("assistant", welcomeText);
      }

      setTimeout(() => document.getElementById("dsc-input").focus(), 100);
    }
  }

  // ── Public API ─────────────────────────────────────────────
  window.DiskSchedulixChat = {
    updateContext: function (ctx) {
      diskContext = ctx;
      messages = []; // Reset conversation for new simulation

      const fab = document.getElementById("dsc-fab");
      const noCtx = document.getElementById("dsc-no-context");
      const msgsEl = document.getElementById("dsc-messages");

      if (fab) fab.classList.add("has-context");
      if (noCtx) noCtx.style.display = "none";
      if (msgsEl) {
        msgsEl.style.display = "flex";
        msgsEl.innerHTML = "";
      }

      updateContextPill();
      updateSuggestions();

      const panel = document.getElementById("dsc-panel");
      if (panel && !panel.classList.contains("hidden")) {
        renderBubble(
          "assistant",
          `I've loaded the new ${ctx.algorithm} simulation with ${ctx.requestQueue.length} requests. Total seek time: ${ctx.seekTime}. What would you like to know?`
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