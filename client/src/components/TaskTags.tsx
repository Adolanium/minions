import { useCallback, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { patchTask } from '../lib/api';
import { useStore } from '../lib/store';
import type { Task } from '@shared/types';

// Deterministic tag -> palette mapping so a tag keeps its color everywhere.
const TAG_PALETTES = [
  'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  'bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  'bg-cyan-50 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
  'bg-lime-50 text-lime-700 dark:bg-lime-900/30 dark:text-lime-300',
];

export function tagColorClasses(tag: string): string {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash = (hash * 31 + tag.charCodeAt(i)) | 0;
  return TAG_PALETTES[Math.abs(hash) % TAG_PALETTES.length];
}

export function TagChip({ tag, onRemove }: { tag: string; onRemove?: () => void }) {
  return (
    <span className={`inline-flex max-w-[9rem] items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-medium leading-none ${tagColorClasses(tag)}`}>
      <span className="truncate">{tag}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          title={`Remove tag "${tag}"`}
          aria-label={`Remove tag "${tag}"`}
          className="shrink-0 rounded-full p-0.5 opacity-60 hover:opacity-100"
        >
          <X size={10} strokeWidth={2.5} />
        </button>
      )}
    </span>
  );
}

const MAX_TAGS = 8;
const MAX_TAG_LENGTH = 24;

export function TagsEditor({ task }: { task: Task }) {
  const upsertTask = useStore((s) => s.upsertTask);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const tags = task.tags ?? [];

  const save = useCallback(async (next: string[]) => {
    setSaving(true);
    try {
      const { task: updated } = await patchTask(task.id, { tags: next.length > 0 ? next : null });
      upsertTask(updated);
    } catch {
      // Keep the previous state; the next successful save will settle it.
    } finally {
      setSaving(false);
    }
  }, [task.id, upsertTask]);

  const addDraft = useCallback(() => {
    const tag = draft.trim().slice(0, MAX_TAG_LENGTH);
    setDraft('');
    if (!tag || tags.includes(tag) || tags.length >= MAX_TAGS) return;
    void save([...tags, tag]);
  }, [draft, tags, save]);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((tag) => (
        <TagChip key={tag} tag={tag} onRemove={() => void save(tags.filter((t) => t !== tag))} />
      ))}
      {adding ? (
        <input
          ref={inputRef}
          autoFocus
          value={draft}
          disabled={saving}
          maxLength={MAX_TAG_LENGTH}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => { addDraft(); setAdding(false); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); addDraft(); }
            if (e.key === 'Escape') { e.preventDefault(); setDraft(''); setAdding(false); }
          }}
          placeholder="tag name"
          className="h-5 w-24 rounded-full border border-zinc-200 bg-white px-2 text-[11px] text-zinc-700 placeholder-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
        />
      ) : (
        tags.length < MAX_TAGS && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            title="Add tag"
            className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-zinc-300 px-2 py-0.5 text-[11px] font-medium leading-none text-zinc-400 hover:border-zinc-400 hover:text-zinc-600 dark:border-zinc-700 dark:text-zinc-500 dark:hover:border-zinc-500 dark:hover:text-zinc-300"
          >
            <Plus size={10} strokeWidth={2.5} />
            Tag
          </button>
        )
      )}
    </div>
  );
}
