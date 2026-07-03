import type { HermesWorkerAdapter } from '../adapters/hermes-worker.js';
import type { ScheduledTask } from '../../shared/types.js';
import { loadNotificationSettings, notify } from '../notifications.js';

const TICK_INTERVAL_MS = 60000;

function markerFor(task: ScheduledTask): string {
  return `${task.lastRunAt ?? ''}|${task.lastStatus ?? ''}`;
}

export function startScheduledTaskMonitor(adapter: HermesWorkerAdapter): void {
  const snapshot = new Map<string, string>();
  const retryUsed = new Set<string>();
  let seeded = false;

  async function handleFailure(task: ScheduledTask): Promise<void> {
    const settings = loadNotificationSettings();

    if (settings.retryScheduledTasksOnce && !retryUsed.has(task.id)) {
      retryUsed.add(task.id);
      await adapter.runScheduledTask(task.id);
      notify({ kind: 'scheduled', title: task.name, detail: 'Run failed, retrying once' });
      return;
    }

    notify({ kind: 'scheduled', title: task.name, detail: task.lastError ?? undefined });
  }

  async function tick(): Promise<void> {
    try {
      const tasks = await adapter.listScheduledTasks(true);
      const seeding = !seeded;
      seeded = true;

      for (const task of tasks) {
        const marker = markerFor(task);
        const previous = snapshot.get(task.id);
        snapshot.set(task.id, marker);

        if (seeding || previous === undefined || previous === marker) continue;
        if (task.lastStatus === 'ok') {
          retryUsed.delete(task.id);
          continue;
        }
        if (task.lastStatus !== 'error') continue;

        await handleFailure(task);
      }
    } catch {
      // adapter unavailable this tick, try again next interval
    }
  }

  setInterval(() => void tick(), TICK_INTERVAL_MS).unref();
}
