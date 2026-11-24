'use strict';

const zlib = require('node:zlib');

function decodeXmlEntities(text) {
  return String(text || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)));
}

function unzipEntries(buf) {
  // Locate End of Central Directory (EOCD) signature 0x06054b50
  let eocd = -1;
  const minOffset = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= minOffset; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw Error('Invalid ZIP/Office archive: missing central directory.');
  const totalEntries = buf.readUInt16LE(eocd + 10);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  const entries = new Map();
  let pos = cdOffset;
  for (let idx = 0; idx < totalEntries && pos + 46 <= buf.length; idx++) {
    if (buf.readUInt32LE(pos) !== 0x02014b50) break;
    const method = buf.readUInt16LE(pos + 10);
    const compSize = buf.readUInt32LE(pos + 20);
    const nameLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const commentLen = buf.readUInt16LE(pos + 32);
    const localHeaderOffset = buf.readUInt32LE(pos + 42);
    const name = buf.subarray(pos + 46, pos + 46 + nameLen).toString('utf8');
    pos += 46 + nameLen + extraLen + commentLen;

    if (localHeaderOffset + 30 > buf.length || buf.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
      continue;
    }
    const lNameLen = buf.readUInt16LE(localHeaderOffset + 26);
    const lExtraLen = buf.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + lNameLen + lExtraLen;
    const compressed = buf.subarray(dataStart, dataStart + compSize);
    if (method === 0) {
      entries.set(name, compressed);
    } else if (method === 8) {
      entries.set(name, zlib.inflateRawSync(compressed));
    }
  }
  return entries;
}

function extractXmlTextRuns(xml, tagName) {
  const runs = [];
  const re = new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)</${tagName}>`, 'g');
  let m;
  while ((m = re.exec(xml)) !== null) {
    const val = decodeXmlEntities(m[1]).trim();
    if (val) runs.push(val);
  }
  return runs;
}

function extractDocxText(buf) {
  const entries = unzipEntries(buf);
  const parts = [];
  const docNames = [...entries.keys()]
    .filter((n) => /^word\/(document|header\d*|footer\d*)\.xml$/i.test(n))
    .sort((a, b) => (a === 'word/document.xml' ? -1 : b === 'word/document.xml' ? 1 : a.localeCompare(b)));
  for (const name of docNames) {
    const xml = entries.get(name).toString('utf8');
    const paragraphs = xml.split(/<\/w:p>/i);
    for (const p of paragraphs) {
      const runs = extractXmlTextRuns(p, 'w:t');
      if (runs.length) parts.push(runs.join(''));
    }
  }
  return parts.join('\n').trim() || '[DOCX document contained no extractable text]';
}

function extractPptxText(buf) {
  const entries = unzipEntries(buf);
  const slides = [...entries.keys()]
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/i.test(n))
    .sort((a, b) => {
      const na = parseInt(a.match(/slide(\d+)\.xml/i)?.[1] || '0', 10);
      const nb = parseInt(b.match(/slide(\d+)\.xml/i)?.[1] || '0', 10);
      return na - nb;
    });
  const out = [];
  for (const slide of slides) {
    const num = slide.match(/slide(\d+)\.xml/i)?.[1] || '?';
    const xml = entries.get(slide).toString('utf8');
    const paragraphs = xml.split(/<\/a:p>/i);
    const lines = [];
    for (const p of paragraphs) {
      const runs = extractXmlTextRuns(p, 'a:t');
      if (runs.length) lines.push(runs.join(''));
    }
    if (lines.length) {
      out.push(`--- Slide ${num} ---\n${lines.join('\n')}`);
    }
  }
  return out.join('\n\n').trim() || '[PPTX presentation contained no extractable text]';
}

function extractXlsxText(buf) {
  const entries = unzipEntries(buf);
  const sharedStrings = [];
  const sstBuf = entries.get('xl/sharedStrings.xml');
  if (sstBuf) {
    const sstXml = sstBuf.toString('utf8');
    for (const si of sstXml.split(/<\/si>/i)) {
      const runs = extractXmlTextRuns(si, 't');
      if (runs.length || /<t[\s>]/i.test(si)) {
        sharedStrings.push(runs.join(''));
      }
    }
  }
  const sheets = [...entries.keys()]
    .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(n))
    .sort((a, b) => {
      const na = parseInt(a.match(/sheet(\d+)\.xml/i)?.[1] || '0', 10);
      const nb = parseInt(b.match(/sheet(\d+)\.xml/i)?.[1] || '0', 10);
      return na - nb;
    });
  const out = [];
  for (const sheet of sheets) {
    const num = sheet.match(/sheet(\d+)\.xml/i)?.[1] || '?';
    const xml = entries.get(sheet).toString('utf8');
    const rows = [];
    const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/gi;
    let rm;
    while ((rm = rowRe.exec(xml)) !== null) {
      const cells = [];
      const cellRe = /<c\b([^>]*)>([\s\S]*?)<\/c>/gi;
      let cm;
      while ((cm = cellRe.exec(rm[1])) !== null) {
        const attrs = cm[1];
        const body = cm[2];
        const typeMatch = /\bt="([^"]+)"/i.exec(attrs);
        const cellType = typeMatch ? typeMatch[1] : '';
        const refMatch = /\br="([^"]+)"/i.exec(attrs);
        const ref = refMatch ? refMatch[1] : '';
        let val = '';
        if (cellType === 'inlineStr') {
          val = extractXmlTextRuns(body, 't').join('');
        } else {
          const vm = /<v[^>]*>([\s\S]*?)<\/v>/i.exec(body);
          if (vm) {
            const raw = decodeXmlEntities(vm[1]).trim();
            if (cellType === 's') {
              const idx = parseInt(raw, 10);
              val = Number.isInteger(idx) && sharedStrings[idx] !== undefined ? sharedStrings[idx] : raw;
            } else {
              val = raw;
            }
          }
        }
        if (val !== '') cells.push(ref ? `${ref}=${val}` : val);
      }
      if (cells.length) rows.push(cells.join('\t'));
    }
    if (rows.length) {
      out.push(`--- Sheet ${num} ---\n${rows.join('\n')}`);
    }
  }
  return out.join('\n\n').trim() || '[XLSX workbook contained no extractable cells]';
}

function unescapePdfLiteral(str) {
  return str
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\([()\\])/g, '$1')
    .replace(/\\([0-7]{1,3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)));
}

function extractPdfOperators(text) {
  const chunks = [];
  // Extract (...) Tj and [...] TJ text operators
  const tjRe = /\(([^()\\]*(?:\\.[^()\\]*)*)\)\s*Tj/g;
  let m;
  while ((m = tjRe.exec(text)) !== null) {
    const s = unescapePdfLiteral(m[1]).trim();
    if (s) chunks.push(s);
  }
  const tjArrRe = /\[([^\]]+)\]\s*TJ/g;
  while ((m = tjArrRe.exec(text)) !== null) {
    const inner = m[1];
    const parts = [];
    const strRe = /\(([^()\\]*(?:\\.[^()\\]*)*)\)/g;
    let sm;
    while ((sm = strRe.exec(inner)) !== null) {
      parts.push(unescapePdfLiteral(sm[1]));
    }
    const joined = parts.join('').trim();
    if (joined) chunks.push(joined);
  }
  return chunks;
}

function extractPdfText(buf, name, sha256) {
  const raw = buf.toString('latin1');
  const collected = [];
  const streamRe = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let m;
  while ((m = streamRe.exec(raw)) !== null) {
    const streamBytes = Buffer.from(m[1], 'latin1');
    let decoded = null;
    try {
      decoded = zlib.inflateSync(streamBytes).toString('latin1');
    } catch {
      decoded = streamBytes.toString('latin1');
    }
    collected.push(...extractPdfOperators(decoded));
  }
  if (!collected.length) {
    collected.push(...extractPdfOperators(raw));
  }
  if (collected.length) {
    return collected.join('\n');
  }
  return `[PDF attachment: ${name}, ${buf.length} bytes, sha256: ${sha256}]`;
}

function imageDimensions(buf, ext) {
  if (ext === '.png' && buf.length >= 24 && buf.readUInt32BE(0) === 0x89504e47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if ((ext === '.jpg' || ext === '.jpeg') && buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = buf[i + 1];
      if (marker === 0xd9 || marker === 0xda) break;
      const len = buf.readUInt16BE(i + 2);
      if (len < 2) break;
      if ((marker >= 0xc0 && marker <= 0xc3) && i + 8 < buf.length) {
        return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      }
      i += 2 + len;
    }
  }
  return null;
}

function extractImageText(buf, name, mimeType, sha256, ext) {
  const dims = imageDimensions(buf, ext);
  const dimStr = dims ? `, ${dims.width}x${dims.height}` : '';
  return `[Image attachment: ${name}, ${mimeType}${dimStr}, ${buf.length} bytes, sha256: ${sha256}]`;
}

module.exports = {
  extractDocxText,
  extractPptxText,
  extractXlsxText,
  extractPdfText,
  extractImageText,
  unzipEntries,
};
