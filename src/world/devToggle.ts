import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("stoatDevToggle", {
  switch: () => ipcRenderer.invoke("devtoggle:switch") as Promise<boolean>,
  status: () => ipcRenderer.invoke("devtoggle:status") as Promise<boolean>,
});

// Inject a floating toggle button into the page
window.addEventListener("DOMContentLoaded", async () => {
  const isDev = await ipcRenderer.invoke("devtoggle:status");

  const btn = document.createElement("button");
  btn.id = "stoat-dev-toggle";
  btn.textContent = isDev ? "DEV" : "PROD";
  btn.title = "Switch between prod and dev builds";

  Object.assign(btn.style, {
    position: "fixed",
    bottom: "12px",
    right: "12px",
    zIndex: "99999",
    padding: "4px 10px",
    borderRadius: "6px",
    border: "1px solid rgba(255,255,255,0.15)",
    background: isDev ? "rgba(255,160,0,0.85)" : "rgba(80,80,80,0.85)",
    color: "#fff",
    fontSize: "11px",
    fontWeight: "700",
    fontFamily: "system-ui, sans-serif",
    letterSpacing: "0.05em",
    cursor: "pointer",
    userSelect: "none",
    backdropFilter: "blur(8px)",
    transition: "background 0.15s, opacity 0.15s",
    opacity: "0.7",
  });

  btn.addEventListener("mouseenter", () => { btn.style.opacity = "1"; });
  btn.addEventListener("mouseleave", () => { btn.style.opacity = "0.7"; });

  btn.addEventListener("click", async () => {
    btn.style.pointerEvents = "none";
    btn.textContent = "...";
    const newIsDev = await ipcRenderer.invoke("devtoggle:switch");
    // Page will reload, but update in case it doesn't
    btn.textContent = newIsDev ? "DEV" : "PROD";
    btn.style.background = newIsDev ? "rgba(255,160,0,0.85)" : "rgba(80,80,80,0.85)";
    btn.style.pointerEvents = "";
  });

  document.body.appendChild(btn);
});
