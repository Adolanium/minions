import { useCallback, useEffect, useState } from 'react';
import { Boxes, Loader2, Pencil, RotateCcw, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { fetchModelInfo, fetchAuxiliaryModels, setAuxiliaryModel } from '../lib/api';
import { toErrorMessage } from '../lib/format';
import { useAgentConfig } from '../hooks/useAgentConfig';
import { ModelPicker, parseQualifiedModelValue, type ModelPickerSelection } from './InputToolbar';
import type { AuxiliaryModelsResponse, ModelInfoResponse } from '@shared/types';

function formatContext(n: number | null): string | null {
  if (!n || n <= 0) return null;
  if (n >= 1_000_000) return `${Math.round(n / 100_000) / 10}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

function formatPrice(n: number | null): string | null {
  if (n == null) return null;
  if (n === 0) return 'free';
  return `$${n < 1 ? n.toFixed(2) : n.toFixed(2).replace(/\.00$/, '')}`;
}

function Badge({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
        on
          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
          : 'bg-zinc-100 text-zinc-400 line-through dark:bg-zinc-800 dark:text-zinc-600'
      }`}
    >
      {label}
    </span>
  );
}

export function ModelsPage() {
  const { modelGroups } = useAgentConfig();
  const [info, setInfo] = useState<ModelInfoResponse | null>(null);
  const [infoLoading, setInfoLoading] = useState(true);
  const [aux, setAux] = useState<AuxiliaryModelsResponse | null>(null);
  const [auxLoading, setAuxLoading] = useState(true);
  const [auxError, setAuxError] = useState<string | null>(null);
  const [editingSlot, setEditingSlot] = useState<string | null>(null);
  const [savingSlot, setSavingSlot] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchModelInfo()
      .then((res) => { if (!cancelled) setInfo(res); })
      .catch(() => { if (!cancelled) setInfo(null); })
      .finally(() => { if (!cancelled) setInfoLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const loadAux = useCallback(async () => {
    setAuxLoading(true);
    setAuxError(null);
    try {
      setAux(await fetchAuxiliaryModels());
    } catch (err) {
      setAuxError(toErrorMessage(err, 'Failed to load auxiliary models'));
    } finally {
      setAuxLoading(false);
    }
  }, []);

  useEffect(() => { void loadAux(); }, [loadAux]);

  const applySlot = useCallback(async (slot: string, model: string | null, provider: string | null) => {
    setSavingSlot(slot);
    try {
      const next = await setAuxiliaryModel(slot, model, provider);
      setAux(next);
      setEditingSlot(null);
    } catch (err) {
      toast(toErrorMessage(err, 'Failed to update model'));
    } finally {
      setSavingSlot(null);
    }
  }, []);

  const handlePick = useCallback((slot: string, nextModel: string, selection?: ModelPickerSelection) => {
    const parsed = parseQualifiedModelValue(nextModel);
    const provider = selection?.provider ?? parsed?.provider ?? null;
    void applySlot(slot, parsed?.model ?? nextModel, provider);
  }, [applySlot]);

  const caps = info?.capabilities;
  const pricing = info?.pricing;
  const ctx = formatContext(caps?.contextWindow ?? null);
  const maxOut = formatContext(caps?.maxOutputTokens ?? null);

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 text-zinc-400 dark:text-zinc-500"><Boxes size={20} /></div>
          <div>
            <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Models</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Your main model, and the helper models Hermes uses for background jobs.
            </p>
          </div>
        </div>

        {/* Current model */}
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">Main model</h2>
          {infoLoading ? (
            <div className="flex items-center gap-2 text-sm text-zinc-400 dark:text-zinc-500">
              <Loader2 size={14} className="animate-spin" /> Loading…
            </div>
          ) : !info?.model ? (
            <p className="text-sm text-zinc-400 dark:text-zinc-500">No default model configured.</p>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-100">{info.model}</span>
                {info.provider && <span className="text-xs text-zinc-400 dark:text-zinc-500">via {info.provider}</span>}
              </div>
              {caps ? (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge on={caps.supportsTools} label="Tools" />
                    <Badge on={caps.supportsVision} label="Vision" />
                    <Badge on={caps.supportsReasoning} label="Reasoning" />
                  </div>
                  <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
                    {ctx && <span>Context: <span className="font-medium text-zinc-700 dark:text-zinc-300">{ctx}</span></span>}
                    {maxOut && <span>Max output: <span className="font-medium text-zinc-700 dark:text-zinc-300">{maxOut}</span></span>}
                    {caps.modelFamily && <span>Family: <span className="font-medium text-zinc-700 dark:text-zinc-300">{caps.modelFamily}</span></span>}
                  </div>
                </>
              ) : (
                <p className="text-xs text-zinc-400 dark:text-zinc-500">Capability details unavailable for this model.</p>
              )}
              {pricing && (formatPrice(pricing.inputPerMillion) || formatPrice(pricing.outputPerMillion)) && (
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  Price (per 1M tokens):{' '}
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">
                    {formatPrice(pricing.inputPerMillion) ?? '—'} in / {formatPrice(pricing.outputPerMillion) ?? '—'} out
                  </span>
                </div>
              )}
              <p className="text-[11px] text-zinc-400 dark:text-zinc-600">
                Change the main model and reasoning effort in Settings.
              </p>
            </div>
          )}
        </div>

        {/* Auxiliary models */}
        <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="border-b border-zinc-200 p-4 dark:border-zinc-800">
            <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">Helper models</h2>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Hermes uses these for background jobs. <span className="font-medium">Auto</span> means it reuses your main model
              {aux?.main.model ? ` (${aux.main.model})` : ''}.
            </p>
          </div>

          {auxLoading ? (
            <div className="flex items-center justify-center py-10 text-zinc-400 dark:text-zinc-500">
              <Loader2 size={18} className="animate-spin" />
            </div>
          ) : auxError ? (
            <div className="p-4 text-sm text-red-600 dark:text-red-400">
              {auxError}{' '}
              <button onClick={() => void loadAux()} className="underline">Retry</button>
            </div>
          ) : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {aux?.slots.map((slot) => (
                <li key={slot.key} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{slot.label}</div>
                      <div className="text-xs text-zinc-400 dark:text-zinc-500">{slot.description}</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {slot.isAuto ? (
                        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">Auto</span>
                      ) : (
                        <span className="max-w-[12rem] truncate rounded-md bg-zinc-100 px-2 py-0.5 font-mono text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" title={slot.model ?? ''}>
                          {slot.model}
                        </span>
                      )}
                      {savingSlot === slot.key ? (
                        <Loader2 size={14} className="animate-spin text-zinc-400" />
                      ) : (
                        <>
                          <button
                            onClick={() => setEditingSlot((cur) => (cur === slot.key ? null : slot.key))}
                            title="Set model"
                            aria-label={`Set model for ${slot.label}`}
                            className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                          >
                            {editingSlot === slot.key ? <X size={14} /> : <Pencil size={14} />}
                          </button>
                          {!slot.isAuto && (
                            <button
                              onClick={() => void applySlot(slot.key, null, null)}
                              title="Reset to Auto"
                              aria-label={`Reset ${slot.label} to Auto`}
                              className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                            >
                              <RotateCcw size={14} />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  {editingSlot === slot.key && (
                    <div className="mt-3 flex items-center gap-2">
                      <ModelPicker
                        value={slot.model ?? ''}
                        provider={slot.provider}
                        modelGroups={modelGroups}
                        title={`Set model for ${slot.label}`}
                        onChange={(nextModel, selection) => handlePick(slot.key, nextModel, selection)}
                      />
                      <span className="text-xs text-zinc-400 dark:text-zinc-500">Pick a model to assign, or</span>
                      <button
                        onClick={() => void applySlot(slot.key, null, null)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                      >
                        <Check size={12} /> use Auto
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
