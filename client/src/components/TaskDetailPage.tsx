import { useState, useCallback, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { MoreHorizontal, Trash2, Loader2, Pencil, Check, Archive, Users, Download } from 'lucide-react';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { SubagentsModal } from './SubagentsModal';
import { StatusIcon } from './StatusIcon';
import { useStore, optimisticMoveTask, isActiveRun } from '../lib/store';
import { toast } from 'sonner';
import { deleteTask, patchTask, moveTask, markTaskViewed, fetchSession, fetchSubagents } from '../lib/api';
import { TASK_STATUSES } from '@shared/types';
import { STATUS_META } from '../lib/constants';
import { formatCost, formatTokenCount, timeAgo } from '../lib/format';
import { isEditableTarget } from '../lib/keyboard';
import { TaskChat } from './TaskChat';
import { RenameReveal, useRenameAnimation } from './RenameTitle';
import type { AgentRunSettings } from '../lib/api';
import type { TaskStatus } from '@shared/types';

export function TaskDetailPage() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as { initialMessage?: string; initialSettings?: AgentRunSettings } | null;
  // Capture the navigation payload on the first render for this task, before the
  // effect below wipes location.state. TaskChat only mounts once the task lands
  // in the store (via async SSE), which can happen after the wipe, so reading
  // location.state live would drop the first message and leave the task idle.
  const initialPayloadRef = useRef<{ taskId: string | undefined; initialMessage?: string; initialSettings?: AgentRunSettings }>({ taskId: undefined });
  if (initialPayloadRef.current.taskId !== taskId) {
    initialPayloadRef.current = {
      taskId,
      initialMessage: locationState?.initialMessage,
      initialSettings: locationState?.initialSettings,
    };
  }
  const initialMessage = initialPayloadRef.current.initialMessage;
  const initialSettings = initialPayloadRef.current.initialSettings;
  const task = useStore((s) => s.tasks.find((t) => t.id === taskId) ?? null);
  const tasksLoaded = useStore((s) => s.tasksLoaded);
  const upsertTask = useStore((s) => s.upsertTask);
  const removeTask = useStore((s) => s.removeTask);
  const taskRun = useStore((s) => s.taskRuns.get(taskId ?? ''));
  const isRunning = !!taskRun && isActiveRun(taskRun);

  const [titleDraft, setTitleDraft] = useState('');
  const [sessionCost, setSessionCost] = useState<number | null>(null);
  const [sessionTokens, setSessionTokens] = useState<number | null>(null);
  const [subagentCount, setSubagentCount] = useState(0);
  const [showSubagents, setShowSubagents] = useState(false);
  const wasRunningRef = useRef(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const skipNextTitleSaveRef = useRef(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const markViewedInFlightRef = useRef<string | null>(null);
  const titleAnimation = useRenameAnimation(task?.title ?? '', task?.id ?? null);

  useEffect(() => {
    if (task) setTitleDraft(task.title);
  }, [task?.id, task?.title]);

  useEffect(() => {
    if (!task) return;
    let cancelled = false;
    fetchSession(task.id)
      .then(({ session }) => {
        if (cancelled) return;
        setSessionCost(typeof session?.estimated_cost_usd === 'number' ? session.estimated_cost_usd : null);
        setSessionTokens(session ? session.input_tokens + session.output_tokens : null);
      })
      .catch(() => {
        if (!cancelled) { setSessionCost(null); setSessionTokens(null); }
      });
    return () => { cancelled = true; };
  }, [task?.id]);

  useEffect(() => {
    if (wasRunningRef.current && !isRunning && task) {
      fetchSession(task.id)
        .then(({ session }) => {
          setSessionCost(typeof session?.estimated_cost_usd === 'number' ? session.estimated_cost_usd : null);
          setSessionTokens(session ? session.input_tokens + session.output_tokens : null);
        })
        .catch(() => {});
      fetchSubagents(task.id)
        .then(({ subagents }) => setSubagentCount(subagents.length))
        .catch(() => {});
    }
    wasRunningRef.current = isRunning;
  }, [isRunning, task?.id]);

  useEffect(() => {
    if (!task) return;
    let cancelled = false;
    fetchSubagents(task.id)
      .then(({ subagents }) => {
        if (!cancelled) setSubagentCount(subagents.length);
      })
      .catch(() => {
        if (!cancelled) setSubagentCount(0);
      });
    return () => { cancelled = true; };
  }, [task?.id]);

  useEffect(() => {
    if (!task || task.last_agent_response_at === null) return;
    if (task.last_viewed_at !== null && task.last_viewed_at >= task.last_agent_response_at) return;

    const key = `${task.id}:${task.last_agent_response_at}`;
    if (markViewedInFlightRef.current === key) return;
    markViewedInFlightRef.current = key;

    markTaskViewed(task.id)
      .then(({ task: updated }) => upsertTask(updated))
      .catch(() => {})
      .finally(() => {
        if (markViewedInFlightRef.current === key) {
          markViewedInFlightRef.current = null;
        }
      });
  }, [task?.id, task?.last_agent_response_at, task?.last_viewed_at, upsertTask]);

  const hasNavState = Boolean(locationState?.initialMessage || locationState?.initialSettings);
  useEffect(() => {
    if (hasNavState) {
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [taskId, hasNavState, navigate, location.pathname]);

  useEffect(() => {
    if (!showMenu) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showMenu]);

  const handleTitleSave = useCallback(async () => {
    if (!task) return;
    if (skipNextTitleSaveRef.current) {
      skipNextTitleSaveRef.current = false;
      setTitleDraft(task.title);
      return;
    }

    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== task.title) {
      try {
        const { task: updated } = await patchTask(task.id, { title: trimmed });
        upsertTask(updated);
      } catch {
        setTitleDraft(task.title);
      }
    } else {
      setTitleDraft(task.title);
    }
  }, [task, titleDraft, upsertTask]);

  const handleStatusChange = useCallback(async (status: TaskStatus) => {
    if (!task) return;
    setShowMenu(false);
    if (status === 'done') {
      const previousStatus = task.status;
      const taskId = task.id;
      optimisticMoveTask(task, 'done', upsertTask, moveTask);
      navigate('/');
      toast('Task completed', {
        icon: <Check size={14} strokeWidth={2.5} className="text-zinc-500 dark:text-zinc-400" />,
        action: {
          label: 'Undo',
          onClick: () => {
            const { tasks, upsertTask: storeUpsert } = useStore.getState();
            const current = tasks.find((t) => t.id === taskId);
            if (current) optimisticMoveTask(current, previousStatus, storeUpsert, moveTask);
          },
        },
      });
    } else {
      await optimisticMoveTask(task, status, upsertTask, moveTask);
    }
  }, [task, upsertTask, navigate]);

  const handleArchive = useCallback(() => {
    if (!task) return;
    setShowMenu(false);
    const previousStatus = task.status;
    const taskId = task.id;
    optimisticMoveTask(task, 'archived', upsertTask, moveTask);
    toast('Task archived', {
      icon: <Archive size={14} strokeWidth={2.5} className="text-zinc-500 dark:text-zinc-400" />,
      action: {
        label: 'Undo',
        onClick: () => {
          const { tasks, upsertTask: storeUpsert } = useStore.getState();
          const current = tasks.find((t) => t.id === taskId);
          if (current) optimisticMoveTask(current, previousStatus, storeUpsert, moveTask);
        },
      },
    });
  }, [task, upsertTask]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !isEditableTarget(e.target)) navigate('/');
      if (e.key === 'd' && e.metaKey && e.shiftKey && task && task.status !== 'done') {
        e.preventDefault();
        handleStatusChange('done');
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [navigate, task, handleStatusChange]);

  const handleDelete = useCallback(async () => {
    if (!task) return;
    try {
      await deleteTask(task.id);
      removeTask(task.id);
      navigate('/');
    } catch {}
  }, [task, removeTask, navigate]);

  if (!task) {
    if (!tasksLoaded) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 size={24} className="animate-spin text-zinc-400" />
        </div>
      );
    }
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-zinc-400 dark:text-zinc-500">Task not found</p>
      </div>
    );
  }

  const statusMeta = STATUS_META[task.status];

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="w-full px-3 pt-3 pb-2 sm:px-6 sm:pt-4 sm:pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="-ml-2 relative w-full rounded-md px-2 py-1 pr-10 transition-colors hover:bg-zinc-100/80 focus-within:bg-white focus-within:ring-1 focus-within:ring-zinc-200 dark:hover:bg-zinc-800/80 dark:focus-within:bg-zinc-900 dark:focus-within:ring-zinc-700">
              <div className="rename-title-shell">
                <input
                  ref={titleInputRef}
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onBlur={handleTitleSave}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      titleInputRef.current?.blur();
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      skipNextTitleSaveRef.current = true;
                      setTitleDraft(task.title);
                      titleInputRef.current?.blur();
                    }
                  }}
                  aria-label="Task title"
                  placeholder="Name this task"
                  className={`block w-full cursor-text truncate bg-transparent p-0 text-lg font-semibold leading-7 text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-100 dark:placeholder:text-zinc-500 sm:text-xl sm:leading-8 ${
                    titleAnimation.isAnimating ? 'rename-title-input-hidden' : ''
                  }`}
                />
                <RenameReveal
                  animation={titleAnimation}
                  className="text-lg font-semibold leading-7 text-zinc-900 dark:text-zinc-100 sm:text-xl sm:leading-8"
                />
              </div>
              <button
                type="button"
                title="Rename task"
                aria-label="Rename task"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  titleInputRef.current?.focus();
                  titleInputRef.current?.select();
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-zinc-400 transition-colors hover:bg-zinc-200 hover:text-zinc-700 dark:text-zinc-500 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
              >
                <Pencil size={15} />
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2.5 sm:shrink-0 sm:justify-start sm:pt-1.5">
            <div className="flex items-center gap-2.5">
              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${statusMeta.tint}`}>
                <StatusIcon status={task.status} />
                {statusMeta.label}
              </span>

              <span className="text-xs text-zinc-400 dark:text-zinc-500 shrink-0">
                {timeAgo(task.updated_at)}
              </span>

              {sessionCost != null && sessionCost > 0 && (
                <span className="text-xs text-zinc-400 dark:text-zinc-500 shrink-0">
                  {formatCost(sessionCost)}
                </span>
              )}

              {sessionTokens != null && sessionTokens > 0 && (
                <span className="text-xs text-zinc-400 dark:text-zinc-500 shrink-0">
                  {formatTokenCount(sessionTokens)} tok
                </span>
              )}

              {subagentCount > 0 && (
                <button
                  type="button"
                  onClick={() => setShowSubagents(true)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 shrink-0"
                >
                  <Users size={12} />
                  Subagents
                  <span className="rounded-full bg-zinc-200 px-1.5 text-[10px] font-semibold text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
                    {subagentCount}
                  </span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2.5">
              {task.status !== 'done' && (
                <div className="group relative shrink-0">
                  <button
                    onClick={() => handleStatusChange('done')}
                    aria-label="Mark complete"
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-zinc-900 p-1.5 text-zinc-100 transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300 sm:px-3 sm:py-1.5 sm:text-xs sm:font-semibold"
                  >
                    <Check size={14} strokeWidth={2.5} />
                    <span className="hidden sm:inline">Mark complete</span>
                  </button>
                  <div className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-[11px] text-zinc-500 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 max-sm:hidden">
                    <div className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 border-l border-t border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900" />
                    <span className="flex items-center gap-1">
                      {['⌘', '⇧', 'D'].map((k) => (
                        <kbd key={k} className="inline-flex h-4 min-w-[16px] items-center justify-center rounded border border-zinc-200 bg-zinc-100 px-1 font-sans text-[10px] text-zinc-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">{k}</kbd>
                      ))}
                    </span>
                  </div>
                </div>
              )}

              <div className="relative shrink-0">
                <button
                  onClick={() => setShowMenu(!showMenu)}
                  className="p-1.5 rounded-md text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  <MoreHorizontal size={16} />
                </button>
                {showMenu && (
                  <div ref={menuRef} className="absolute right-0 top-full mt-1 min-w-[180px] py-1 bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-700 shadow-xl z-50">
                    <p className="px-3 py-1.5 text-[11px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                      Move to
                    </p>
                    {TASK_STATUSES.filter((s) => s !== task.status).map((status) => (
                      <button
                        key={status}
                        onClick={() => handleStatusChange(status)}
                        className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-left"
                      >
                        <StatusIcon status={status} />
                        {STATUS_META[status].label}
                      </button>
                    ))}
                    {task.status !== 'archived' && (
                      <>
                        <div className="my-1 border-t border-zinc-200 dark:border-zinc-800" />
                        <button
                          onClick={handleArchive}
                          className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-left"
                        >
                          <Archive size={14} />
                          Archive
                        </button>
                      </>
                    )}
                    <div className="my-1 border-t border-zinc-200 dark:border-zinc-800" />
                    {(['md', 'json'] as const).map((format) => (
                      <a
                        key={format}
                        href={`/api/tasks/${task.id}/export?format=${format}`}
                        download
                        onClick={() => setShowMenu(false)}
                        className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-left"
                      >
                        <Download size={14} />
                        Export as {format === 'md' ? 'Markdown' : 'JSON'}
                      </a>
                    ))}
                    <div className="my-1 border-t border-zinc-200 dark:border-zinc-800" />
                    <button
                      onClick={() => { setShowMenu(false); setShowDeleteConfirm(true); }}
                      className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-left"
                    >
                      <Trash2 size={14} />
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="w-full flex-1 flex flex-col min-h-0">
        <TaskChat taskId={task.id} initialMessage={initialMessage} initialSettings={initialSettings} />
      </div>

      {showDeleteConfirm && (
        <DeleteConfirmModal
          onConfirm={() => { setShowDeleteConfirm(false); handleDelete(); }}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}

      {showSubagents && (
        <SubagentsModal
          taskId={task.id}
          onClose={() => setShowSubagents(false)}
          onCountChange={setSubagentCount}
        />
      )}
    </div>
  );
}
