/* One geometry for Chat and Coding agent; drag, keyboard, expand and reset. */
(function (root) {
  "use strict";
  function mount(shell, { docked = false } = {}) {
    if (shell.dataset.agentResizable) return;
    shell.dataset.agentResizable = "true";
    const key = "suite-agent-window-v1:" + location.pathname,
      main = docked ? document.querySelector("main") : null,
      head = shell.querySelector(".sai-head,.panel-head");
    let floating = false,
      maximized = false,
      previous = null,
      geometry = null,
      resizeFrame = 0,
      pendingSize = null;
    const clamp = (n, min, max) =>
        Math.max(Math.min(min, max), Math.min(max, n)),
      isFloat = () => !docked || floating || innerWidth <= 800;
    function save() {
      try {
        localStorage.setItem(key, JSON.stringify({ geometry, floating }));
      } catch {}
    }
    function apply(width, height, persist = false) {
      const float = isFloat(),
        maxW = float ? innerWidth - 16 : Math.max(260, innerWidth - 460),
        maxH = float
          ? innerHeight - 16
          : main?.clientHeight || innerHeight - 16;
      const rect = shell.getBoundingClientRect();
      geometry = {
        width: clamp(width, Math.min(300, maxW), maxW),
        height: clamp(height, Math.min(260, maxH), maxH),
      };
      shell.style.resize = "none";
      shell.style.maxWidth = "calc(100vw - 16px)";
      shell.style.minWidth = "0";
      if (float) {
        shell.style.position = "fixed";
        shell.style.top = "auto";
        shell.style.left = "auto";
        shell.style.right =
          Math.max(
            8,
            Math.min(
              parseFloat(getComputedStyle(shell).right) || 18,
              innerWidth - geometry.width - 8,
            ),
          ) + "px";
        shell.style.bottom =
          Math.max(
            8,
            Math.min(
              parseFloat(getComputedStyle(shell).bottom) || 24,
              innerHeight - geometry.height - 8,
            ),
          ) + "px";
        shell.style.width = geometry.width + "px";
        shell.style.height = geometry.height + "px";
        shell.style.maxHeight = "calc(100dvh - 16px)";
        shell.style.zIndex = "40";
      } else {
        for (const key of [
          "position",
          "top",
          "left",
          "right",
          "bottom",
          "zIndex",
        ])
          shell.style[key] = "";
        main?.style.setProperty("--suite-agent-width", geometry.width + "px");
        shell.style.width = "100%";
        shell.style.height = "";
        shell.style.maxHeight = "100%";
      }
      shell.classList.toggle("suite-agent-floating", float);
      if (docked)
        document.body.classList.toggle(
          "agent-floating",
          floating && innerWidth > 800,
        );
      corner.hidden = !float;
      floatButton && (floatButton.textContent = floating ? "Dock" : "Float");
      size.textContent =
        Math.round(geometry.width) +
        " × " +
        Math.round(float ? geometry.height : rect.height);
      if (persist) save();
    }
    function flushResize() {
      if (resizeFrame) root.cancelAnimationFrame(resizeFrame);
      resizeFrame = 0;
      if (!pendingSize) return;
      const [width, height] = pendingSize;
      pendingSize = null;
      apply(width, height);
    }
    function scheduleResize(width, height) {
      pendingSize = [width, height];
      if (!resizeFrame) resizeFrame = root.requestAnimationFrame(flushResize);
    }
    function cancelResize() {
      if (resizeFrame) root.cancelAnimationFrame(resizeFrame);
      resizeFrame = 0;
      pendingSize = null;
    }
    function button(label, text) {
      const b = document.createElement("button");
      b.type = "button";
      b.title = label;
      b.setAttribute("aria-label", label);
      b.textContent = text;
      return b;
    }
    const side = button(
        "Resize chat width. Drag or use Left and Right arrows.",
        "⋮",
      ),
      corner = button(
        "Resize chat and coding agent. Drag or use arrow keys; Shift makes larger steps.",
        "⤢",
      ),
      expand = button("Expand or restore chat window", "Expand"),
      reset = button("Reset chat window size", "Reset size"),
      floatButton = docked
        ? button("Float or dock the assistant window", "Float")
        : null,
      size = document.createElement("span");
    side.className = "suite-agent-resize-side";
    corner.className = "suite-agent-resize-corner";
    size.className = "suite-agent-window-size";
    size.setAttribute("aria-live", "polite");
    const controls = document.createElement("div");
    controls.className = "suite-agent-window-controls";
    controls.append(...(floatButton ? [floatButton] : []), expand, reset);
    head.append(controls);
    shell.append(side, corner, size);
    corner.hidden = docked && innerWidth > 800;
    shell.style.resize = "none";
    function begin(event, both) {
      if (event.button !== 0) return;
      event.preventDefault();
      const node = event.currentTarget,
        start = shell.getBoundingClientRect(),
        x = event.clientX,
        y = event.clientY;
      node.setPointerCapture(event.pointerId);
      shell.classList.add("suite-agent-resizing");
      const move = (e) =>
          scheduleResize(
            start.width + x - e.clientX,
            both ? start.height + y - e.clientY : start.height,
          ),
        end = () => {
          flushResize();
          node.removeEventListener("pointermove", move);
          node.removeEventListener("pointerup", end);
          node.removeEventListener("pointercancel", end);
          shell.classList.remove("suite-agent-resizing");
          save();
        };
      node.addEventListener("pointermove", move);
      node.addEventListener("pointerup", end);
      node.addEventListener("pointercancel", end);
    }
    side.onpointerdown = (e) => begin(e, false);
    corner.onpointerdown = (e) => begin(e, true);
    for (const node of [side, corner])
      node.onkeydown = (e) => {
        if (
          !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
        )
          return;
        e.preventDefault();
        e.stopPropagation();
        const rect = shell.getBoundingClientRect(),
          step = e.shiftKey ? 80 : 20;
        apply(
          rect.width +
            (e.key === "ArrowLeft" ? step : e.key === "ArrowRight" ? -step : 0),
          rect.height +
            (node === corner
              ? e.key === "ArrowUp"
                ? step
                : e.key === "ArrowDown"
                  ? -step
                  : 0
              : 0),
          true,
        );
      };
    floatButton &&
      (floatButton.onclick = () => {
        const rect = shell.getBoundingClientRect();
        floating = !floating;
        maximized = false;
        expand.textContent = "Expand";
        apply(rect.width, rect.height, true);
      });
    expand.onclick = () => {
      if (maximized && previous) {
        floating = previous.floating;
        apply(previous.width, previous.height, true);
        maximized = false;
        expand.textContent = "Expand";
        return;
      }
      const rect = shell.getBoundingClientRect();
      previous = { width: rect.width, height: rect.height, floating };
      if (docked) floating = true;
      maximized = true;
      apply(innerWidth - 16, innerHeight - 16, true);
      expand.textContent = "Restore";
    };
    reset.onclick = () => {
      cancelResize();
      floating = false;
      maximized = false;
      geometry = null;
      expand.textContent = "Expand";
      for (const property of [
        "width",
        "height",
        "maxWidth",
        "maxHeight",
        "minWidth",
        "top",
        "left",
        "right",
        "bottom",
        "position",
        "zIndex",
      ])
        shell.style[property] = "";
      main?.style.removeProperty("--suite-agent-width");
      document.body.classList.remove("agent-floating");
      shell.classList.remove("suite-agent-floating");
      corner.hidden = docked && innerWidth > 800;
      floatButton && (floatButton.textContent = "Float");
      try {
        localStorage.removeItem(key);
      } catch {}
    };
    root.addEventListener("resize", () => {
      if (geometry)
        scheduleResize(
          maximized ? innerWidth - 16 : geometry.width,
          maximized ? innerHeight - 16 : geometry.height,
        );
    });
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      if (
        value &&
        Number.isFinite(value.geometry?.width) &&
        Number.isFinite(value.geometry?.height)
      ) {
        floating = !!value.floating;
        apply(value.geometry.width, value.geometry.height);
      }
    } catch {}
    return {
      resize: (w, h) => {
        cancelResize();
        apply(w, h, true);
      },
      reset: () => reset.click(),
      expand: () => expand.click(),
    };
  }
  root.SuiteAgentWindow = { mount };
  if (typeof module !== "undefined") module.exports = root.SuiteAgentWindow;
})(typeof window === "undefined" ? globalThis : window);
