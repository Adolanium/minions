import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollText, Loader2, RotateCcw } from 'lucide-react';
import { fetchLogFiles, fetchLogTail } from '../lib/api';
import { formatBytes, timeAgo, toErrorMessage } from '../lib/format';
import type { LogFileEntry, LogTailResponse } from '@shared/types';

const LINE_OPTIONS = [200, 500, 2000, 5000];

export function LogsPage() {
  const [files, setFiles] = useState<LogFileEntry[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [lines, setLines] = useState(500);
  const [tail, setTail] = useState<LogTailResponse | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingTail, setLoadingTail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const contentRef = useRef<HTMLPreElement>(null);

  const loadList = useCallback(async () => {
    setLoadingList(true);
    setError(null);
    try {
      const { files: next } = await fetchLogFiles();
      setFiles(next);
      setSelected((current) => current && next.some((f) => f.name === current) ? current : next[0]?.name ?? null);
    } catch (err) {
      setError(toErrorMessage(err, 'Failed to list logs'));
    } finally {
      setLoadingList(false);
    }
  }, []);

  const loadTail = useCallback(async (name: string, lineCount: number) => {
    setLoadingTail(true);
    setError(null);
    try {
      setTail(await fetchLogTail(name, lineCount));
    } catch (err) {
      setTail(null);
      setError(toErrorMessage(err, 'Failed to read log file'));
    } finally {
      setLoadingTail(false);
    }
  }, []);

  useEffect(() => { void loadList(); }, [loadList]);

  useEffect(() => {
    if (selected) void loadTail(selected, lines);
    else setTail(null);
  }, [selected, lines, loadTail]);

  // Keep the view pinned to the newest lines after each load.
  useEffect(() => {
    const el = contentRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [tail]);

  const selectedFile = files.find((f) => f.name === selected);

  return (
    <div className="flex flex-1 flex-col overflow-hidden p-6">
      <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 text-zinc-400 dark:text-zinc-500"><ScrollText size={20} /></div>
            <div>
              <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Logs</h1>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Server log files from ~/.minions/logs.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={selected ?? ''}
              onChange={(e) => setSelected(e.target.value || null)}
              disabled={files.length === 0}
              aria-label="Log file"
              className="h-8 max-w-[16rem] truncate rounded-lg border border-zinc-200 bg-white px-2 font-mono text-xs text-zinc-700 focus:outline-none disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
            >
              {files.map((f) => (
                <option key={f.name} value={f.name}>{f.name}</option>
              ))}
            </select>
            <select
              value={lines}
              onChange={(e) => setLines(Number(e.target.value))}
              aria-label="Lines to show"
              className="h-8 rounded-lg border border-zinc-200 bg-white px-2 text-xs text-zinc-700 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
            >
              {LINE_OPTIONS.map((n) => (
                <option key={n} value={n}>{n} lines</option>
              ))}
            </select>
            <button
              onClick={() => { void loadList(); if (selected) void loadTail(selected, lines); }}
              title="Refresh"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              {loadingTail || loadingList ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
              Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">
            {error}
          </div>
        )}

        {loadingList && files.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-zinc-400 dark:text-zinc-500">
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : files.length === 0 ? (
          <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-zinc-200 text-sm text-zinc-400 dark:border-zinc-800 dark:text-zinc-500">
            No log files yet. They appear once the server has been running.
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
            {selectedFile && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-zinc-100 px-4 py-2 text-[11px] text-zinc-400 dark:border-zinc-800 dark:text-zinc-500">
                <span className="font-mono">{selectedFile.name}</span>
                <span>{formatBytes(selectedFile.size)}</span>
                <span>updated {timeAgo(selectedFile.modifiedAt)}</span>
                {tail?.truncated && <span>showing the last {tail.lines.length} lines</span>}
              </div>
            )}
            <pre
              ref={contentRef}
              className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-[11px] leading-relaxed text-zinc-700 dark:text-zinc-300"
            >
              {tail ? (tail.lines.length > 0 ? tail.lines.join('\n') : 'This log file is empty.') : ''}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
