


Observaciones DELIVERY:
1)
Con AppSelect, al cambiar de size de sm a md tiene los estilos correctos, pero al dejar en sm queda con estilos diferentes, corregir

2)
revisando, aún persiste el problema, al dejarlo así "   <AppSelect
                                options={adminStatusOptions}
                                value={adminStatusOptions.find((o) => o.value === adminStatus) ?? adminStatusOptions[0]}
                                onChange={(opt) => opt && setAdminStatus(opt.value)}
                                size="sm"
                                className="min-w-[140px]"
                            />" se renderiza como en la siguiente imagen, y cuando lo cambio a md sí se adaptar a los estilos del sistema, a qué se debe?

3)
Refactorizar el componente, sin alterar los estilos trabajando con variantes (estilos del sistema y el base de react select)

4)
En la lógica de negocio se estaba considerando el caso de unlock?, si no es así, a qué se debe su consideración? o en qué participa en el flujo


--

5)
- En el webhook de fidelio ya no sería necesario el restaurant_nombre, dado que con  restaurant_fidelio_id lo podemos obtener de nuestra base de datos


6)
- veo que en match no se genera de forma automática?, al estar en match es necesario hacerlo manual, o solo es el panel administrativo y en la apk si se considera?


7)
- Veo que procede o permite realizar la entrega sin haber hecho match con un driver, eso no debería se debería permitir según la lógica


---
8)
- Respecto a los estilos de la app de kiosk/driver, implementar una grilla responsive para la cola de drivers.
- Trasladar el registro de driver a un widget pop-up/modal para un flujo de registro más limpio.
- Considerar soporte de tema dark/light, alineado con la web, para mejorar UX/UI.
- Revisamos lo realizado, corregimos 

Plan de implementación paso a paso (UI/UX Delivery)

Fase 1 - Grilla responsive de cola de drivers
- Ajustar la cola de drivers para vista móvil, tablet y desktop.
- Mantener consistencia visual con estilos del sistema (espaciado, tipografía y contraste).

Criterios de aceptación:
- En móvil no hay desbordes horizontales.
- En tablet y desktop se aprovecha el ancho disponible sin romper jerarquía visual.
- Estados críticos del driver se distinguen con claridad.

Estado: **Fase 1 aplicada en app Kiosk** (`mobile/apps/kiosk/app/(tabs)/index.tsx`): breakpoint 880px (columna vs fila), grilla 1–4 columnas según ancho del panel, `ScrollView` en la cola, acentos visuales ESPERANDO (ámbar) vs EN_MATCH (teal).

Fase 2 - Registro de driver en modal
- Mover el formulario de registro a modal/popup reutilizable.
- Permitir apertura/cierre controlado y confirmación de envío.

Criterios de aceptación:
- El registro puede completarse sin salir de la vista principal.
- El modal valida campos obligatorios y muestra errores claros.
- Al registrar, la cola se refresca correctamente.

Fase 3 - Soporte de tema dark/light
- Integrar dark/light theme en la app móvil Delivery con la misma lógica de la web.
- Aplicar tokens/variables de color para evitar hardcodeos.

Criterios de aceptación:
- El usuario puede alternar entre dark y light.
- El tema persiste en la sesión.
- Contraste y legibilidad cumplen en ambos temas.

Estado: **Fase 3 aplicada en app Kiosk**: hook `useKioskTheme` (`hooks/useKioskTheme.ts`) con **misma clave AsyncStorage que la web** (`refugio.theme`), paletas en `constants/kioskTheme.ts` alineadas a `index.css`, botón sol/luna en barra superior, `StatusBar` adaptativo.



9) 
Genera la guía con los comandos para realizar el build de las apk, colocando icon, y luego una guía para ditribuirlo a compañeros paso a paso, no se publicará en un store 



10)
**`yarn kiosk:web` (desde `mobile/`):** solo levanta la app **Kiosk** en el navegador (Expo web del workspace `kiosk`). No inicia Runner, ni el backend, ni el SPA del frontend: esos siguen siendo terminales/procesos aparte. Aclaración añadida en [COMMANDS.md](./COMMANDS.md) → *Aplicación móvil*.


11) 
Observaciones
- En el monorepo del runner me sale error 404 en:
http://localhost:8080/api/delivery/orders/12
- Requiero refactorizar estilos, nos guiamos del mono reporte de kiok para ello, además considerar el tema de dark/light theme
completamos la refactorización de estilos para el monorepo del runner


12)
Recomiendas en la apk de kiosk, agregamos como la sección última los pedidos entregados del día? como ux/ui,
aplicamos la funcionalidad,

13) 
solo responde,
he actualizado el "ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 1440))
",
pero obsevo que se cierre sesión cada cierto tiempo, cuál es al causa

