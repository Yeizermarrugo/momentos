import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  pgEnum,
  unique,
} from "drizzle-orm/pg-core";

export const categoryEnum = pgEnum("category", ["romantica", "divertida", "general"]);
// "like" es la reacción de fotos categoría general — campo propio en vez
// de reusar "love", para que el admin pueda rankear generales por like sin
// mezclarlas con las reacciones de fotos románticas.
export const reactionTypeEnum = pgEnum("reaction_type", ["love", "fun", "like"]);
export const winnerCategoryEnum = pgEnum("winner_category", ["romantica", "divertida"]);

// Un invitado registrado — el código de invitación se valida contra la API
// de tarjetas-invitacion en el momento del registro, no se duplica la tabla
// `invitations` acá. seatIndex distingue a las 2 personas de un mismo código
// con seats=2 (cada una elige su nombre real al registrarse).
export const guests = pgTable(
  "guests",
  {
    id: serial("id").primaryKey(),
    invitationCode: text("invitation_code").notNull(),
    seatIndex: integer("seat_index").notNull().default(1),
    name: text("name").notNull(),
    // Hash de contraseña (scrypt, ver src/lib/auth.ts). Nullable: filas
    // legacy de pruebas pre-login-con-contraseña quedan sin setear hasta
    // que ese invitado pase por el flujo de "crear contraseña" una vez más.
    passwordHash: text("password_hash"),
    // Usuario del login (correo + contraseña) y canal para recuperarla (ver
    // actions/password-reset.ts). Único — cada persona su propio correo,
    // siempre en minúsculas (normalizeEmail). Nullable: invitados
    // registrados antes de pedir correo — lo vinculan desde "Crear cuenta"
    // con su código + contraseña actual (linkLegacyGuest), o con EmailPrompt
    // si ya tienen sesión abierta.
    email: text("email"),
    tableLabel: text("table_label"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("guests_code_seat_unique").on(t.invitationCode, t.seatIndex),
    unique("guests_email_unique").on(t.email),
  ]
);

// Una publicación = 1+ fotos (carrusel si hay varias, hasta MAX_PHOTOS_PER_POST
// en actions/posts.ts). La categoría y la descripción viven en el post, no
// por foto individual — 1 sola descripción para todo el carrusel (coincide
// con el mockup: Subir elige 1 categoría y 1 descripción por publicación).
export const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  guestId: integer("guest_id")
    .notNull()
    .references(() => guests.id, { onDelete: "cascade" }),
  category: categoryEnum("category").notNull(),
  // Límite de caracteres aplicado en la app (MAX_CAPTION_LENGTH en
  // src/lib/format.ts), no acá en el schema.
  caption: text("caption"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const photos = pgTable("photos", {
  id: serial("id").primaryKey(),
  postId: integer("post_id")
    .notNull()
    .references(() => posts.id, { onDelete: "cascade" }),
  // Versión para mostrar (JPEG ~2048px) — feed, detalle, modal de admin.
  s3Key: text("s3_key").notNull(),
  url: text("url").notNull(),
  // Miniatura (~640px) para grids (perfil, admin). Nullable: fotos previas
  // a la miniatura caen a `url`.
  thumbKey: text("thumb_key"),
  thumbUrl: text("thumb_url"),
  // Archivo original tal cual salió del celular (sin recomprimir) — solo lo
  // descarga el admin, nunca se muestra en la app. Nullable por fotos previas.
  originalKey: text("original_key"),
  // Código aleatorio para el link público de compartir (/f/<code>) — el id
  // es correlativo y permitiría recorrer todo el álbum sin cuenta.
  shareCode: text("share_code").notNull().unique(),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Link de "olvidé mi contraseña": se guarda solo el hash SHA-256 del token
// (el token en claro viaja únicamente en el correo). Un solo uso, vence en
// 1 hora.
export const passwordResets = pgTable("password_resets", {
  id: serial("id").primaryKey(),
  guestId: integer("guest_id")
    .notNull()
    .references(() => guests.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Reacción exclusiva por foto: 1 fila por (photo, guest) — cambiar de love a
// fun es un update de `type`, no una fila nueva. El toggle "quitar reacción"
// borra la fila.
export const reactions = pgTable(
  "reactions",
  {
    id: serial("id").primaryKey(),
    photoId: integer("photo_id")
      .notNull()
      .references(() => photos.id, { onDelete: "cascade" }),
    guestId: integer("guest_id")
      .notNull()
      .references(() => guests.id, { onDelete: "cascade" }),
    type: reactionTypeEnum("type").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("reactions_photo_guest_unique").on(t.photoId, t.guestId)]
);

// 1 ganadora por categoría (romántica / divertida) — el admin la marca desde
// el ranking. Upsert por categoría (unique constraint) para que "marcar
// ganadora" en otra foto simplemente reemplace a la anterior.
export const winners = pgTable(
  "winners",
  {
    id: serial("id").primaryKey(),
    category: winnerCategoryEnum("category").notNull(),
    photoId: integer("photo_id")
      .notNull()
      .references(() => photos.id, { onDelete: "cascade" }),
    markedAt: timestamp("marked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("winners_category_unique").on(t.category)]
);

export type Guest = typeof guests.$inferSelect;
export type NewGuest = typeof guests.$inferInsert;
export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;
export type Photo = typeof photos.$inferSelect;
export type NewPhoto = typeof photos.$inferInsert;
export type Reaction = typeof reactions.$inferSelect;
export type NewReaction = typeof reactions.$inferInsert;
export type Winner = typeof winners.$inferSelect;
