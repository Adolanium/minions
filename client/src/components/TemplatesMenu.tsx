import { useCallback, useEffect, useRef, useState } from 'react';
import { BookMarked, Loader2, Plus, Trash2 } from 'lucide-react';
import type { ChatRunMode, ReasoningEffort, TaskTemplate } from '@shared/types';
import { createTemplate, deleteTemplate, fetchTemplates } from '../lib/api';
import { toErrorMessage } from '../lib/format';
import { DeleteConfirmModal } from './DeleteConfirmModal';

interface TemplateDraft {
  prompt: string;
  model: string | null;
  provider: string | null;
  reasoningEffort: ReasoningEffort | null;
  runMode: ChatRunMode;
}

interface TemplatesMenuProps {
  disabled?: boolean;
  compactMobile?: boolean;
  canSave: boolean;
  draft: TemplateDraft;
  onApply: (template: TaskTemplate) => void;
}

export function TemplatesMenu({ disabled = false, compactMobile = false, canSave, draft, onApply }: TemplatesMenuProps) {
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TaskTemplate | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const saveInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    fetchTemplates()
      .then((res) => setTemplates(res.templates))
      .catch((err) => setError(toErrorMessage(err, 'Failed to load templates')))
      .finally(() => setLoading(false));

    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown, { passive: true });
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setShowSaveInput(false);
      setSaveName('');
    }
  }, [open]);

  useEffect(() => {
    if (showSaveInput) saveInputRef.current?.focus();
  }, [showSaveInput]);

  const handleApply = useCallback((template: TaskTemplate) => {
    onApply(template);
    setOpen(false);
  }, [onApply]);

  const handleSave = useCallback(async () => {
    const name = saveName.trim();
    if (!name || saving) return;
    setSaving(true);
    setError(null);
    try {
      const { template } = await createTemplate({
        name,
        prompt: draft.prompt,
        agent_model: draft.model,
        agent_provider: draft.provider,
        reasoning_effort: draft.reasoningEffort,
        run_mode: draft.runMode,
      });
      setTemplates((current) => [...current, template].sort((a, b) => a.name.localeCompare(b.name)));
      setSaveName('');
      setShowSaveInput(false);
    } catch (err) {
      setError(toErrorMessage(err, 'Failed to save template'));
    } finally {
      setSaving(false);
    }
  }, [draft, saveName, saving]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeletingId(deleteTarget.id);
    try {
      await deleteTemplate(deleteTarget.id);
      setTemplates((current) => current.filter((t) => t.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      setError(toErrorMessage(err, 'Failed to delete template'));
    } finally {
      setDeletingId(null);
    }
  }, [deleteTarget]);

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        disabled={disabled}
        title="Templates"
        aria-label="Templates"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white text-xs font-medium text-zinc-600 shadow-sm transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700/70 ${
          compactMobile ? 'w-9 justify-center px-0 sm:w-auto sm:justify-start sm:px-2.5' : 'px-2.5'
        }`}
      >
        <BookMarked size={12} className="shrink-0" />
        <span className={compactMobile ? 'sr-only sm:not-sr-only' : undefined}>Templates</span>
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-2.5 z-50">
          <div className="w-72 max-h-80 overflow-y-auto rounded-lg bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 shadow-lg p-2">
            {loading ? (
              <div className="flex items-center justify-center py-6 text-zinc-400 dark:text-zinc-500">
                <Loader2 size={16} className="animate-spin" />
              </div>
            ) : templates.length === 0 ? (
              <p className="px-1.5 py-3 text-xs text-zinc-400 dark:text-zinc-500">No templates yet</p>
            ) : (
              <div className="space-y-0.5 mb-1.5">
                {templates.map((template) => (
                  <div
                    key={template.id}
                    className="group flex items-center gap-1 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-700/70"
                  >
                    <button
                      type="button"
                      onClick={() => handleApply(template)}
                      className="flex-1 min-w-0 text-left px-2 py-1.5 text-sm text-zinc-700 dark:text-zinc-300 truncate"
                      title={template.prompt}
                    >
                      {template.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(template)}
                      disabled={deletingId === template.id}
                      title={`Delete "${template.name}"`}
                      aria-label={`Delete "${template.name}"`}
                      className="shrink-0 p-1.5 mr-1 rounded-md text-zinc-400 opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:text-zinc-500 dark:hover:bg-red-900/20 dark:hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {error && <p className="px-1.5 pb-1.5 text-xs text-red-500">{error}</p>}

            <div className="border-t border-zinc-200 dark:border-zinc-700 pt-1.5">
              {showSaveInput ? (
                <div className="flex items-center gap-1.5 px-0.5">
                  <input
                    ref={saveInputRef}
                    value={saveName}
                    onChange={(e) => setSaveName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); void handleSave(); }
                      if (e.key === 'Escape') { e.preventDefault(); setShowSaveInput(false); setSaveName(''); }
                    }}
                    placeholder="Template name"
                    className="min-w-0 flex-1 h-8 rounded-md border border-zinc-200 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={!saveName.trim() || saving}
                    className="shrink-0 px-2.5 h-8 rounded-md text-xs font-medium bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-300 disabled:opacity-50 transition-colors"
                  >
                    {saving ? <Loader2 size={13} className="animate-spin" /> : 'Save'}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowSaveInput(true)}
                  disabled={!canSave}
                  className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700/70 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Plus size={13} />
                  Save as template
                </button>
              )}
            </div>
          </div>
          <div className="absolute -bottom-[3px] left-[13px] w-1.5 h-1.5 bg-white dark:bg-zinc-800 border-r border-b border-zinc-200 dark:border-zinc-700 rotate-45" />
        </div>
      )}

      {deleteTarget && (
        <DeleteConfirmModal
          title="Delete template"
          body={`Delete the "${deleteTarget.name}" template? This can't be undone.`}
          confirmLabel="Delete"
          isConfirming={deletingId === deleteTarget.id}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          zIndex={60}
        />
      )}
    </div>
  );
}
