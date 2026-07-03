import { useEffect } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { SquarePen, Columns3, Settings, PanelLeftClose, PanelLeft, Repeat, Folder, Archive, Search, BrainCircuit, BarChart3, Boxes, Plug, ScrollText } from 'lucide-react';
import { useStore } from '../lib/store';
import { isEditableTarget } from '../lib/keyboard';

const isMac = /Mac/.test(navigator.userAgent);

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const collapsed = useStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useStore((s) => s.toggleSidebar);
  const toggleSearch = useStore((s) => s.toggleSearch);

  useEffect(() => {
    let chordKey: string | null = null;
    let chordTimeout: ReturnType<typeof setTimeout> | null = null;

    function handleKeyDown(e: KeyboardEvent) {
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (mod && e.shiftKey && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        navigate('/tasks/new');
        return;
      }

      if (mod && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        toggleSearch();
        return;
      }

      if (isEditableTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;

      const key = e.key.toLowerCase();

      if (chordKey === 'g') {
        chordKey = null;
        if (chordTimeout) clearTimeout(chordTimeout);
        const routes: Record<string, string> = { t: '/', f: '/files' };
        if (routes[key]) {
          e.preventDefault();
          navigate(routes[key]);
        }
        return;
      }

      if (key === 'g') {
        chordKey = 'g';
        if (chordTimeout) clearTimeout(chordTimeout);
        chordTimeout = setTimeout(() => { chordKey = null; }, 500);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (chordTimeout) clearTimeout(chordTimeout);
    };
  }, [navigate, toggleSearch]);

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/' || (location.pathname.startsWith('/tasks/') && location.pathname !== '/tasks/new');
    if (path === '/scheduled-tasks') return location.pathname === path || location.pathname.startsWith('/scheduled-tasks/');
    return location.pathname === path;
  };

  const desktopCollapsed = collapsed;

  return (
    <aside
      className={`fixed inset-x-0 bottom-0 z-50 flex h-[calc(3.75rem_+_env(safe-area-inset-bottom))] shrink-0 flex-col justify-end border-t border-zinc-200 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-1px_12px_rgba(0,0,0,0.06)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95 sm:relative sm:inset-auto sm:z-auto sm:h-auto sm:justify-start sm:border-t-0 sm:bg-sidebar sm:pb-0 sm:shadow-none sm:backdrop-blur-none dark:sm:bg-zinc-950 sm:transition-[width] sm:duration-200 sm:ease-in-out ${
        desktopCollapsed ? 'sm:w-16' : 'sm:w-56'
      }`}
    >
      <div className="hidden items-center justify-center px-2 py-4 sm:flex">
        {desktopCollapsed ? (
          <button
            onClick={toggleSidebar}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors p-1.5 rounded-lg hover:bg-surface dark:hover:bg-zinc-800"
            title="Expand sidebar"
          >
            <PanelLeft size={20} />
          </button>
        ) : (
          <div className="flex items-center justify-between w-full px-2">
            <button onClick={() => navigate('/')} className="shrink-0" title="Home">
              <img src="/logo.png" alt="Logo" className="w-9 h-9" />
            </button>
            <button
              onClick={toggleSidebar}
              className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors p-1.5 rounded-lg hover:bg-surface dark:hover:bg-zinc-800"
              title="Collapse sidebar"
            >
              <PanelLeftClose size={18} />
            </button>
          </div>
        )}
      </div>

      <div
        className={`flex h-[3.75rem] items-center justify-around gap-1 px-2 sm:flex-1 sm:flex-col sm:items-stretch sm:justify-start sm:gap-0 sm:h-auto ${
          desktopCollapsed ? 'sm:px-2' : 'sm:px-3'
        }`}
      >
        <nav
          aria-label="Primary"
          className="flex h-full flex-1 items-center gap-1 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:block sm:h-auto sm:flex-none sm:space-y-1 sm:overflow-visible"
        >
          <SidebarLink
            icon={<SquarePen size={18} />}
            label="New Task"
            mobileLabel="New"
            to="/tasks/new"
            active={isActive('/tasks/new')}
            collapsed={desktopCollapsed}
            shortcut={isMac ? '⇧⌘O' : 'Ctrl+⇧+O'}
          />
          <SidebarButton
            icon={<Search size={18} />}
            label="Search"
            onClick={toggleSearch}
            collapsed={desktopCollapsed}
            shortcut={isMac ? '⌘K' : 'Ctrl+K'}
          />
          <SidebarLink
            icon={<Columns3 size={18} />}
            label="Tasks"
            to="/"
            active={isActive('/')}
            collapsed={desktopCollapsed}
            shortcut={['G', 'T']}
          />
          <SidebarLink
            icon={<Repeat size={18} />}
            label="Recurring"
            to="/scheduled-tasks"
            active={isActive('/scheduled-tasks')}
            collapsed={desktopCollapsed}
          />
          <SidebarLink
            icon={<Folder size={18} />}
            label="Files"
            to="/files"
            active={isActive('/files')}
            collapsed={desktopCollapsed}
            shortcut={['G', 'F']}
          />
          <SidebarLink
            icon={<BrainCircuit size={18} />}
            label="Memory"
            to="/memory"
            active={isActive('/memory')}
            collapsed={desktopCollapsed}
            className="sm:hidden"
          />
          <SidebarLink
            icon={<BarChart3 size={18} />}
            label="Analytics"
            to="/analytics"
            active={isActive('/analytics')}
            collapsed={desktopCollapsed}
            className="sm:hidden"
          />
          <SidebarLink
            icon={<Boxes size={18} />}
            label="Models"
            to="/models"
            active={isActive('/models')}
            collapsed={desktopCollapsed}
            className="sm:hidden"
          />
          <SidebarLink
            icon={<Plug size={18} />}
            label="MCP"
            to="/mcp"
            active={isActive('/mcp')}
            collapsed={desktopCollapsed}
            className="sm:hidden"
          />
          <SidebarLink
            icon={<ScrollText size={18} />}
            label="Logs"
            to="/logs"
            active={isActive('/logs')}
            collapsed={desktopCollapsed}
            className="sm:hidden"
          />
          <SidebarLink
            icon={<Archive size={18} />}
            label="Archive"
            to="/archive"
            active={isActive('/archive')}
            collapsed={desktopCollapsed}
            className="sm:hidden"
          />
          <SidebarLink
            icon={<Settings size={18} />}
            label="Settings"
            to="/settings"
            active={isActive('/settings')}
            collapsed={desktopCollapsed}
            className="sm:hidden"
          />
        </nav>

        <div className="hidden sm:block sm:mt-7">
          {!desktopCollapsed ? (
            <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-600">
              Advanced
            </div>
          ) : (
            <div className="mx-3 mb-2 h-px bg-zinc-200 dark:bg-zinc-800" />
          )}
          <nav aria-label="Advanced" className="space-y-1">
            <SidebarLink
              icon={<BrainCircuit size={18} />}
              label="Memory"
              to="/memory"
              active={isActive('/memory')}
              collapsed={desktopCollapsed}
              subdued
            />
            <SidebarLink
              icon={<BarChart3 size={18} />}
              label="Analytics"
              to="/analytics"
              active={isActive('/analytics')}
              collapsed={desktopCollapsed}
              subdued
            />
            <SidebarLink
              icon={<Boxes size={18} />}
              label="Models"
              to="/models"
              active={isActive('/models')}
              collapsed={desktopCollapsed}
              subdued
            />
            <SidebarLink
              icon={<Plug size={18} />}
              label="MCP"
              to="/mcp"
              active={isActive('/mcp')}
              collapsed={desktopCollapsed}
              subdued
            />
            <SidebarLink
              icon={<ScrollText size={18} />}
              label="Logs"
              to="/logs"
              active={isActive('/logs')}
              collapsed={desktopCollapsed}
              subdued
            />
          </nav>
        </div>

        <nav aria-label="System" className="mt-auto hidden pb-3 sm:block sm:space-y-1">
          <SidebarLink
            icon={<Archive size={18} />}
            label="Archive"
            to="/archive"
            active={isActive('/archive')}
            collapsed={desktopCollapsed}
            subdued
          />
          <SidebarLink
            icon={<Settings size={18} />}
            label="Settings"
            to="/settings"
            active={isActive('/settings')}
            collapsed={desktopCollapsed}
            subdued
          />
        </nav>
      </div>

    </aside>
  );
}

function SidebarLink({
  icon,
  label,
  mobileLabel,
  to,
  active,
  collapsed,
  shortcut,
  className,
  subdued = false,
}: {
  icon: React.ReactNode;
  label: string;
  mobileLabel?: string;
  to: string;
  active: boolean;
  collapsed: boolean;
  shortcut?: string | string[];
  className?: string;
  subdued?: boolean;
}) {
  return (
    <Link
      to={to}
      title={shortcut ? `${label} (${Array.isArray(shortcut) ? shortcut.join(' then ') : shortcut})` : label}
      className={`group flex min-w-[3.75rem] flex-1 flex-col items-center justify-center gap-1 rounded-lg px-1.5 py-1.5 text-[10px] font-medium leading-none transition-colors sm:min-w-0 sm:w-full sm:flex-row sm:px-3 sm:py-2 sm:text-sm sm:leading-normal ${
        collapsed ? 'sm:justify-center' : 'sm:justify-start sm:gap-3'
      } ${
        active
          ? 'bg-zinc-100 text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-100 sm:bg-surface'
          : subdued
            ? 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 sm:text-zinc-600 sm:dark:text-zinc-400 sm:hover:bg-surface'
            : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 sm:text-zinc-700 sm:dark:text-zinc-300 sm:hover:bg-surface'
      } ${className ?? ''}`}
    >
      <span className={active ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-500 dark:text-zinc-400'}>
        {icon}
      </span>
      <span className="block max-w-full whitespace-normal text-center leading-tight sm:hidden">{mobileLabel ?? label}</span>
      {!collapsed && <span className="hidden truncate sm:block">{label}</span>}
      {!collapsed && shortcut && (
        Array.isArray(shortcut) ? (
          <span className="ml-auto hidden items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 sm:flex">
            <Kbd>{shortcut[0]}</Kbd>
            <span className="text-[10px] text-zinc-400 dark:text-zinc-500">then</span>
            <Kbd>{shortcut[1]}</Kbd>
          </span>
        ) : (
          <span className="ml-auto hidden text-xs tracking-widest text-zinc-400 opacity-0 transition-opacity group-hover:opacity-100 dark:text-zinc-500 sm:block">
            {shortcut}
          </span>
        )
      )}
    </Link>
  );
}

function SidebarButton({
  icon,
  label,
  onClick,
  collapsed,
  shortcut,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  collapsed: boolean;
  shortcut?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={shortcut ? `${label} (${shortcut})` : label}
      className={`group hidden min-w-0 flex-1 items-center rounded-lg px-1.5 py-1.5 text-[10px] font-medium leading-none transition-colors sm:flex sm:w-full sm:px-3 sm:py-2 sm:text-sm sm:leading-normal text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 sm:text-zinc-700 sm:dark:text-zinc-300 sm:hover:bg-surface ${
        collapsed ? 'sm:justify-center' : 'sm:justify-start sm:gap-3'
      }`}
    >
      <span className="text-zinc-500 dark:text-zinc-400">{icon}</span>
      {!collapsed && <span className="hidden truncate sm:block">{label}</span>}
      {!collapsed && shortcut && (
        <span className="ml-auto hidden text-xs tracking-widest text-zinc-400 opacity-0 transition-opacity group-hover:opacity-100 dark:text-zinc-500 sm:block">
          {shortcut}
        </span>
      )}
    </button>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="text-[11px] font-medium leading-none px-1.5 py-0.5 rounded border border-zinc-300/60 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 shadow-[0_1px_0_0_rgba(0,0,0,0.05)]">
      {children}
    </kbd>
  );
}
