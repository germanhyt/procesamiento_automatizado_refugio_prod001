import { useCallback } from 'react';
import { useAudioPlayer } from 'expo-audio';

import { RUNNER_SOUND_DRIVER_ALERT } from '@/constants/runnerSounds';

/**
 * Reproducción de alertas locales (no confundir con el sonido del sistema en push).
 * Escalable: añadir más `useAudioPlayer` o selección por tipo de evento.
 */
export function useRunnerAlertChime() {
  const player = useAudioPlayer(RUNNER_SOUND_DRIVER_ALERT);

  const play = useCallback(() => {
    try {
      player.seekTo(0);
      const playResult = player.play();
      if (playResult != null && typeof (playResult as Promise<void>).then === 'function') {
        void (playResult as Promise<void>).catch(() => { });
      }
    } catch {
      /* entorno sin audio */
    }
  }, [player]);

  return { play };
}
