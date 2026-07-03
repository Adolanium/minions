import { useCallback, useState } from 'react';

const STORAGE_KEY = 'desktop-notifications';

function hasNotificationSupport(): boolean {
  return typeof Notification !== 'undefined';
}

function getStored(): boolean {
  return hasNotificationSupport() && localStorage.getItem(STORAGE_KEY) === 'true';
}

export function desktopNotificationsReady(): boolean {
  return hasNotificationSupport() && getStored() && Notification.permission === 'granted';
}

export function showDesktopNotification(title: string, body: string, taskId: string): void {
  if (!desktopNotificationsReady()) return;
  if (document.visibilityState === 'visible') return;

  const notification = new Notification(title, { body });
  notification.onclick = () => {
    window.focus();
    location.assign(`/tasks/${taskId}`);
  };
}

export function useDesktopNotifications() {
  const [enabled, setEnabledState] = useState<boolean>(getStored);

  const setEnabled = useCallback((next: boolean) => {
    if (!next) {
      localStorage.setItem(STORAGE_KEY, 'false');
      setEnabledState(false);
      return;
    }

    if (!hasNotificationSupport()) return;

    Notification.requestPermission().then((permission) => {
      const granted = permission === 'granted';
      localStorage.setItem(STORAGE_KEY, String(granted));
      setEnabledState(granted);
    });
  }, []);

  return { enabled, setEnabled, supported: hasNotificationSupport() } as const;
}
