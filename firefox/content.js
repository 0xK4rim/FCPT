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
    return String(text ?? "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/\u00a0/g, " ")
      .trimEnd();
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
    } catch (err) {
      console.error("[Sample Copier] Save failed:", err);
      return false;
    }
  }

  function readSampleElement(el) {
    if (!el) return "";

    const pre = el.matches?.("pre") ? el : el.querySelector?.("pre");
    const target = pre || el;

    // innerText preserves the rendered line breaks used by the statement.
    // Fall back to textContent for elements where innerText is unavailable.
    const text = typeof target.innerText === "string"
      ? target.innerText
      : target.textContent;

    return normalizeText(text);
  }

  function isNonEmptySample(input, output) {
    return input.length > 0 || output.length > 0;
  }

  function dedupeSamples(samples) {
    const seen = new Set();
    const result = [];

    for (const sample of samples) {
      const input = normalizeText(sample.input);
      const output = normalizeText(sample.output);
      if (!isNonEmptySample(input, output)) continue;

      const key = `${input}\0${output}`;
      if (seen.has(key)) continue;

      seen.add(key);
      result.push({ input, output });
    }

    return result;
  }

  // Standard Codeforces layout:
  // .sample-test > .input/.output > pre
  function getStandardCodeforcesSamples() {
    const root = document.querySelector(".sample-test");
    if (!root) return [];

    const inputs = [...root.querySelectorAll(".input pre")]
      .map(readSampleElement);
    const outputs = [...root.querySelectorAll(".output pre")]
      .map(readSampleElement);

    const samples = [];
    const count = Math.max(inputs.length, outputs.length);

    for (let i = 0; i < count; i++) {
      samples.push({
        input: inputs[i] ?? "",
        output: outputs[i] ?? "",
      });
    }

    return dedupeSamples(samples);
  }

  // Some statements render examples as a two-column HTML table:
  // | standard input | standard output |
  // | <pre>...</pre> | <pre>...</pre> |
  function getTableSamples() {
    const samples = [];

    function classifyHeader(text) {
      const value = normalizeText(text)
        .replace(/\s+/g, " ")
        .replace(/:$/, "")
        .trim()
        .toLowerCase();

      if (/^(?:(?:sample|standard|example)\s+)?input(?:\s+(?:file|#?\d+))?$/.test(value)) {
        return "input";
      }

      if (/^(?:(?:sample|standard|example)\s+)?output(?:\s+(?:file|#?\d+))?$/.test(value)) {
        return "output";
      }

      return null;
    }

    for (const table of document.querySelectorAll(".problem-statement table, table")) {
      const rows = [...table.querySelectorAll("tr")];

      for (let headerRowIndex = 0; headerRowIndex < rows.length; headerRowIndex++) {
        const headerCells = [...rows[headerRowIndex].cells];
        let inputIndex = -1;
        let outputIndex = -1;

        headerCells.forEach((cell, index) => {
          const kind = classifyHeader(cell.textContent);
          if (kind === "input") inputIndex = index;
          if (kind === "output") outputIndex = index;
        });

        if (inputIndex === -1 || outputIndex === -1) continue;

        for (const row of rows.slice(headerRowIndex + 1)) {
          const cells = [...row.cells];
          if (cells.length <= Math.max(inputIndex, outputIndex)) continue;

          samples.push({
            input: readSampleElement(cells[inputIndex]),
            output: readSampleElement(cells[outputIndex]),
          });
        }

        // A table normally contains only one examples table/header pair.
        break;
      }
    }

    return dedupeSamples(samples);
  }

  // Alternate layouts use .sample, .example, or related wrappers
  // around separate .input and .output blocks.
  function getContainerSamples() {
    const samples = [];
    const rootSelector = [
      ".sample-tests",
      ".sample-test",
      ".samples",
      ".sample",
      ".examples",
      ".example",
      ".sample-case",
      ".test-example",
      "[data-sample]"
    ].join(",");

    for (const root of document.querySelectorAll(rootSelector)) {
      const inputs = [
        ...root.querySelectorAll(
          ".input, .sample-input, .example-input, [data-sample-input]"
        )
      ];
      const outputs = [
        ...root.querySelectorAll(
          ".output, .sample-output, .example-output, [data-sample-output]"
        )
      ];

      const count = Math.max(inputs.length, outputs.length);

      for (let i = 0; i < count; i++) {
        samples.push({
          input: readSampleElement(inputs[i]),
          output: readSampleElement(outputs[i]),
        });
      }
    }

    return dedupeSamples(samples);
  }

  // Last-resort fallback for statement templates that use the input/output
  // block classes but omit a recognizable sample wrapper.
  function getLooseClassSamples() {
    const inputs = [
      ...document.querySelectorAll(
        ".input:not(.input-specification), .sample-input, " +
        ".example-input, [data-sample-input]"
      )
    ];
    const outputs = [
      ...document.querySelectorAll(
        ".output:not(.output-specification), .sample-output, " +
        ".example-output, [data-sample-output]"
      )
    ];

    const samples = [];
    const count = Math.max(inputs.length, outputs.length);

    for (let i = 0; i < count; i++) {
      samples.push({
        input: readSampleElement(inputs[i]),
        output: readSampleElement(outputs[i]),
      });
    }

    return dedupeSamples(samples);
  }

  function getCodeforcesSamples() {
    const extractors = [
      getStandardCodeforcesSamples,
      getTableSamples,
      getContainerSamples,
      getLooseClassSamples,
    ];

    for (const extract of extractors) {
      const samples = extract();
      if (samples.length) return samples;
    }

    return [];
  }


  function getAtCoderSamples() {
    const task = document.querySelector("#task-statement");
    if (!task) return [];

    // Select the currently visible statement language.
    const languages = [
      ...task.querySelectorAll("span.lang-en, span.lang-ja")
    ];

    const root =
      languages.find(el => el.getClientRects().length > 0) ||
      task;
    
    const elements = [
      ...root.querySelectorAll('pre[id^="pre-sample"]')
    ];

    const sampleMap = new Map();

    for (const pre of elements) {
      const match = pre.id.match(/^pre-sample(\d+)$/);
      if (!match) continue;

      const index = Number(match[1]);

      const sampleNumber = Math.floor(index / 2) + 1;
      const type = index % 2 === 0 ? "input" : "output";

      if (!sampleMap.has(sampleNumber)) {
        sampleMap.set(sampleNumber, {
          input: "",
          output: ""
        });
      }

      sampleMap.get(sampleNumber)[type] =
        normalizeText(pre.textContent || "");
    }

    return [...sampleMap.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([_, sample]) => sample)
      .filter(sample => sample.input || sample.output);
  }
  function getSamples() {
    if (document.querySelector("#task-statement")) {
      return getAtCoderSamples();
    }

    return getCodeforcesSamples();
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
      console.warn(
        "[Sample Copier] No samples found. Page:",
        location.href,
        "Tables:",
        document.querySelectorAll("table").length,
        "sample-test:",
        document.querySelectorAll(".sample-test").length
      );
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
      state.button.textContent = samples.length === 0
        ? "No samples found"
        : "Save samples";
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
    if (state.panel || !document.body) return;

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
        if (e.repeat || !matchesHotkey(e)) return;

        const target = e.target;
        if (
          target &&
          (
            target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.isContentEditable
          )
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
