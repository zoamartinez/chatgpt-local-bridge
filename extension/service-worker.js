const HOST = "com.zoa.chatgpt_local_bridge";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "execute-local-tool") return false;

  chrome.runtime.sendNativeMessage(HOST, message.request, (response) => {
    if (chrome.runtime.lastError) {
      sendResponse({
        ok: false,
        error: `No se pudo contactar con el agente local: ${chrome.runtime.lastError.message}`
      });
      return;
    }
    sendResponse(response);
    if (response?.reload_extension) {
      setTimeout(() => chrome.runtime.reload(), 1000);
    }
  });
  return true;
});
