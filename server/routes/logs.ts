import { open, readdir, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { Router } from 'express';
import { resolveMinionsLogsDir } from '../paths.js';
import { errorCode } from '../errors.js';
import type { LogFileEntry } from '../../shared/types.js';

const DEFAULT_TAIL_LINES = 500;
const MAX_TAIL_LINES = 5000;
// Reading the last 512 KiB covers thousands of lines without loading huge files.
const TAIL_CHUNK_BYTES = 512 * 1024;

export const logsRouter = Router();

logsRouter.get('/', async (_req, res) => {
  try {
    const dir = resolveMinionsLogsDir();
    const names = await readdir(dir);
    const files: LogFileEntry[] = [];
    for (const name of names) {
      try {
        const stats = await stat(join(dir, name));
        if (stats.isFile()) files.push({ name, size: stats.size, modifiedAt: stats.mtimeMs });
      } catch {
        // Skip entries that vanish mid-listing.
      }
    }
    files.sort((a, b) => b.modifiedAt - a.modifiedAt);
    res.json({ files });
  } catch (error) {
    if (errorCode(error) === 'ENOENT') {
      res.json({ files: [] });
      return;
    }
    const message = error instanceof Error ? error.message : 'Failed to list logs';
    res.status(500).json({ error: message });
  }
});

logsRouter.get('/tail', async (req, res) => {
  const name = typeof req.query.name === 'string' ? req.query.name : '';
  if (!name || name !== basename(name) || name.startsWith('.')) {
    res.status(400).json({ error: 'A valid log file name is required' });
    return;
  }

  const parsedLines = Number.parseInt(String(req.query.lines ?? DEFAULT_TAIL_LINES), 10);
  const maxLines = Number.isFinite(parsedLines)
    ? Math.min(Math.max(parsedLines, 1), MAX_TAIL_LINES)
    : DEFAULT_TAIL_LINES;

  const filePath = join(resolveMinionsLogsDir(), name);
  try {
    const stats = await stat(filePath);
    if (!stats.isFile()) {
      res.status(404).json({ error: 'Log file not found' });
      return;
    }

    const start = Math.max(0, stats.size - TAIL_CHUNK_BYTES);
    const handle = await open(filePath, 'r');
    let text: string;
    try {
      const buffer = Buffer.alloc(Math.min(TAIL_CHUNK_BYTES, stats.size));
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, start);
      text = buffer.subarray(0, bytesRead).toString('utf8');
    } finally {
      await handle.close();
    }

    let lines = text.split(/\r?\n/);
    // When reading from the middle of the file the first line is partial.
    if (start > 0 && lines.length > 0) lines = lines.slice(1);
    if (lines.length > 0 && lines[lines.length - 1] === '') lines = lines.slice(0, -1);
    const truncated = start > 0 || lines.length > maxLines;
    lines = lines.slice(-maxLines);

    res.json({ name, size: stats.size, modifiedAt: stats.mtimeMs, lines, truncated });
  } catch (error) {
    if (errorCode(error) === 'ENOENT') {
      res.status(404).json({ error: 'Log file not found' });
      return;
    }
    const message = error instanceof Error ? error.message : 'Failed to read log file';
    res.status(500).json({ error: message });
  }
});
