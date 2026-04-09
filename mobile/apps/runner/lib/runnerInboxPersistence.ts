import AsyncStorage from '@react-native-async-storage/async-storage';

/** Clave legada (v1 caché local); la bandeja actual es API + estado en memoria. */
export const RUNNER_INBOX_STORAGE_KEY = '@refugio/runner/inbox/v1';

/** Elimina restos de AsyncStorage al cerrar sesión o vaciar bandeja (evita datos obsoletos). */
export async function clearPersistedInbox(): Promise<void> {
  try {
    await AsyncStorage.removeItem(RUNNER_INBOX_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
