import { v4 as uuid } from 'uuid';
import { randomUUID } from 'node:crypto';
import db from './index.js';
import {
  type Task,
  type TaskStatus,
  type ReasoningEffort,
  type ContextUsage,
  type TaskTemplate,
  type ChatRunMode,
} from '../../shared/types.js';

const stmtAllTasks = db.prepare("SELECT * FROM tasks WHERE status != 'archived' ORDER BY updated_at DESC");
const stmtTasksByStatus = db.prepare('SELECT * FROM tasks WHERE status = ? ORDER BY updated_at DESC');
const stmtGetTask = db.prepare('SELECT * FROM tasks WHERE id = ?');
const stmtSearchTasks = db.prepare(`
  SELECT * FROM tasks
  WHERE title LIKE @pattern ESCAPE '\\' OR description LIKE @pattern ESCAPE '\\'
  ORDER BY updated_at DESC
  LIMIT @limit
`);
const stmtInsertTask = db.prepare(`
  INSERT INTO tasks (
    id, title, description, status, agent_model, agent_provider, reasoning_effort,
    created_at, updated_at, last_agent_response_at, last_viewed_at,
    last_context_used_tokens, last_context_window_tokens, depends_on_task_id, pending_prompt
  )
  VALUES (
    @id, @title, @description, @status, @agent_model, @agent_provider, @reasoning_effort,
    @created_at, @updated_at, @last_agent_response_at, @last_viewed_at,
    @last_context_used_tokens, @last_context_window_tokens, @depends_on_task_id, @pending_prompt
  )
`);
const stmtDependentTasks = db.prepare(
  'SELECT * FROM tasks WHERE depends_on_task_id = ? AND pending_prompt IS NOT NULL',
);
const stmtDeleteTask = db.prepare('DELETE FROM tasks WHERE id = ?');
const stmtTouchTask = db.prepare('UPDATE tasks SET updated_at = ? WHERE id = ?');
const stmtMarkTaskViewed = db.prepare(`
  UPDATE tasks
  SET last_viewed_at = last_agent_response_at
  WHERE id = ?
    AND last_agent_response_at IS NOT NULL
    AND (last_viewed_at IS NULL OR last_viewed_at < last_agent_response_at)
`);

function parseToolsets(raw: unknown): string[] | null {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : null;
  } catch {
    return null;
  }
}

function serializeToolsets(value: string[] | null | undefined): string | null {
  if (!value || value.length === 0) return null;
  return JSON.stringify(value);
}

function toTask(row: Record<string, unknown>): Task {
  return { ...row, toolsets: parseToolsets(row.toolsets) } as Task;
}

export function getAllTasks(status?: TaskStatus): Task[] {
  const rows = status ? stmtTasksByStatus.all(status) : stmtAllTasks.all();
  return (rows as Record<string, unknown>[]).map(toTask);
}

export function getTask(id: string): Task | undefined {
  const row = stmtGetTask.get(id) as Record<string, unknown> | undefined;
  return row ? toTask(row) : undefined;
}

export function searchTasks(query: string, limit = 20): Task[] {
  const escaped = query.replace(/[\\%_]/g, (ch) => `\\${ch}`);
  const rows = stmtSearchTasks.all({ pattern: `%${escaped}%`, limit });
  return (rows as Record<string, unknown>[]).map(toTask);
}

export function insertTask(task: {
  title: string;
  description?: string | null;
  status: TaskStatus;
  agent_model?: string | null;
  agent_provider?: string | null;
  reasoning_effort?: ReasoningEffort | null;
  last_agent_response_at?: number | null;
  depends_on_task_id?: string | null;
  pending_prompt?: string | null;
}): Task {
  const id = uuid();
  const now = Date.now();
  const row = {
    id,
    title: task.title,
    description: task.description ?? null,
    status: task.status,
    agent_model: task.agent_model ?? null,
    agent_provider: task.agent_provider ?? null,
    reasoning_effort: task.reasoning_effort ?? null,
    created_at: now,
    updated_at: now,
    last_agent_response_at: task.last_agent_response_at ?? null,
    last_viewed_at: null,
    last_context_used_tokens: null,
    last_context_window_tokens: null,
    estimated_cost_usd: null,
    toolsets: null,
    depends_on_task_id: task.depends_on_task_id ?? null,
    pending_prompt: task.pending_prompt ?? null,
  };
  stmtInsertTask.run(row);
  return row as Task;
}

export function getDependentTasks(taskId: string): Task[] {
  const rows = stmtDependentTasks.all(taskId) as Record<string, unknown>[];
  return rows.map(toTask);
}

const ALLOWED_UPDATE_FIELDS = new Set<string>([
  'title',
  'description',
  'status',
  'agent_model',
  'agent_provider',
  'reasoning_effort',
  'toolsets',
  'depends_on_task_id',
  'pending_prompt',
  'last_agent_response_at',
  'last_context_used_tokens',
  'last_context_window_tokens',
  'estimated_cost_usd',
]);
const updateStmtCache = new Map<string, ReturnType<typeof db.prepare>>();

type TaskUpdateFields = Pick<
  Task,
  | 'title'
  | 'description'
  | 'status'
  | 'agent_model'
  | 'agent_provider'
  | 'reasoning_effort'
  | 'toolsets'
  | 'depends_on_task_id'
  | 'pending_prompt'
  | 'last_agent_response_at'
  | 'last_context_used_tokens'
  | 'last_context_window_tokens'
  | 'estimated_cost_usd'
>;

function getUpdateStmt(fieldKeys: string[]): ReturnType<typeof db.prepare> {
  const key = fieldKeys.join(',');
  let stmt = updateStmtCache.get(key);
  if (!stmt) {
    const sets = fieldKeys.map(f => `${f} = @${f}`).join(', ');
    stmt = db.prepare(`UPDATE tasks SET ${sets}, updated_at = @updated_at WHERE id = @id`);
    updateStmtCache.set(key, stmt);
  }
  return stmt;
}

export function updateTask(
  id: string,
  fields: Partial<TaskUpdateFields>,
): Task | undefined {
  const fieldKeys: string[] = [];
  const values: Record<string, unknown> = { id };

  for (const [key, value] of Object.entries(fields)) {
    if (!ALLOWED_UPDATE_FIELDS.has(key)) continue;
    fieldKeys.push(key);
    values[key] = key === 'toolsets' ? serializeToolsets(value as string[] | null | undefined) : value ?? null;
  }

  if (fieldKeys.length === 0) return getTask(id);

  values.updated_at = Date.now();
  getUpdateStmt(fieldKeys).run(values);
  return getTask(id);
}

export function touchTask(id: string): void {
  stmtTouchTask.run(Date.now(), id);
}

export function contextFromTask(task: Task): ContextUsage | null {
  if (task.last_context_used_tokens == null || task.last_context_window_tokens == null) return null;
  return { used_tokens: task.last_context_used_tokens, window_tokens: task.last_context_window_tokens };
}

export function recordAgentResponse(
  taskId: string,
  at = Date.now(),
  context?: ContextUsage | null,
  costUsd?: number | null,
): Task | undefined {
  return updateTask(taskId, {
    last_agent_response_at: at,
    ...(context !== undefined ? {
      last_context_used_tokens: context?.used_tokens ?? null,
      last_context_window_tokens: context?.window_tokens ?? null,
    } : {}),
    ...(costUsd !== undefined ? { estimated_cost_usd: costUsd } : {}),
  });
}

export function markTaskViewed(id: string): { task: Task | undefined; changed: boolean } {
  const result = stmtMarkTaskViewed.run(id);
  return {
    task: getTask(id),
    changed: result.changes > 0,
  };
}

export function deleteTask(id: string): boolean {
  const result = stmtDeleteTask.run(id);
  return result.changes > 0;
}

const stmtAllTemplates = db.prepare('SELECT * FROM templates ORDER BY name COLLATE NOCASE ASC');
const stmtGetTemplate = db.prepare('SELECT * FROM templates WHERE id = ?');
const stmtInsertTemplate = db.prepare(`
  INSERT INTO templates (
    id, name, prompt, agent_model, agent_provider, reasoning_effort, run_mode, created_at, updated_at
  )
  VALUES (
    @id, @name, @prompt, @agent_model, @agent_provider, @reasoning_effort, @run_mode, @created_at, @updated_at
  )
`);
const stmtDeleteTemplate = db.prepare('DELETE FROM templates WHERE id = ?');

export function getAllTemplates(): TaskTemplate[] {
  return stmtAllTemplates.all() as TaskTemplate[];
}

export function getTemplate(id: string): TaskTemplate | undefined {
  return stmtGetTemplate.get(id) as TaskTemplate | undefined;
}

export function insertTemplate(template: {
  name: string;
  prompt: string;
  agent_model?: string | null;
  agent_provider?: string | null;
  reasoning_effort?: ReasoningEffort | null;
  run_mode?: ChatRunMode | null;
}): TaskTemplate {
  const id = randomUUID();
  const now = Date.now();
  const row = {
    id,
    name: template.name,
    prompt: template.prompt,
    agent_model: template.agent_model ?? null,
    agent_provider: template.agent_provider ?? null,
    reasoning_effort: template.reasoning_effort ?? null,
    run_mode: template.run_mode ?? null,
    created_at: now,
    updated_at: now,
  };
  stmtInsertTemplate.run(row);
  return row as TaskTemplate;
}

const ALLOWED_TEMPLATE_UPDATE_FIELDS = new Set<string>([
  'name',
  'prompt',
  'agent_model',
  'agent_provider',
  'reasoning_effort',
  'run_mode',
]);
const templateUpdateStmtCache = new Map<string, ReturnType<typeof db.prepare>>();

type TemplateUpdateFields = Pick<
  TaskTemplate,
  'name' | 'prompt' | 'agent_model' | 'agent_provider' | 'reasoning_effort' | 'run_mode'
>;

function getTemplateUpdateStmt(fieldKeys: string[]): ReturnType<typeof db.prepare> {
  const key = fieldKeys.join(',');
  let stmt = templateUpdateStmtCache.get(key);
  if (!stmt) {
    const sets = fieldKeys.map(f => `${f} = @${f}`).join(', ');
    stmt = db.prepare(`UPDATE templates SET ${sets}, updated_at = @updated_at WHERE id = @id`);
    templateUpdateStmtCache.set(key, stmt);
  }
  return stmt;
}

export function updateTemplate(
  id: string,
  fields: Partial<TemplateUpdateFields>,
): TaskTemplate | undefined {
  const fieldKeys: string[] = [];
  const values: Record<string, unknown> = { id };

  for (const [key, value] of Object.entries(fields)) {
    if (!ALLOWED_TEMPLATE_UPDATE_FIELDS.has(key)) continue;
    fieldKeys.push(key);
    values[key] = value ?? null;
  }

  if (fieldKeys.length === 0) return getTemplate(id);

  values.updated_at = Date.now();
  getTemplateUpdateStmt(fieldKeys).run(values);
  return getTemplate(id);
}

export function deleteTemplate(id: string): boolean {
  const result = stmtDeleteTemplate.run(id);
  return result.changes > 0;
}
