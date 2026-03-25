import React, { useState } from 'react';
import { TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { useRunnerTheme } from '@/context/ThemeContext';
import { loginRunner } from '@refugio/delivery-api';
import { useRouter } from 'expo-router';
import { View, Text } from 'react-native';

export default function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { login } = useAuth();
  const { palette: p } = useRunnerTheme();
  const router = useRouter();

  const handleLogin = async () => {
    if (!username || !password) {
      Alert.alert('Error', 'Ingresa usuario y contraseña/PIN');
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await loginRunner(username, password);
      await login(result.access_token);
      router.replace('/(tabs)');
    } catch (error: any) {
      console.error('Login error', error);
      Alert.alert('Error de Login', 'Usuario o PIN incorrectos');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: p.bg }]}>
      <View style={[styles.card, { backgroundColor: p.cardBg, borderColor: p.cardBorder }]}>

        {/* Header con logo */}
        <View style={styles.logoRow}>
          <Image
            source={require('@/assets/images/logo-refugio.png')}
            style={styles.logo}
          />
          <View style={styles.logoText}>
            <Text style={[styles.title, { color: p.accent }]}>RefuChasky</Text>
            <Text style={[styles.subtitle, { color: p.muted }]}>Módulo Runner</Text>
          </View>
        </View>

        {/* Campo usuario */}
        <View style={styles.field}>
          <Text style={[styles.label, { color: p.muted }]}>USUARIO</Text>
          <TextInput
            style={[styles.input, { color: p.inputText, backgroundColor: p.inputBg, borderColor: p.inputBorder }]}
            placeholder="Ej: runner1"
            placeholderTextColor={p.placeholder}
            autoCapitalize="none"
            value={username}
            onChangeText={setUsername}
          />
        </View>

        {/* Campo contraseña/PIN */}
        <View style={styles.field}>
          <Text style={[styles.label, { color: p.muted }]}>PIN / CONTRASEÑA</Text>
          <View style={styles.passwordWrap}>
            <TextInput
              style={[
                styles.input,
                styles.inputWithEye,
                { color: p.inputText, backgroundColor: p.inputBg, borderColor: p.inputBorder },
              ]}
              placeholder="****"
              placeholderTextColor={p.placeholder}
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="password"
              secureTextEntry={!passwordVisible}
              value={password}
              onChangeText={setPassword}
            />
            <TouchableOpacity
              style={styles.eyeHit}
              onPress={() => setPasswordVisible((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel={passwordVisible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name={passwordVisible ? 'eye-off-outline' : 'eye-outline'}
                size={22}
                color={p.muted}
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Botón */}
        <TouchableOpacity
          style={[styles.button, { backgroundColor: p.accent }, isSubmitting && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color={p.accentText} />
          ) : (
            <Text style={[styles.buttonText, { color: p.accentText }]}>INGRESAR</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    padding: 32,
    borderRadius: 28,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 6,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    marginBottom: 40,
  },
  logo: {
    width: 60,
    height: 60,
  },
  logoText: {
    alignItems: 'flex-start',
  },
  title: {
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  subtitle: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginTop: 2,
  },
  field: {
    marginBottom: 22,
  },
  label: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  passwordWrap: {
    position: 'relative',
    justifyContent: 'center',
  },
  input: {
    height: 56,
    borderRadius: 14,
    paddingHorizontal: 18,
    fontSize: 17,
    fontWeight: '700',
    borderWidth: 1,
    letterSpacing: 0.5,
  },
  inputWithEye: {
    paddingRight: 52,
  },
  eyeHit: {
    position: 'absolute',
    right: 14,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
  },
  button: {
    height: 60,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 6,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
});
