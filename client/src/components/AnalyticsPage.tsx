import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, Loader2, RotateCcw } from 'lucide-react';
import { fetchAnalytics } from '../lib/api';
import { formatCost, formatTokenCount, toErrorMessage } from '../lib/format';
import type { AnalyticsReport } from '@shared/types';

const RANGES = [
  { days: 7, label: '7d' },
  { days: 30, label: '30d' },
  { days: 90, label: '90d' },
  { days: 365, label: '1y' },
];

function costLabel(value: number): string {
  return value > 0 ? formatCost(value) : '$0.00';
}

export function AnalyticsPage() {
  const [days, setDays] = useState(30);
  const [report, setReport] = useState<AnalyticsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (range: number) => {
    setLoading(true);
    setError(null);
    try {
      setReport(await fetchAnalytics(range));
    } catch (err) {
      setError(toErrorMessage(err, 'Failed to load analytics'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(days);
  }, [days, load]);

  const empty = report != null && report.totals.sessions === 0;

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-4xl space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 text-zinc-400 dark:text-zinc-500">
              <BarChart3 size={20} />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Analytics</h1>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Token, cost, and activity trends across every Hermes session.
              </p>
            </div>
          </div>
          <div className="inline-flex rounded-lg border border-zinc-200 bg-white p-1 dark:border-zinc-800 dark:bg-zinc-900">
            {RANGES.map((r) => (
              <button
                key={r.days}
                onClick={() => setDays(r.days)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  days === r.days
                    ? 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100'
                    : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24 text-zinc-400 dark:text-zinc-500">
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">
            <p>{error}</p>
            <button
              onClick={() => void load(days)}
              className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-red-300 px-2.5 py-1 text-xs font-medium hover:bg-red-100 dark:border-red-800 dark:hover:bg-red-900/40"
            >
              <RotateCcw size={12} />
              Retry
            </button>
          </div>
        ) : empty || !report ? (
          <div className="rounded-xl border border-dashed border-zinc-200 py-20 text-center text-sm text-zinc-400 dark:border-zinc-800 dark:text-zinc-500">
            No session activity in this period.
          </div>
        ) : (
          <Dashboard report={report} />
        )}
      </div>
    </div>
  );
}

function Dashboard({ report }: { report: AnalyticsReport }) {
  const { totals } = report;
  const cacheReadPct = totals.inputTokens + totals.cacheReadTokens > 0
    ? Math.round((totals.cacheReadTokens / (totals.inputTokens + totals.cacheReadTokens)) * 100)
    : 0;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Total tokens" value={formatTokenCount(totals.totalTokens)} />
        <Stat label="Est. cost" value={costLabel(totals.estimatedCostUsd)} />
        <Stat label="Sessions" value={totals.sessions.toLocaleString()} />
        <Stat label="Messages" value={totals.messages.toLocaleString()} />
        <Stat label="Tool calls" value={totals.toolCalls.toLocaleString()} />
        <Stat label="Cache hit" value={`${cacheReadPct}%`} />
      </div>

      <DailyChart report={report} />
      <ModelBreakdown report={report} />

      <div className="grid gap-5 lg:grid-cols-2">
        <ActivityChart
          title="Sessions by hour"
          bars={report.byHour.map((h) => ({ label: String(h.hour), value: h.count }))}
          highlightEvery={6}
        />
        <ActivityChart
          title="Sessions by day of week"
          bars={report.byDayOfWeek.map((d) => ({ label: d.day, value: d.count }))}
        />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">{value}</div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">{title}</h2>
      {children}
    </div>
  );
}

function DailyChart({ report }: { report: AnalyticsReport }) {
  const max = useMemo(() => Math.max(1, ...report.daily.map((d) => d.totalTokens)), [report.daily]);
  const showLabels = report.daily.length <= 31;

  return (
    <Card title="Daily tokens">
      <div className="flex h-40 items-end gap-px overflow-x-auto">
        {report.daily.map((d) => (
          <div
            key={d.date}
            className="group flex min-w-[3px] flex-1 flex-col items-center justify-end"
            title={`${d.date}\n${formatTokenCount(d.totalTokens)} tokens\n${d.sessions} sessions\n${costLabel(d.estimatedCostUsd)}`}
          >
            <div
              className="w-full rounded-t bg-zinc-300 transition-colors group-hover:bg-zinc-500 dark:bg-zinc-700 dark:group-hover:bg-zinc-500"
              style={{ height: `${Math.max(d.totalTokens > 0 ? 2 : 0, (d.totalTokens / max) * 100)}%` }}
            />
          </div>
        ))}
      </div>
      {showLabels && report.daily.length > 0 && (
        <div className="mt-1.5 flex justify-between text-[10px] text-zinc-400 dark:text-zinc-600">
          <span>{report.daily[0]?.date.slice(5)}</span>
          <span>{report.daily[report.daily.length - 1]?.date.slice(5)}</span>
        </div>
      )}
    </Card>
  );
}

function ModelBreakdown({ report }: { report: AnalyticsReport }) {
  const max = Math.max(1, ...report.byModel.map((m) => m.totalTokens));
  return (
    <Card title="By model">
      <div className="space-y-2.5">
        {report.byModel.map((m) => (
          <div key={m.model}>
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="truncate font-medium text-zinc-700 dark:text-zinc-300">{m.model}</span>
              <span className="shrink-0 font-mono text-zinc-400 dark:text-zinc-500">
                {formatTokenCount(m.totalTokens)} tok · {m.sessions} sess · {costLabel(m.estimatedCostUsd)}
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
              <div
                className="h-full rounded-full bg-zinc-400 dark:bg-zinc-600"
                style={{ width: `${(m.totalTokens / max) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ActivityChart({
  title,
  bars,
  highlightEvery,
}: {
  title: string;
  bars: { label: string; value: number }[];
  highlightEvery?: number;
}) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  return (
    <Card title={title}>
      <div className="flex h-28 items-end gap-px">
        {bars.map((b, i) => (
          <div key={b.label} className="group flex flex-1 flex-col items-center justify-end" title={`${b.label}: ${b.value}`}>
            <div
              className="w-full rounded-t bg-zinc-300 transition-colors group-hover:bg-zinc-500 dark:bg-zinc-700 dark:group-hover:bg-zinc-500"
              style={{ height: `${Math.max(b.value > 0 ? 3 : 0, (b.value / max) * 100)}%` }}
            />
            {(!highlightEvery || i % highlightEvery === 0) && (
              <span className="mt-1 text-[9px] text-zinc-400 dark:text-zinc-600">{b.label}</span>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
