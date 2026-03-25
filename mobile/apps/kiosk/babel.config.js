/**
 * Reanimated v4 usa react-native-worklets como motor Worklet.
 * El plugin DEBE ir como ÚLTIMO plugin o el APK release cierra al arrancar.
 * La ruta correcta para este paquete es 'react-native-worklets/plugin'.
 */
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['react-native-worklets/plugin'],
  };
};
