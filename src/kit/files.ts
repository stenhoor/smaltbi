// Local files the user imported (CSV, Parquet, …), kept in OPFS under smaltbi-files/ so a report
// that reads `local:<name>` still works after a reload. Falls back to memory. Shared-kit candidate.
import type { FileStore } from '../data/sources.js';

const DIR = 'smaltbi-files';
const memory = new Map<string, Blob>();

async function dir(): Promise<FileSystemDirectoryHandle | null> {
  try {
    if (!navigator.storage?.getDirectory || !isSecureContext) return null;
    return await (await navigator.storage.getDirectory()).getDirectoryHandle(DIR, { create: true });
  } catch {
    return null;
  }
}

export const localFiles: FileStore & { put(name: string, blob: Blob): Promise<void>; list(): Promise<string[]> } = {
  async put(name, blob) {
    memory.set(name, blob);
    const d = await dir();
    if (!d) return;
    const fh = await d.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    await w.write(blob);
    await w.close();
  },
  async get(name) {
    if (memory.has(name)) return memory.get(name)!;
    const d = await dir();
    if (!d) return null;
    try {
      return await (await d.getFileHandle(name)).getFile();
    } catch {
      return null;
    }
  },
  async list() {
    const d = await dir();
    const out = new Set(memory.keys());
    if (d) for await (const k of (d as unknown as { keys(): AsyncIterable<string> }).keys()) out.add(k);
    return [...out].sort();
  },
};
