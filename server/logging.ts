import { createWriteStream, mkdirSync, readdirSync, unlinkSync, type WriteStream } from 'node:fs';
import { join } from 'node:path';
import { resolveMinionsLogsDir } from './paths.js';

const installedSymbol = Symbol.for('minions.timestampedLoggingInstalled');

type WritableStream = typeof process.stdout | typeof process.stderr;

// Mirror everything written to stdout/stderr into a daily server log file so
// the Logs page has history to show. File problems must never break logging,
// so every filesystem step degrades to "skip the file copy".
const MAX_LOG_FILES = 14;
const LOG_FILE_PATTERN = /^server-\d{4}-\d{2}-\d{2}\.log$/;
let logFileStream: WriteStream | null = null;
let logFileDate = '';
let logFileBroken = false;

function pruneOldLogFiles(dir: string): void {
  try {
    const files = readdirSync(dir).filter((f) => LOG_FILE_PATTERN.test(f)).sort();
    while (files.length > MAX_LOG_FILES) {
      unlinkSync(join(dir, files.shift() as string));
    }
  } catch {
    // Pruning is best effort.
  }
}

function logFile(): WriteStream | null {
  if (logFileBroken) return null;
  const date = new Date().toISOString().slice(0, 10);
  if (logFileStream && logFileDate === date) return logFileStream;
  try {
    const dir = resolveMinionsLogsDir();
    mkdirSync(dir, { recursive: true });
    logFileStream?.end();
    logFileStream = createWriteStream(join(dir, `server-${date}.log`), { flags: 'a' });
    logFileStream.on('error', () => {
      logFileBroken = true;
      logFileStream = null;
    });
    logFileDate = date;
    pruneOldLogFiles(dir);
    return logFileStream;
  } catch {
    logFileBroken = true;
    logFileStream = null;
    return null;
  }
}

function prefixLogLines(text: string, atLineStart: { value: boolean }): string {
  let output = '';

  for (const char of text) {
    if (atLineStart.value) {
      output += `[${new Date().toISOString()}] `;
      atLineStart.value = false;
    }

    output += char;
    if (char === '\n') atLineStart.value = true;
  }

  return output;
}

function installTimestampPrefix(stream: WritableStream): void {
  const originalWrite = stream.write.bind(stream);
  const atLineStart = { value: true };

  stream.write = ((chunk: unknown, encodingOrCallback?: unknown, callback?: unknown) => {
    const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
    const prefixed = prefixLogLines(text, atLineStart);
    logFile()?.write(prefixed);

    if (typeof encodingOrCallback === 'function') {
      return originalWrite(prefixed, encodingOrCallback as (error?: Error | null) => void);
    }

    return originalWrite(
      prefixed,
      encodingOrCallback as BufferEncoding | undefined,
      callback as ((error?: Error | null) => void) | undefined,
    );
  }) as typeof stream.write;
}

export function installTimestampedLogging(): void {
  const globalState = globalThis as typeof globalThis & { [installedSymbol]?: boolean };
  if (globalState[installedSymbol]) return;
  globalState[installedSymbol] = true;

  installTimestampPrefix(process.stdout);
  installTimestampPrefix(process.stderr);
}

installTimestampedLogging();
