import { Router } from 'express';
import { getTask, searchTasks } from '../db/queries.js';
import type { SearchResponse } from '../../shared/types.js';
import type { HermesWorkerAdapter } from '../adapters/hermes-worker.js';

const TASK_SEARCH_LIMIT = 20;
const MESSAGE_SEARCH_LIMIT = 20;
const WORKER_SEARCH_LIMIT = 50;

export function createSearchRouter(adapter: HermesWorkerAdapter): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!q) {
      const response: SearchResponse = { tasks: [], messages: [] };
      return res.json(response);
    }

    const tasks = searchTasks(q, TASK_SEARCH_LIMIT);

    const messages: SearchResponse['messages'] = [];
    try {
      const matches = await adapter.searchSessions(q, WORKER_SEARCH_LIMIT);
      for (const match of matches) {
        if (messages.length >= MESSAGE_SEARCH_LIMIT) break;
        const task = getTask(match.session_id);
        if (!task) continue;
        messages.push({
          taskId: task.id,
          taskTitle: task.title,
          snippet: match.snippet,
          role: match.role,
          created_at: match.created_at,
        });
      }
    } catch {
      // Worker unavailable or search failed: fall back to task results only.
    }

    const response: SearchResponse = { tasks, messages };
    res.json(response);
  });

  return router;
}
