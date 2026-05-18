import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom';
import { Header, HeaderProvider } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { Board } from './components/Board';
import { NewTaskPage } from './components/NewTaskPage';
import { TaskDetailPage } from './components/TaskDetailPage';
import { SettingsPage } from './components/SettingsPage';
import { RoutinesPage } from './components/RoutinesPage';
import { SkillsPage } from './components/SkillsPage';
import { FileBrowserPage } from './components/FileBrowserPage';
import { Toaster } from 'sonner';
import { useTasks } from './hooks/useTasks';
import { useTheme } from './hooks/useTheme';

function AppShell() {
  useTasks();
  const { theme } = useTheme();

  return (
    <div className="flex h-dvh overflow-hidden bg-surface dark:bg-zinc-900 sm:h-screen sm:bg-sidebar dark:sm:bg-zinc-950">
      <Sidebar />
      <main className="flex flex-1 flex-col min-w-0 overflow-hidden bg-surface pb-[calc(3.75rem_+_env(safe-area-inset-bottom))] dark:bg-zinc-900 sm:m-2 sm:ml-0 sm:rounded-xl sm:border sm:border-zinc-200 sm:pb-0 sm:shadow-sm sm:dark:border-zinc-800">
        <HeaderProvider>
          <Header />
          <Routes>
            <Route path="/" element={<Board />} />
            <Route path="/tasks/new" element={<NewTaskPage />} />
            <Route path="/tasks/:taskId" element={<TaskDetailPage />} />
            <Route path="/cron" element={<Navigate to="/routines" replace />} />
            <Route path="/routines" element={<RoutinesPage />} />
            <Route path="/routines/new" element={<RoutinesPage />} />
            <Route path="/routines/:routineId/edit" element={<RoutinesPage />} />
            <Route path="/routines/:routineId/runs" element={<RoutinesPage />} />
            <Route path="/routines/:routineId/runs/:runId" element={<RoutinesPage />} />
            <Route path="/routines/:routineId" element={<RoutinesPage />} />
            <Route path="/skills" element={<SkillsPage />} />
            <Route path="/files" element={<FileBrowserPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </HeaderProvider>
      </main>
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
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}
