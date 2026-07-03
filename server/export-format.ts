import type { LiveChatMessage, Task } from '../shared/types.js';

function formatTimestamp(ms: number | null | undefined): string {
  if (!ms) return '';
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}

function roleHeading(role: string): string {
  if (role === 'user') return 'User';
  if (role === 'assistant') return 'Assistant';
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export function taskTranscriptMarkdown(task: Task, messages: LiveChatMessage[]): string {
  const lines: string[] = [];
  lines.push(`# ${task.title}`);
  lines.push('');
  if (task.description && task.description !== task.title) {
    lines.push(task.description);
    lines.push('');
  }
  lines.push(`- Status: ${task.status}`);
  lines.push(`- Created: ${formatTimestamp(task.created_at)}`);
  if (task.agent_model) lines.push(`- Model: ${task.agent_model}`);
  lines.push('');

  for (const msg of messages) {
    const time = formatTimestamp(msg.created_at);
    lines.push(`## ${roleHeading(msg.role)}${time ? ` — ${time}` : ''}`);
    lines.push('');
    if (msg.role === 'assistant' && msg.tools && msg.tools.length > 0) {
      const toolNames = msg.tools.map((t) => t.tool).join(', ');
      lines.push(`*Tools used: ${toolNames}*`);
      lines.push('');
    }
    lines.push(msg.content || '*(no content)*');
    lines.push('');
  }

  return lines.join('\n');
}

export function exportFilename(task: Task, extension: 'md' | 'json'): string {
  const slug = task.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'task';
  return `${slug}.${extension}`;
}
