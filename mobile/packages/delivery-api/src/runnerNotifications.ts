import { http } from './client';
import type { RunnerNotification } from './types';

export async function listRunnerNotifications(limit = 50): Promise<RunnerNotification[]> {
  const res = await http.get<RunnerNotification[]>('/delivery/runner/notifications', {
    params: { limit },
  });
  return res.data;
}

export async function markRunnerNotificationsReadAll(): Promise<void> {
  await http.patch('/delivery/runner/notifications/read-all');
}

export async function deleteRunnerNotificationsAll(): Promise<void> {
  await http.delete('/delivery/runner/notifications');
}
