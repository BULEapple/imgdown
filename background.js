// background.js —— service worker：消息转发、执行下载、下载状态回传。

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // content.js 提取完成：存入 storage 并打开 gallery 页面。
  if (msg.type === 'EXTRACTED') {
    chrome.storage.local.set({ images: msg.images || [] }, () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('gallery.html') });
    });
    sendResponse({ ok: true });
    return false;
  }

  // gallery 发来的下载请求：dataUrl 已由 gallery 转换为 PNG，这里执行保存。
  if (msg.type === 'DOWNLOAD') {
    chrome.downloads.download(
      { url: msg.dataUrl, filename: msg.filename, conflictAction: 'uniquify' },
      (downloadId) => {
        if (chrome.runtime.lastError) {
          sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        } else {
          sendResponse({ ok: true, downloadId });
        }
      }
    );
    return true; // 异步回调中 sendResponse
  }

  return false;
});

// 下载状态回传 gallery（完成 / 中断 / 进行中），用于实时进度提示。
chrome.downloads.onChanged.addListener((delta) => {
  if (!delta.state) return;
  const payload = { type: 'PROGRESS', downloadId: delta.id, state: delta.state.current };
  if (delta.bytesReceived) payload.bytesReceived = delta.bytesReceived.current;
  if (delta.totalBytes) payload.totalBytes = delta.totalBytes.current;
  chrome.runtime.sendMessage(payload).catch(() => {});
});
