(function () {
  "use strict";

  // ── State ──────────────────────────────────────────────────
  let deadlockContext = null;
  let messages = [];
  let isLoading = false;

  const GROQ_API_KEY = "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";

  const SUGGESTIONS = [
    "Is the system in a safe state?",
    "Explain the safe sequence",
    "What is Banker's Algorithm?",
    "Why did deadlock occur?",
  ];

  // ── Build system prompt ────────────────────────────────────
  function buildSystemPrompt(ctx) {
    const resourceList = ctx.resources.map((r, i) => `R${i + 1}=${r}`).join(", ");
    const availableList = ctx.available.map((a, i) => `R${i + 1}=${a}`).join(", ");

    const maxMatrix = ctx.max
      .map((row, i) => `  P${i + 1}: [${row.join(", ")}]`)
      .join("\n");

    const allocMatrix = ctx.allocation
      .map((row, i) => `  P${i + 1}: [${row.join(", ")}]`)
      .join("\n");

    const needMatrix = ctx.need
      .map((row, i) => `  P${i + 1}: [${row.join(", ")}]`)
      .join("\n");

    const safeSeq = ctx.safeSequence.length > 0
      ? ctx.safeSequence.map(p => `P${p}`).join(" → ")
      : "No safe sequence (Deadlock detected)";

    return `You are Schedulix Assistant, an expert in OS Deadlock Avoidance using Banker's Algorithm, embedded inside the Schedulix visualization tool.

The user just ran a Banker's Algorithm simulation. Here is the EXACT result:

Number of Processes: ${ctx.nbProc}
Number of Resources: ${ctx.nbResources}
Resource Instances: [${resourceList}]
Available Resources: [${availableList}]

Max Matrix (max resources each process may request):
${maxMatrix}

Allocation Matrix (currently allocated):
${allocMatrix}

Need Matrix (Max - Allocation):
${needMatrix}

Result: ${ctx.deadlock ? "DEADLOCK DETECTED" : "NO DEADLOCK - System is in a SAFE STATE"}
Safe Sequence: ${safeSeq}
Execution Time: ${ctx.executionTime}ms

Rules:
- Answer questions about THIS specific simulation using the data above.
- Reference actual process numbers, resource values, and matrices when explaining.
- Be concise (under 120 words) unless the user asks for more detail.
- Use plain text, no markdown headers or bullet symbols — write naturally.
- If deadlock occurred, explain which processes could not proceed and why.
- If safe, explain why the sequence works step by step if asked.`;
  }

  // ── Render bubble (no push to messages[]) ─────────────────
  function renderBubble(role, text) {
    const container = document.getElementById("dlc-messages");
    if (!container) return;
    const div = document.createElement("div");
    div.className = `dlc-msg dlc-msg-${role}`;
    div.innerHTML = `<div class="dlc-bubble">${escapeHtml(text)}</div>`;
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
    if (!deadlockContext) {
      return "Please run a simulation first using the Banker's Algorithm form, then I can explain the results!";
    }

    const systemPrompt = buildSystemPrompt(deadlockContext);

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
    const container = document.getElementById("dlc-messages");
    if (!container) return;
    const div = document.createElement("div");
    div.className = "dlc-msg dlc-msg-assistant";
    div.id = "dlc-typing";
    div.innerHTML = `<div class="dlc-bubble dlc-typing-bubble">
      <span></span><span></span><span></span>
    </div>`;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  function hideTyping() {
    const el = document.getElementById("dlc-typing");
    if (el) el.remove();
  }

  function updateContextPill() {
    const pill = document.getElementById("dlc-context-pill");
    if (!pill) return;
    if (deadlockContext) {
      pill.style.display = "flex";
      const status = deadlockContext.deadlock ? "🔴 Deadlock" : "🟢 Safe";
      pill.innerHTML = `<span class="dlc-algo-badge">Banker's Algorithm</span>
        <span class="dlc-pill-dot">·</span>
        <span>${deadlockContext.nbProc} processes</span>
        <span class="dlc-pill-dot">·</span>
        <span>${status}</span>`;
    } else {
      pill.style.display = "none";
    }
  }

  function updateSuggestions() {
    const el = document.getElementById("dlc-suggestions");
    if (!el) return;
    el.style.display = messages.filter((m) => m.role === "user").length === 0 ? "flex" : "none";
  }

  // ── Send message ───────────────────────────────────────────
  async function sendMessage(text) {
    const input = document.getElementById("dlc-input");
    const userText = text || (input ? input.value.trim() : "");
    if (!userText || isLoading) return;
    if (input) input.value = "";

    isLoading = true;
    const btn = document.getElementById("dlc-send-btn");
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
      #dlc-fab {
        position: fixed !important; bottom: 28px !important; right: 28px !important;
        width: 58px; height: 58px; border-radius: 50%;
        background: linear-gradient(135deg, #10b981 0%, #065f46 100%);
        border: none; cursor: pointer; z-index: 99999 !important;
        box-shadow: 0 4px 20px rgba(16,185,129,0.45);
        display: flex !important; align-items: center; justify-content: center;
        font-size: 24px; transition: transform 0.2s, box-shadow 0.2s;
        color: #fff;
      }
      #dlc-fab:hover { transform: scale(1.08); box-shadow: 0 6px 28px rgba(16,185,129,0.55); }
      #dlc-fab.open { background: #374151; box-shadow: 0 4px 20px rgba(0,0,0,0.3); }
      #dlc-fab.has-context::after {
        content: ''; position: absolute; top: -4px; right: -4px;
        width: 16px; height: 16px; background: #f59e0b;
        border-radius: 50%; border: 2px solid #fff;
        animation: dlc-pulse 2s infinite;
      }
      @keyframes dlc-pulse {
        0%,100% { transform: scale(1); opacity: 1; }
        50% { transform: scale(1.3); opacity: 0.7; }
      }
      #dlc-panel {
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
      #dlc-panel.hidden {
        opacity: 0; transform: scale(0.92) translateY(12px);
        pointer-events: none;
      }
      #dlc-header {
        background: linear-gradient(135deg, #064e3b 0%, #065f46 100%);
        padding: 14px 18px;
        display: flex; align-items: center; gap: 10px;
        flex-shrink: 0;
      }
      #dlc-avatar {
        width: 38px; height: 38px; border-radius: 50%;
        background: linear-gradient(135deg, #10b981, #065f46);
        display: flex; align-items: center; justify-content: center;
        font-size: 18px; flex-shrink: 0;
      }
      #dlc-header-text { flex: 1; }
      #dlc-header-title { color: #fff; font-weight: 700; font-size: 14px; }
      #dlc-header-sub { color: #6ee7b7; font-size: 11px; }
      #dlc-status-dot {
        width: 9px; height: 9px; border-radius: 50%;
        background: #10b981; box-shadow: 0 0 8px #10b981;
        flex-shrink: 0;
      }
      #dlc-context-pill {
        background: #f9fafb; border-bottom: 1px solid #e5e7eb;
        padding: 7px 14px; font-size: 11px; color: #6b7280;
        display: none; align-items: center; gap: 6px; flex-shrink: 0;
      }
      .dlc-algo-badge {
        background: #d1fae5; color: #065f46;
        border-radius: 4px; padding: 1px 7px; font-weight: 700; font-size: 11px;
      }
      .dlc-pill-dot { color: #d1d5db; }
      #dlc-messages {
        flex: 1; overflow-y: auto; padding: 14px 14px 6px;
        display: flex; flex-direction: column; gap: 10px;
        scroll-behavior: smooth;
      }
      #dlc-messages::-webkit-scrollbar { width: 5px; }
      #dlc-messages::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 4px; }
      .dlc-msg { display: flex; }
      .dlc-msg-user { justify-content: flex-end; }
      .dlc-msg-assistant { justify-content: flex-start; }
      .dlc-bubble {
        max-width: 82%; padding: 10px 14px;
        font-size: 13.5px; line-height: 1.55;
        white-space: pre-wrap; word-break: break-word;
      }
      .dlc-msg-user .dlc-bubble {
        background: linear-gradient(135deg, #10b981, #065f46);
        color: #fff; border-radius: 16px 16px 4px 16px;
      }
      .dlc-msg-assistant .dlc-bubble {
        background: #f3f4f6; color: #1f2937;
        border-radius: 16px 16px 16px 4px;
      }
      .dlc-typing-bubble {
        display: flex; align-items: center; gap: 5px;
        padding: 12px 16px !important;
      }
      .dlc-typing-bubble span {
        width: 7px; height: 7px; border-radius: 50%;
        background: #9ca3af; display: block;
        animation: dlc-bounce 1.2s infinite;
      }
      .dlc-typing-bubble span:nth-child(2) { animation-delay: 0.2s; }
      .dlc-typing-bubble span:nth-child(3) { animation-delay: 0.4s; }
      @keyframes dlc-bounce {
        0%,60%,100% { transform: translateY(0); }
        30% { transform: translateY(-7px); }
      }
      #dlc-suggestions {
        padding: 6px 12px; gap: 6px; flex-wrap: wrap;
        display: flex; flex-shrink: 0;
      }
      .dlc-suggestion {
        background: #fff; border: 1px solid #e5e7eb;
        border-radius: 20px; padding: 4px 11px;
        font-size: 11.5px; cursor: pointer; color: #374151;
        transition: border-color 0.15s, color 0.15s;
        font-family: inherit;
      }
      .dlc-suggestion:hover { border-color: #10b981; color: #065f46; }
      #dlc-input-area {
        padding: 10px 12px; border-top: 1px solid #e5e7eb;
        display: flex; gap: 8px; align-items: center; flex-shrink: 0;
      }
      #dlc-input {
        flex: 1; padding: 9px 13px; border-radius: 10px;
        border: 1.5px solid #e5e7eb; outline: none;
        font-size: 13.5px; color: #1f2937;
        font-family: inherit; transition: border-color 0.15s;
        background: #fff;
      }
      #dlc-input:focus { border-color: #10b981; }
      #dlc-send-btn {
        width: 38px; height: 38px; border-radius: 10px; border: none;
        background: linear-gradient(135deg, #10b981, #065f46);
        cursor: pointer; font-size: 17px; color: #fff;
        display: flex; align-items: center; justify-content: center;
        transition: opacity 0.2s; flex-shrink: 0;
      }
      #dlc-send-btn:disabled { opacity: 0.45; cursor: not-allowed; }
      #dlc-no-context {
        margin: 0 14px; padding: 10px 13px;
        background: #ecfdf5; border: 1px solid #6ee7b7;
        border-radius: 10px; font-size: 12px; color: #065f46;
        flex-shrink: 0;
      }
      @media (max-width: 480px) {
        #dlc-panel { width: calc(100vw - 24px) !important; right: 12px !important; bottom: 88px !important; }
        #dlc-fab { bottom: 18px !important; right: 18px !important; }
      }
    `;
    document.head.appendChild(style);
  }

  // ── Inject HTML ────────────────────────────────────────────
  function injectHTML() {
    const fab = document.createElement("button");
    fab.id = "dlc-fab";
    fab.title = "Ask Deadlock AI";
    fab.textContent = "💬";

    const panel = document.createElement("div");
    panel.id = "dlc-panel";
    panel.className = "hidden";
    panel.innerHTML = `
      <div id="dlc-header">
        <div id="dlc-avatar">🔒</div>
        <div id="dlc-header-text">
          <div id="dlc-header-title">Schedulix Assistant</div>
          <div id="dlc-header-sub">Banker's Algorithm · Deadlock Analysis</div>
        </div>
        <div id="dlc-status-dot"></div>
      </div>
      <div id="dlc-context-pill"></div>
      <div id="dlc-no-context">
        ⚡ Complete the Banker's Algorithm form and submit to enable AI explanations.
      </div>
      <div id="dlc-messages"></div>
      <div id="dlc-suggestions">
        ${SUGGESTIONS.map(
          (s) => `<button class="dlc-suggestion" data-suggestion="${s.replace(/"/g, "&quot;")}">${s}</button>`
        ).join("")}
      </div>
      <div id="dlc-input-area">
        <input id="dlc-input" type="text" placeholder="Ask about the deadlock analysis..." autocomplete="off" />
        <button id="dlc-send-btn" title="Send">↑</button>
      </div>
    `;

    document.body.appendChild(fab);
    document.body.appendChild(panel);

    fab.addEventListener("click", togglePanel);
    document.getElementById("dlc-send-btn").addEventListener("click", () => sendMessage());
    document.getElementById("dlc-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });
    document.querySelectorAll(".dlc-suggestion").forEach((btn) => {
      btn.addEventListener("click", () => sendMessage(btn.dataset.suggestion));
    });
  }

  // ── Toggle panel ───────────────────────────────────────────
  function togglePanel() {
    const panel = document.getElementById("dlc-panel");
    const fab = document.getElementById("dlc-fab");
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
        const welcomeText = deadlockContext
          ? `Hey! I can explain the Banker's Algorithm result — the system is ${deadlockContext.deadlock ? "in DEADLOCK" : "in a SAFE STATE"}. What would you like to know?`
          : "Hey! Complete the Banker's Algorithm form and click Submit, then I can explain the deadlock analysis.";
        renderBubble("assistant", welcomeText);
      }

      setTimeout(() => document.getElementById("dlc-input").focus(), 100);
    }
  }

  // ── Public API ─────────────────────────────────────────────
  window.DeadlockChat = {
    updateContext: function (ctx) {
      deadlockContext = ctx;
      messages = [];

      const fab = document.getElementById("dlc-fab");
      const noCtx = document.getElementById("dlc-no-context");
      const msgsEl = document.getElementById("dlc-messages");

      if (fab) fab.classList.add("has-context");
      if (noCtx) noCtx.style.display = "none";
      if (msgsEl) {
        msgsEl.style.display = "flex";
        msgsEl.innerHTML = "";
      }

      updateContextPill();
      updateSuggestions();

      const panel = document.getElementById("dlc-panel");
      if (panel && !panel.classList.contains("hidden")) {
        const status = ctx.deadlock ? "DEADLOCK detected" : "safe state — no deadlock";
        renderBubble("assistant",
          `I've loaded the new simulation with ${ctx.nbProc} processes and ${ctx.nbResources} resources. Result: ${status}. What would you like to know?`
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