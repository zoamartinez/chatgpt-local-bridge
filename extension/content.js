const TOOL_RE = /<local-tool>\s*([\s\S]*?)\s*<\/local-tool>/g;
const DEFAULT_MODES = { commands: "ask", updates: "ask", applications: "ask", files: "ask", tabs: "ask", reading: "ask" };
const TOOL_CATEGORIES = {
  run_command: "commands", update_bridge: "updates", open_app: "applications",
  open_path: "files", browser_tabs: "tabs", read_tab: "reading"
};

function stableId(value) {
  const text = JSON.stringify(value);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `clb-${(hash >>> 0).toString(16)}`;
}

function validateRequest(value) {
  if (!value || typeof value !== "object") throw new Error("Solicitud no válida");
  if (value.version !== 1) throw new Error("Versión de protocolo no compatible");
  if (typeof value.tool !== "string") throw new Error("Falta el nombre de la herramienta");
  if (value.tool !== "bridge_settings" && (typeof value.reason !== "string" || !value.reason.trim())) {
    throw new Error("Falta el motivo de la operación");
  }
  return value;
}

function describe(request) {
  if (request.tool === "run_command") return Array.isArray(request.args) ? request.args.join(" ") : "Comando no válido";
  if (request.tool === "update_bridge") return "Actualizar desde zoamartinez/chatgpt-local-bridge";
  if (request.tool === "open_app") return `Abrir aplicación: ${request.app || "?"}`;
  if (request.tool === "open_path") return `Abrir en Archivos: ${request.path || "?"}`;
  if (request.tool === "browser_tabs") return `Pestañas: ${request.action || "?"}`;
  if (request.tool === "read_tab") return "Leer el texto visible de la pestaña activa";
  return request.tool;
}

async function getModes() {
  const stored = await chrome.storage.local.get("permissionModes");
  return { ...DEFAULT_MODES, ...(stored.permissionModes || {}) };
}

function putInComposer(text) {
  const composer = document.querySelector("#prompt-textarea");
  if (!composer) return false;
  composer.focus();
  if (composer.tagName === "TEXTAREA") {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    setter?.call(composer, text);
  } else {
    composer.replaceChildren();
    const paragraph = document.createElement("p");
    paragraph.textContent = text;
    composer.appendChild(paragraph);
  }
  composer.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
  return true;
}

function resultEnvelope(request, response) {
  return `<local-tool-result>\n${JSON.stringify({
    version: 1, request_id: request.request_id, tool: request.tool, ...response
  }, null, 2)}\n</local-tool-result>`;
}

function executeRequest(request, status, buttons = []) {
  buttons.forEach((button) => { button.disabled = true; });
  status.textContent = "Ejecutando…";
  chrome.runtime.sendMessage({ type: "execute-local-tool", request }, (response) => {
    if (chrome.runtime.lastError) {
      status.textContent = chrome.runtime.lastError.message;
      return;
    }
    const envelope = resultEnvelope(request, response || { ok: false, error: "Sin respuesta" });
    if (putInComposer(envelope)) {
      status.textContent = "Resultado preparado abajo. Revísalo y pulsa Enviar.";
    } else {
      navigator.clipboard.writeText(envelope).then(
        () => { status.textContent = "Resultado copiado. Pégalo en el chat."; },
        () => { status.textContent = envelope; }
      );
    }
  });
}

function makeSettingsCard(request) {
  const card = document.createElement("section");
  card.className = "clb-card clb-settings";
  card.id = stableId(request);
  const title = document.createElement("div");
  title.className = "clb-title";
  title.textContent = "Configuración de ChatGPT Local Bridge";
  const labels = {
    commands: "Ejecutar consultas", updates: "Actualizar el puente",
    applications: "Abrir aplicaciones", files: "Abrir carpetas y archivos",
    tabs: "Manejar pestañas", reading: "Leer la pestaña activa"
  };
  const grid = document.createElement("div");
  grid.className = "clb-settings-grid";
  const status = document.createElement("div");
  status.className = "clb-status";
  getModes().then((modes) => {
    Object.entries(labels).forEach(([category, label]) => {
      const row = document.createElement("label");
      const name = document.createElement("span");
      name.textContent = label;
      const select = document.createElement("select");
      [["block", "Bloquear"], ["ask", "Preguntar"], ["auto", "Automático"]].forEach(([value, text]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = text;
        option.selected = modes[category] === value;
        select.appendChild(option);
      });
      select.addEventListener("change", async () => {
        const current = await getModes();
        current[category] = select.value;
        await chrome.storage.local.set({ permissionModes: current });
        status.textContent = "Configuración guardada localmente.";
      });
      row.append(name, select);
      grid.appendChild(row);
    });
  });
  const note = document.createElement("p");
  note.textContent = "Las lecturas siempre se preparan en el cuadro de texto; tú decides si las envías.";
  card.append(title, grid, note, status);
  return card;
}

function makeCard(request) {
  if (request.tool === "bridge_settings") return makeSettingsCard(request);
  const card = document.createElement("section");
  card.className = "clb-card";
  card.id = stableId(request);
  const title = document.createElement("div");
  title.className = "clb-title";
  title.textContent = "ChatGPT solicita una acción local";
  const reason = document.createElement("div");
  reason.textContent = `Motivo: ${request.reason}`;
  const command = document.createElement("code");
  command.className = "clb-command";
  command.textContent = describe(request);
  const status = document.createElement("div");
  status.className = "clb-status";
  const actions = document.createElement("div");
  actions.className = "clb-actions";
  const allow = document.createElement("button");
  allow.className = "clb-allow";
  allow.textContent = "Autorizar una vez";
  const deny = document.createElement("button");
  deny.className = "clb-deny";
  deny.textContent = "Denegar";
  actions.append(allow, deny);
  deny.addEventListener("click", () => {
    allow.disabled = true;
    deny.disabled = true;
    status.textContent = "Operación denegada.";
  });
  allow.addEventListener("click", () => executeRequest(request, status, [allow, deny]));
  card.append(title, reason, command, actions, status);
  const category = TOOL_CATEGORIES[request.tool];
  getModes().then((modes) => {
    const mode = category ? modes[category] : "block";
    if (mode === "block") {
      allow.disabled = true;
      deny.disabled = true;
      status.textContent = "Esta capacidad está bloqueada en la configuración del puente.";
    } else if (mode === "auto") {
      executeRequest(request, status, [allow, deny]);
    }
  });
  return card;
}

function scan() {
  document.querySelectorAll('[data-message-author-role="assistant"]').forEach((message) => {
    const text = message.innerText || "";
    for (const match of text.matchAll(TOOL_RE)) {
      try {
        const request = validateRequest(JSON.parse(match[1]));
        if (!request.request_id) request.request_id = stableId(request);
        if (!document.getElementById(stableId(request))) message.appendChild(makeCard(request));
      } catch (error) {
        const id = stableId({ bad: match[1] });
        if (document.getElementById(id)) continue;
        const warning = document.createElement("div");
        warning.id = id;
        warning.className = "clb-card";
        warning.textContent = `Solicitud local ignorada: ${error.message}`;
        message.appendChild(warning);
      }
    }
  });
}

let scanTimer;
function scheduleScan() {
  clearTimeout(scanTimer);
  scanTimer = setTimeout(scan, 400);
}
new MutationObserver(scheduleScan).observe(document.documentElement, { childList: true, subtree: true });
scan();
