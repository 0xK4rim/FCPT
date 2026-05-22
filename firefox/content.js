(() => {
  if (window.__sampleCopierInstalled) return;
  window.__sampleCopierInstalled = true;

  const HOTKEY = {
    ctrlKey: true,
    shiftKey: true,
    keyCode: "KeyC",
  };

  const state = {
    panel: null,
    badge: null,
    button: null,
    status: null,
    lastText: "",
    observer: null,
    refreshTimer: null,
    statusTimer: null,
  };

  function normalizeText(text) {
    return (text || "").replace(/\r\n/g, "\n").trimEnd();
  }

  function isVisible(el) {
    if (!el) return false;
    const style = getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden";
  }

  function buildClipboardText(samples) {
    const lines = [`Sample count: ${samples.length}`];

    samples.forEach((sample, i) => {
      lines.push("");
      lines.push(`=== Sample ${i + 1} ===`);
      lines.push("Input:");
      lines.push(sample.input || "");
      lines.push("Output:");
      lines.push(sample.output || "");
    });

    return lines.join("\n");
  }

  function setStatus(text, good = true) {
    if (!state.status) return;
    state.status.textContent = text;
    state.status.style.opacity = "1";
    state.status.style.color = good ? "#d7ffd9" : "#ffd7d7";

    clearTimeout(state.statusTimer);
    state.statusTimer = setTimeout(() => {
      if (state.status) state.status.style.opacity = "0.8";
    }, 1200);
  }

  async function saveTextToFile(text) {
    try {
      const result = await browser.runtime.sendMessage({
        type: "save-samples",
        text,
      });
      return !!(result && result.ok);
    } catch (_) {
      return false;
    }
  }

  function getCodeforcesSamples() {
    const root = document.querySelector(".sample-test");
    if (!root) return [];

    const inputs = [...root.querySelectorAll(".input pre")].map((pre) =>
      normalizeText(pre.innerText)
    );
    const outputs = [...root.querySelectorAll(".output pre")].map((pre) =>
      normalizeText(pre.innerText)
    );

    const n = Math.max(inputs.length, outputs.length);
    const samples = [];
    for (let i = 0; i < n; i++) {
      const input = inputs[i] ?? "";
      const output = outputs[i] ?? "";
      if (input || output) samples.push({ input, output });
    }
    return samples;
  }

  function getAtCoderSamples() {
    const root = document.querySelector("#task-statement span.lang-en");
    if (!root) return [];

    const parts = [...root.querySelectorAll("div.part")];
    const sampleParts = parts.slice(2);

    const samples = [];
    for (let i = 2; i + 1 < sampleParts.length; i += 2) {
      const inputPre = sampleParts[i].querySelector("pre");
      const outputPre = sampleParts[i + 1].querySelector("pre");

      const input = normalizeText(inputPre ? inputPre.textContent : "");
      const output = normalizeText(outputPre ? outputPre.textContent : "");

      if (input || output) {
        samples.push({ input, output });
      }
    }

    return samples;
  }

  function getSamples() {
    if (document.querySelector(".sample-test")) return getCodeforcesSamples();
    if (document.querySelector("#task-statement")) return getAtCoderSamples();
    return [];
  }

  async function saveSamplesNow() {
    const samples = getSamples();
    const text = buildClipboardText(samples);
    state.lastText = text;

    if (state.badge) {
      state.badge.textContent = `Samples: ${samples.length}`;
    }

    if (!samples.length) {
      setStatus("No samples found", false);
      return;
    }

    const ok = await saveTextToFile(text);
    if (ok) setStatus(`✓ Saved ${samples.length} sample(s)`, true);
    else setStatus("✗ Save failed", false);
  }

  function refresh() {
    const samples = getSamples();
    state.lastText = buildClipboardText(samples);

    if (state.badge) {
      state.badge.textContent = `Samples: ${samples.length}`;
    }
    if (state.button) {
      state.button.disabled = samples.length === 0;
      state.button.textContent = samples.length === 0 ? "No samples found" : "Save samples";
    }
  }

  function matchesHotkey(e) {
    return (
      e.ctrlKey === HOTKEY.ctrlKey &&
      e.shiftKey === HOTKEY.shiftKey &&
      e.metaKey === false &&
      e.code === HOTKEY.keyCode
    );
  }

  function ensureUI() {
    if (state.panel) return;

    const panel = document.createElement("div");
    panel.style.cssText = [
      "position:fixed",
      "right:16px",
      "bottom:16px",
      "z-index:2147483647",
      "display:flex",
      "flex-direction:column",
      "gap:8px",
      "padding:12px",
      "border-radius:14px",
      "background:rgba(20,20,20,0.92)",
      "color:#fff",
      "box-shadow:0 10px 30px rgba(0,0,0,0.35)",
      "font:13px/1.2 system-ui,-apple-system,Segoe UI,Roboto,sans-serif",
      "min-width:190px",
    ].join(";");

    const badge = document.createElement("div");
    badge.style.cssText = "font-weight:700; opacity:0.95;";
    badge.textContent = "Samples: 0";

    const hotkeyHint = document.createElement("div");
    hotkeyHint.style.cssText = "font-size:12px; opacity:0.75;";
    hotkeyHint.textContent = "Hotkey: Ctrl+Shift+C";

    const button = document.createElement("button");
    button.type = "button";
    button.style.cssText = [
      "border:0",
      "border-radius:10px",
      "padding:10px 12px",
      "background:#ffffff",
      "color:#111",
      "font-weight:700",
      "cursor:pointer",
    ].join(";");
    button.addEventListener("click", saveSamplesNow);

    const status = document.createElement("div");
    status.style.cssText = "font-size:12px; opacity:0.8; min-height:1em;";
    status.textContent = "Ready";

    panel.appendChild(badge);
    panel.appendChild(hotkeyHint);
    panel.appendChild(button);
    panel.appendChild(status);
    document.body.appendChild(panel);

    state.panel = panel;
    state.badge = badge;
    state.button = button;
    state.status = status;

    refresh();

    state.observer = new MutationObserver(() => {
      clearTimeout(state.refreshTimer);
      state.refreshTimer = setTimeout(refresh, 150);
    });

    state.observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    document.addEventListener(
      "keydown",
      async (e) => {
        if (e.repeat) return;
        if (!matchesHotkey(e)) return;

        const target = e.target;
        if (
          target &&
          (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.isContentEditable)
        ) {
          return;
        }

        e.preventDefault();
        e.stopPropagation();
        await saveSamplesNow();
      },
      true
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureUI, { once: true });
  } else {
    ensureUI();
  }
})();
