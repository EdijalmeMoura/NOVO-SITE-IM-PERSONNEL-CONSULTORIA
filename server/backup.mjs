import fs from 'node:fs';
import path from 'node:path';

// Backup em ZIP sem depender de biblioteca externa: entradas armazenadas (sem
// compressão), CRC-32 calculado arquivo por arquivo e nome em UTF-8. O backup é
// gerado em fluxo, então a memória usada acompanha o maior arquivo, não o total.
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value;
  }
  return table;
})();

export function crc32(buffer) {
  let crc = -1;
  for (let index = 0; index < buffer.length; index += 1) crc = CRC_TABLE[(crc ^ buffer[index]) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

const ZIP_LIMITS = { entries: 60_000, totalBytes: 2 * 1024 * 1024 * 1024 };

// Entradas: [{ name, read: () => Buffer }]. Lê uma por vez para não carregar tudo na memória.
export function* buildZip(entries) {
  const central = [];
  let offset = 0;
  let totalBytes = 0;
  for (const entry of entries) {
    if (central.length >= ZIP_LIMITS.entries || totalBytes >= ZIP_LIMITS.totalBytes) {
      throw new Error('O backup passou do limite de tamanho suportado. Baixe os arquivos em partes.');
    }
    const nameBuffer = Buffer.from(entry.name, 'utf-8');
    const data = entry.read();
    const checksum = crc32(data);
    const local = Buffer.alloc(30 + nameBuffer.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // versão necessária para descompactar
    local.writeUInt16LE(0x0800, 6); // nomes em UTF-8
    local.writeUInt16LE(0, 8); // sem compressão
    local.writeUInt16LE(0, 10); // hora
    local.writeUInt16LE(0x21, 12); // data fixa (1980-01-01) para o arquivo ser determinístico
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    local.writeUInt16LE(0, 28);
    nameBuffer.copy(local, 30);
    yield local;
    yield data;
    central.push({ nameBuffer, checksum, size: data.length, offset });
    offset += local.length + data.length;
    totalBytes += data.length;
  }

  const centralStart = offset;
  let centralSize = 0;
  for (const record of central) {
    const header = Buffer.alloc(46 + record.nameBuffer.length);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4); // versão que criou
    header.writeUInt16LE(20, 6); // versão necessária
    header.writeUInt16LE(0x0800, 8);
    header.writeUInt16LE(0, 10);
    header.writeUInt16LE(0, 12);
    header.writeUInt16LE(0x21, 14);
    header.writeUInt32LE(record.checksum, 16);
    header.writeUInt32LE(record.size, 20);
    header.writeUInt32LE(record.size, 24);
    header.writeUInt16LE(record.nameBuffer.length, 28);
    header.writeUInt16LE(0, 30); // extra
    header.writeUInt16LE(0, 32); // comentário
    header.writeUInt16LE(0, 34); // disco
    header.writeUInt16LE(0, 36); // atributos internos
    header.writeUInt32LE(0, 38); // atributos externos
    header.writeUInt32LE(record.offset, 42);
    record.nameBuffer.copy(header, 46);
    yield header;
    centralSize += header.length;
  }

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(central.length, 8);
  end.writeUInt16LE(central.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralStart, 16);
  end.writeUInt16LE(0, 20);
  yield end;
}

// Anexa todos os arquivos de um diretório, ignorando o que não for arquivo regular.
export function folderEntries(directory, prefix, { skip = new Set() } = {}) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((item) => item.isFile() && !skip.has(item.name))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((item) => ({ name: `${prefix}${item.name}`, read: () => fs.readFileSync(path.join(directory, item.name)) }));
}
