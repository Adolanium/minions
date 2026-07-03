import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search as SearchIcon } from 'lucide-react';
import type { SearchResponse } from '@shared/types';
import { fetchSearch } from '../lib/api';
import { useStore } from '../lib/store';
import { StatusIcon } from './StatusIcon';

const DEBOUNCE_MS = 250;
const EMPTY_RESULT: SearchResponse = { tasks: [], messages: [] };
const SNIPPET_START = '>>>';
const SNIPPET_END = '<<<';

function renderSnippet(snippet: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let cursor = 0;
  let key = 0;

  while (cursor < snippet.length) {
    const start = snippet.indexOf(SNIPPET_START, cursor);
    if (start === -1) {
      parts.push(snippet.slice(cursor));
      break;
    }
    if (start > cursor) parts.push(snippet.slice(cursor, start));

    const end = snippet.indexOf(SNIPPET_END, start + SNIPPET_START.length);
    if (end === -1) {
      parts.push(snippet.slice(start));
      break;
    }

    parts.push(
      <strong key={key++} className="font-semibold text-zinc-900 dark:text-zinc-100">
        {snippet.slice(start + SNIPPET_START.length, end)}
      </strong>,
    );
    cursor = end + SNIPPET_END.length;
  }

  return parts;
}

export function SearchPalette() {
  const open = useStore((s) => s.searchOpen);
  const closeSearch = useStore((s) => s.closeSearch);
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<SearchResponse>(EMPTY_RESULT);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setResult(EMPTY_RESULT);
    setSelectedIndex(0);
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    if (!trimmed) {
      setResult(EMPTY_RESULT);
      return;
    }
    const timer = setTimeout(() => {
      fetchSearch(trimmed)
        .then(setResult)
        .catch(() => setResult(EMPTY_RESULT));
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, open]);

  const totalResults = result.tasks.length + result.messages.length;

  useEffect(() => {
    setSelectedIndex(0);
  }, [result]);

  function openTask(taskId: string) {
    closeSearch();
    navigate(`/tasks/${taskId}`);
  }

  const selectedTaskId = useMemo(() => {
    if (selectedIndex < result.tasks.length) return result.tasks[selectedIndex]?.id ?? null;
    return result.messages[selectedIndex - result.tasks.length]?.taskId ?? null;
  }, [result, selectedIndex]);

  function handleKeyDown(e: ReactKeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeSearch();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (totalResults > 0) setSelectedIndex((i) => (i + 1) % totalResults);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (totalResults > 0) setSelectedIndex((i) => (i - 1 + totalResults) % totalResults);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedTaskId) openTask(selectedTaskId);
    }
  }

  if (!open) return null;

  const trimmed = query.trim();

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[15vh]" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={closeSearch} />
      <div className="relative mx-4 w-full max-w-lg overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-2.5 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <SearchIcon size={16} className="shrink-0 text-zinc-400 dark:text-zinc-500" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search tasks and messages..."
            className="w-full bg-transparent text-sm text-zinc-900 placeholder-zinc-400 outline-none dark:text-zinc-100 dark:placeholder-zinc-500"
          />
        </div>
        {trimmed && (
          <div className="max-h-[60vh] overflow-y-auto py-2">
            {totalResults === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-zinc-400 dark:text-zinc-500">No matches</p>
            ) : (
              <>
                {result.tasks.length > 0 && (
                  <SearchGroup label="Tasks">
                    {result.tasks.map((task, index) => (
                      <button
                        key={task.id}
                        type="button"
                        onClick={() => openTask(task.id)}
                        onMouseEnter={() => setSelectedIndex(index)}
                        className={`flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm ${
                          index === selectedIndex
                            ? 'bg-zinc-100 dark:bg-zinc-800'
                            : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/60'
                        }`}
                      >
                        <StatusIcon status={task.status} />
                        <span className="min-w-0 truncate text-zinc-800 dark:text-zinc-100">{task.title}</span>
                      </button>
                    ))}
                  </SearchGroup>
                )}
                {result.messages.length > 0 && (
                  <SearchGroup label="Messages">
                    {result.messages.map((message, i) => {
                      const index = result.tasks.length + i;
                      return (
                        <button
                          key={`${message.taskId}-${i}`}
                          type="button"
                          onClick={() => openTask(message.taskId)}
                          onMouseEnter={() => setSelectedIndex(index)}
                          className={`flex w-full flex-col items-start gap-0.5 px-4 py-2 text-left text-sm ${
                            index === selectedIndex
                              ? 'bg-zinc-100 dark:bg-zinc-800'
                              : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/60'
                          }`}
                        >
                          <span className="min-w-0 truncate text-xs font-medium text-zinc-500 dark:text-zinc-400">{message.taskTitle}</span>
                          <span className="line-clamp-2 text-zinc-700 dark:text-zinc-300">{renderSnippet(message.snippet)}</span>
                        </button>
                      );
                    })}
                  </SearchGroup>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SearchGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-600">{label}</div>
      {children}
    </div>
  );
}
