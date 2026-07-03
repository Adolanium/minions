import { Router } from 'express';
import type { Response } from 'express';
import type { AgentAdapter } from '../adapters/types.js';
import { errorCode, isRecord } from '../errors.js';
import type { McpServerInput, McpTransport } from '../../shared/types.js';

function fail(res: Response, error: unknown, fallback: string): void {
  const message = error instanceof Error ? error.message : fallback;
  const code = errorCode(error);
  const status = code === 'bad_request' ? 400 : code === 'not_found' ? 404 : 500;
  res.status(status).json({ error: message, code });
}

function stringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, val] of Object.entries(value)) {
    if (key.trim()) out[key] = String(val);
  }
  return out;
}

function parseInput(body: unknown): McpServerInput {
  const record = isRecord(body) ? body : {};
  const transport: McpTransport = record.transport === 'remote' ? 'remote' : 'stdio';
  return {
    name: typeof record.name === 'string' ? record.name.trim() : '',
    transport,
    enabled: record.enabled === undefined ? undefined : Boolean(record.enabled),
    command: typeof record.command === 'string' ? record.command : null,
    args: Array.isArray(record.args) ? record.args.map((a) => String(a)) : [],
    env: stringRecord(record.env),
    url: typeof record.url === 'string' ? record.url : null,
    headers: stringRecord(record.headers),
  };
}

export function createMcpRouter(adapter: AgentAdapter): Router {
  const router = Router();

  router.get('/servers', async (_req, res) => {
    try {
      res.json(await adapter.listMcpServers());
    } catch (error) {
      fail(res, error, 'Failed to load MCP servers');
    }
  });

  router.put('/servers', async (req, res) => {
    try {
      res.json(await adapter.saveMcpServer(parseInput(req.body)));
    } catch (error) {
      fail(res, error, 'Failed to save MCP server');
    }
  });

  router.delete('/servers/:name', async (req, res) => {
    try {
      res.json(await adapter.removeMcpServer(req.params.name));
    } catch (error) {
      fail(res, error, 'Failed to remove MCP server');
    }
  });

  router.put('/servers/:name/enabled', async (req, res) => {
    try {
      const enabled = isRecord(req.body) ? Boolean(req.body.enabled) : false;
      res.json(await adapter.setMcpServerEnabled(req.params.name, enabled));
    } catch (error) {
      fail(res, error, 'Failed to update MCP server');
    }
  });

  router.post('/servers/:name/probe', async (req, res) => {
    try {
      res.json(await adapter.probeMcpServer(req.params.name));
    } catch (error) {
      fail(res, error, 'Failed to test MCP server');
    }
  });

  return router;
}
