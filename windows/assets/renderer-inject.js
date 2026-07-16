((cssText, heroDataUrl, textureDataUrl, characterDataUrl, avatarDataUrl, themeConfig) => {
  const STATE_KEY = "__CODEX_DREAM_SKIN_STATE__";
  const STYLE_ID = "codex-dream-skin-style";
  const CHROME_ID = "codex-dream-skin-chrome";
  const VERSION = "2.0.0";
  const THEME = themeConfig && typeof themeConfig === "object" ? themeConfig : {};
  const THEME_VARIABLES = [
    "--theme-background", "--theme-panel", "--theme-panel-alt", "--theme-accent",
    "--theme-accent-alt", "--theme-gold", "--theme-text", "--theme-muted",
    "--theme-line", "--theme-hero-size", "--theme-hero-position",
    "--theme-overlay-strength", "--theme-texture-opacity", "--dream-hero", "--dream-texture",
    "--dream-character", "--dream-avatar",
  ];
  window.__CODEX_DREAM_SKIN_DISABLED__ = false;

  const previous = window[STATE_KEY];
  if (previous?.observer) previous.observer.disconnect();
  if (previous?.timer) clearInterval(previous.timer);
  if (previous?.scheduler?.timeout) clearTimeout(previous.scheduler.timeout);
  if (previous?.resizeHandler) window.removeEventListener("resize", previous.resizeHandler);
  if (previous?.heroUrl) URL.revokeObjectURL(previous.heroUrl);
  if (previous?.textureUrl) URL.revokeObjectURL(previous.textureUrl);
  if (previous?.characterUrl) URL.revokeObjectURL(previous.characterUrl);
  if (previous?.avatarUrl) URL.revokeObjectURL(previous.avatarUrl);

  const objectUrlFromData = (dataUrl) => {
    const comma = dataUrl.indexOf(",");
    const mime = /^data:([^;,]+)/.exec(dataUrl)?.[1] || "image/png";
    const binary = atob(dataUrl.slice(comma + 1));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return URL.createObjectURL(new Blob([bytes], { type: mime }));
  };

  const heroUrl = objectUrlFromData(heroDataUrl);
  const textureUrl = objectUrlFromData(textureDataUrl);
  const characterUrl = objectUrlFromData(characterDataUrl);
  const avatarUrl = objectUrlFromData(avatarDataUrl);

  const applyThemeVariables = (root) => {
    const colors = THEME.colors || {};
    const layout = THEME.layout || {};
    const variables = {
      "--theme-background": colors.background || "#100D0E",
      "--theme-panel": colors.panel || "#171214",
      "--theme-panel-alt": colors.panelAlt || "#211719",
      "--theme-accent": colors.accent || "#9F252B",
      "--theme-accent-alt": colors.accentAlt || "#C44338",
      "--theme-gold": colors.gold || "#B89352",
      "--theme-text": colors.text || "#F2ECE4",
      "--theme-muted": colors.muted || "#A79B95",
      "--theme-line": colors.line || "#6D4A32",
      "--theme-hero-size": layout.heroSize || "cover",
      "--theme-hero-position": layout.heroPosition || "58% 36%",
      "--theme-overlay-strength": String(layout.heroOverlayStrength ?? 0.72),
      "--theme-texture-opacity": String(layout.textureOpacity ?? 0.12),
      "--dream-hero": `url("${heroUrl}")`,
      "--dream-texture": `url("${textureUrl}")`,
      "--dream-character": `url("${characterUrl}")`,
      "--dream-avatar": `url("${avatarUrl}")`,
    };
    for (const [name, value] of Object.entries(variables)) root.style.setProperty(name, value);
  };

  const ensure = () => {
    if (window.__CODEX_DREAM_SKIN_DISABLED__) return;
    const root = document.documentElement;
    if (!root) return;
    root.classList.add("codex-dream-skin");
    applyThemeVariables(root);

    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      (document.head || root).appendChild(style);
    }
    if (style.dataset.dreamVersion !== VERSION) {
      style.textContent = cssText;
      style.dataset.dreamVersion = VERSION;
    }

    const shellMain = document.querySelector("main.main-surface") || document.querySelector("main");
    const home = document.querySelector('[role="main"]:has([data-testid="home-icon"])');
    for (const candidate of document.querySelectorAll('[role="main"].dream-home')) {
      if (candidate !== home) candidate.classList.remove("dream-home");
    }
    if (home) home.classList.add("dream-home");

    if (!shellMain || !document.body) return;
    shellMain.classList.toggle("dream-home-shell", Boolean(home));
    let chrome = document.getElementById(CHROME_ID);
    if (!chrome || chrome.parentElement !== document.body) {
      chrome?.remove();
      chrome = document.createElement("div");
      chrome.id = CHROME_ID;
      chrome.setAttribute("aria-hidden", "true");
      chrome.innerHTML = `
        <div class="dream-metal-frame"><i></i><i></i><i></i><i></i></div>
        <div class="dream-snow"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>`;
      document.body.appendChild(chrome);
    }
    const shellBox = shellMain.getBoundingClientRect();
    chrome.style.left = `${Math.round(shellBox.left)}px`;
    chrome.style.top = `${Math.round(shellBox.top)}px`;
    chrome.style.width = `${Math.round(shellBox.width)}px`;
    chrome.style.height = `${Math.round(shellBox.height)}px`;
    chrome.classList.toggle("dream-home-shell", Boolean(home));
  };

  const cleanup = () => {
    window.__CODEX_DREAM_SKIN_DISABLED__ = true;
    document.documentElement?.classList.remove("codex-dream-skin");
    for (const name of THEME_VARIABLES) document.documentElement?.style.removeProperty(name);
    document.querySelectorAll(".dream-home").forEach((node) => node.classList.remove("dream-home"));
    document.querySelectorAll(".dream-home-shell").forEach((node) => node.classList.remove("dream-home-shell"));
    document.getElementById(STYLE_ID)?.remove();
    document.getElementById(CHROME_ID)?.remove();
    const state = window[STATE_KEY];
    state?.observer?.disconnect();
    if (state?.timer) clearInterval(state.timer);
    if (state?.scheduler?.timeout) clearTimeout(state.scheduler.timeout);
    if (state?.resizeHandler) window.removeEventListener("resize", state.resizeHandler);
    if (state?.heroUrl) URL.revokeObjectURL(state.heroUrl);
    if (state?.textureUrl) URL.revokeObjectURL(state.textureUrl);
    if (state?.characterUrl) URL.revokeObjectURL(state.characterUrl);
    if (state?.avatarUrl) URL.revokeObjectURL(state.avatarUrl);
    delete window[STATE_KEY];
    return true;
  };

  const scheduler = { timeout: null };
  const scheduleEnsure = () => {
    if (scheduler.timeout) clearTimeout(scheduler.timeout);
    scheduler.timeout = setTimeout(() => {
      scheduler.timeout = null;
      ensure();
    }, 180);
  };
  const observer = new MutationObserver(scheduleEnsure);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  const timer = setInterval(ensure, 5000);
  const resizeHandler = scheduleEnsure;
  window.addEventListener("resize", resizeHandler, { passive: true });
  window[STATE_KEY] = {
    ensure,
    cleanup,
    observer,
    timer,
    scheduler,
    resizeHandler,
    heroUrl,
    textureUrl,
    characterUrl,
    avatarUrl,
    themeId: THEME.id || null,
    version: VERSION,
  };
  ensure();
  return { installed: true, version: VERSION, themeId: THEME.id || null };
})(__DREAM_CSS_JSON__, __DREAM_HERO_JSON__, __DREAM_TEXTURE_JSON__, __DREAM_CHARACTER_JSON__, __DREAM_AVATAR_JSON__, __DREAM_THEME_JSON__)
