@AGENTS.md

# momentos

App de fotos para la boda de Yeizer & Diana (10 dic 2026) — "Momentos". Invitados suben fotos en 3 categorías (romántica/divertida/general), reaccionan, y el admin elige ganadora por categoría premiada. Next.js 16 App Router + Tailwind 4 + shadcn/ui (base-ui, no Radix) + Drizzle ORM — mismo stack que el proyecto hermano `../tarjetas-invitacion` (invitación digital de la misma boda), con el que **comparte la misma base de datos Neon Postgres** (no son proyectos Neon separados).

## Stack y por qué

- **DB**: Postgres compartido con tarjetas-invitacion (mismo `DATABASE_URL`). Decisión explícita del usuario — momentos consulta la tabla `invitations` de esa app directo por SQL, sin API HTTP intermedia (hubo una versión con endpoint HTTP + secreto compartido, se descartó a favor de DB compartida).
- **Storage**: S3 bucket dedicado `momentos-yd-media` (`us-east-1`, mismo AWS account que `viralgen`, IAM user propio `momentos-media` con policy mínima — no reusa `remotion-user`). Subida directa navegador→S3 vía presigned URL (evita el límite de body de Vercel Hobby).
- **Hosting objetivo**: Vercel free (Hobby) — evaluado explícitamente contra AWS EC2, gana por costo y cero ops a esta escala (40 invitados).
- **DB relacional, no NoSQL**: justificado por reacciones exclusivas (constraint único) y rankings por agregación SQL directa.

## Estructura

- `src/db/schema.ts` — `guests` (código+seatIndex único, `passwordHash` nullable — ver login abajo), `posts` (categoría + `caption` por publicación — 1 sola descripción para todo el carrusel, máx `MAX_CAPTION_LENGTH`=140 chars, ver `src/lib/format.ts`), `photos` (carrusel, orden por `position`, hasta `MAX_PHOTOS_PER_POST`=10 por publicación, ver `actions/posts.ts`), `reactions` (exclusiva por foto, tipo `love|fun|like`), `winners` (1 por categoría premiada, `romantica|divertida` — `general` NO tiene premio, solo ranking).
- `src/lib/invitations.ts` — `checkInvitation(code)` lee `invitations` de tarjetas-invitacion con SQL crudo (NO está en `schema.ts` — a propósito, así `drizzle-kit` de acá nunca la gestiona). Solo entra quien **confirmó** RSVP (`rsvp_status='confirmed'`); tope de registro es `rsvp_attendees`, no `seats`. Devuelve `seatsWithPassword` (no solo `takenSeatIndexes`) para que el cliente sepa si un asiento ya registrado necesita login o "crear contraseña".
- `src/lib/auth.ts` / `src/lib/session.ts` — sesión invitado (cookie HMAC, 30 días) **con contraseña** (`hashPassword`/`verifyPassword`, scrypt + salt propio, sin dependencia externa) y admin (cookie separada, password único vía env), sin sistema de cuentas real (no hay email).
- `src/lib/rate-limit.ts` — throttle en memoria (best-effort, no Redis — no vale la pena la infra a 40 invitados) para intentos de login fallidos, 8 por `código+asiento` cada 15 min.
- `src/lib/media-storage.ts` — `createUploadUrl()` presigned PUT S3.
- `src/lib/queries.ts` — toda lectura de datos (feed, perfil, rankings, admin). `flattenFeedPhotos()` y tipo `PhotoDetail` comparten forma entre feed y perfil para `/foto/[id]`. `getGuestWinners()` para el modal de celebración; `getAllGuestsAdmin()` para el reset de contraseña desde admin.
- `src/app/actions/{auth,posts,admin}.ts` — server actions. `auth.ts`: `registerGuest` (primera vez, crea contraseña) y `loginGuest` (ya tiene contraseña) separados — no existe más `completeRegistration` (era registro+re-login sin password, se reemplazó por el flujo real de abajo). `admin.ts`: `markWinner`/`unmarkWinner` (reversible), `adminDeletePhoto`, `adminResetGuestPassword`.
- `src/app/(guest)/` — feed/subir/buscar/perfil, protegidas por `requireGuest()` en el layout del grupo.
- `src/app/foto/[id]/` — **ruta real, no modal** (ver Gotchas) — vista de detalle de una foto, scroll-snap tipo Instagram, acepta `?ctx=feed&cat=<categoria>` o `?ctx=perfil&guestId=<id>` para reconstruir la misma lista/orden que el usuario venía viendo.
- `src/app/admin/` — protegida por `src/proxy.ts` (matcher `/admin/:path*`), password único.
- `scripts/migrate.mjs` — aplica migraciones sin prompts interactivos (ver Gotchas de DB).

## Comandos

- Node **24** (`.nvmrc` + `engines` en package.json) — Node 20 deprecado en Vercel desde 2026-10-01. Local: `nvm use`.
- `npm run dev` / `build` / `start` / `lint`
- `npm run db:generate` — genera SQL de migración (diffea contra snapshots locales, NO toca la DB)
- `npm run db:migrate` — aplica migraciones pendientes (`scripts/migrate.mjs`, no interactivo)
- `npm run db:studio` — Drizzle Studio

## Gotchas (leer antes de tocar de nuevo)

1. **`drizzle-kit push` no funciona en este entorno** — sin TTY, y además choca con los enums de `invitations` (tabla ajena) al introspectar la DB compartida, pidiendo resolver conflictos por prompt interactivo. Usar siempre `db:generate` + `db:migrate`.
2. **Nunca usar `fixed` + unidades de viewport (`svh`/`dvh`/`vh`) juntos** en overlays — el usuario previsualiza en un simulador de teléfono con `transform: scale()`, y un ancestro con `transform` se vuelve el containing block de `position: fixed` (por spec CSS), mientras que las unidades de viewport se calculan contra el viewport real del navegador, no contra el marco escalado. Resultado: contenido `fixed` con `h-svh` queda más alto que el marco visible, se asoma contenido de al lado. Por esto el visor de foto **es una ruta real** (`/foto/[id]`, scroll de documento normal, nada `fixed`), no un modal/portal — se intentó como modal primero, el bug persistió pese a varios fixes, se cortó por lo sano.
3. **`object-contain` + overlay `absolute` posicionado contra el contenedor grande (no contra la imagen)** deja el overlay flotando en el hueco vacío (letterbox) cuando la foto no calza con el aspect ratio del contenedor. Fix aplicado en `photo-scroller.tsx`: el overlay vive en un wrapper que se ajusta al tamaño REAL de la imagen renderizada (`max-h-full max-w-full` en un div sin `flex-1`, que se encoge al tamaño intrínseco de su `<img>` hijo), no al recuadro completo.
4. **Foto + botones deben centrarse como un solo grupo** (`flex-col items-center justify-center`) — si los botones están fuera de ese bloque, quedan pegados al borde de la pantalla en vez de justo debajo de la foto, sin importar el alto real de la imagen.
5. **`/admin` necesita `export const dynamic = "force-dynamic"`** — sin `cookies()`/`headers()` en la página (la protección vive en el proxy), Next la prerenderiza estática en build y hornea datos viejos para siempre.
6. **`Button` de este proyecto (shadcn base-ui) no soporta `asChild`** — usar `render={<a .../>}`. Aplica también en tarjetas-invitacion. Mismo patrón usado para el link de descarga en el modal de admin (`<a href={url} download>` envuelto en `Button`).
7. **`checkInvitation` ya no bloquea por cupo lleno en el paso 1 del login** — antes devolvía `status: "full"` apenas `registered.length >= maxAllowed`, lo cual tapaba el re-login de un invitado ya registrado si su invitación estaba 100% completa. El tope de cupo ahora solo se chequea en `registerGuest` (crear contraseña nueva), nunca al validar el código o al hacer login.
8. **El "olvidé mi contraseña" es admin-mediado, no self-service** — no hay email/SMS en la app (solo código de invitación), así que no hay canal para verificar identidad y mandar un link de reset. El admin resetea desde `/admin` (`adminResetGuestPassword`, pone `passwordHash=null`) y el invitado vuelve a pasar por "crear contraseña" en su próximo login. No inventar un flujo self-service sin resolver primero de dónde sale el canal de verificación.

## Integración con tarjetas-invitacion

- Botón "Ir a Momentos" en `tarjetas-invitacion/src/components/invite/rsvp-form.tsx` (solo tras **confirmar** asistencia, nunca al rechazar) linkea a `${NEXT_PUBLIC_MOMENTOS_URL}/login?code=<slug>` — `/login` acá lee el param y auto-valida, el invitado no escribe nada.
- `NEXT_PUBLIC_MOMENTOS_URL` en `tarjetas-invitacion/.env.local` apunta a `http://localhost:3000` en dev — **actualizar al dominio real cuando momentos se despliegue**, y agregar la var a Vercel prod de tarjetas-invitacion en ese momento.

## Estado (2026-09-11)

**Configurado y funcional de punta a punta**: `.env.local` completo (DB compartida real, S3 real con bucket+IAM creados, `SESSION_SECRET`/`ADMIN_PASSWORD` generados). `npm run build` pasa limpio. Todas las pantallas del mockup original implementadas con datos reales.

**Login con contraseña real**: código de invitación → elegir invitado → si ese asiento ya tiene contraseña, 1 campo (login); si es la primera vez, 2 campos (crear + repetir, mín. 4 caracteres). `registerGuest`/`loginGuest` en `actions/auth.ts`, hash scrypt en `lib/auth.ts`, migración `0003` (`password_hash` nullable en `guests`). Rate limit de intentos fallidos (`lib/rate-limit.ts`). "Olvidé mi contraseña" es admin-mediado (ver Gotcha #8), no self-service.

**Reacciones**: `love` ❤️ / `fun` 😄 (romántica/divertida, exclusivas) + `like` 👍 (general, campo propio en el enum `reaction_type`, no reusa `love`). Rediseñadas: sin caja/borde, solo emoji+contador uno al lado del otro, `title` nativo como tooltip con el nombre de la reacción, botón compartir después de las reacciones (también sin caja). Al activar una reacción: el emoji "vuela" al centro de la foto y se desvanece (`ReactionBurst`, componente compartido entre `PostCard` y `PhotoScroller`) — el corazón hace loop de pulso (`animate-heart-pulse`) y la carita de wiggle (`animate-fun-wiggle`) mientras está activa. El burst de "like" usa el ícono lucide `ThumbsUp` en círculo azul (estilo Facebook), no el emoji 👍 (trae tono de piel amarillo fijo, no se puede pintar).

**Descripciones de publicación**: campo `caption` en `posts` (no en `photos`) — **1 sola descripción para todo el carrusel**, no por foto individual, máx 140 caracteres (`MAX_CAPTION_LENGTH`, `src/lib/format.ts` — sanitizado también server-side en `sanitizeCaption()`, `actions/posts.ts`). Se completa al subir (`/subir`, un solo textarea debajo de la grilla de fotos elegidas) o después vía `updateCaption(postId, caption)` server action — **solo el dueño del post puede editar**, botón lápiz visible únicamente en `/foto/[id]` cuando `viewerId === photo.guestId`; editar afecta las N fotos del carrusel a la vez (todas comparten el mismo `postId`). Se muestra estilo Instagram (**nombre en negrita, clickeable a su perfil** + descripción en la misma línea, sin cursiva) en el feed (`PostCard`, debajo del carrusel, solo lectura) y en el detalle (`PhotoScroller`, con edición inline, repetida en cada foto del carrusel). No se muestra en el grid de perfil (tiles muy chicos, igual que Instagram).

**Compartir foto**: `src/lib/share.ts` (`sharePhoto(photoId, caption)`) — `navigator.share()` nativo si está disponible (sheet del sistema, WhatsApp/Mensajes/etc.), si no copia el link al portapapeles. Link siempre `/foto/[id]?ctx=feed&cat=todas` sin importar desde dónde se comparte (feed filtrado o detalle) — `cat=todas` es a propósito, así el link no depende del filtro de quien lo mandó. Quien lo recibe, si ya tiene su propia sesión de invitado activa, entra directo a esa foto (`requireGuest()` en `/foto/[id]` solo bloquea si NO hay sesión — no hay redirect-back post-login todavía, si alguien sin sesión abre el link cae en `/login` liso). Botón en `PostCard` (feed) y `PhotoScroller` (detalle).

**Carrusel**: grid de `/perfil` = 1 tile por publicación (portada = 1ª foto, ícono `Copy` arriba a la derecha si tiene varias, estilo Instagram); el tacho borra la publicación entera (`deleteOwnPost`, confirm si >1 foto). `getGuestProfile` ordena post más nuevo primero + `position` dentro del carrusel. En `/foto/[id]` (`PhotoScroller`) cada publicación es una sección vertical; solo las fotos se deslizan en horizontal, descripción/reacciones/compartir quedan quietas y siguen a la foto activa (autor+chip de categoría en fila fija arriba de la foto, fuera del track; alto de foto topado con `100cqh` de la sección, `container-type:size` — no vh, Gotcha #2).

**Logout**: botón (ícono `LogOut`) en `/perfil` propio (solo `isOwner`), `<form action={logoutGuest}>` — server action ya existía, no se usaba en ningún lado hasta ahora.

**Admin rediseñado** (`components/admin/dashboard.tsx`): "Todas las fotos" pasó de tabla a grid de cards (`aspect-[4/5]`, foto grande, overlay con autor/categoría/reacciones) — click abre `Dialog` con la foto completa (`object-contain`, sin recortar), botón **descargar original** (`<a download>`, calidad = la misma que ya se sirve, no hay pipeline de recompresión server-side) y eliminar. Filtros combinables por autor + categoría + orden (siempre descendente sobre la reacción elegida — ej. categoría=romántica + orden=♡, o autor=X + orden=☺). Borrar foto pide confirmación (`window.confirm`) en card y modal. "Marcar ganadora" es **reversible**: click de nuevo (hover → "Quitar", ícono X rojo) llama `unmarkWinner`, borra la fila de `winners`. Sección nueva "Invitados" con botón "Resetear" contraseña por invitado (confirm + `adminResetGuestPassword`).

**Celebración de ganador** (`components/guest/winner-celebration.tsx`): al entrar el invitado, si una foto suya fue marcada ganadora, modal con confeti (`canvas-confetti`) + trofeo + thumbnail. Se muestra una vez por `photoId:markedAt` (no solo `photoId`) guardado en `localStorage` del navegador del invitado — la key compuesta con `markedAt` hace que si el admin desmarca y vuelve a marcar la misma foto ganadora, el modal se vea de nuevo solo (sin sincronizar ningún borrado activo entre admin e invitado, que son sesiones/dispositivos distintos).

**Pendiente**:
- Probar el flujo real con una invitación `confirmed` de verdad en la DB (no probado end-to-end con datos reales todavía).
- Probar la compresión WebP (`browser-image-compression`, `subir/page.tsx`) con fotos pesadas reales de celular (12+ MP) — revisada la lógica, se ve sana, pero no se pudo probar en un browser real en esta sesión.
- Borrar el IAM user `momentos-admin` (AdministratorAccess, usado solo para provisionar el bucket) — ya cumplió su propósito.
- Actualizar la regla CORS `PUT` del bucket S3 (hoy apunta a un placeholder `.vercel.app`) cuando se sepa el dominio real de deploy.
- Deploy a Vercel — no hecho todavía.
- Actualizar `NEXT_PUBLIC_MOMENTOS_URL` en tarjetas-invitacion (dev y prod) cuando eso pase.
