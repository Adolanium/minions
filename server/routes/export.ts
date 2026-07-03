import { Router } from 'express';
import type { AgentAdapter } from '../adapters/types.js';
import { getTask } from '../db/queries.js';
import { exportFilename, taskTranscriptMarkdown } from '../export-format.js';

export function createExportRouter(adapter: AgentAdapter): Router {
  const router = Router();

  router.get('/:id/export', async (req, res) => {
    const task = getTask(req.params.id);
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    let messages;
    try {
      messages = await adapter.getMessages(task.id, task.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load the conversation';
      res.status(502).json({ error: message });
      return;
    }

    if (req.query.format === 'json') {
      res.setHeader('Content-Disposition', `attachment; filename="${exportFilename(task, 'json')}"`);
      res.json({ task, messages });
      return;
    }

    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${exportFilename(task, 'md')}"`);
    res.send(taskTranscriptMarkdown(task, messages));
  });

  return router;
}
