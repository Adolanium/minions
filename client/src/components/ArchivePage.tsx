import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Archive, ArchiveRestore, Loader2, Trash2 } from 'lucide-react';
import type { Task } from '@shared/types';
import { useStore, optimisticMoveTask } from '../lib/store';
import { deleteTask, fetchTasks, moveTask } from '../lib/api';
import { timeAgo } from '../lib/format';
import { DeleteConfirmModal } from './DeleteConfirmModal';

export function ArchivePage() {
  const upsertTask = useStore((s) => s.upsertTask);
  const removeTask = useStore((s) => s.removeTask);
  const archivedTasks = useStore((s) => s.tasks.filter((t) => t.status === 'archived'));
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchTasks('archived')
      .then((res) => {
        if (cancelled) return;
        for (const task of res.tasks) upsertTask(task);
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [upsertTask]);

  const sorted = useMemo(
    () => [...archivedTasks].sort((a, b) => b.updated_at - a.updated_at),
    [archivedTasks],
  );

  function handleRestore(task: Task) {
    optimisticMoveTask(task, 'done', upsertTask, moveTask);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteTask(deleteTarget.id);
      removeTask(deleteTarget.id);
      setDeleteTarget(null);
    } catch {
      // leave the confirm modal open so the user can retry
    } finally {
      setIsDeleting(false);
    }
  }

  if (loading && sorted.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-zinc-400" />
      </div>
    );
  }

  if (sorted.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 text-zinc-400 dark:text-zinc-500">
        <Archive size={28} />
        <p className="text-sm">No archived tasks</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-3 sm:p-6">
      <div className="mx-auto flex max-w-2xl flex-col gap-2">
        {sorted.map((task) => (
          <div
            key={task.id}
            className="group flex items-center gap-3 rounded-lg border border-zinc-200 bg-white px-3.5 py-2.5 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <Link to={`/tasks/${task.id}`} className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{task.title}</p>
              <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">Archived {timeAgo(task.updated_at)}</p>
            </Link>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleRestore(task)}
                title="Restore"
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800 transition-colors"
              >
                <ArchiveRestore size={14} />
                Restore
              </button>
              <button
                type="button"
                onClick={() => setDeleteTarget(task)}
                title="Delete"
                aria-label="Delete task"
                className="inline-flex items-center justify-center rounded-md p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400 transition-colors"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {deleteTarget && (
        <DeleteConfirmModal
          isConfirming={isDeleting}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
