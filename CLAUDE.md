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
- `src/lib/email.ts` — envío vía API HTTP de Resend (fetch, sin SDK) + plantilla del correo de recuperación. Env: `RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL`.
- `src/app/actions/password-reset.ts` — `requestPasswordReset`, `resetPassword`, `saveGuestEmail`; tabla `password_resets`.
- `src/lib/rate-limit.ts` — throttle en memoria (best-effort, no Redis — no vale la pena la infra a 40 invitados) para intentos de login fallidos, 8 por `código+asiento` cada 15 min.
- `src/lib/media-storage.ts` — presigned PUT/GET S3. Cada foto = 1 "base" (`<cat>/<guestId>-<ts>-<16hex>`) → 3 keys: `<base>.jpg` (display), `<base>.thumb.jpg` (miniatura), `originals/<base>.<ext>` (original intacto). El cliente solo devuelve bases; el server valida dueño (`isOwnUploadBase`) y deriva keys/URLs.
- `src/lib/upload-queue.ts` — cola de subidas **a nivel de módulo** (sobrevive navegación client-side), XHR con progreso real por bytes, reintentos, wake lock. Barra en `components/guest/upload-progress.tsx` (root layout, `sticky`).
- `src/lib/queries.ts` — toda lectura de datos (feed, perfil, rankings, admin). `flattenFeedPhotos()` y tipo `PhotoDetail` comparten forma entre feed y perfil para `/foto/[id]`. `getPhotoIdByShareCode()` + `getPublicPost()` para el link público `/f/<code>`. `getGuestWinners()` para el modal de celebración; `getAllGuestsAdmin()` para el reset de contraseña desde admin.
- `src/app/actions/{auth,posts,admin,password-reset}.ts` — server actions. `posts.ts`: `signUploads` (firma display+miniatura+original por foto, re-firma en reintentos) y `createPost` (recibe solo bases, valida dueño — antes aceptaba key/URL del cliente y permitía publicar URLs ajenas o borrar archivos de otro invitado). `auth.ts`: `registerGuest` (primera vez, crea contraseña + correo obligatorio) y `loginGuest` (ya tiene contraseña) separados, ambos con `next` validado por `safeNext()`; `adminLogin` con rate limit por IP (`x-forwarded-for`, no global — uno global dejaría bloquear al admin real) — no existe más `completeRegistration` (era registro+re-login sin password, se reemplazó por el flujo real de abajo). `admin.ts`: `markWinner`/`unmarkWinner` (reversible), `adminDeletePhoto`, `adminResetGuestPassword`, `getPhotoDownloadUrl` (original firmado). Borrados de fotos usan `deletePhotoObjects` (display + miniatura + original).
- `src/app/(guest)/` — feed/subir/buscar/perfil, protegidas por `requireGuest()` en el layout del grupo.
- `src/app/f/[code]/` — link público de compartir (sin cuenta), ver Estado.
- `src/app/recuperar/[token]/` — crear contraseña nueva desde el link del correo.
- `src/app/foto/[id]/` — **solo con sesión** (sin sesión → `/login?next=...`). **Ruta real, no modal** (ver Gotchas) — vista de detalle de una foto, scroll-snap tipo Instagram, acepta `?ctx=feed&cat=<categoria>` o `?ctx=perfil&guestId=<id>` para reconstruir la misma lista/orden que el usuario venía viendo.
- `src/app/admin/` — protegida por `src/proxy.ts` (matcher `/admin/:path*`), password único.
- `scripts/migrate.mjs` — aplica migraciones sin prompts interactivos (ver Gotchas de DB).

## Variables de entorno

`DATABASE_URL`, `SESSION_SECRET`, `ADMIN_PASSWORD`, `AWS_MEDIA_BUCKET_NAME`, `AWS_MEDIA_REGION`, `AWS_MEDIA_ACCESS_KEY_ID`, `AWS_MEDIA_SECRET_ACCESS_KEY`, `RESEND_API_KEY`, `EMAIL_FROM` (`"Nombre <x@dominio-verificado>"`, con comillas), `APP_URL` (dominio real en prod — arma links de correo). Todas van también a Vercel prod.

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
6. **`Button` de este proyecto (shadcn base-ui) no soporta `asChild`** — usar `render={<a .../>}`. Aplica también en tarjetas-invitacion. Ojo: `<a download>` apuntando a S3 (otro origen) se ignora — la descarga del admin usa URL firmada con `Content-Disposition: attachment` (`getPhotoDownloadUrl`).
7. **`checkInvitation` ya no bloquea por cupo lleno en el paso 1 del login** — antes devolvía `status: "full"` apenas `registered.length >= maxAllowed`, lo cual tapaba el re-login de un invitado ya registrado si su invitación estaba 100% completa. El tope de cupo ahora solo se chequea en `registerGuest` (crear contraseña nueva), nunca al validar el código o al hacer login.
8. **"Olvidé mi contraseña" es por correo (Resend)** — el correo se pide al crear contraseña (`registerGuest`) y a los registrados antes se les pide con `EmailPrompt` en el layout de invitado. Desde el login (código + asiento ya elegidos) → `requestPasswordReset` manda link `/recuperar/<token>` al correo guardado (token 32 bytes, en DB solo su SHA-256, 1 h, un solo uso, rate limit 8/15 min por código+asiento). El link se arma con `APP_URL` de env, **nunca con el header Host** (host header injection → robo del token). Sin correo registrado → sigue el reset admin-mediado (`adminResetGuestPassword`). Limitación: la sesión es cookie HMAC sin versión, cambiar la contraseña NO cierra sesiones abiertas en otros dispositivos.
9. **Migración con columna `NOT NULL` en tabla con filas** — `db:generate` emite `ADD COLUMN ... NOT NULL` que falla. Editar el SQL generado ANTES de `db:migrate`: agregar nullable → `UPDATE` backfill → `SET NOT NULL` (ver `0006`, `share_code`). La DB es compartida y la misma para dev y prod: migrar acá = migrar prod.
10. **Safari/iOS no codifica WebP en canvas** — `canvas.toBlob("image/webp")` devuelve PNG; con `browser-image-compression` + `maxSizeMB` eso terminaba achicando la foto. Por eso display/miniatura son JPEG. La librería ya topa el canvas de iOS a 4096px.
11. **Progreso real de subida = XHR**, no `fetch` (fetch no expone `upload.onprogress`).

## Integración con tarjetas-invitacion

- Botón "Ir a Momentos" en `tarjetas-invitacion/src/components/invite/rsvp-form.tsx` (solo tras **confirmar** asistencia, nunca al rechazar) linkea a `${NEXT_PUBLIC_MOMENTOS_URL}/login?code=<slug>` — `/login` acá lee el param y auto-valida, el invitado no escribe nada.
- `NEXT_PUBLIC_MOMENTOS_URL` en `tarjetas-invitacion/.env.local` apunta a `http://localhost:3000` en dev — **actualizar al dominio real cuando momentos se despliegue**, y agregar la var a Vercel prod de tarjetas-invitacion en ese momento.

## Estado (2026-10-13)

**Configurado y funcional de punta a punta**: `.env.local` completo (DB compartida real, S3 real con bucket+IAM creados, `SESSION_SECRET`/`ADMIN_PASSWORD` generados). `npm run build` pasa limpio. Todas las pantallas del mockup original implementadas con datos reales.

**Login con contraseña real**: código de invitación → elegir invitado → si ese asiento ya tiene contraseña, 1 campo (login); si es la primera vez, 2 campos (crear + repetir, mín. 4 caracteres). `registerGuest`/`loginGuest` en `actions/auth.ts`, hash scrypt en `lib/auth.ts`, migración `0003` (`password_hash` nullable en `guests`). Rate limit de intentos fallidos (`lib/rate-limit.ts`). "Olvidé mi contraseña" es admin-mediado (ver Gotcha #8), no self-service.

**Reacciones**: `love` ❤️ / `fun` 😄 (romántica/divertida, exclusivas) + `like` 👍 (general, campo propio en el enum `reaction_type`, no reusa `love`). Rediseñadas: sin caja/borde, solo emoji+contador uno al lado del otro, `title` nativo como tooltip con el nombre de la reacción, botón compartir después de las reacciones (también sin caja). Al activar una reacción: el emoji "vuela" al centro de la foto y se desvanece (`ReactionBurst`, componente compartido entre `PostCard` y `PhotoScroller`) — el corazón hace loop de pulso (`animate-heart-pulse`) y la carita de wiggle (`animate-fun-wiggle`) mientras está activa. El burst de "like" usa el ícono lucide `ThumbsUp` en círculo azul (estilo Facebook), no el emoji 👍 (trae tono de piel amarillo fijo, no se puede pintar).

**Descripciones de publicación**: campo `caption` en `posts` (no en `photos`) — **1 sola descripción para todo el carrusel**, no por foto individual, máx 140 caracteres (`MAX_CAPTION_LENGTH`, `src/lib/format.ts` — sanitizado también server-side en `sanitizeCaption()`, `actions/posts.ts`). Se completa al subir (`/subir`, un solo textarea debajo de la grilla de fotos elegidas) o después vía `updateCaption(postId, caption)` server action — **solo el dueño del post puede editar**, botón lápiz visible únicamente en `/foto/[id]` cuando `viewerId === photo.guestId`; editar afecta las N fotos del carrusel a la vez (todas comparten el mismo `postId`). Se muestra estilo Instagram (**nombre en negrita, clickeable a su perfil** + descripción en la misma línea, sin cursiva) en el feed (`PostCard`, debajo del carrusel, solo lectura) y en el detalle (`PhotoScroller`, con edición inline, repetida en cada foto del carrusel). No se muestra en el grid de perfil (tiles muy chicos, igual que Instagram).

**Compartir foto**: `src/lib/share.ts` (`sharePhoto(photoId, caption)`) — `navigator.share()` nativo si está disponible (sheet del sistema, WhatsApp/Mensajes/etc.), si no copia el link al portapapeles. Link siempre `/foto/[id]?ctx=feed&cat=todas` sin importar desde dónde se comparte (feed filtrado o detalle) — `cat=todas` es a propósito, así el link no depende del filtro de quien lo mandó. **Link público `/f/<shareCode>`** (estrategia de difusión: se ve sin cuenta). `photos.share_code` aleatorio (base64url 12, migración `0006` con backfill) — NO usar `/foto/[id]` para compartir: el id es correlativo y permitiría recorrer el álbum entero. `/foto/[id]` exige sesión (sin sesión → `/login?next=...`). En `/f/<code>` sin sesión: solo esa publicación (`getPublicPost`), botón "Soy invitado · Entrar"; reaccionar o tocar un perfil manda a `/login?next=/f/<code>` y tras login/registro vuelve (`safeNext()` en `actions/auth.ts`, solo rutas internas — evita open redirect); con sesión → redirect a `/foto/[id]`. Vista previa en WhatsApp/redes vía `generateMetadata` (Open Graph con la miniatura — sin EXIF/GPS). Solo invitados confirmados pueden crear cuenta (decisión: externos solo ven). Botón en `PostCard` (feed) y `PhotoScroller` (detalle).

**Carrusel**: grid de `/perfil` = 1 tile por publicación (portada = 1ª foto, ícono `Copy` arriba a la derecha si tiene varias, estilo Instagram); el tacho borra la publicación entera (`deleteOwnPost`, confirm si >1 foto). `getGuestProfile` ordena post más nuevo primero + `position` dentro del carrusel. En `/foto/[id]` (`PhotoScroller`) cada publicación es una sección vertical; solo las fotos se deslizan en horizontal, descripción/reacciones/compartir quedan quietas y siguen a la foto activa (autor+chip de categoría en fila fija arriba de la foto, fuera del track; alto de foto topado con `100cqh` de la sección, `container-type:size` — no vh, Gotcha #2).

**Logout**: botón (ícono `LogOut`) en `/perfil` propio (solo `isOwner`), `<form action={logoutGuest}>` — server action ya existía, no se usaba en ningún lado hasta ahora.

**Admin rediseñado** (`components/admin/dashboard.tsx`): "Todas las fotos" pasó de tabla a grid de cards (`aspect-[4/5]`, foto grande, overlay con autor/categoría/reacciones) — click abre `Dialog` con la foto completa (`object-contain`, sin recortar), botón **descargar original** (archivo intacto del celular vía URL firmada; fotos previas a guardar originales bajan la versión display) y eliminar. Filtros combinables por autor + categoría + orden (siempre descendente sobre la reacción elegida — ej. categoría=romántica + orden=♡, o autor=X + orden=☺). Borrar foto pide confirmación (`window.confirm`) en card y modal. "Marcar ganadora" es **reversible**: click de nuevo (hover → "Quitar", ícono X rojo) llama `unmarkWinner`, borra la fila de `winners`. Sección nueva "Invitados" con botón "Resetear" contraseña por invitado (confirm + `adminResetGuestPassword`).

**Celebración de ganador** (`components/guest/winner-celebration.tsx`): al entrar el invitado, si una foto suya fue marcada ganadora, modal con confeti (`canvas-confetti`) + trofeo + thumbnail. Se muestra una vez por `photoId:markedAt` (no solo `photoId`) guardado en `localStorage` del navegador del invitado — la key compuesta con `markedAt` hace que si el admin desmarca y vuelve a marcar la misma foto ganadora, el modal se vea de nuevo solo (sin sincronizar ningún borrado activo entre admin e invitado, que son sesiones/dispositivos distintos).

**Subida con original (estilo Instagram)**: `/subir` prepara en el navegador display JPEG 2048px q0.85 + miniatura JPEG 640px (JPEG, no WebP: Safari/iOS no codifica WebP en canvas → caía a PNG y la librería achicaba la foto). Al publicar se encola y el invitado sigue navegando; barra arriba con % real (bytes de las 3 versiones), aviso de no cerrar/bloquear. El post se crea (`createPost`) **recién cuando el original llegó a S3** — nunca hay post sin original. Error → botón reintentar (re-firma con los mismos bases, no re-sube lo ya subido). iPhone: `accept="image/*"` hace que iOS entregue JPEG a resolución completa (no HEIC) — compatible con redes/Windows; HEIC igual se acepta si llega. Admin descarga el original vía URL firmada con `Content-Disposition: attachment` (`getPhotoDownloadUrl`). Grids (perfil, admin, ranking) usan `thumbUrl` (fallback a `url` en fotos previas). Migración `0005` (`thumb_key`, `thumb_url`, `original_key` nullable).

**Pendiente**:
- Cargar `RESEND_API_KEY`, `EMAIL_FROM` y `APP_URL` (dev en `.env.local`, prod en Vercel) y probar el correo de recuperación real.
- `ADMIN_PASSWORD` actual es adivinable — cambiar por uno aleatorio antes de prod.
- Probar subida real desde iPhone (Safari) con fotos 24/48 MP: tiempo de preparación, barra, bloqueo de pantalla a mitad de subida.
- El bucket es de lectura pública entera, incluido `originals/` (EXIF con GPS). Keys no adivinables (16 hex) y nunca expuestas a invitados, pero se podría hacer privado `originals/*` en la bucket policy (requiere el user admin de AWS).
- `CacheControl` firmado en el PUT no se guarda en S3 (el cliente no manda el header) — las fotos se sirven sin `Cache-Control`. Menor.
- Probar el flujo real con una invitación `confirmed` de verdad en la DB (no probado end-to-end con datos reales todavía).
- Borrar el IAM user `momentos-admin` (AdministratorAccess, usado solo para provisionar el bucket) — ya cumplió su propósito.
- Actualizar la regla CORS `PUT` del bucket S3 (hoy apunta a un placeholder `.vercel.app`) cuando se sepa el dominio real de deploy.
- Deploy a Vercel — no hecho todavía. Node 24 ya fijado.
- Probar vista previa del link `/f/<code>` en WhatsApp real (solo posible ya desplegado).
- Cambiar contraseña no cierra sesiones abiertas (cookie HMAC sin versión) — agregar si importa.
- Actualizar `NEXT_PUBLIC_MOMENTOS_URL` en tarjetas-invitacion (dev y prod) cuando eso pase.
