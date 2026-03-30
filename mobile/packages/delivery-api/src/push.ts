import { http } from './client';

export async function registerRunnerPushToken(expoPushToken: string, platform: string): Promise<void> {
  await http.post('/delivery/push/register', {
    expo_push_token: expoPushToken,
    platform,
    app_slug: 'runner',
  });
}

/** Si se omite el token, el backend desactiva todos los tokens del usuario. */
export async function unregisterRunnerPushToken(expoPushToken?: string | null): Promise<void> {
  await http.post('/delivery/push/unregister', {
    expo_push_token: expoPushToken ?? undefined,
  });
}
