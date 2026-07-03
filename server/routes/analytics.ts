import { Router } from 'express';
import type { AgentAdapter } from '../adapters/types.js';
import { errorCode } from '../errors.js';

const ALLOWED_DAYS = new Set([7, 30, 90, 365]);

export function createAnalyticsRouter(adapter: AgentAdapter): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    try {
      const parsed = Number.parseInt(String(req.query.days ?? '30'), 10);
      const days = ALLOWED_DAYS.has(parsed) ? parsed : 30;
      const report = await adapter.getInsights(days);
      res.json(report);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load analytics';
      res.status(500).json({ error: message, code: errorCode(error) });
    }
  });

  return router;
}
