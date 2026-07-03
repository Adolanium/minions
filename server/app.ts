import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import { tasksRouter } from './routes/tasks.js';
import { templatesRouter } from './routes/templates.js';
import { chatRouter } from './routes/chat.js';
import { createAgentRouter, createTaskAgentSettingsRouter } from './routes/agent.js';
import { createScheduledTasksRouter } from './routes/scheduled-tasks.js';
import { createSearchRouter } from './routes/search.js';
import { createSubagentsRouter } from './routes/subagents.js';
import { skillsRouter } from './routes/skills.js';
import { filesRouter } from './routes/files.js';
import { createMemoryRouter } from './routes/memory.js';
import { notificationsRouter } from './routes/notifications.js';
import { HermesWorkerAdapter } from './adapters/hermes-worker.js';
import { initSSE, addClient, sendEvent, getWorkerUp } from './events.js';
import { getRunStatuses } from './live-chat.js';
import { getAppVersion } from './version.js';

const app = express();

app.use(cors());

const adapter = new HermesWorkerAdapter();

app.get('/api/health', async (_req, res) => {
  const hermes = await adapter.healthCheck();
  res.json({ ok: true, hermes });
});

app.get('/api/version', (_req, res) => {
  res.json(getAppVersion());
});

app.get('/api/events', (req, res) => {
  initSSE(res);
  addClient(res);
  sendEvent(res, { type: 'task_runs_snapshot', runs: getRunStatuses() });
  sendEvent(res, { type: 'worker_status', up: getWorkerUp() });
});

app.use('/api/files', express.json({ limit: '25mb' }), filesRouter);
app.use('/api/memory', express.json({ limit: '5mb' }), createMemoryRouter(adapter));

app.use(express.json());

app.use('/api/tasks', tasksRouter);
app.use('/api/tasks', createTaskAgentSettingsRouter(adapter));
app.use('/api/tasks', chatRouter);
app.use('/api/tasks', createSubagentsRouter(adapter));
app.use('/api/agent', createAgentRouter(adapter));
app.use('/api/scheduled-tasks', createScheduledTasksRouter(adapter));
app.use('/api/search', createSearchRouter(adapter));
app.use('/api/skills', skillsRouter);
app.use('/api/templates', templatesRouter);
app.use('/api/notifications', notificationsRouter);

app.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (!res.headersSent && error && typeof error === 'object' && (error as { type?: string }).type === 'entity.too.large') {
    res.status(413).json({ error: 'Request body is too large', code: 'PAYLOAD_TOO_LARGE' });
    return;
  }
  next(error);
});

export { adapter };
export default app;
