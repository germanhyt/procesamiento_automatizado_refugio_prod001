import type { RunnerInboxItemKind } from '@/constants/runnerPush';

export type { RunnerInboxItemKind };

export type RunnerInboxItem = {
  id: string;
  createdAt: number;
  kind: RunnerInboxItemKind;
  title: string;
  subtitle: string;
  orderId?: number;
  driverArrivalId?: number;
  read: boolean;
  sourceChannel: 'push' | 'ws' | 'api';
};
