import { Router } from 'express';
import { getTask } from '../db/queries.js';
import { toErrorMessage } from '../errors.js';
import type { HermesWorkerAdapter } from '../adapters/hermes-worker.js';

export function createSubagentsRouter(adapter: HermesWorkerAdapter): Router {
  const router = Router();

  router.get('/:id/subagents', async (req, res) => {
    const task = getTask(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    try {
      const subagents = await adapter.listChildSessions(task.id);
      res.json({ subagents });
    } catch (error) {
      res.status(503).json({ error: toErrorMessage(error, 'Hermes subagent lookup unavailable') });
    }
  });

  router.get('/:id/subagents/:childId/messages', async (req, res) => {
    const task = getTask(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    try {
      const subagents = await adapter.listChildSessions(task.id);
      const child = subagents.find((s) => s.id === req.params.childId);
      if (!child) return res.status(404).json({ error: 'Subagent not found' });

      const messages = await adapter.getMessages(req.params.childId, req.params.childId);
      res.json({ messages });
    } catch (error) {
      res.status(503).json({ error: toErrorMessage(error, 'Hermes subagent transcript unavailable') });
    }
  });

  return router;
}
