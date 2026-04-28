import { Ionicons } from '@expo/vector-icons';
import React, { useEffect } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

const DEFAULT_SIZE = 26;

type Props = {
  color: string;
  /** Detiene el gesto (p. ej. con el modal de registro abierto). */
  paused: boolean;
  size?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Mano (ícono) con animación sutil: empujón horizontal + leve giro, bucle pausado.
 * El botón CTA se mantiene estático; solo se anima el pictograma.
 */
export function RegisterCtaPointingHand({ color, paused, size = DEFAULT_SIZE, style }: Props) {
  const nudge = useSharedValue(0);

  useEffect(() => {
    const ease = Easing.bezier(0.45, 0, 0.55, 1);
    if (paused) {
      nudge.value = withTiming(0, { duration: 200, easing: ease });
      return;
    }
    nudge.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1000, easing: ease }),
        withTiming(0, { duration: 1000, easing: ease }),
      ),
      -1,
      false,
    );
  }, [paused]);

  const iconMotion = useAnimatedStyle(() => {
    const t = nudge.value;
    return {
      transform: [
        { translateX: 5 * t },
        { rotate: `${-3 + 6 * t}deg` },
      ],
    };
  });

  return (
    <Animated.View
      style={[iconMotion, style]}
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      <Ionicons name="hand-right-outline" size={size} color={color} />
    </Animated.View>
  );
}
