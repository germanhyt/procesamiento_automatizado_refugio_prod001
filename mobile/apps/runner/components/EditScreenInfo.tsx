import React from 'react';
import { StyleSheet } from 'react-native';
import { Text, View } from './Themed';

/**
 * Componente de información genérico.
 * No se usa en la App Runner — mantenido por compatibilidad con el template base.
 */
export default function EditScreenInfo({ path }: { path: string }) {
  return (
    <View style={styles.container}>
      <Text style={styles.path} lightColor="rgba(0,0,0,0.5)" darkColor="rgba(255,255,255,0.5)">
        {path}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    padding: 16,
  },
  path: {
    fontSize: 13,
    fontFamily: 'SpaceMono',
  },
});
