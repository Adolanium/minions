import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Loader2, RefreshCw, X } from 'lucide-react';
import { fetchSubagentMessages, fetchSubagents } from '../lib/api';
import { formatCost, formatTokenCount, toErrorMessage } from '../lib/format';
import { MarkdownContent } from './MarkdownContent';
import type { SubagentSession, TaskMessage } from '@shared/types';

function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}

function RunningPulse() {
  return (
    <span className="relative inline-flex h-2 w-2 shrink-0">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
    </span>
  );
}

function SubagentRow({ subagent, onOpen }: { subagent: SubagentSession; onOpen: () => void }) {
  const isRunning = subagent.ended_at === null;
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{ paddingLeft: `${12 + subagent.depth * 16}px` }}
      className="flex w-full items-center gap-2.5 rounded-lg py-2 pr-3 text-left text-sm transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
    >
      {isRunning ? <RunningPulse /> : <span className="h-2 w-2 shrink-0" />}
      <span className="min-w-0 flex-1 truncate text-zinc-800 dark:text-zinc-200">
        {subagent.title || shortId(subagent.id)}
      </span>
      {subagent.model && (
        <span className="shrink-0 truncate text-xs text-zinc-400 dark:text-zinc-500 max-w-[140px]">
          {subagent.model}
        </span>
      )}
      <span className="shrink-0 text-xs text-zinc-400 dark:text-zinc-500">
        {subagent.message_count} msg{subagent.message_count === 1 ? '' : 's'}
      </span>
      {subagent.estimated_cost_usd != null && subagent.estimated_cost_usd > 0 && (
        <span className="shrink-0 text-xs text-zinc-400 dark:text-zinc-500">
          {formatCost(subagent.estimated_cost_usd)}
        </span>
      )}
    </button>
  );
}

function TranscriptView({ messages }: { messages: TaskMessage[] }) {
  if (messages.length === 0) {
    return <p className="py-8 text-center text-sm text-zinc-400 dark:text-zinc-500">No messages yet.</p>;
  }

  return (
    <div className="space-y-4">
      {messages.map((msg) => {
        if (msg.role === 'assistant') {
          return (
            <div key={msg.id} className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
              <MarkdownContent content={msg.content} />
            </div>
          );
        }
        return (
          <div
            key={msg.id}
            className="whitespace-pre-wrap break-words text-xs leading-relaxed text-zinc-400 dark:text-zinc-500"
          >
            <span className="mr-1.5 font-medium uppercase tracking-wide">{msg.role}</span>
            {msg.content}
          </div>
        );
      })}
    </div>
  );
}

export function SubagentsModal({
  taskId,
  onClose,
  onCountChange,
}: {
  taskId: string;
  onClose: () => void;
  onCountChange: (count: number) => void;
}) {
  const [subagents, setSubagents] = useState<SubagentSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<SubagentSession | null>(null);
  const [messages, setMessages] = useState<TaskMessage[] | null>(null);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);

  const loadList = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchSubagents(taskId)
      .then(({ subagents: list }) => {
        setSubagents(list);
        onCountChange(list.length);
      })
      .catch((err) => setError(toErrorMessage(err, 'Failed to load subagents')))
      .finally(() => setLoading(false));
  }, [taskId, onCountChange]);

  useEffect(() => {
    loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  const loadMessages = useCallback((childId: string) => {
    setMessagesLoading(true);
    setMessagesError(null);
    fetchSubagentMessages(taskId, childId)
      .then(({ messages: list }) => setMessages(list))
      .catch((err) => setMessagesError(toErrorMessage(err, 'Failed to load transcript')))
      .finally(() => setMessagesLoading(false));
  }, [taskId]);

  function openChild(subagent: SubagentSession) {
    setSelected(subagent);
    setMessages(null);
    loadMessages(subagent.id);
  }

  function refresh() {
    if (selected) loadMessages(selected.id);
    else loadList();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 p-5"
      role="dialog"
      aria-modal="true"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex h-[80dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
        <header className="flex items-center justify-between gap-3 border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
          <div className="flex min-w-0 items-center gap-2">
            {selected && (
              <button
                type="button"
                onClick={() => setSelected(null)}
                title="Back to list"
                className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
              >
                <ArrowLeft size={16} />
              </button>
            )}
            <h2 className="truncate text-base font-semibold text-zinc-900 dark:text-zinc-100">
              {selected ? (selected.title || shortId(selected.id)) : 'Subagents'}
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={refresh}
              title="Refresh"
              className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            >
              <RefreshCw size={15} />
            </button>
            <button
              type="button"
              onClick={onClose}
              title="Close"
              className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            >
              <X size={16} />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {!selected && (
            <>
              {error && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
              {loading && (
                <div className="flex items-center gap-2 py-4 text-sm text-zinc-500 dark:text-zinc-400">
                  <Loader2 size={14} className="animate-spin" />
                  Loading subagents
                </div>
              )}
              {!loading && !error && subagents.length === 0 && (
                <p className="py-8 text-center text-sm text-zinc-400 dark:text-zinc-500">No subagents yet.</p>
              )}
              {!loading && subagents.length > 0 && (
                <div className="space-y-0.5">
                  {subagents.map((subagent) => (
                    <SubagentRow key={subagent.id} subagent={subagent} onOpen={() => openChild(subagent)} />
                  ))}
                </div>
              )}
            </>
          )}

          {selected && (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-400 dark:text-zinc-500">
                {selected.model && <span>{selected.model}</span>}
                <span>{selected.message_count} messages</span>
                <span>{formatTokenCount(selected.total_tokens)} tokens</span>
                {selected.estimated_cost_usd != null && selected.estimated_cost_usd > 0 && (
                  <span>{formatCost(selected.estimated_cost_usd)}</span>
                )}
                {selected.ended_at === null && (
                  <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                    <RunningPulse />
                    running
                  </span>
                )}
              </div>
              {messagesError && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{messagesError}</p>}
              {messagesLoading && (
                <div className="flex items-center gap-2 py-4 text-sm text-zinc-500 dark:text-zinc-400">
                  <Loader2 size={14} className="animate-spin" />
                  Loading transcript
                </div>
              )}
              {!messagesLoading && !messagesError && messages && <TranscriptView messages={messages} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
