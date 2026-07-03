import { useCallback, useEffect, useState } from 'react';
import { Sun, Moon, Monitor, Info, Volume2, VolumeX, Play, Bell, BellOff } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme, type ThemePreference } from '../hooks/useTheme';
import { useSoundOnComplete } from '../hooks/useSoundOnComplete';
import { useDesktopNotifications } from '../hooks/useDesktopNotifications';
import { useAgentConfig } from '../hooks/useAgentConfig';
import { fetchAppVersion, updateAgentDefaults, fetchNotificationSettings, updateNotificationSettings, sendTestNotifications } from '../lib/api';
import type { AppVersion, NotificationSettings } from '@shared/types';
import { toErrorMessage } from '../lib/format';
import { ModelPicker, parseQualifiedModelValue, REASONING_LABELS, type ModelPickerSelection } from './InputToolbar';
import {
  REASONING_EFFORTS,
  type ReasoningEffort,
} from '@shared/types';

type SegmentOption<T> = { value: T; label: string; icon: typeof Sun };

const themeOptions: SegmentOption<ThemePreference>[] = [
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
];

const soundOptions: SegmentOption<boolean>[] = [
  { value: false, label: 'Off', icon: VolumeX },
  { value: true, label: 'On', icon: Volume2 },
];

const desktopOptions: SegmentOption<boolean>[] = [
  { value: false, label: 'Off', icon: BellOff },
  { value: true, label: 'On', icon: Bell },
];

const NOTIFICATION_INPUT_CLASS = 'mt-1 h-9 w-full rounded-md border border-zinc-200 bg-white px-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100';

const EMPTY_NOTIFICATION_SETTINGS: NotificationSettings = {
  telegramBotToken: null,
  telegramChatId: null,
  webhookUrl: null,
  notifyOnReview: true,
  notifyOnError: true,
  notifyOnScheduledFailure: true,
  retryScheduledTasksOnce: false,
};

function SegmentedGroup<T>({ options, value, onChange }: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-1 gap-1">
      {options.map(({ value: optValue, label, icon: Icon }) => (
        <button
          key={String(optValue)}
          onClick={() => onChange(optValue)}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            value === optValue
              ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
              : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
          }`}
        >
          <Icon size={14} />
          {label}
        </button>
      ))}
    </div>
  );
}

export function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const { enabled: soundEnabled, setEnabled: setSoundEnabled, playPreview } = useSoundOnComplete();
  const { enabled: desktopEnabled, setEnabled: setDesktopEnabled } = useDesktopNotifications();

  const { defaults: agentDefaults, modelGroups, isLoading: isLoadingDefaults, replaceDefaults } = useAgentConfig();
  const [appVersion, setAppVersion] = useState<AppVersion | null>(null);
  const [defaultsError, setDefaultsError] = useState<string | null>(null);
  const [savingDefaults, setSavingDefaults] = useState(false);
  const [savedDefaults, setSavedDefaults] = useState(false);

  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>(EMPTY_NOTIFICATION_SETTINGS);
  const [savingNotifications, setSavingNotifications] = useState(false);
  const [testingNotifications, setTestingNotifications] = useState(false);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);

  useEffect(() => {
    fetchNotificationSettings()
      .then(setNotificationSettings)
      .catch(() => {});
  }, []);

  const saveNotifications = useCallback(async () => {
    setSavingNotifications(true);
    setNotificationsError(null);
    try {
      const result = await updateNotificationSettings(notificationSettings);
      setNotificationSettings(result);
      toast('Notification settings saved');
    } catch (error) {
      setNotificationsError(toErrorMessage(error, 'Failed to save'));
    } finally {
      setSavingNotifications(false);
    }
  }, [notificationSettings]);

  const runTestNotifications = useCallback(async () => {
    setTestingNotifications(true);
    try {
      const { results } = await sendTestNotifications();
      const entries = Object.entries(results);
      if (entries.length === 0) {
        toast('No notification channels configured');
      } else {
        for (const [channel, result] of entries) {
          toast(`${channel === 'telegram' ? 'Telegram' : 'Webhook'}: ${result?.ok ? 'sent' : result?.error ?? 'failed'}`);
        }
      }
    } catch (error) {
      toast(toErrorMessage(error, 'Test failed'));
    } finally {
      setTestingNotifications(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchAppVersion()
      .then((v) => {
        if (!cancelled) setAppVersion(v);
      })
      .catch(() => {
        if (!cancelled) setAppVersion({ name: 'minionsai', version: 'unknown' });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!savedDefaults) return;
    const timer = setTimeout(() => setSavedDefaults(false), 2000);
    return () => clearTimeout(timer);
  }, [savedDefaults]);

  const saveDefaults = useCallback(async (updates: { provider?: string | null; model?: string | null; reasoningEffort?: ReasoningEffort | null }) => {
    setSavingDefaults(true);
    setDefaultsError(null);
    setSavedDefaults(false);
    try {
      const result = await updateAgentDefaults(updates);
      replaceDefaults(result);
      setSavedDefaults(true);
    } catch (error) {
      setDefaultsError(toErrorMessage(error, 'Failed to save'));
    } finally {
      setSavingDefaults(false);
    }
  }, [replaceDefaults]);

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="max-w-2xl space-y-5">
        <section
          aria-labelledby="default-model-title"
          className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 sm:p-5"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 id="default-model-title" className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                Default model
              </h2>
              <p className="mt-1 text-sm leading-5 text-zinc-500 dark:text-zinc-400">
                Model and reasoning effort for new tasks. Per-task overrides still apply.
              </p>
            </div>
            <span
              aria-live="polite"
              aria-hidden={!defaultsError && !savingDefaults && !savedDefaults}
              className={`shrink-0 text-xs transition-opacity duration-300 ${
                defaultsError || savingDefaults || savedDefaults ? 'opacity-100' : 'opacity-0'
              } ${defaultsError ? 'text-red-500' : 'text-zinc-400 dark:text-zinc-500'}`}
            >
              {defaultsError ?? (savingDefaults ? 'Saving...' : 'Saved')}
            </span>
          </div>

          <div className="mt-4 flex items-center flex-wrap gap-3">
            <ModelPicker
              value={agentDefaults?.model ?? ''}
              provider={agentDefaults?.provider ?? null}
              modelGroups={modelGroups}
              disabled={isLoadingDefaults || savingDefaults}
              title={agentDefaults?.model ? `Default: ${agentDefaults.model}` : 'Select default model'}
              onChange={(nextModel, selection?: ModelPickerSelection) => {
                const parsed = parseQualifiedModelValue(nextModel);
                const provider = selection?.provider ?? parsed?.provider;
                saveDefaults({
                  model: parsed?.model ?? nextModel,
                  ...(provider ? { provider } : {}),
                });
              }}
            />

            <select
              value={agentDefaults?.reasoningEffort ?? 'medium'}
              disabled={isLoadingDefaults || savingDefaults}
              onChange={(event) => saveDefaults({ reasoningEffort: event.target.value as ReasoningEffort })}
              aria-label="Default reasoning effort"
              className="h-9 rounded-lg border border-zinc-200 bg-white px-2.5 pr-7 text-xs font-medium text-zinc-600 shadow-sm transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700/70 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:focus:ring-zinc-700 appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22%2371717a%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22m3%204.5%203%203%203-3%22%2F%3E%3C%2Fsvg%3E')] bg-[length:12px] bg-[right_0.5rem_center] bg-no-repeat"
            >
              {REASONING_EFFORTS.map((effort) => (
                <option key={effort} value={effort}>
                  {REASONING_LABELS[effort]}
                </option>
              ))}
            </select>
          </div>
        </section>

        <div>
          <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500 mb-2">Theme</h2>
          <SegmentedGroup options={themeOptions} value={theme} onChange={setTheme} />
        </div>

        <div>
          <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500 mb-2">Sound on task completion</h2>
          <div className="flex items-center gap-2 flex-wrap">
            <SegmentedGroup options={soundOptions} value={soundEnabled} onChange={setSoundEnabled} />
            <button
              onClick={playPreview}
              aria-label="Preview sound"
              title="Preview sound"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
            >
              <Play size={14} />
              Preview
            </button>
          </div>
        </div>

        <div>
          <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500 mb-2">Desktop notifications</h2>
          <SegmentedGroup options={desktopOptions} value={desktopEnabled} onChange={setDesktopEnabled} />
        </div>

        <section
          aria-labelledby="notifications-title"
          className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 sm:p-5"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 id="notifications-title" className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                Notifications
              </h2>
              <p className="mt-1 text-sm leading-5 text-zinc-500 dark:text-zinc-400">
                Get a Telegram message or webhook call when a task needs attention.
              </p>
            </div>
            <span
              aria-live="polite"
              aria-hidden={!notificationsError && !savingNotifications}
              className={`shrink-0 text-xs transition-opacity duration-300 ${
                notificationsError || savingNotifications ? 'opacity-100' : 'opacity-0'
              } ${notificationsError ? 'text-red-500' : 'text-zinc-400 dark:text-zinc-500'}`}
            >
              {notificationsError ?? (savingNotifications ? 'Saving...' : '')}
            </span>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Telegram bot token
              <input
                type="text"
                value={notificationSettings.telegramBotToken ?? ''}
                onChange={(event) => setNotificationSettings((s) => ({ ...s, telegramBotToken: event.target.value }))}
                placeholder="123456:ABC-DEF..."
                className={`${NOTIFICATION_INPUT_CLASS} font-mono`}
              />
            </label>
            <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Telegram chat id
              <input
                type="text"
                value={notificationSettings.telegramChatId ?? ''}
                onChange={(event) => setNotificationSettings((s) => ({ ...s, telegramChatId: event.target.value }))}
                placeholder="-100123456789"
                className={`${NOTIFICATION_INPUT_CLASS} font-mono`}
              />
            </label>
            <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 sm:col-span-2">
              Webhook URL
              <input
                type="text"
                value={notificationSettings.webhookUrl ?? ''}
                onChange={(event) => setNotificationSettings((s) => ({ ...s, webhookUrl: event.target.value }))}
                placeholder="https://example.com/hooks/minions"
                className={`${NOTIFICATION_INPUT_CLASS} font-mono`}
              />
            </label>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-4">
            <label className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={notificationSettings.notifyOnReview}
                onChange={(event) => setNotificationSettings((s) => ({ ...s, notifyOnReview: event.target.checked }))}
              />
              Notify on review
            </label>
            <label className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={notificationSettings.notifyOnError}
                onChange={(event) => setNotificationSettings((s) => ({ ...s, notifyOnError: event.target.checked }))}
              />
              Notify on error
            </label>
            <label className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={notificationSettings.notifyOnScheduledFailure}
                onChange={(event) => setNotificationSettings((s) => ({ ...s, notifyOnScheduledFailure: event.target.checked }))}
              />
              Notify on scheduled task failure
            </label>
          </div>

          <div className="mt-3">
            <label className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={notificationSettings.retryScheduledTasksOnce}
                onChange={(event) => setNotificationSettings((s) => ({ ...s, retryScheduledTasksOnce: event.target.checked }))}
              />
              Retry failed scheduled tasks once
            </label>
            <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
              Re-runs a failed scheduled task automatically before notifying.
            </p>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={saveNotifications}
              disabled={savingNotifications}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50 transition-colors"
            >
              Save
            </button>
            <button
              onClick={runTestNotifications}
              disabled={testingNotifications}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 disabled:opacity-50 transition-colors"
            >
              Send test
            </button>
          </div>
        </section>

        <div>
          <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500 mb-2">Version</h2>
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs font-medium text-zinc-900 dark:text-zinc-100">
            <Info size={14} />
            Minions
            <span className="text-zinc-500 dark:text-zinc-400">
              {appVersion ? `v${appVersion.version}` : '...'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
