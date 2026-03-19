import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export function NumPad(props: {
  keys: readonly string[];
  onKeyPress: (key: string) => void;
  disabled?: boolean;
}) {
  return (
    <View style={[styles.grid, props.disabled && { opacity: 0.6 }]}>
      {props.keys.map((k) => (
        <TouchableOpacity
          key={k}
          onPress={() => props.onKeyPress(k)}
          disabled={props.disabled}
          style={styles.key}
        >
          <Text style={styles.keyText}>{k}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    marginTop: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  key: {
    width: '31%',
    height: 64,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 1,
  },
});

