/**
 * Zero-dependency client-side ZIP archive generator.
 * Creates standard PKZIP 2.0 (Store method 0) archives natively supported
 * by all OS extractors (Windows Explorer, macOS Finder, Linux, Android, iOS).
 */

const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[i] = c;
}

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function toDosDateTime(d: Date = new Date()): { dosTime: number; dosDate: number } {
  const year = Math.max(1980, d.getFullYear());
  const dosTime =
    ((d.getHours() & 0x1f) << 11) |
    ((d.getMinutes() & 0x3f) << 5) |
    (Math.floor(d.getSeconds() / 2) & 0x1f);
  const dosDate =
    (((year - 1980) & 0x7f) << 9) |
    (((d.getMonth() + 1) & 0x0f) << 5) |
    (d.getDate() & 0x1f);
  return { dosTime, dosDate };
}

export interface ZipFileEntry {
  name: string;
  data: Uint8Array | ArrayBuffer;
  date?: Date;
}

export function buildZip(entries: ZipFileEntry[]): Blob {
  const parts: Uint8Array[] = [];
  const centralDirectoryHeaders: Uint8Array[] = [];
  let currentOffset = 0;
  const encoder = new TextEncoder();

  for (const entry of entries) {
    const rawData =
      entry.data instanceof Uint8Array ? entry.data : new Uint8Array(entry.data);
    const nameStr = entry.name.replace(/\\/g, "/").replace(/^\/+/, "");
    const nameBytes = encoder.encode(nameStr);
    const { dosTime, dosDate } = toDosDateTime(entry.date || new Date());
    const crc = crc32(rawData);
    const uncompressedSize = rawData.length;
    const compressedSize = uncompressedSize; // Store method 0

    // Local file header (30 bytes + name length)
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);

    lv.setUint32(0, 0x04034b50, true); // Local file header signature
    lv.setUint16(4, 20, true); // Version needed to extract (2.0)
    lv.setUint16(6, 0x0800, true); // General purpose bit flag (UTF-8 encoded filename)
    lv.setUint16(8, 0, true); // Compression method (0 = Store)
    lv.setUint16(10, dosTime, true);
    lv.setUint16(12, dosDate, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, compressedSize, true);
    lv.setUint32(22, uncompressedSize, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true); // Extra field length
    localHeader.set(nameBytes, 30);

    parts.push(localHeader);
    parts.push(rawData);

    // Central directory file header (46 bytes + name length)
    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);

    cv.setUint32(0, 0x02014b50, true); // Central directory header signature
    cv.setUint16(4, 20, true); // Version made by
    cv.setUint16(6, 20, true); // Version needed to extract
    cv.setUint16(8, 0x0800, true); // UTF-8 filename flag
    cv.setUint16(10, 0, true); // Compression method (Store)
    cv.setUint16(12, dosTime, true);
    cv.setUint16(14, dosDate, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, compressedSize, true);
    cv.setUint32(24, uncompressedSize, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true); // Extra field length
    cv.setUint16(32, 0, true); // File comment length
    cv.setUint16(34, 0, true); // Disk number start
    cv.setUint16(36, 0, true); // Internal file attributes
    cv.setUint32(38, 0, true); // External file attributes
    cv.setUint32(42, currentOffset, true); // Relative offset of local header
    centralHeader.set(nameBytes, 46);

    centralDirectoryHeaders.push(centralHeader);

    currentOffset += localHeader.length + rawData.length;
  }

  const centralDirectoryOffset = currentOffset;
  let centralDirectorySize = 0;
  for (const ch of centralDirectoryHeaders) {
    parts.push(ch);
    centralDirectorySize += ch.length;
  }

  // End of central directory record (22 bytes)
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);

  ev.setUint32(0, 0x06054b50, true); // EOCD signature
  ev.setUint16(4, 0, true); // Disk number
  ev.setUint16(6, 0, true); // Disk where central directory starts
  ev.setUint16(8, entries.length, true); // Number of central directory records on this disk
  ev.setUint16(10, entries.length, true); // Total number of central directory records
  ev.setUint32(12, centralDirectorySize, true); // Size of central directory
  ev.setUint32(16, centralDirectoryOffset, true); // Offset of start of central directory
  ev.setUint16(20, 0, true); // ZIP comment length

  parts.push(eocd);

  return new Blob(parts as unknown as BlobPart[], { type: "application/zip" });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
