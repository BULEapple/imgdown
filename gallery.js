// gallery.js —— 网格展示图片、勾选，并仅在用户勾选后对选中项转 PNG 下载。
// 单张直接下载 PNG，多张打包为 zip。

const grid = document.getElementById('grid');
const countEl = document.getElementById('count');
const statusEl = document.getElementById('status');
const downloadBtn = document.getElementById('download');
const selectAllBtn = document.getElementById('select-all');
const invertBtn = document.getElementById('invert');

let images = []; // 从 storage 读取的图片列表
let selected = new Set(); // 已勾选的图片下标

// 序号补零到 3 位：1 -> 001
function pad(n) {
  return String(n).padStart(3, '0');
}

// 渲染网格，每张图一个卡片（缩略图 + 尺寸 + 复选框）。
function render() {
  grid.innerHTML = '';
  images.forEach((img, i) => {
    const card = document.createElement('label');
    card.className = 'card';
    card.innerHTML =
      '<input type="checkbox" class="check" data-i="' + i + '">' +
      '<div class="thumb"><img loading="lazy" src="' + img.url + '" alt=""></div>' +
      '<div class="meta"><span class="size">' +
      (img.width ? img.width + '×' + img.height : '—') +
      '</span><span class="status"></span></div>';

    const check = card.querySelector('.check');
    check.addEventListener('change', syncSelection);

    // 提取阶段尺寸未知时，图片加载后回填真实尺寸。
    if (!img.width) {
      const el = card.querySelector('img');
      el.addEventListener('load', () => {
        img.width = el.naturalWidth;
        img.height = el.naturalHeight;
        card.querySelector('.size').textContent = el.naturalWidth + '×' + el.naturalHeight;
      });
    }

    grid.appendChild(card);
  });
  syncSelection();
}

// 根据所有复选框状态重建选中集合并刷新计数。
function syncSelection() {
  selected.clear();
  grid.querySelectorAll('.check').forEach((c) => {
    if (c.checked) selected.add(Number(c.dataset.i));
  });
  grid.querySelectorAll('.card').forEach((card) => {
    card.classList.toggle('selected', card.querySelector('.check').checked);
  });
  updateCount();
}

function updateCount() {
  countEl.textContent = '已选 ' + selected.size + ' 张';
  downloadBtn.disabled = selected.size === 0;
}

selectAllBtn.addEventListener('click', () => {
  grid.querySelectorAll('.check').forEach((c) => { c.checked = true; });
  syncSelection();
});

invertBtn.addEventListener('click', () => {
  grid.querySelectorAll('.check').forEach((c) => { c.checked = !c.checked; });
  syncSelection();
});

downloadBtn.addEventListener('click', downloadSelected);

// 批量下载选中项：先逐张转 PNG，再单张直下 / 多张打包 zip。
async function downloadSelected() {
  const list = [...selected].sort((a, b) => a - b);
  if (list.length === 0) return;

  downloadBtn.disabled = true;
  let failed = 0;
  const pngs = []; // 成功转换的 PNG { name, blob }

  // 第一步：仅此时逐张转换为 PNG（提取与预览阶段不转换）。
  for (const i of list) {
    const card = grid.querySelectorAll('.card')[i];
    const status = card.querySelector('.status');
    status.textContent = '转换中';
    statusEl.textContent = '正在处理 ' + (pngs.length + failed + 1) + '/' + list.length;

    try {
      const blob = await urlToPngBlob(images[i].url);
      pngs.push({ name: '商品图_' + pad(i + 1) + '.png', blob });
      status.textContent = '完成';
    } catch (e) {
      status.textContent = '失败';
      failed++;
    }
  }

  if (pngs.length === 0) {
    statusEl.textContent = '下载失败：所选图片均无法处理';
    downloadBtn.disabled = false;
    return;
  }

  // 第二步：单张直接下载，多张打包 zip。
  try {
    if (pngs.length === 1) {
      const dataUrl = await blobToDataUrl(pngs[0].blob);
      await sendDownload(dataUrl, pngs[0].name);
      statusEl.textContent = '下载完成：已保存 ' + pngs[0].name;
    } else {
      statusEl.textContent = '正在打包 zip…';
      const entries = [];
      for (const p of pngs) {
        entries.push({ name: p.name, data: new Uint8Array(await p.blob.arrayBuffer()) });
      }
      const zipBlob = buildZip(entries);
      const dataUrl = await blobToDataUrl(zipBlob);
      await sendDownload(dataUrl, '商品图.zip');
      statusEl.textContent = '下载完成：已打包 ' + pngs.length + ' 张为 商品图.zip' +
        (failed ? '（失败 ' + failed + ' 张）' : '');
    }
  } catch (e) {
    statusEl.textContent = '下载失败：' + (e.message || e);
  }

  downloadBtn.disabled = false;
}

// 发送下载请求给 background。
async function sendDownload(dataUrl, filename) {
  const resp = await chrome.runtime.sendMessage({ type: 'DOWNLOAD', dataUrl, filename });
  if (!resp || !resp.ok) throw new Error((resp && resp.error) || '下载失败');
}

// 把图片 URL 转为 PNG Blob（跨域由 host_permissions 兜底，无需 CORS 头）。
async function urlToPngBlob(url) {
  const resp = await fetch(url, { credentials: 'include' });
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  const blob = await resp.blob();

  // 原本就是 PNG 则直接使用，避免重复编码。
  if (blob.type === 'image/png') return blob;

  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0);
  bitmap.close();

  return await new Promise((res, rej) => {
    canvas.toBlob((b) => (b ? res(b) : rej(new Error('转 PNG 失败'))), 'image/png');
  });
}

function blobToDataUrl(blob) {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = () => res(reader.result);
    reader.onerror = () => rej(reader.error);
    reader.readAsDataURL(blob);
  });
}

// 接收 background 回传的下载状态，做粗粒度提示。
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type !== 'PROGRESS') return;
  if (msg.state === 'interrupted') statusEl.textContent = '部分下载被中断';
});

// 读取 content.js 提取的图片列表。
chrome.storage.local.get('images', (data) => {
  images = data.images || [];
  if (images.length === 0) {
    grid.innerHTML = '<p class="empty">未提取到图片，请回到商品详情页点击「获取图片」。</p>';
    downloadBtn.disabled = true;
    return;
  }
  render();
});
