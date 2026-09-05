const HOST = "com.zoa.chatgpt_local_bridge";

async function normalWindowTabs() {
  const windows = await chrome.windows.getAll({ windowTypes: ["normal"] });
  if (!windows.length) throw new Error("No hay ninguna ventana normal de Chromium abierta");
  const target = windows.find((window) => window.focused) || windows[windows.length - 1];
  return chrome.tabs.query({ windowId: target.id });
}

function safeWebUrl(value) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Solo se permiten direcciones http o https");
  return url.href;
}

async function browserTabs(request) {
  const action = request.action;
  if (action === "new") {
    const url = safeWebUrl(request.url);
    const windows = await chrome.windows.getAll({ windowTypes: ["normal"] });
    if (!windows.length) {
      const created = await chrome.windows.create({ url });
      return { ok: true, action, tab_id: created.tabs?.[0]?.id };
    }
    const target = windows.find((window) => window.focused) || windows[windows.length - 1];
    const tab = await chrome.tabs.create({ windowId: target.id, url, active: true });
    return { ok: true, action, tab_id: tab.id };
  }
  const tabs = await normalWindowTabs();
  const activeIndex = Math.max(0, tabs.findIndex((tab) => tab.active));
  if (action === "list") {
    return {
      ok: true,
      tabs: tabs.map((tab, index) => ({ position: index + 1, tab_id: tab.id, active: Boolean(tab.active) }))
    };
  }
  if (!tabs.length) throw new Error("La ventana de Chromium no tiene pestañas");
  if (action === "next" || action === "previous") {
    const delta = action === "next" ? 1 : -1;
    const target = tabs[(activeIndex + delta + tabs.length) % tabs.length];
    await chrome.tabs.update(target.id, { active: true });
    await chrome.windows.update(target.windowId, { focused: true });
    return { ok: true, action, position: target.index + 1 };
  }
  if (action === "activate") {
    if (!Number.isInteger(request.position) || request.position < 1 || request.position > tabs.length) {
      throw new Error("La posición de pestaña no es válida");
    }
    const target = tabs[request.position - 1];
    await chrome.tabs.update(target.id, { active: true });
    await chrome.windows.update(target.windowId, { focused: true });
    return { ok: true, action, position: request.position };
  }
  const active = tabs[activeIndex];
  if (action === "close") await chrome.tabs.remove(active.id);
  else if (action === "reload") await chrome.tabs.reload(active.id);
  else if (action === "back") await chrome.tabs.goBack(active.id);
  else if (action === "forward") await chrome.tabs.goForward(active.id);
  else throw new Error("Acción de pestañas no permitida");
  return { ok: true, action };
}

async function readTab() {
  const tabs = await normalWindowTabs();
  const active = tabs.find((tab) => tab.active);
  if (!active) throw new Error("No hay una pestaña activa");
  const results = await chrome.scripting.executeScript({
    target: { tabId: active.id },
    func: () => ({
      title: document.title,
      url: location.href,
      text: (document.body?.innerText || "").slice(0, 100000)
    })
  });
  return { ok: true, ...results[0].result, truncated: (results[0].result?.text?.length || 0) >= 100000 };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "execute-local-tool") return false;
  const request = message.request;
  if (request?.tool === "browser_tabs" || request?.tool === "read_tab") {
    const operation = request.tool === "browser_tabs" ? browserTabs(request) : readTab();
    operation.then(sendResponse, (error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  chrome.runtime.sendNativeMessage(HOST, request, (response) => {
    if (chrome.runtime.lastError) {
      sendResponse({ ok: false, error: `No se pudo contactar con el agente local: ${chrome.runtime.lastError.message}` });
      return;
    }
    sendResponse(response);
    if (response?.reload_extension) setTimeout(() => chrome.runtime.reload(), 1000);
  });
  return true;
});
