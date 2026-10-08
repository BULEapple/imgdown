// content.js —— 在商品详情页注入「获取图片」悬浮按钮，并收集图片 URL 与尺寸。
// 注意：这里只收集信息，不做任何转换；真正的 PNG 转换发生在 gallery 勾选下载时。

(function () {
  'use strict';

  // 详情页 URL 白名单：只有这些商品详情页才显示按钮，其他页面不显示。
  const DETAIL_PATTERNS = [
    /item\.taobao\.com\/item\.htm/i,            // 淘宝 PC 详情
    /detail\.tmall\.com\/item\.htm/i,           // 天猫 PC 详情
    /item\.jd\.com\/\d+\.html/i,                // 京东 PC 详情
    /(yangkeduo|pinduoduo)\.com\/goods\.html/i  // 拼多多详情
  ];

  // 过滤规则：这些 URL 通常是图标/占位图/LOGO，直接跳过。
  const FILTER_RE = /(data:|blank\.gif|placeholder|sprite|logo|icon|avatar|qr|\.svg)/i;

  const MIN_SIZE = 100; // 小于 100x100 的图视为小图过滤

  function isDetailPage() {
    return DETAIL_PATTERNS.some((re) => re.test(location.href));
  }

  // 已知尺寸且小于阈值时过滤；尺寸未知则保留，交给 gallery 展示真实尺寸。
  function isTooSmall(w, h) {
    if (!w || !h) return false;
    return w < MIN_SIZE || h < MIN_SIZE;
  }

  // 相对路径补全为绝对 URL，解析失败返回 null。
  function toAbsolute(url) {
    try {
      return new URL(url, location.href).href;
    } catch (e) {
      return null;
    }
  }

  // 从 srcset 中取分辨率最大的候选（优先 w 描述符，其次取最后一项）。
  function bestFromSrcset(srcset) {
    if (!srcset) return null;
    let best = null;
    let bestW = -1;
    for (const part of srcset.split(',')) {
      const seg = part.trim().split(/\s+/);
      if (!seg[0]) continue;
      let w = 0;
      if (seg[1] && seg[1].endsWith('w')) w = parseInt(seg[1], 10) || 0;
      if (w >= bestW) {
        bestW = w;
        best = seg[0];
      }
    }
    return best;
  }

  // 收集 <img> 标签的候选图。
  function collectFromImg() {
    const out = [];
    document.querySelectorAll('img').forEach((img) => {
      const nw = img.naturalWidth || 0;
      const nh = img.naturalHeight || 0;

      // 已加载图片（src/currentSrc/srcset），用真实尺寸过滤小图。
      const loaded = [img.currentSrc, img.src, bestFromSrcset(img.getAttribute('srcset'))];
      for (const c of loaded) {
        if (!c) continue;
        const url = toAbsolute(c.trim());
        if (!url || FILTER_RE.test(url)) continue;
        if (isTooSmall(nw, nh)) continue;
        out.push({ url, width: nw, height: nh });
        break; // 一个 img 只保留一个已加载候选
      }

      // 懒加载属性：尺寸未知，不做尺寸过滤，交给 gallery 展示。
      const lazy = [
        img.getAttribute('data-src'),
        img.getAttribute('data-lazy-src'),
        img.getAttribute('data-lazy'),
        img.getAttribute('data-original'),
        img.getAttribute('data-echo'),
        img.getAttribute('data-ks-lazyload')
      ];
      for (const c of lazy) {
        if (!c) continue;
        const url = toAbsolute(c.trim());
        if (!url || FILTER_RE.test(url)) continue;
        out.push({ url, width: 0, height: 0 });
      }
    });
    return out;
  }

  // 收集背景图 background-image（兼容 CSS 类与内联样式）。
  function collectFromBackground() {
    const out = [];
    document.querySelectorAll('*').forEach((el) => {
      let bg;
      try {
        bg = getComputedStyle(el).backgroundImage;
      } catch (e) {
        return;
      }
      if (!bg || bg === 'none') return;
      const match = bg.match(/url\(["']?(.*?)["']?\)/);
      if (!match) return;
      const url = toAbsolute(match[1].trim());
      if (!url || FILTER_RE.test(url)) return;
      out.push({ url, width: 0, height: 0 });
    });
    return out;
  }

  // 汇总并去重。
  function extractImages() {
    const seen = new Set();
    const images = [];
    const push = (item) => {
      if (!item || seen.has(item.url)) return;
      seen.add(item.url);
      images.push(item);
    };
    collectFromImg().forEach(push);
    collectFromBackground().forEach(push);
    return images;
  }

  // 注入悬浮按钮。
  function injectButton() {
    if (document.getElementById('img-fetch-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'img-fetch-btn';
    btn.textContent = '获取图片';
    btn.addEventListener('click', () => {
      const images = extractImages();
      chrome.runtime.sendMessage({ type: 'EXTRACTED', images }, () => {
        void chrome.runtime.lastError; // 忽略上下文失效等错误
      });
    });
    document.body.appendChild(btn);
  }

  if (isDetailPage()) injectButton();
})();
