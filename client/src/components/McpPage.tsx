import { useCallback, useEffect, useState } from 'react';
import { Plug, Plus, Loader2, Trash2, Pencil, Zap, AlertTriangle, X } from 'lucide-react';
import { toast } from 'sonner';
import { fetchMcpServers, saveMcpServer, removeMcpServer, setMcpServerEnabled, probeMcpServer } from '../lib/api';
import { toErrorMessage } from '../lib/format';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import type { McpServer, McpServerInput, McpTransport, McpTool } from '@shared/types';

const INPUT = 'h-9 w-full rounded-lg border border-zinc-200 bg-white px-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100';
const AREA = 'w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-2 font-mono text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100';

function linesToArray(text: string): string[] {
  return text.split('\n').map((l) => l.trim()).filter(Boolean);
}
function linesToPairs(text: string, sep: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const i = line.indexOf(sep);
    if (i <= 0) continue;
    out[line.slice(0, i).trim()] = line.slice(i + sep.length).trim();
  }
  return out;
}
function pairsToLines(pairs: Record<string, string>, sep: string): string {
  return Object.entries(pairs).map(([k, v]) => `${k}${sep}${v}`).join('\n');
}

interface FormState {
  original: string | null;
  name: string;
  transport: McpTransport;
  enabled: boolean;
  command: string;
  argsText: string;
  envText: string;
  url: string;
  headersText: string;
}

function emptyForm(): FormState {
  return { original: null, name: '', transport: 'stdio', enabled: true, command: '', argsText: '', envText: '', url: '', headersText: '' };
}

function formFromServer(s: McpServer): FormState {
  return {
    original: s.name,
    name: s.name,
    transport: s.transport,
    enabled: s.enabled,
    command: s.command ?? '',
    argsText: s.args.join('\n'),
    envText: pairsToLines(s.env, '='),
    url: s.url ?? '',
    headersText: pairsToLines(s.headers, ': '),
  };
}

export function McpPage() {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [busyServer, setBusyServer] = useState<string | null>(null);
  const [probing, setProbing] = useState<string | null>(null);
  const [probeResult, setProbeResult] = useState<{ name: string; tools: McpTool[]; error: string | null } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setServers((await fetchMcpServers()).servers);
    } catch (err) {
      setLoadError(toErrorMessage(err, 'Failed to load MCP servers'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const openAdd = () => { setWarnings([]); setForm(emptyForm()); };
  const openEdit = (s: McpServer) => { setWarnings([]); setForm(formFromServer(s)); };
  const closeForm = () => { setForm(null); setWarnings([]); };

  const handleSave = useCallback(async () => {
    if (!form) return;
    const name = form.name.trim();
    if (!name) { toast('A server name is required'); return; }
    const input: McpServerInput = form.transport === 'remote'
      ? { name, transport: 'remote', enabled: form.enabled, url: form.url.trim(), headers: linesToPairs(form.headersText, ':') }
      : { name, transport: 'stdio', enabled: form.enabled, command: form.command.trim(), args: linesToArray(form.argsText), env: linesToPairs(form.envText, '=') };

    setSaving(true);
    setWarnings([]);
    try {
      const res = await saveMcpServer(input);
      setServers(res.servers);
      if (res.ok) {
        toast(`Saved ${name}`);
        closeForm();
      } else {
        setWarnings(res.warnings.length ? res.warnings : ['The server could not be saved.']);
      }
    } catch (err) {
      toast(toErrorMessage(err, 'Failed to save server'));
    } finally {
      setSaving(false);
    }
  }, [form]);

  const handleToggle = useCallback(async (s: McpServer) => {
    setBusyServer(s.name);
    try {
      setServers((await setMcpServerEnabled(s.name, !s.enabled)).servers);
    } catch (err) {
      toast(toErrorMessage(err, 'Failed to update server'));
    } finally {
      setBusyServer(null);
    }
  }, []);

  const handleProbe = useCallback(async (name: string) => {
    setProbing(name);
    setProbeResult(null);
    try {
      const { tools } = await probeMcpServer(name);
      setProbeResult({ name, tools, error: null });
    } catch (err) {
      setProbeResult({ name, tools: [], error: toErrorMessage(err, 'Could not connect') });
    } finally {
      setProbing(null);
    }
  }, []);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      setServers((await removeMcpServer(deleteTarget)).servers);
      if (probeResult?.name === deleteTarget) setProbeResult(null);
      setDeleteTarget(null);
    } catch (err) {
      toast(toErrorMessage(err, 'Failed to remove server'));
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, probeResult]);

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-3xl space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 text-zinc-400 dark:text-zinc-500"><Plug size={20} /></div>
            <div>
              <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">MCP servers</h1>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Model Context Protocol servers give the agent extra tools. Add, test, and toggle them here.
              </p>
            </div>
          </div>
          {!form && (
            <button
              onClick={openAdd}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              <Plus size={15} /> Add server
            </button>
          )}
        </div>

        {form && (
          <ServerForm
            form={form}
            setForm={(updater) => setForm((f) => (f ? updater(f) : f))}
            saving={saving}
            warnings={warnings}
            onSave={handleSave}
            onCancel={closeForm}
          />
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16 text-zinc-400 dark:text-zinc-500"><Loader2 size={20} className="animate-spin" /></div>
        ) : loadError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">
            {loadError} <button onClick={() => void load()} className="underline">Retry</button>
          </div>
        ) : servers.length === 0 && !form ? (
          <div className="rounded-xl border border-dashed border-zinc-200 py-16 text-center text-sm text-zinc-400 dark:border-zinc-800 dark:text-zinc-500">
            No MCP servers configured yet.
          </div>
        ) : (
          <div className="space-y-3">
            {servers.map((s) => (
              <div key={s.name} className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-zinc-900 dark:text-zinc-100">{s.name}</span>
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                        {s.transport === 'remote' ? 'Remote' : 'stdio'}
                      </span>
                      {!s.enabled && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">Disabled</span>}
                    </div>
                    <div className="mt-1 truncate font-mono text-xs text-zinc-400 dark:text-zinc-500" title={s.transport === 'remote' ? s.url ?? '' : `${s.command ?? ''} ${s.args.join(' ')}`}>
                      {s.transport === 'remote' ? s.url : `${s.command ?? ''} ${s.args.join(' ')}`.trim()}
                    </div>
                    {(Object.keys(s.env).length > 0 || Object.keys(s.headers).length > 0) && (
                      <div className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-600">
                        {Object.keys(s.env).length > 0 && `${Object.keys(s.env).length} env var(s)`}
                        {Object.keys(s.headers).length > 0 && `${Object.keys(s.headers).length} header(s)`}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => void handleProbe(s.name)}
                      disabled={probing === s.name}
                      title="Test connection"
                      className="inline-flex items-center gap-1 rounded-md border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      {probing === s.name ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />} Test
                    </button>
                    <ToggleSwitch on={s.enabled} busy={busyServer === s.name} onClick={() => void handleToggle(s)} />
                    <button onClick={() => openEdit(s)} title="Edit" className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"><Pencil size={14} /></button>
                    <button onClick={() => setDeleteTarget(s.name)} title="Remove" className="rounded-md p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"><Trash2 size={14} /></button>
                  </div>
                </div>

                {probeResult?.name === s.name && (
                  <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950/50">
                    {probeResult.error ? (
                      <p className="flex items-start gap-1.5 text-xs text-red-600 dark:text-red-400"><AlertTriangle size={13} className="mt-0.5 shrink-0" />{probeResult.error}</p>
                    ) : probeResult.tools.length === 0 ? (
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">Connected. The server exposes no tools.</p>
                    ) : (
                      <>
                        <p className="mb-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300">Connected — {probeResult.tools.length} tool(s):</p>
                        <ul className="space-y-1">
                          {probeResult.tools.map((t) => (
                            <li key={t.name} className="text-xs">
                              <span className="font-mono font-medium text-zinc-700 dark:text-zinc-300">{t.name}</span>
                              {t.description && <span className="text-zinc-400 dark:text-zinc-500"> — {t.description}</span>}
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {deleteTarget && (
        <DeleteConfirmModal
          title="Remove MCP server"
          body={`Remove "${deleteTarget}" from your Hermes config? The agent will no longer load its tools.`}
          confirmLabel="Remove"
          confirmingLabel="Removing..."
          isConfirming={deleting}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          zIndex={60}
        />
      )}
    </div>
  );
}

function ToggleSwitch({ on, busy, onClick }: { on: boolean; busy: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      role="switch"
      aria-checked={on}
      title={on ? 'Disable' : 'Enable'}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${on ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-700'}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${on ? 'translate-x-4' : 'translate-x-0.5'}`} />
    </button>
  );
}

function ServerForm({ form, setForm, saving, warnings, onSave, onCancel }: {
  form: FormState;
  setForm: (updater: (f: FormState) => FormState) => void;
  saving: boolean;
  warnings: string[];
  onSave: () => void;
  onCancel: () => void;
}) {
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{form.original ? `Edit ${form.original}` : 'Add MCP server'}</h2>
        <button onClick={onCancel} className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800"><X size={16} /></button>
      </div>

      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Name</label>
          <input
            className={INPUT}
            value={form.name}
            disabled={Boolean(form.original)}
            onChange={(e) => set('name', e.target.value)}
            placeholder="github"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Transport</label>
          <div className="inline-flex rounded-lg border border-zinc-200 bg-white p-1 dark:border-zinc-800 dark:bg-zinc-950">
            {(['stdio', 'remote'] as McpTransport[]).map((t) => (
              <button
                key={t}
                onClick={() => set('transport', t)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${form.transport === t ? 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100' : 'text-zinc-500 dark:text-zinc-400'}`}
              >
                {t === 'stdio' ? 'Local (stdio)' : 'Remote (URL)'}
              </button>
            ))}
          </div>
        </div>

        {form.transport === 'stdio' ? (
          <>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Command</label>
              <input className={INPUT} value={form.command} onChange={(e) => set('command', e.target.value)} placeholder="npx" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Arguments <span className="font-normal text-zinc-400">(one per line)</span></label>
              <textarea className={AREA} rows={3} value={form.argsText} onChange={(e) => set('argsText', e.target.value)} placeholder={'-y\n@modelcontextprotocol/server-github'} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Environment <span className="font-normal text-zinc-400">(KEY=value per line)</span></label>
              <textarea className={AREA} rows={2} value={form.envText} onChange={(e) => set('envText', e.target.value)} placeholder="GITHUB_TOKEN=ghp_..." />
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">URL</label>
              <input className={INPUT} value={form.url} onChange={(e) => set('url', e.target.value)} placeholder="https://mcp.example.com/mcp" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Headers <span className="font-normal text-zinc-400">(Header: value per line)</span></label>
              <textarea className={AREA} rows={2} value={form.headersText} onChange={(e) => set('headersText', e.target.value)} placeholder="Authorization: Bearer ..." />
            </div>
          </>
        )}

        {warnings.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-300">
            <p className="mb-1 flex items-center gap-1.5 font-medium"><AlertTriangle size={13} /> Not saved — this server looks unsafe:</p>
            <ul className="list-disc space-y-0.5 pl-5">
              {warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button onClick={onCancel} className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800">Cancel</button>
          <button
            onClick={onSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {saving && <Loader2 size={14} className="animate-spin" />} Save
          </button>
        </div>
      </div>
    </div>
  );
}
