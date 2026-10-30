// A very small driver for the Chrome that is already on this machine, speaking the DevTools
// protocol over a WebSocket. No test framework and no browser download: Node 22 has both
// WebSocket and fetch built in. Headless Chrome runs animation frames and timers in real time,
// so what these scripts see is the game actually running, not a paused tab.

import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
export const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3015";
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const KEYS = {
  ArrowLeft: [37, "ArrowLeft"],
  ArrowRight: [39, "ArrowRight"],
  ArrowDown: [40, "ArrowDown"],
  Enter: [13, "Enter", "\r"],
  Escape: [27, "Escape"],
  " ": [32, "Space", " "],
  Tab: [9, "Tab"],
};

/** Start Chrome and open one page. Remember to `close()` it. */
export async function launch({ width = 1362, height = 1044 } = {}) {
  const profile = mkdtempSync(join(tmpdir(), "jelly-chrome-"));
  const proc = spawn(
    CHROME,
    ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", `--window-size=${width},${height}`, "--autoplay-policy=no-user-gesture-required", ...(process.env.CHROME_ARGS ? process.env.CHROME_ARGS.split(" ") : []), "about:blank"],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  const endpoint = await new Promise((resolve, reject) => {
    let seen = "";
    proc.stderr.on("data", (d) => {
      seen += d;
      const m = /DevTools listening on (ws:\/\/\S+)/.exec(seen);
      if (m) resolve(m[1]);
    });
    proc.on("exit", () => reject(new Error(`Chrome exited before it was ready:\n${seen}`)));
    setTimeout(() => reject(new Error("Chrome did not start within 20s")), 20000);
  });

  const ws = new WebSocket(endpoint);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = () => reject(new Error("Could not connect to Chrome"));
  });
  let next = 0;
  const waiting = new Map();
  const handlers = new Set();
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    const call = msg.id ? waiting.get(msg.id) : null;
    if (call) {
      waiting.delete(msg.id);
      if (msg.error) call.reject(new Error(`${call.method}: ${msg.error.message}`));
      else call.resolve(msg.result);
    } else for (const h of handlers) h(msg);
  };
  const raw = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = ++next;
      waiting.set(id, { resolve, reject, method });
      ws.send(JSON.stringify({ id, method, params, sessionId }));
    });

  const { targetId } = await raw("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await raw("Target.attachToTarget", { targetId, flatten: true });
  const send = (method, params) => raw(method, params, sessionId);

  /** Uncaught errors and console.error calls, and any request that leaves this machine. */
  const errors = [];
  const outside = [];
  handlers.add((msg) => {
    if (msg.sessionId !== sessionId) return;
    if (msg.method === "Runtime.exceptionThrown") errors.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
    if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") errors.push(msg.params.args.map((a) => a.value ?? a.description).join(" "));
    if (msg.method === "Network.requestWillBeSent") {
      const url = msg.params.request.url;
      if (/^https?:/.test(url) && !/^https?:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) outside.push(url);
    }
  });
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");

  const page = {
    errors,
    outside,
    send,
    /** Calls `fn` every time the browser reports `method` (until the page closes). */
    on(method, fn) {
      handlers.add((msg) => { if (msg.sessionId === sessionId && msg.method === method) fn(msg.params); });
    },
    /** Resolves the next time the browser reports `method`. */
    once(method) {
      return new Promise((resolve) => {
        const h = (msg) => {
          if (msg.sessionId !== sessionId || msg.method !== method) return;
          handlers.delete(h);
          resolve(msg.params);
        };
        handlers.add(h);
      });
    },
    /** Run `source` in every page before any of its own code (for a seeded Math.random, say). */
    async beforeLoad(source) {
      await send("Page.addScriptToEvaluateOnNewDocument", { source });
    },
    /** A real viewport of any size: there is no 500px minimum as with a window. */
    /** `dpr` 2 captures at twice the detail, for looking closely at pixel work. */
    async size(w, h, { touch = false, dpr = 1 } = {}) {
      await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: dpr, mobile: touch });
    },
    /** A real finger: press on a point (or the middle of the first element matching a selector), hold, lift. */
    async touch(target, ms = 60) {
      let [x, y] = Array.isArray(target) ? target : [0, 0];
      if (typeof target === "string") {
        const at = await page.run((sel) => {
          const r = document.querySelector(sel)?.getBoundingClientRect();
          return r ? [r.left + r.width / 2, r.top + r.height / 2] : null;
        }, target);
        if (!at) throw new Error(`Nothing matches ${target}`);
        [x, y] = at;
      }
      await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
      await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
      await sleep(ms);
      await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    },
    /** Put a save in a test slot. The page must already be on the site; load it again afterwards. */
    async seed(slot, save) {
      await this.run((key, json) => localStorage.setItem(key, json), `quote-quest:v3:${slot}`, JSON.stringify(save));
    },
    async unseed(slot) {
      await this.run((key) => localStorage.removeItem(key), `quote-quest:v3:${slot}`);
    },
    async reducedMotion(on) {
      await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: on ? "reduce" : "no-preference" }] });
    },
    async goto(path, { settle = 900 } = {}) {
      const loaded = new Promise((resolve) => {
        const h = (msg) => {
          if (msg.sessionId === sessionId && msg.method === "Page.loadEventFired") {
            handlers.delete(h);
            resolve();
          }
        };
        handlers.add(h);
      });
      await send("Page.navigate", { url: path.startsWith("http") ? path : BASE + path });
      await loaded;
      await sleep(settle);
    },
    /** Run a function in the page and return what it returns (it may be async). */
    async run(fn, ...args) {
      const expression = typeof fn === "string" ? fn : `(${fn})(...${JSON.stringify(args)})`;
      const { result, exceptionDetails } = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true });
      if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
      return result.value;
    },
    /** The whole window, or just `clip` ({ x, y, width, height }) of it. */
    async shot(file, clip) {
      const { data } = await send("Page.captureScreenshot", { format: "png", ...(clip ? { clip: { scale: 1, ...clip } } : {}) });
      writeFileSync(file, Buffer.from(data, "base64"));
      return file;
    },
    /** A real key press, held for `ms`. */
    async key(key, ms = 40) {
      const [code, name, text] = KEYS[key] ?? [key.toUpperCase().charCodeAt(0), `Key${key.toUpperCase()}`, key];
      // No nativeVirtualKeyCode: these are Windows key codes, and on a Mac the same numbers
      // mean other keys (27 is Minus). Chrome then sees a native key go down that never comes
      // up, and auto-repeats it thousands of times a second until the page can do nothing else.
      const base = { key, code: name, windowsVirtualKeyCode: code };
      await send("Input.dispatchKeyEvent", { type: text ? "keyDown" : "rawKeyDown", ...base, text });
      await sleep(ms);
      await send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
    },
    /** A real mouse move to a point, in `steps` hops so the page sees a velocity. */
    async move(x, y, { steps = 1, from = null, ms = 16, buttons = 0 } = {}) {
      const [x0, y0] = from ?? [x, y];
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: x0 + (x - x0) * t, y: y0 + (y - y0) * t, buttons });
        if (steps > 1) await sleep(ms);
      }
    },
    /** Press or release the left button where the mouse is. */
    async mouse(type, x, y) {
      await send("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons: type === "mousePressed" ? 1 : 0, clickCount: 1 });
    },
    /** A real mouse click at a point, or on the middle of the first element matching a selector. */
    async click(target, ms = 30) {
      let [x, y] = Array.isArray(target) ? target : [0, 0];
      if (typeof target === "string") {
        const at = await page.run((sel) => {
          const el = document.querySelector(sel);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return [r.left + r.width / 2, r.top + r.height / 2];
        }, target);
        if (!at) throw new Error(`Nothing matches ${target}`);
        [x, y] = at;
      }
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
      await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
      await sleep(ms);
      await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
    },
    /** Click the first button whose text or accessible name is exactly this. */
    async press(label, scope = "body") {
      const at = await page.run(
        (label, scope) => {
          const root = [...document.querySelectorAll(scope)].at(-1);
          const el = [...(root?.querySelectorAll("button, [role=tab]") ?? [])].find((b) => b.textContent.trim() === label || b.getAttribute("aria-label") === label);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return [r.left + r.width / 2, r.top + r.height / 2];
        },
        label,
        scope,
      );
      if (!at) throw new Error(`No button called "${label}" in ${scope}`);
      await page.click(at);
    },
    /** Wait until a function in the page returns something truthy. */
    async until(fn, { timeout = 10000, every = 50, what = "condition" } = {}, ...args) {
      const started = Date.now();
      for (;;) {
        const value = await page.run(fn, ...args);
        if (value) return value;
        if (Date.now() - started > timeout) throw new Error(`Timed out after ${timeout}ms waiting for ${what}`);
        await sleep(every);
      }
    },
    async close() {
      try {
        ws.close();
      } catch {}
      proc.kill("SIGKILL");
      await sleep(150);
      rmSync(profile, { recursive: true, force: true });
    },
  };
  await page.size(width, height);
  return page;
}
