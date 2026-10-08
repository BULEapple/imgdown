// zip.js —— 极简 ZIP 打包（store 无压缩 + UTF-8 文件名 + CRC-32）。
// PNG 本身已压缩，ZIP 内直接存储即可，体积几乎不增加，无需引入外部库。
(function () {
  'use strict';

  // CRC-32 查表
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(u8) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  // 小端写入整数
  function u16(v) { return new Uint8Array([v & 0xFF, (v >>> 8) & 0xFF]); }
  function u32(v) { return new Uint8Array([v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF]); }

  function concat(arrays) {
    let len = 0;
    for (const a of arrays) len += a.length;
    const out = new Uint8Array(len);
    let p = 0;
    for (const a of arrays) { out.set(a, p); p += a.length; }
    return out;
  }

  // 当前时间的 DOS 时间/日期
  function dosDateTime(d) {
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const date = (((d.getFullYear() - 1980) & 0x7F) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    return { time, date };
  }

  // entries: [{ name: string, data: Uint8Array }]
  function buildZip(entries) {
    const encoder = new TextEncoder();
    const { time, date } = dosDateTime(new Date());
    const parts = [];
    const central = [];
    let offset = 0;

    for (const e of entries) {
      const name = encoder.encode(e.name);
      const crc = crc32(e.data);
      const size = e.data.length;

      // 本地文件头
      const local = [
        u32(0x04034B50),               // 签名
        u16(20),                       // 所需版本
        u16(0x0800),                   // 标志：UTF-8 文件名
        u16(0),                        // 压缩方式：store
        u16(time), u16(date),
        u32(crc), u32(size), u32(size),
        u16(name.length), u16(0),      // 文件名长度、扩展字段长度
        name, e.data
      ];
      const localBytes = concat(local);
      parts.push(localBytes);
      const localOffset = offset;
      offset += localBytes.length;

      // 中央目录项
      const cd = [
        u32(0x02014B50),
        u16(20), u16(20),
        u16(0x0800), u16(0),
        u16(time), u16(date),
        u32(crc), u32(size), u32(size),
        u16(name.length), u16(0), u16(0), u16(0), u16(0),
        u32(0),                        // 外部属性
        u32(localOffset),
        name
      ];
      central.push(concat(cd));
    }

    const centralBytes = concat(central);
    const centralOffset = offset;
    const centralSize = centralBytes.length;
    parts.push(centralBytes);

    // 结束记录
    const end = [
      u32(0x06054B50),
      u16(0), u16(0),
      u16(entries.length), u16(entries.length),
      u32(centralSize), u32(centralOffset),
      u16(0)
    ];
    parts.push(concat(end));

    return new Blob(parts, { type: 'application/zip' });
  }

  window.buildZip = buildZip;
})();
