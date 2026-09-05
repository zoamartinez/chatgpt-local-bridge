const TOOL_RE = /<local-tool>\s*([\s\S]*?)\s*<\/local-tool>/g;

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
  if (typeof value.reason !== "string" || !value.reason.trim()) {
    throw new Error("Falta el motivo de la operación");
  }
  return value;
}

function describe(request) {
  if (request.tool === "run_command") {
    return Array.isArray(request.args) ? request.args.join(" ") : "Comando no válido";
  }
  if (request.tool === "update_bridge") {
    return "Actualizar desde zoamartinez/chatgpt-local-bridge";
  }
  return `${request.tool} ${JSON.stringify(request.input || {})}`;
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
    version: 1,
    request_id: request.request_id,
    tool: request.tool,
    ...response
  }, null, 2)}\n</local-tool-result>`;
}

function makeCard(request) {
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

  allow.addEventListener("click", () => {
    allow.disabled = true;
    deny.disabled = true;
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
  });

  card.append(title, reason, command, actions, status);
  return card;
}

function scan() {
  document.querySelectorAll('[data-message-author-role="assistant"]')
    .forEach((message) => {
      const text = message.innerText || "";
      for (const match of text.matchAll(TOOL_RE)) {
        try {
          const request = validateRequest(JSON.parse(match[1]));
          if (!request.request_id) request.request_id = stableId(request);
          if (!document.getElementById(stableId(request))) message.appendChild(makeCard(request));
        } catch (error) {
          const warning = document.createElement("div");
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
