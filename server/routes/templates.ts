import { Router } from 'express';
import { getAllTemplates, insertTemplate, updateTemplate, deleteTemplate } from '../db/queries.js';
import { REASONING_EFFORTS, CHAT_RUN_MODES } from '../../shared/types.js';
import type { ReasoningEffort, ChatRunMode } from '../../shared/types.js';

export const templatesRouter = Router();

templatesRouter.get('/', (req, res) => {
  const templates = getAllTemplates();
  res.json({ templates });
});

templatesRouter.post('/', (req, res) => {
  const { name, prompt, agent_model, agent_provider, reasoning_effort, run_mode } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'prompt is required' });
  }
  if (reasoning_effort != null && !REASONING_EFFORTS.includes(reasoning_effort as ReasoningEffort)) {
    return res.status(400).json({ error: `reasoning_effort must be one of: ${REASONING_EFFORTS.join(', ')}` });
  }
  if (run_mode != null && !CHAT_RUN_MODES.includes(run_mode as ChatRunMode)) {
    return res.status(400).json({ error: `run_mode must be one of: ${CHAT_RUN_MODES.join(', ')}` });
  }

  const template = insertTemplate({
    name: name.trim(),
    prompt,
    agent_model: agent_model ?? null,
    agent_provider: agent_provider ?? null,
    reasoning_effort: reasoning_effort ?? null,
    run_mode: run_mode ?? null,
  });
  res.status(201).json({ template });
});

templatesRouter.patch('/:id', (req, res) => {
  const allowed = ['name', 'prompt', 'agent_model', 'agent_provider', 'reasoning_effort', 'run_mode'] as const;
  const fields: Record<string, unknown> = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) fields[key] = req.body[key];
  }

  if (fields.reasoning_effort != null && !REASONING_EFFORTS.includes(fields.reasoning_effort as ReasoningEffort)) {
    return res.status(400).json({ error: `reasoning_effort must be one of: ${REASONING_EFFORTS.join(', ')}` });
  }
  if (fields.run_mode != null && !CHAT_RUN_MODES.includes(fields.run_mode as ChatRunMode)) {
    return res.status(400).json({ error: `run_mode must be one of: ${CHAT_RUN_MODES.join(', ')}` });
  }

  const updated = updateTemplate(req.params.id, fields);
  if (!updated) return res.status(404).json({ error: 'Template not found' });
  res.json({ template: updated });
});

templatesRouter.delete('/:id', (req, res) => {
  const deleted = deleteTemplate(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Template not found' });
  res.json({ ok: true });
});
