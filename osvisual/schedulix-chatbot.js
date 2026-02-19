(function () {
  "use strict";

  // ── State ──────────────────────────────────────────────────
  let schedulerContext = null;
  let messages = []; // { role: "user"|"assistant", content: string }
  let isLoading = false;

  const GROQ_API_KEY = "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";

  const SUGGESTIONS = [
    "Which process waited the longest?",
    "Explain the algorithm used",
    "What is turnaround time?",
    "How can I reduce average wait time?",
  ];

  // ── Build system prompt ────────────────────────────────────
  function buildSystemPrompt(ctx) {
    const processList = ctx.processes
      .map(
        (p) =>
          `  • ${p.id}: Arrival=${p.arrivalTime}, Burst=${p.burstTime}${
            p.priority !== undefined && p.priority !== null ? ", Priority=" + p.priority : ""
          }`
      )
      .join("\n");

    const timeline = ctx.executionOrder
      .map((e) => `  • ${e.process} → t=${e.start} to t=${e.end}`)
      .join("\n");

    const metrics = Object.entries(ctx.metrics || {})
      .map(
        ([pid, m]) =>
          `  • ${pid}: Wait=${m.waitTime}, Turnaround=${m.turnaroundTime}, Completion=${m.completionTime}`
      )
      .join("\n");

    return `You are Schedulix Assistant, an expert in OS CPU scheduling algorithms, embedded inside the Schedulix visualization tool.

The user just ran a simulation. Here is the EXACT result:

Algorithm: ${ctx.algorithm}
${ctx.timeQuantum ? "Time Quantum: " + ctx.timeQuantum : ""}

Processes:
${processList}

Execution Timeline (Gantt Chart order):
${timeline}

Per-Process Metrics:
${metrics || "  (not yet computed)"}

Average Wait Time: ${ctx.averageWaitTime ?? "N/A"}
Average Turnaround Time: ${ctx.averageTurnaround ?? "N/A"}

Rules:
- Answer questions about THIS specific simulation using the data above.
- When explaining scheduling order, reference actual arrival/burst/priority values.
- Be concise (under 120 words) unless the user asks for more detail.
- Use plain text, no markdown headers or bullet symbols — write naturally.
- If asked about a different algorithm, reason about what WOULD happen with the same processes.`;
  }

  // ── Render a bubble (NO push to messages[]) ────────────────
  function renderBubble(role, text) {
    const container = document.getElementById("sxc-messages");
    if (!container) return;
    const div = document.createElement("div");
    div.className = `sxc-msg sxc-msg-${role}`;
    div.innerHTML = `<div class="sxc-bubble">${escapeHtml(text)}</div>`;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  // ── Add message to state AND render ───────────────────────
  function addMessage(role, text) {
    messages.push({ role, content: text });
    renderBubble(role, text);
  }

  // ── Groq API call ──────────────────────────────────────────
  async function askClaude(userMessage) {
    console.log("=== askClaude called ===");
  console.log("schedulerContext:", schedulerContext);
  console.log("messages[]:", JSON.stringify(messages, null, 2));
  
    if (!schedulerContext) {
      return "Please run a simulation first by clicking Calculate, then I can explain the results!";
    }

    const systemPrompt = buildSystemPrompt(schedulerContext);

    // Build a clean strictly-alternating message list for the API
    // messages[] already has the new user message at the end (added before this call)
    const apiMessages = [];
    for (const m of messages) {
      const role = m.role === "assistant" ? "assistant" : "user";
      if (apiMessages.length > 0 && apiMessages[apiMessages.length - 1].role === role) {
        // Merge consecutive same-role messages (shouldn't happen, but safety net)
        apiMessages[apiMessages.length - 1].content += "\n" + m.content;
      } else {
        apiMessages.push({ role, content: m.content });
      }
    }

    // Must start with user
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
    const container = document.getElementById("sxc-messages");
    if (!container) return;
    const div = document.createElement("div");
    div.className = "sxc-msg sxc-msg-assistant";
    div.id = "sxc-typing";
    div.innerHTML = `<div class="sxc-bubble sxc-typing-bubble">
      <span></span><span></span><span></span>
    </div>`;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  function hideTyping() {
    const el = document.getElementById("sxc-typing");
    if (el) el.remove();
  }

  function updateContextPill() {
    const pill = document.getElementById("sxc-context-pill");
    if (!pill) return;
    if (schedulerContext) {
      pill.style.display = "flex";
      pill.innerHTML = `<span class="sxc-algo-badge">${schedulerContext.algorithm}</span>
        <span class="sxc-pill-dot">·</span>
        <span>${schedulerContext.processes.length} processes</span>
        <span class="sxc-pill-dot">·</span>
        <span>Avg wait: ${schedulerContext.averageWaitTime ?? "?"}</span>`;
    } else {
      pill.style.display = "none";
    }
  }

  function updateSuggestions() {
    const el = document.getElementById("sxc-suggestions");
    if (!el) return;
    el.style.display = messages.filter((m) => m.role === "user").length === 0 ? "flex" : "none";
  }

  // ── Send message ───────────────────────────────────────────
  async function sendMessage(text) {
    const input = document.getElementById("sxc-input");
    const userText = (text || (input ? input.value.trim() : ""));
    if (!userText || isLoading) return;
    if (input) input.value = "";

    isLoading = true;
    const btn = document.getElementById("sxc-send-btn");
    if (btn) btn.disabled = true;

    // 1. Add user message to state + render
    addMessage("user", userText);
    updateSuggestions();
    showTyping();

    try {
      // 2. Call API (messages[] already contains the user message)
      const reply = await askClaude(userText);
      hideTyping();
      // 3. Add assistant reply to state + render
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
      #sxc-fab {
        position: fixed; bottom: 28px; right: 28px;
        width: 58px; height: 58px; border-radius: 50%;
        background: linear-gradient(135deg, #f59e0b 0%, #ef4444 100%);
        border: none; cursor: pointer; z-index: 9999;
        box-shadow: 0 4px 20px rgba(245,158,11,0.45);
        display: flex; align-items: center; justify-content: center;
        font-size: 24px; transition: transform 0.2s, box-shadow 0.2s;
        color: #fff;
      }
      #sxc-fab:hover { transform: scale(1.08); box-shadow: 0 6px 28px rgba(245,158,11,0.55); }
      #sxc-fab.open { background: #374151; box-shadow: 0 4px 20px rgba(0,0,0,0.3); }
      #sxc-fab.has-context::after {
        content: ''; position: absolute; top: -4px; right: -4px;
        width: 16px; height: 16px; background: #10b981;
        border-radius: 50%; border: 2px solid #fff;
        animation: sxc-pulse 2s infinite;
      }
      @keyframes sxc-pulse {
        0%,100% { transform: scale(1); opacity: 1; }
        50% { transform: scale(1.3); opacity: 0.7; }
      }
      #sxc-panel {
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
      #sxc-panel.hidden {
        opacity: 0; transform: scale(0.92) translateY(12px);
        pointer-events: none;
      }
      #sxc-header {
        background: linear-gradient(135deg, #1f2937 0%, #374151 100%);
        padding: 14px 18px;
        display: flex; align-items: center; gap: 10px;
        flex-shrink: 0;
      }
      #sxc-avatar {
        width: 38px; height: 38px; border-radius: 50%;
        background: linear-gradient(135deg, #f59e0b, #ef4444);
        display: flex; align-items: center; justify-content: center;
        font-size: 18px; flex-shrink: 0;
      }
      #sxc-header-text { flex: 1; }
      #sxc-header-title { color: #fff; font-weight: 700; font-size: 14px; }
      #sxc-header-sub { color: #9ca3af; font-size: 11px; }
      #sxc-status-dot {
        width: 9px; height: 9px; border-radius: 50%;
        background: #10b981; box-shadow: 0 0 8px #10b981;
        flex-shrink: 0;
      }
      #sxc-context-pill {
        background: #f9fafb; border-bottom: 1px solid #e5e7eb;
        padding: 7px 14px; font-size: 11px; color: #6b7280;
        display: none; align-items: center; gap: 6px; flex-shrink: 0;
      }
      .sxc-algo-badge {
        background: #dbeafe; color: #1d4ed8;
        border-radius: 4px; padding: 1px 7px; font-weight: 700; font-size: 11px;
      }
      .sxc-pill-dot { color: #d1d5db; }
      #sxc-messages {
        flex: 1; overflow-y: auto; padding: 14px 14px 6px;
        display: flex; flex-direction: column; gap: 10px;
        scroll-behavior: smooth;
      }
      #sxc-messages::-webkit-scrollbar { width: 5px; }
      #sxc-messages::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 4px; }
      .sxc-msg { display: flex; }
      .sxc-msg-user { justify-content: flex-end; }
      .sxc-msg-assistant { justify-content: flex-start; }
      .sxc-bubble {
        max-width: 82%; padding: 10px 14px;
        font-size: 13.5px; line-height: 1.55;
        white-space: pre-wrap; word-break: break-word;
      }
      .sxc-msg-user .sxc-bubble {
        background: linear-gradient(135deg, #f59e0b, #ef4444);
        color: #fff; border-radius: 16px 16px 4px 16px;
      }
      .sxc-msg-assistant .sxc-bubble {
        background: #f3f4f6; color: #1f2937;
        border-radius: 16px 16px 16px 4px;
      }
      .sxc-typing-bubble {
        display: flex; align-items: center; gap: 5px;
        padding: 12px 16px !important;
      }
      .sxc-typing-bubble span {
        width: 7px; height: 7px; border-radius: 50%;
        background: #9ca3af; display: block;
        animation: sxc-bounce 1.2s infinite;
      }
      .sxc-typing-bubble span:nth-child(2) { animation-delay: 0.2s; }
      .sxc-typing-bubble span:nth-child(3) { animation-delay: 0.4s; }
      @keyframes sxc-bounce {
        0%,60%,100% { transform: translateY(0); }
        30% { transform: translateY(-7px); }
      }
      #sxc-suggestions {
        padding: 6px 12px; gap: 6px; flex-wrap: wrap;
        display: flex; flex-shrink: 0;
      }
      .sxc-suggestion {
        background: #fff; border: 1px solid #e5e7eb;
        border-radius: 20px; padding: 4px 11px;
        font-size: 11.5px; cursor: pointer; color: #374151;
        transition: border-color 0.15s, color 0.15s;
        font-family: inherit;
      }
      .sxc-suggestion:hover { border-color: #f59e0b; color: #92400e; }
      #sxc-input-area {
        padding: 10px 12px; border-top: 1px solid #e5e7eb;
        display: flex; gap: 8px; align-items: center; flex-shrink: 0;
      }
      #sxc-input {
        flex: 1; padding: 9px 13px; border-radius: 10px;
        border: 1.5px solid #e5e7eb; outline: none;
        font-size: 13.5px; color: #1f2937;
        font-family: inherit; transition: border-color 0.15s;
        background: #fff;
      }
      #sxc-input:focus { border-color: #f59e0b; }
      #sxc-send-btn {
        width: 38px; height: 38px; border-radius: 10px; border: none;
        background: linear-gradient(135deg, #f59e0b, #ef4444);
        cursor: pointer; font-size: 17px; color: #fff;
        display: flex; align-items: center; justify-content: center;
        transition: opacity 0.2s; flex-shrink: 0;
      }
      #sxc-send-btn:disabled { opacity: 0.45; cursor: not-allowed; }
      #sxc-no-context {
        margin: 0 14px; padding: 10px 13px;
        background: #fffbeb; border: 1px solid #fde68a;
        border-radius: 10px; font-size: 12px; color: #92400e;
        flex-shrink: 0;
      }
      @media (max-width: 480px) {
        #sxc-panel { width: calc(100vw - 24px); right: 12px; bottom: 88px; }
        #sxc-fab { bottom: 18px; right: 18px; }
      }
    `;
    document.head.appendChild(style);
  }

  // ── Inject HTML ────────────────────────────────────────────
  function injectHTML() {
    const fab = document.createElement("button");
    fab.id = "sxc-fab";
    fab.title = "Ask Schedulix AI";
    fab.textContent = "💬";

    const panel = document.createElement("div");
    panel.id = "sxc-panel";
    panel.className = "hidden";
    panel.innerHTML = `
      <div id="sxc-header">
        <div id="sxc-avatar">🤖</div>
        <div id="sxc-header-text">
          <div id="sxc-header-title">Schedulix Assistant</div>
          <div id="sxc-header-sub">Ask why · Explain decisions</div>
        </div>
        <div id="sxc-status-dot"></div>
      </div>
      <div id="sxc-context-pill"></div>
      <div id="sxc-no-context">
        ⚡ Run a simulation first — click <b>Calculate</b> to enable AI explanations.
      </div>
      <div id="sxc-messages"></div>
      <div id="sxc-suggestions">
        ${SUGGESTIONS.map(
          (s) => `<button class="sxc-suggestion" data-suggestion="${s.replace(/"/g, "&quot;")}">${s}</button>`
        ).join("")}
      </div>
      <div id="sxc-input-area">
        <input id="sxc-input" type="text" placeholder="Ask about the schedule..." autocomplete="off" />
        <button id="sxc-send-btn" title="Send">↑</button>
      </div>
    `;

    document.body.appendChild(fab);
    document.body.appendChild(panel);

    fab.addEventListener("click", togglePanel);

    document.getElementById("sxc-send-btn").addEventListener("click", () => sendMessage());
    document.getElementById("sxc-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });
    document.querySelectorAll(".sxc-suggestion").forEach((btn) => {
      btn.addEventListener("click", () => sendMessage(btn.dataset.suggestion));
    });
  }

  // ── Toggle panel ───────────────────────────────────────────
  function togglePanel() {
    const panel = document.getElementById("sxc-panel");
    const fab = document.getElementById("sxc-fab");
    const isOpen = !panel.classList.contains("hidden");

    if (isOpen) {
      panel.classList.add("hidden");
      fab.classList.remove("open");
      fab.textContent = "💬";
    } else {
      panel.classList.remove("hidden");
      fab.classList.add("open");
      fab.textContent = "✕";

      // Show welcome message only once — render only, don't push to messages[]
      // so it doesn't count as a turn in the API conversation
      if (messages.length === 0) {
        const welcomeText = schedulerContext
          ? `Hey! I can explain why processes were scheduled this way using ${schedulerContext.algorithm}. What would you like to know?`
          : "Hey! Run a simulation first by clicking Calculate, then I can explain the scheduling decisions in detail.";
        renderBubble("assistant", welcomeText);
        // NOTE: intentionally NOT pushing to messages[] 
        // so the API conversation starts cleanly with the first real user message
      }

      setTimeout(() => document.getElementById("sxc-input").focus(), 100);
    }
  }

  // ── Public API ─────────────────────────────────────────────
  window.SchedulixChat = {
    updateContext: function (ctx) {
      schedulerContext = ctx;
      messages = []; // Reset conversation when new simulation runs

      const fab = document.getElementById("sxc-fab");
      const noCtx = document.getElementById("sxc-no-context");
      const msgsEl = document.getElementById("sxc-messages");

      if (fab) fab.classList.add("has-context");
      if (noCtx) noCtx.style.display = "none";
      if (msgsEl) {
        msgsEl.style.display = "flex";
        msgsEl.innerHTML = ""; // Clear old chat
      }

      updateContextPill();
      updateSuggestions();

      // If panel is open, show a fresh context message (rendered only, not in messages[])
      const panel = document.getElementById("sxc-panel");
      if (panel && !panel.classList.contains("hidden")) {
        renderBubble(
          "assistant",
          `I've loaded the new ${ctx.algorithm} simulation with ${ctx.processes.length} processes. What would you like to know?`
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