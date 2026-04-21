import { useAudioPlayer } from 'expo-audio';
import React, { createContext, useCallback, useContext, useMemo } from 'react';

import { RUNNER_SOUND_DRIVER_ALERT } from '@/constants/runnerSounds';

type Ctx = {
  playLoopingAlert: () => void;
  stopAlertLoop: () => void;
};

const RunnerAlertAudioContext = createContext<Ctx | null>(null);

export function RunnerAlertAudioProvider({ children }: { children: React.ReactNode }) {
  const player = useAudioPlayer(RUNNER_SOUND_DRIVER_ALERT);

  const playLoopingAlert = useCallback(() => {
    try {
      player.loop = true;
      void player.seekTo(0);
      const pr = player.play();
      if (pr != null && typeof (pr as Promise<void>).then === 'function') {
        void (pr as Promise<void>).catch(() => {});
      }
    } catch {
      /* entorno sin audio */
    }
  }, [player]);

  const stopAlertLoop = useCallback(() => {
    try {
      player.loop = false;
      player.pause();
      void player.seekTo(0);
    } catch {
      /* entorno sin audio */
    }
  }, [player]);

  const value = useMemo(() => ({ playLoopingAlert, stopAlertLoop }), [playLoopingAlert, stopAlertLoop]);

  return <RunnerAlertAudioContext.Provider value={value}>{children}</RunnerAlertAudioContext.Provider>;
}

export function useRunnerAlertAudio(): Ctx {
  const ctx = useContext(RunnerAlertAudioContext);
  if (!ctx) {
    return {
      playLoopingAlert: () => {},
      stopAlertLoop: () => {},
    };
  }
  return ctx;
}
