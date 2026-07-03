import { Router } from 'express';
import { isRecord } from '../errors.js';
import { loadNotificationSettings, saveNotificationSettings, testNotifications } from '../notifications.js';
import type { NotificationSettings } from '../../shared/types.js';

export const notificationsRouter = Router();

function maskToken(token: string | null): string | null {
  if (!token) return null;
  if (token.length <= 4) return '*'.repeat(token.length);
  return `${'*'.repeat(token.length - 4)}${token.slice(-4)}`;
}

function withMaskedToken(settings: NotificationSettings): NotificationSettings {
  return { ...settings, telegramBotToken: maskToken(settings.telegramBotToken) };
}

notificationsRouter.get('/', (_req, res) => {
  res.json(withMaskedToken(loadNotificationSettings()));
});

notificationsRouter.put('/', (req, res) => {
  if (!isRecord(req.body)) {
    return res.status(400).json({ error: 'Request body is required' });
  }

  const current = loadNotificationSettings();
  const updates: Partial<NotificationSettings> = {};

  if ('telegramBotToken' in req.body) {
    const value = req.body.telegramBotToken;
    if (value !== null && typeof value !== 'string') {
      return res.status(400).json({ error: 'telegramBotToken must be a string or null' });
    }
    const trimmed = typeof value === 'string' ? value.trim() : null;
    updates.telegramBotToken = trimmed && trimmed === maskToken(current.telegramBotToken)
      ? current.telegramBotToken
      : trimmed || null;
  }

  if ('telegramChatId' in req.body) {
    const value = req.body.telegramChatId;
    if (value !== null && typeof value !== 'string') {
      return res.status(400).json({ error: 'telegramChatId must be a string or null' });
    }
    updates.telegramChatId = typeof value === 'string' ? value.trim() || null : null;
  }

  if ('webhookUrl' in req.body) {
    const value = req.body.webhookUrl;
    if (value !== null && typeof value !== 'string') {
      return res.status(400).json({ error: 'webhookUrl must be a string or null' });
    }
    updates.webhookUrl = typeof value === 'string' ? value.trim() || null : null;
  }

  if ('notifyOnReview' in req.body) {
    if (typeof req.body.notifyOnReview !== 'boolean') {
      return res.status(400).json({ error: 'notifyOnReview must be a boolean' });
    }
    updates.notifyOnReview = req.body.notifyOnReview;
  }

  if ('notifyOnError' in req.body) {
    if (typeof req.body.notifyOnError !== 'boolean') {
      return res.status(400).json({ error: 'notifyOnError must be a boolean' });
    }
    updates.notifyOnError = req.body.notifyOnError;
  }

  res.json(withMaskedToken(saveNotificationSettings(updates)));
});

notificationsRouter.post('/test', async (_req, res) => {
  res.json({ results: await testNotifications() });
});
