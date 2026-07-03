export function looksLikeDiff(value: string): boolean {
  const lines = value.split('\n');
  if (lines.some((line) => line.startsWith('@@'))) return true;
  const hasOldHeader = lines.some((line) => line.startsWith('--- '));
  const hasNewHeader = lines.some((line) => line.startsWith('+++ '));
  return hasOldHeader && hasNewHeader;
}

function diffLineClass(line: string): string {
  if (line.startsWith('@@')) {
    return 'text-zinc-400 dark:text-zinc-500';
  }
  if (line.startsWith('+++') || line.startsWith('---')) {
    return 'text-zinc-400 dark:text-zinc-500';
  }
  if (line.startsWith('+')) {
    return 'text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/40';
  }
  if (line.startsWith('-')) {
    return 'text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-950/40';
  }
  return 'text-zinc-600 dark:text-zinc-400';
}

export function DiffView({ diff }: { diff: string }) {
  const lines = diff.split('\n');
  return (
    <div className="max-h-64 overflow-auto rounded-lg border border-zinc-200 bg-zinc-50 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900/60">
      {lines.map((line, i) => (
        <div key={i} className={`whitespace-pre px-2 py-0.5 ${diffLineClass(line)}`}>
          {line || ' '}
        </div>
      ))}
    </div>
  );
}
