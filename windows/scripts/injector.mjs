import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildThemePayload } from "./theme-loader.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

function parseArgs(argv) {
  const options = {
    port: 9335,
    mode: "watch",
    timeoutMs: 30000,
    screenshot: null,
    viewport: null,
    reload: false,
    themeDir: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--port") options.port = Number(argv[++i]);
    else if (arg === "--once") options.mode = "once";
    else if (arg === "--watch") options.mode = "watch";
    else if (arg === "--verify") options.mode = "verify";
    else if (arg === "--remove") options.mode = "remove";
    else if (arg === "--timeout-ms") options.timeoutMs = Number(argv[++i]);
    else if (arg === "--screenshot") options.screenshot = path.resolve(argv[++i]);
    else if (arg === "--viewport") {
      const value = argv[++i] ?? "";
      const match = /^(\d{3,4})x(\d{3,4})$/i.exec(value);
      if (!match) throw new Error(`Invalid viewport: ${value}`);
      options.viewport = { width: Number(match[1]), height: Number(match[2]) };
    }
    else if (arg === "--reload") options.reload = true;
    else if (arg === "--theme-dir") options.themeDir = path.resolve(argv[++i]);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isInteger(options.port) || options.port < 1024 || options.port > 65535) {
    throw new Error(`Invalid port: ${options.port}`);
  }
  if (options.viewport && (
    options.viewport.width < 800 || options.viewport.width > 3840 ||
    options.viewport.height < 600 || options.viewport.height > 2160
  )) {
    throw new Error(`Viewport is out of range: ${options.viewport.width}x${options.viewport.height}`);
  }
  if (["watch", "once"].includes(options.mode) && !options.themeDir) {
    throw new Error("--theme-dir is required when applying a theme");
  }
  return options;
}

class CdpSession {
  constructor(target) {
    this.target = target;
    this.ws = new WebSocket(target.webSocketDebuggerUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    this.closed = false;
  }

  async open() {
    await new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener("error", reject, { once: true });
    });
    this.ws.addEventListener("message", (event) => this.onMessage(event));
    this.ws.addEventListener("close", () => {
      this.closed = true;
      for (const waiter of this.pending.values()) waiter.reject(new Error("CDP socket closed"));
      this.pending.clear();
    });
    await this.send("Runtime.enable");
    await this.send("Page.enable");
    return this;
  }

  onMessage(event) {
    const message = JSON.parse(String(event.data));
    if (message.id) {
      const waiter = this.pending.get(message.id);
      if (!waiter) return;
      this.pending.delete(message.id);
      if (message.error) waiter.reject(new Error(`${message.error.message} (${message.error.code})`));
      else waiter.resolve(message.result);
      return;
    }
    for (const listener of this.listeners.get(message.method) ?? []) listener(message.params ?? {});
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) ?? [];
    listeners.push(listener);
    this.listeners.set(method, listeners);
  }

  send(method, params = {}) {
    if (this.closed) return Promise.reject(new Error("CDP session is closed"));
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: false,
    });
    if (result.exceptionDetails) {
      const detail = result.exceptionDetails.exception?.description ?? result.exceptionDetails.text;
      throw new Error(`Renderer evaluation failed: ${detail}`);
    }
    return result.result?.value;
  }

  close() {
    if (!this.closed) this.ws.close();
    this.closed = true;
  }
}

async function waitForTargets(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const targets = await response.json();
      const pages = targets.filter((item) => item.type === "page" && item.url.startsWith("app://"));
      if (pages.length) return pages;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  throw new Error(`No Codex renderer target on 127.0.0.1:${port}: ${lastError?.message ?? "timed out"}`);
}

async function loadPayload(themeDir) {
  const [css, template, themePayload] = await Promise.all([
    fs.readFile(path.join(root, "assets", "dream-skin.css"), "utf8"),
    fs.readFile(path.join(root, "assets", "renderer-inject.js"), "utf8"),
    buildThemePayload(themeDir),
  ]);
  return template
    .replace("__DREAM_CSS_JSON__", JSON.stringify(css))
    .replace("__DREAM_HERO_JSON__", JSON.stringify(themePayload.heroDataUrl))
    .replace("__DREAM_TEXTURE_JSON__", JSON.stringify(themePayload.textureDataUrl))
    .replace("__DREAM_CHARACTER_JSON__", JSON.stringify(themePayload.characterDataUrl))
    .replace("__DREAM_AVATAR_JSON__", JSON.stringify(themePayload.avatarDataUrl))
    .replace("__DREAM_THEME_JSON__", JSON.stringify(themePayload.theme));
}

async function connectTarget(target) {
  return new CdpSession(target).open();
}

async function applyToSession(session, payload) {
  return session.evaluate(payload);
}

async function removeFromSession(session) {
  return session.evaluate(`(() => {
    window.__CODEX_DREAM_SKIN_DISABLED__ = true;
    const state = window.__CODEX_DREAM_SKIN_STATE__;
    if (state?.cleanup) return state.cleanup();
    document.documentElement?.classList.remove('codex-dream-skin');
    document.documentElement?.style.removeProperty('--dream-hero');
    document.documentElement?.style.removeProperty('--dream-texture');
    document.documentElement?.style.removeProperty('--dream-character');
    document.documentElement?.style.removeProperty('--dream-avatar');
    document.getElementById('codex-dream-skin-style')?.remove();
    document.getElementById('codex-dream-skin-chrome')?.remove();
    return true;
  })()`);
}

async function verifySession(session) {
  return session.evaluate(`(() => {
    const box = (node) => {
      if (!node) return null;
      const r = node.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
    };
    const home = document.querySelector('.dream-home');
    const task = document.querySelector('main.main-surface.dream-task-shell');
    const suggestions = home?.querySelector('.group\\\\/home-suggestions') ?? null;
    const cards = suggestions ? [...suggestions.querySelectorAll('button')].map(box) : [];
    const result = {
      installed: document.documentElement.classList.contains('codex-dream-skin'),
      version: window.__CODEX_DREAM_SKIN_STATE__?.version ?? null,
      themeId: window.__CODEX_DREAM_SKIN_STATE__?.themeId ?? null,
      stylePresent: Boolean(document.getElementById('codex-dream-skin-style')),
      chromePresent: Boolean(document.getElementById('codex-dream-skin-chrome')),
      chromePointerEvents: getComputedStyle(document.getElementById('codex-dream-skin-chrome') || document.body).pointerEvents,
      homePresent: Boolean(home),
      taskPresent: Boolean(task),
      avatarPresent: Boolean(document.querySelector('#codex-dream-skin-chrome .dream-avatar')),
      suggestionsPresent: Boolean(suggestions),
      hero: box(home?.firstElementChild?.firstElementChild?.firstElementChild),
      cards,
      composer: box(document.querySelector('.composer-surface-chrome')),
      sidebar: box(document.querySelector('aside.app-shell-left-panel')),
      viewport: { width: innerWidth, height: innerHeight },
      documentOverflow: {
        x: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        y: document.documentElement.scrollHeight > document.documentElement.clientHeight,
      },
    };
    const homePass = result.homePresent && Boolean(result.hero) && result.avatarPresent &&
      (!result.suggestionsPresent || (result.cards.length >= 2 && result.cards.length <= 4));
    const taskPass = result.taskPresent;
    result.pass = result.installed && result.stylePresent && result.chromePresent &&
      result.chromePointerEvents === 'none' && Boolean(result.composer) && Boolean(result.sidebar) &&
      (homePass || taskPass);
    return result;
  })()`);
}

async function waitForVerifiedSession(session, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastResult;
  while (Date.now() < deadline) {
    lastResult = await verifySession(session);
    if (lastResult.pass) return lastResult;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return lastResult;
}

async function capture(session, outputPath, requestedViewport) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  if (requestedViewport) {
    await session.send("Emulation.setDeviceMetricsOverride", {
      width: requestedViewport.width,
      height: requestedViewport.height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  await session.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await session.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  const viewport = await session.evaluate("({ width: innerWidth, height: innerHeight })");
  await session.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: Math.round(viewport.width * 0.64),
    y: Math.round(viewport.height * 0.62),
    button: "none",
  });
  await new Promise((resolve) => setTimeout(resolve, 300));
  const result = await session.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
  });
  await fs.writeFile(outputPath, Buffer.from(result.data, "base64"));
}

function isAuxiliaryTarget(target) {
  try {
    const targetUrl = new URL(target.url);
    return targetUrl.searchParams.get("initialRoute") === "/avatar-overlay";
  } catch {
    return false;
  }
}

async function runOneShot(options) {
  const discoveredTargets = await waitForTargets(options.port, options.timeoutMs);
  const targets = (options.mode === "verify" || options.screenshot)
    ? discoveredTargets.filter((target) => !isAuxiliaryTarget(target))
    : discoveredTargets;
  if (!targets.length) throw new Error(`No primary Codex renderer target on 127.0.0.1:${options.port}`);
  const payload = (options.mode === "once" || options.reload) ? await loadPayload(options.themeDir) : null;
  const results = [];
  for (const target of targets) {
    const session = await connectTarget(target);
    try {
      if (options.mode === "remove") await removeFromSession(session);
      else if (options.mode === "once") await applyToSession(session, payload);
      if (options.mode === "once") {
        await new Promise((resolve) => setTimeout(resolve, 850));
      }
      if (options.reload) {
        await session.send("Page.reload", { ignoreCache: true });
        await new Promise((resolve) => setTimeout(resolve, 1600));
        if (options.mode !== "remove") await applyToSession(session, payload);
      }
      const verified = options.mode === "remove"
        ? await session.evaluate("!document.documentElement.classList.contains('codex-dream-skin')")
        : (options.reload || options.mode === "once")
          ? await waitForVerifiedSession(session, options.timeoutMs)
          : await verifySession(session);
      results.push({ targetId: target.id, title: target.title, url: target.url, result: verified });
      if (options.screenshot) await capture(session, options.screenshot, options.viewport);
    } finally {
      session.close();
    }
  }
  console.log(JSON.stringify({ mode: options.mode, port: options.port, targets: results }, null, 2));
  if (options.mode === "verify" && results.some((item) => !item.result.pass)) process.exitCode = 2;
}

async function runWatch(options) {
  const payload = await loadPayload(options.themeDir);
  const sessions = new Map();
  const cleanedAuxiliaryIds = new Set();
  let stopping = false;
  const stop = () => { stopping = true; };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  while (!stopping) {
    let targets = [];
    try {
      targets = await waitForTargets(options.port, 2000);
    } catch (error) {
      console.error(`[dream-skin] ${new Date().toISOString()} ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      continue;
    }

    const allActiveIds = new Set(targets.map((target) => target.id));
    for (const id of cleanedAuxiliaryIds) {
      if (!allActiveIds.has(id)) cleanedAuxiliaryIds.delete(id);
    }

    const auxiliaryTargets = targets.filter(isAuxiliaryTarget);
    for (const target of auxiliaryTargets) {
      if (cleanedAuxiliaryIds.has(target.id)) continue;
      let auxiliarySession;
      try {
        auxiliarySession = await connectTarget(target);
        await removeFromSession(auxiliarySession);
        cleanedAuxiliaryIds.add(target.id);
        console.log(`[dream-skin] cleaned auxiliary target ${target.id} (${target.url})`);
      } catch (error) {
        console.error(`[dream-skin] auxiliary cleanup failed for ${target.id}: ${error.message}`);
      } finally {
        auxiliarySession?.close();
      }
    }

    const primaryTargets = targets.filter((target) => !isAuxiliaryTarget(target));
    const activeIds = new Set(primaryTargets.map((target) => target.id));
    for (const [id, session] of sessions) {
      if (!activeIds.has(id) || session.closed) {
        session.close();
        sessions.delete(id);
      }
    }

    for (const target of primaryTargets) {
      if (sessions.has(target.id)) continue;
      try {
        const session = await connectTarget(target);
        session.on("Page.loadEventFired", () => {
          setTimeout(() => applyToSession(session, payload).catch((error) => {
            console.error(`[dream-skin] reinject failed: ${error.message}`);
          }), 250);
        });
        await applyToSession(session, payload);
        sessions.set(target.id, session);
        console.log(`[dream-skin] injected target ${target.id} (${target.title || target.url})`);
      } catch (error) {
        console.error(`[dream-skin] inject failed for ${target.id}: ${error.message}`);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 900));
  }

  for (const session of sessions.values()) session.close();
}

const options = parseArgs(process.argv.slice(2));
if (options.mode === "watch") await runWatch(options);
else await runOneShot(options);
