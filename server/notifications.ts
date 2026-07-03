import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { resolveMinionsDataDir } from './paths.js';
import { isRecord, toErrorMessage } from './errors.js';
import type { NotificationChannelResult, NotificationSettings } from '../shared/types.js';

type NotificationSettingsUpdate = Partial<NotificationSettings>;

function notificationsFilePath(): string {
  return join(resolveMinionsDataDir(), 'notifications.json');
}

function readRawSettings(): NotificationSettingsUpdate {
  try {
    const parsed = JSON.parse(readFileSync(notificationsFilePath(), 'utf8'));
    return isRecord(parsed) ? parsed as NotificationSettingsUpdate : {};
  } catch {
    return {};
  }
}

function resolveSettings(raw: NotificationSettingsUpdate): NotificationSettings {
  const telegramBotToken = raw.telegramBotToken ?? null;
  const telegramChatId = raw.telegramChatId ?? null;
  const webhookUrl = raw.webhookUrl ?? null;
  const channelConfigured = Boolean((telegramBotToken && telegramChatId) || webhookUrl);
  return {
    telegramBotToken,
    telegramChatId,
    webhookUrl,
    notifyOnReview: raw.notifyOnReview ?? channelConfigured,
    notifyOnError: raw.notifyOnError ?? channelConfigured,
    notifyOnScheduledFailure: raw.notifyOnScheduledFailure ?? channelConfigured,
    retryScheduledTasksOnce: raw.retryScheduledTasksOnce ?? false,
  };
}

let cache: NotificationSettings | null = null;

export function loadNotificationSettings(): NotificationSettings {
  if (!cache) cache = resolveSettings(readRawSettings());
  return cache;
}

export function saveNotificationSettings(updates: NotificationSettingsUpdate): NotificationSettings {
  const merged = resolveSettings({ ...readRawSettings(), ...updates });
  mkdirSync(dirname(notificationsFilePath()), { recursive: true });
  writeFileSync(notificationsFilePath(), `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
  cache = merged;
  return merged;
}

export interface NotifyEvent {
  kind: 'review' | 'error' | 'scheduled';
  taskId?: string;
  title: string;
  detail?: string;
}

function formatMessage(event: NotifyEvent): string {
  if (event.kind === 'review') return `Ready for review: ${event.title}`;
  const prefix = event.kind === 'scheduled' ? 'Scheduled task failed' : 'Task failed';
  return event.detail ? `${prefix}: ${event.title} (${event.detail})` : `${prefix}: ${event.title}`;
}

async function sendTelegram(token: string, chatId: string, text: string): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Telegram notification failed: HTTP ${res.status} ${body}`.trim());
  }
}

async function sendWebhook(url: string, event: NotifyEvent): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event: event.kind, taskId: event.taskId, title: event.title, detail: event.detail, at: Date.now() }),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Webhook notification failed: HTTP ${res.status} ${body}`.trim());
  }
}

export function notify(event: NotifyEvent): void {
  const settings = loadNotificationSettings();
  const enabled = event.kind === 'review'
    ? settings.notifyOnReview
    : event.kind === 'scheduled'
      ? settings.notifyOnScheduledFailure
      : settings.notifyOnError;
  if (!enabled) return;

  const text = formatMessage(event);

  if (settings.telegramBotToken && settings.telegramChatId) {
    void sendTelegram(settings.telegramBotToken, settings.telegramChatId, text).catch((error) => {
      console.error('Failed to send Telegram notification', error);
    });
  }

  if (settings.webhookUrl) {
    void sendWebhook(settings.webhookUrl, event).catch((error) => {
      console.error('Failed to send webhook notification', error);
    });
  }
}

export async function testNotifications(): Promise<Partial<Record<'telegram' | 'webhook', NotificationChannelResult>>> {
  const settings = loadNotificationSettings();
  const results: Partial<Record<'telegram' | 'webhook', NotificationChannelResult>> = {};

  if (settings.telegramBotToken && settings.telegramChatId) {
    results.telegram = await sendTelegram(settings.telegramBotToken, settings.telegramChatId, 'Minions test notification')
      .then(() => ({ ok: true }))
      .catch((error) => ({ ok: false, error: toErrorMessage(error, 'Telegram test failed') }));
  }

  if (settings.webhookUrl) {
    results.webhook = await sendWebhook(settings.webhookUrl, { kind: 'review', taskId: 'test', title: 'Test notification' })
      .then(() => ({ ok: true }))
      .catch((error) => ({ ok: false, error: toErrorMessage(error, 'Webhook test failed') }));
  }

  return results;
}
