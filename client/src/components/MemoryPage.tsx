import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BrainCircuit, Loader2, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { fetchMemory, saveMemory } from '../lib/api';
import { toErrorMessage } from '../lib/format';
import { ApiError } from '../lib/api';
import type { MemoryFile } from '@shared/types';

export function MemoryPage() {
  const [files, setFiles] = useState<MemoryFile[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [activeKey, setActiveKey] = useState<string>('');
  const [hermesHome, setHermesHome] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetchMemory();
      setFiles(res.files);
      setHermesHome(res.hermesHome);
      setDrafts(Object.fromEntries(res.files.map((f) => [f.key, f.content])));
      setActiveKey((prev) => prev || res.files[0]?.key || '');
    } catch (error) {
      setLoadError(toErrorMessage(error, 'Failed to load memory files'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const active = useMemo(() => files.find((f) => f.key === activeKey), [files, activeKey]);
  const draft = drafts[activeKey] ?? '';
  const dirty = active ? draft !== active.content : false;

  const save = useCallback(async () => {
    if (!active || saving) return;
    if (draft === active.content) return;
    setSaving(true);
    try {
      const res = await saveMemory(active.key, draft, active.modifiedAt ?? undefined);
      setFiles((current) =>
        current.map((f) =>
          f.key === active.key ? { ...f, content: draft, modifiedAt: res.modifiedAt, exists: true } : f,
        ),
      );
      toast(`Saved ${active.filename}`);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'FILE_CHANGED') {
        toast('File changed on disk. Reload to see the latest version before editing.');
      } else {
        toast(toErrorMessage(error, 'Failed to save'));
      }
    } finally {
      setSaving(false);
    }
  }, [active, draft, saving]);

  const revert = useCallback(() => {
    if (!active) return;
    setDrafts((d) => ({ ...d, [active.key]: active.content }));
  }, [active]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void save();
      }
    },
    [save],
  );

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-3xl space-y-5">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 text-zinc-400 dark:text-zinc-500">
            <BrainCircuit size={20} />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Memory</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              View and edit the Hermes memory files the agent reads at the start of every task.
            </p>
            {hermesHome && (
              <p className="mt-1 truncate font-mono text-xs text-zinc-400 dark:text-zinc-600" title={hermesHome}>
                {hermesHome}
              </p>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-zinc-400 dark:text-zinc-500">
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : loadError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">
            <p>{loadError}</p>
            <button
              onClick={() => void load()}
              className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-red-300 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900/40"
            >
              <RotateCcw size={12} />
              Retry
            </button>
          </div>
        ) : (
          <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex flex-wrap gap-1 border-b border-zinc-200 p-2 dark:border-zinc-800">
              {files.map((f) => {
                const fileDirty = (drafts[f.key] ?? '') !== f.content;
                const isActive = f.key === activeKey;
                return (
                  <button
                    key={f.key}
                    onClick={() => setActiveKey(f.key)}
                    className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100'
                        : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100'
                    }`}
                  >
                    {f.label}
                    <span className="font-mono text-[11px] text-zinc-400 dark:text-zinc-500">{f.filename}</span>
                    {fileDirty && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />}
                  </button>
                );
              })}
            </div>

            {active && (
              <div className="p-3">
                <textarea
                  ref={textareaRef}
                  value={draft}
                  onChange={(e) => setDrafts((d) => ({ ...d, [active.key]: e.target.value }))}
                  onKeyDown={handleKeyDown}
                  spellCheck={false}
                  placeholder={active.exists ? '' : `${active.filename} does not exist yet. Start typing and save to create it.`}
                  className="h-[52vh] w-full resize-none rounded-lg border border-zinc-200 bg-zinc-50 p-3 font-mono text-sm leading-relaxed text-zinc-900 placeholder-zinc-400 focus:border-zinc-300 focus:outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder-zinc-600"
                />
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="truncate font-mono text-xs text-zinc-400 dark:text-zinc-600" title={active.path}>
                    {active.displayPath}
                    {!active.exists && ' (new)'}
                  </span>
                  <div className="flex shrink-0 items-center gap-2">
                    {dirty && (
                      <button
                        onClick={revert}
                        disabled={saving}
                        className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                      >
                        <RotateCcw size={12} />
                        Revert
                      </button>
                    )}
                    <button
                      onClick={() => void save()}
                      disabled={!dirty || saving}
                      className="inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
                    >
                      {saving ? <Loader2 size={12} className="animate-spin" /> : null}
                      Save
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
