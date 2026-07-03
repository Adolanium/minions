import { Router } from 'express';
import type { AgentAdapter } from '../adapters/types.js';
import { errorCode, isRecord } from '../errors.js';

function fail(res: import('express').Response, error: unknown, fallback: string): void {
  const message = error instanceof Error ? error.message : fallback;
  const code = errorCode(error);
  res.status(code === 'bad_request' ? 400 : 500).json({ error: message, code });
}

export function createModelsRouter(adapter: AgentAdapter): Router {
  const router = Router();

  router.get('/info', async (_req, res) => {
    try {
      res.json(await adapter.getModelInfo());
    } catch (error) {
      fail(res, error, 'Failed to load model info');
    }
  });

  router.get('/auxiliary', async (_req, res) => {
    try {
      res.json(await adapter.getAuxiliaryModels());
    } catch (error) {
      fail(res, error, 'Failed to load auxiliary models');
    }
  });

  router.put('/auxiliary/:slot', async (req, res) => {
    try {
      const body = isRecord(req.body) ? req.body : {};
      const model = typeof body.model === 'string' && body.model.trim() ? body.model.trim() : null;
      const provider = typeof body.provider === 'string' && body.provider.trim() ? body.provider.trim() : null;
      res.json(await adapter.setAuxiliaryModel(req.params.slot, model, provider));
    } catch (error) {
      fail(res, error, 'Failed to update auxiliary model');
    }
  });

  return router;
}
