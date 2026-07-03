import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { Router } from 'express';
import type { AgentAdapter } from '../adapters/types.js';
import { errorCode } from '../errors.js';
import type { MemoryFile } from '../../shared/types.js';

const MAX_MEMORY_FILE_SIZE = 5 * 1024 * 1024;
const HOME = resolve(homedir());

function displayPath(absolutePath: string): string {
  if (absolutePath === HOME) return '~/';
  const fromHome = relative(HOME, absolutePath);
  if (fromHome && !fromHome.startsWith('..') && !isAbsolute(fromHome)) {
    return `~/${fromHome.split(sep).join('/')}`;
  }
  return absolutePath;
}

async function readEntry(entry: { key: string; label: string; filename: string; path: string }): Promise<MemoryFile> {
  const base = { ...entry, displayPath: displayPath(entry.path) };
  try {
    const stats = await stat(entry.path);
    if (!stats.isFile()) {
      return { ...base, exists: false, content: '', modifiedAt: null };
    }
    const content = await readFile(entry.path, 'utf8');
    return { ...base, exists: true, content, modifiedAt: stats.mtimeMs };
  } catch (error) {
    if (errorCode(error) === 'ENOENT') {
      return { ...base, exists: false, content: '', modifiedAt: null };
    }
    throw error;
  }
}

export function createMemoryRouter(adapter: AgentAdapter): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    try {
      const { hermesHome, files } = await adapter.getMemoryPaths();
      const resolved = await Promise.all(files.map(readEntry));
      res.json({ hermesHome, files: resolved });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load memory files';
      res.status(500).json({ error: message, code: errorCode(error) });
    }
  });

  router.put('/:key', async (req, res) => {
    try {
      const { key } = req.params;
      const body = req.body as { content?: unknown; expectedModifiedAt?: unknown };
      if (typeof body?.content !== 'string') {
        res.status(400).json({ error: 'Content is required', code: 'BAD_REQUEST' });
        return;
      }
      if (Buffer.byteLength(body.content, 'utf8') > MAX_MEMORY_FILE_SIZE) {
        res.status(413).json({ error: 'Memory file is too large', code: 'FILE_TOO_LARGE' });
        return;
      }

      const { files } = await adapter.getMemoryPaths();
      const entry = files.find((f) => f.key === key);
      if (!entry) {
        res.status(404).json({ error: 'Unknown memory file', code: 'NOT_FOUND' });
        return;
      }

      const expectedModifiedAt = typeof body.expectedModifiedAt === 'number' ? body.expectedModifiedAt : undefined;
      if (expectedModifiedAt !== undefined) {
        try {
          const current = await stat(entry.path);
          if (Math.abs(current.mtimeMs - expectedModifiedAt) > 1) {
            res.status(409).json({ error: 'File changed on disk', code: 'FILE_CHANGED' });
            return;
          }
        } catch (error) {
          if (errorCode(error) !== 'ENOENT') throw error;
        }
      }

      await mkdir(dirname(entry.path), { recursive: true });
      await writeFile(entry.path, body.content, 'utf8');
      const stats = await stat(entry.path);
      res.json({ key, path: entry.path, size: stats.size, modifiedAt: stats.mtimeMs });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save memory file';
      res.status(500).json({ error: message, code: errorCode(error) });
    }
  });

  return router;
}
