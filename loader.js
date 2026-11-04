/* Elixir V1 - loader (isolated world) */
(() => {
  try {
    const s = document.createElement("script");
    s.src = chrome.runtime.getURL("core.js");
    s.onload = () => s.remove();
    s.onerror = () => console.warn("[ELIXIR V1] injector failed");
    (document.head || document.documentElement).appendChild(s);
  } catch (e) {
    console.warn("[ELIXIR V1] loader error", e);
  }
})();
