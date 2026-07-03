import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Header, HeaderProvider } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { Board } from './components/Board';
import { NewTaskPage } from './components/NewTaskPage';
import { TaskDetailPage } from './components/TaskDetailPage';
import { SearchPalette } from './components/SearchPalette';
import { Toaster } from 'sonner';
import { useTasks } from './hooks/useTasks';
import { useTheme } from './hooks/useTheme';
import { useStore } from './lib/store';

// The board and task pages are the critical path and stay in the main bundle.
// Everything else loads on demand so the first paint isn't paying for pages
// the user may never open.
const ArchivePage = lazy(() => import('./components/ArchivePage').then((m) => ({ default: m.ArchivePage })));
const SettingsPage = lazy(() => import('./components/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const ScheduledTasksPage = lazy(() => import('./components/ScheduledTasksPage').then((m) => ({ default: m.ScheduledTasksPage })));
const SkillsPage = lazy(() => import('./components/SkillsPage').then((m) => ({ default: m.SkillsPage })));
const FileBrowserPage = lazy(() => import('./components/FileBrowserPage').then((m) => ({ default: m.FileBrowserPage })));
const MemoryPage = lazy(() => import('./components/MemoryPage').then((m) => ({ default: m.MemoryPage })));
const AnalyticsPage = lazy(() => import('./components/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage })));
const ModelsPage = lazy(() => import('./components/ModelsPage').then((m) => ({ default: m.ModelsPage })));
const McpPage = lazy(() => import('./components/McpPage').then((m) => ({ default: m.McpPage })));
const LogsPage = lazy(() => import('./components/LogsPage').then((m) => ({ default: m.LogsPage })));

function PageLoading() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <Loader2 size={22} className="animate-spin text-zinc-400 dark:text-zinc-500" />
    </div>
  );
}

function AppShell() {
  useTasks();
  const { theme } = useTheme();
  const workerUp = useStore((s) => s.workerUp);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-surface dark:bg-zinc-900 sm:h-screen sm:bg-sidebar dark:sm:bg-zinc-950">
      {!workerUp && (
        <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-center text-xs font-medium text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-200">
          Agent backend is offline. Reconnecting...
        </div>
      )}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <Sidebar />
        <main className="flex flex-1 flex-col min-w-0 overflow-hidden bg-surface pb-[calc(3.75rem_+_env(safe-area-inset-bottom))] dark:bg-zinc-900 sm:m-2 sm:ml-0 sm:rounded-xl sm:border sm:border-zinc-200 sm:pb-0 sm:shadow-sm sm:dark:border-zinc-800">
          <HeaderProvider>
            <Header />
            <Suspense fallback={<PageLoading />}>
            <Routes>
              <Route path="/" element={<Board />} />
              <Route path="/tasks/new" element={<NewTaskPage />} />
              <Route path="/tasks/:taskId" element={<TaskDetailPage />} />
              <Route path="/cron" element={<Navigate to="/scheduled-tasks" replace />} />
              <Route path="/scheduled-tasks" element={<ScheduledTasksPage />} />
              <Route path="/scheduled-tasks/new" element={<ScheduledTasksPage />} />
              <Route path="/scheduled-tasks/:scheduledTaskId/edit" element={<ScheduledTasksPage />} />
              <Route path="/scheduled-tasks/:scheduledTaskId/runs" element={<ScheduledTasksPage />} />
              <Route path="/scheduled-tasks/:scheduledTaskId/runs/:runId" element={<ScheduledTasksPage />} />
              <Route path="/scheduled-tasks/:scheduledTaskId" element={<ScheduledTasksPage />} />
              <Route path="/skills" element={<Navigate to="/skills/browse" replace />} />
              <Route path="/skills/:tab" element={<SkillsPage />} />
              <Route path="/files" element={<FileBrowserPage />} />
              <Route path="/memory" element={<MemoryPage />} />
              <Route path="/analytics" element={<AnalyticsPage />} />
              <Route path="/models" element={<ModelsPage />} />
              <Route path="/mcp" element={<McpPage />} />
              <Route path="/logs" element={<LogsPage />} />
              <Route path="/archive" element={<ArchivePage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
            </Suspense>
          </HeaderProvider>
        </main>
        <SearchPalette />
        <Toaster
          theme={theme === 'system' ? 'system' : theme}
          position="top-center"
          toastOptions={{
            unstyled: true,
            classNames: {
              toast: 'w-fit flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 shadow-lg dark:border-zinc-700 dark:bg-zinc-900',
              title: 'text-sm font-medium text-zinc-700 dark:text-zinc-200',
              actionButton: 'shrink-0 cursor-pointer text-sm font-semibold text-zinc-900 hover:underline dark:text-zinc-100',
            },
          }}
        />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}
