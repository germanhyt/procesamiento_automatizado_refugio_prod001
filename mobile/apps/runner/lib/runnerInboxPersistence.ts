import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  RUNNER_INBOX_DEDUPE_MS,
  RUNNER_INBOX_DEDUPE_PERSIST_MAX,
  RUNNER_INBOX_MAX_ITEMS,
  RUNNER_INBOX_TTL_MS,
} from '@/constants/runnerInboxConfig';
import type { RunnerInboxItem } from '@/types/runnerInbox';

export const RUNNER_INBOX_STORAGE_KEY = '@refugio/runner/inbox/v1';

type PersistedRunnerInboxV1 = {
  schemaVersion: 1;
  savedAt: number;
  items: RunnerInboxItem[];
  dedupeEntries?: Array<{ key: string; at: number }>;
};

function isRunnerInboxItem(x: unknown): x is RunnerInboxItem {
  if (x == null || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  if (typeof o.id !== 'string' || typeof o.createdAt !== 'number') return false;
  if (typeof o.kind !== 'string' || typeof o.title !== 'string' || typeof o.subtitle !== 'string') return false;
  if (typeof o.read !== 'boolean') return false;
  if (o.sourceChannel !== 'push' && o.sourceChannel !== 'ws') return false;
  if (o.orderId != null && typeof o.orderId !== 'number') return false;
  if (o.driverArrivalId != null && typeof o.driverArrivalId !== 'number') return false;
  return true;
}

export function filterItemsByTtl(items: RunnerInboxItem[], now: number): RunnerInboxItem[] {
  const cutoff = now - RUNNER_INBOX_TTL_MS;
  return items.filter((i) => i.createdAt >= cutoff);
}

export function normalizeInboxItems(items: RunnerInboxItem[], now: number = Date.now()): RunnerInboxItem[] {
  const filtered = filterItemsByTtl(items, now);
  const sorted = [...filtered].sort((a, b) => b.createdAt - a.createdAt);
  return sorted.slice(0, RUNNER_INBOX_MAX_ITEMS);
}

export function dedupeMapToEntries(map: Map<string, number>): Array<{ key: string; at: number }> {
  const now = Date.now();
  const pruneBefore = now - RUNNER_INBOX_DEDUPE_MS * 4;
  return [...map.entries()]
    .filter(([, at]) => at > pruneBefore)
    .sort((a, b) => a[1] - b[1])
    .slice(-RUNNER_INBOX_DEDUPE_PERSIST_MAX)
    .map(([key, at]) => ({ key, at }));
}

export function restoreDedupeMap(entries: Array<{ key: string; at: number }>): Map<string, number> {
  const now = Date.now();
  const pruneBefore = now - RUNNER_INBOX_DEDUPE_MS * 4;
  const m = new Map<string, number>();
  for (const e of entries) {
    if (e.at > pruneBefore) m.set(e.key, e.at);
  }
  return m;
}

export async function loadPersistedInbox(): Promise<{
  items: RunnerInboxItem[];
  dedupeEntries: Array<{ key: string; at: number }>;
}> {
  try {
    const raw = await AsyncStorage.getItem(RUNNER_INBOX_STORAGE_KEY);
    if (!raw) return { items: [], dedupeEntries: [] };
    const parsed: unknown = JSON.parse(raw);
    if (parsed == null || typeof parsed !== 'object') return { items: [], dedupeEntries: [] };
    const doc = parsed as Partial<PersistedRunnerInboxV1>;
    if (doc.schemaVersion !== 1 || !Array.isArray(doc.items)) return { items: [], dedupeEntries: [] };
    const items = doc.items.filter(isRunnerInboxItem);
    const now = Date.now();
    const normalized = normalizeInboxItems(items, now);
    const dedupeEntries = Array.isArray(doc.dedupeEntries)
      ? doc.dedupeEntries.filter(
          (e): e is { key: string; at: number } =>
            e != null &&
            typeof e === 'object' &&
            typeof (e as { key?: unknown }).key === 'string' &&
            typeof (e as { at?: unknown }).at === 'number',
        )
      : [];
    const pruneBefore = now - RUNNER_INBOX_DEDUPE_MS * 4;
    const prunedDedupe = dedupeEntries.filter((e) => e.at > pruneBefore).slice(-RUNNER_INBOX_DEDUPE_PERSIST_MAX);
    return { items: normalized, dedupeEntries: prunedDedupe };
  } catch {
    return { items: [], dedupeEntries: [] };
  }
}

export async function savePersistedInbox(
  items: RunnerInboxItem[],
  dedupeForSave: Array<{ key: string; at: number }>,
): Promise<void> {
  try {
    const now = Date.now();
    const normalized = normalizeInboxItems(items, now);
    const pruneBefore = now - RUNNER_INBOX_DEDUPE_MS * 4;
    const dedupe = dedupeForSave.filter((e) => e.at > pruneBefore).slice(-RUNNER_INBOX_DEDUPE_PERSIST_MAX);
    const doc: PersistedRunnerInboxV1 = {
      schemaVersion: 1,
      savedAt: now,
      items: normalized,
      ...(dedupe.length > 0 ? { dedupeEntries: dedupe } : {}),
    };
    await AsyncStorage.setItem(RUNNER_INBOX_STORAGE_KEY, JSON.stringify(doc));
  } catch {
    /* evitar romper UI por fallo de disco */
  }
}

export async function clearPersistedInbox(): Promise<void> {
  try {
    await AsyncStorage.removeItem(RUNNER_INBOX_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
