import { desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { guests, posts, photos, reactions, winners } from "@/db/schema";
import type { Guest } from "@/db/schema";

export function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

type PhotoWithReactions = {
  id: number;
  url: string;
  shareCode: string;
  s3Key: string;
  position: number;
  loveCount: number;
  funCount: number;
  likeCount: number;
  viewerReaction: "love" | "fun" | "like" | null;
};

// Foto "plana" con todo lo que la vista de detalle (/foto/[id]) necesita
// para renderizar cualquier foto sin importar si vino del feed o de un
// perfil — ver flattenFeedPhotos() y getGuestProfile().
export type PhotoDetail = {
  id: number;
  url: string;
  shareCode: string;
  postId: number;
  caption: string | null;
  loveCount: number;
  funCount: number;
  likeCount: number;
  viewerReaction: "love" | "fun" | "like" | null;
  guestId: number;
  guestName: string;
  guestInitials: string;
  category: "romantica" | "divertida" | "general";
  createdAt: Date;
};

// Mismo orden en que se ven en el feed (post por post, fotos del carrusel
// en su orden) — usado tanto por /foto/[id] (ctx=feed) para saber "la
// siguiente foto" como antes lo hacía el feed en el cliente.
export function flattenFeedPhotos(posts: FeedPost[]): PhotoDetail[] {
  return posts.flatMap((post) =>
    post.photos.map((photo) => ({
      id: photo.id,
      url: photo.url,
      shareCode: photo.shareCode,
      postId: post.id,
      caption: post.caption,
      loveCount: photo.loveCount,
      funCount: photo.funCount,
      likeCount: photo.likeCount,
      viewerReaction: photo.viewerReaction,
      guestId: post.guest.id,
      guestName: post.guest.name,
      guestInitials: post.guest.initials,
      category: post.category,
      createdAt: post.createdAt,
    }))
  );
}

export type FeedPost = {
  id: number;
  category: "romantica" | "divertida" | "general";
  caption: string | null;
  createdAt: Date;
  guest: { id: number; name: string; tableLabel: string | null; initials: string };
  photos: PhotoWithReactions[];
};

// Feed único ordenado por fecha, mezclado — el filtro por categoría se
// aplica en el cliente sobre este mismo listado (igual que el mockup).
export async function getFeedPosts(viewerGuestId: number | null): Promise<FeedPost[]> {
  const db = getDb();

  const postRows = await db.select().from(posts).orderBy(desc(posts.createdAt)).limit(200);
  if (postRows.length === 0) return [];

  const postIds = postRows.map((p) => p.id);
  const guestIds = [...new Set(postRows.map((p) => p.guestId))];

  const [guestRows, photoRows] = await Promise.all([
    db.select().from(guests).where(inArray(guests.id, guestIds)),
    db.select().from(photos).where(inArray(photos.postId, postIds)).orderBy(photos.position),
  ]);

  const photoIds = photoRows.map((ph) => ph.id);
  const reactionRows = photoIds.length
    ? await db.select().from(reactions).where(inArray(reactions.photoId, photoIds))
    : [];

  const guestById = new Map(guestRows.map((g) => [g.id, g]));

  const reactionsByPhoto = new Map<
    number,
    { love: number; fun: number; like: number; viewer: "love" | "fun" | "like" | null }
  >();
  for (const r of reactionRows) {
    const entry = reactionsByPhoto.get(r.photoId) ?? { love: 0, fun: 0, like: 0, viewer: null };
    if (r.type === "love") entry.love++;
    else if (r.type === "fun") entry.fun++;
    else entry.like++;
    if (viewerGuestId && r.guestId === viewerGuestId) entry.viewer = r.type;
    reactionsByPhoto.set(r.photoId, entry);
  }

  const photosByPost = new Map<number, PhotoWithReactions[]>();
  for (const ph of photoRows) {
    const counts = reactionsByPhoto.get(ph.id) ?? { love: 0, fun: 0, like: 0, viewer: null };
    const list = photosByPost.get(ph.postId) ?? [];
    list.push({
      id: ph.id,
      url: ph.url,
      shareCode: ph.shareCode,
      s3Key: ph.s3Key,
      position: ph.position,
      loveCount: counts.love,
      funCount: counts.fun,
      likeCount: counts.like,
      viewerReaction: counts.viewer,
    });
    photosByPost.set(ph.postId, list);
  }

  return postRows
    .map((p) => {
      const guest = guestById.get(p.guestId);
      if (!guest) return null;
      return {
        id: p.id,
        category: p.category,
        caption: p.caption,
        createdAt: p.createdAt,
        guest: { id: guest.id, name: guest.name, tableLabel: guest.tableLabel, initials: initials(guest.name) },
        photos: photosByPost.get(p.id) ?? [],
      };
    })
    .filter((p): p is FeedPost => p !== null && p.photos.length > 0);
}

export async function searchGuests(query: string) {
  const db = getDb();
  const rows = await db
    .select({
      id: guests.id,
      name: guests.name,
      tableLabel: guests.tableLabel,
    })
    .from(guests)
    .where(query ? sql`${guests.name} ilike ${"%" + query + "%"}` : sql`true`)
    .orderBy(guests.name)
    .limit(100);

  const guestIds = rows.map((g) => g.id);
  if (guestIds.length === 0) return [];

  const postRows = await db
    .select({ id: posts.id, guestId: posts.guestId })
    .from(posts)
    .where(inArray(posts.guestId, guestIds));
  const postIds = postRows.map((p) => p.id);
  const postCountByGuest = new Map<number, number>();
  for (const p of postRows) postCountByGuest.set(p.guestId, (postCountByGuest.get(p.guestId) ?? 0) + 1);

  const photoCountByPost = postIds.length
    ? await db
        .select({ postId: photos.postId, n: sql<number>`count(*)`.as("n") })
        .from(photos)
        .where(inArray(photos.postId, postIds))
        .groupBy(photos.postId)
    : [];
  const photoCountByPostMap = new Map(photoCountByPost.map((r) => [r.postId, Number(r.n)]));
  const photoCountByGuest = new Map<number, number>();
  for (const p of postRows) {
    const n = photoCountByPostMap.get(p.id) ?? 0;
    photoCountByGuest.set(p.guestId, (photoCountByGuest.get(p.guestId) ?? 0) + n);
  }

  return rows.map((g) => ({
    ...g,
    initials: initials(g.name),
    postCount: postCountByGuest.get(g.id) ?? 0,
    photoCount: photoCountByGuest.get(g.id) ?? 0,
  }));
}

export type ProfilePhoto = {
  id: number;
  url: string;
  shareCode: string;
  // Miniatura para el grid del perfil (fallback a `url` en fotos previas).
  thumbUrl: string;
  s3Key: string;
  category: "romantica" | "divertida" | "general";
  postId: number;
  createdAt: Date;
  caption: string | null;
  loveCount: number;
  funCount: number;
  likeCount: number;
  viewerReaction: "love" | "fun" | "like" | null;
};

export async function getGuestProfile(
  guestId: number,
  viewerGuestId: number | null
): Promise<{
  guest: Guest;
  photos: ProfilePhoto[];
  loveReceived: number;
  funReceived: number;
} | null> {
  const db = getDb();
  const [guest] = await db.select().from(guests).where(eq(guests.id, guestId)).limit(1);
  if (!guest) return null;

  const postRows = await db.select().from(posts).where(eq(posts.guestId, guestId));
  const postIds = postRows.map((p) => p.id);
  const categoryByPost = new Map(postRows.map((p) => [p.id, p.category]));
  const captionByPost = new Map(postRows.map((p) => [p.id, p.caption]));

  // Publicación más nueva primero, fotos de cada carrusel juntas y en su
  // orden (`position`) — el grid agrupa por post y /foto/[id] arma el
  // carrusel con este mismo orden.
  const postOrder = new Map(
    [...postRows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).map((p, i) => [p.id, i])
  );
  const photoRows = postIds.length
    ? (await db.select().from(photos).where(inArray(photos.postId, postIds))).sort(
        (a, b) => postOrder.get(a.postId)! - postOrder.get(b.postId)! || a.position - b.position
      )
    : [];
  const photoIds = photoRows.map((ph) => ph.id);

  const reactionRows = photoIds.length
    ? await db.select().from(reactions).where(inArray(reactions.photoId, photoIds))
    : [];

  const reactionsByPhoto = new Map<
    number,
    { love: number; fun: number; like: number; viewer: "love" | "fun" | "like" | null }
  >();
  let loveReceived = 0;
  let funReceived = 0;
  for (const r of reactionRows) {
    const entry = reactionsByPhoto.get(r.photoId) ?? { love: 0, fun: 0, like: 0, viewer: null };
    if (r.type === "love") {
      entry.love++;
      loveReceived++;
    } else if (r.type === "fun") {
      entry.fun++;
      funReceived++;
    } else {
      entry.like++;
    }
    if (viewerGuestId && r.guestId === viewerGuestId) entry.viewer = r.type;
    reactionsByPhoto.set(r.photoId, entry);
  }

  return {
    guest,
    photos: photoRows.map((ph) => {
      const counts = reactionsByPhoto.get(ph.id) ?? { love: 0, fun: 0, like: 0, viewer: null };
      return {
        id: ph.id,
        url: ph.url,
        shareCode: ph.shareCode,
        thumbUrl: ph.thumbUrl ?? ph.url,
        s3Key: ph.s3Key,
        postId: ph.postId,
        category: categoryByPost.get(ph.postId) ?? "general",
        createdAt: ph.createdAt,
        caption: captionByPost.get(ph.postId) ?? null,
        loveCount: counts.love,
        funCount: counts.fun,
        likeCount: counts.like,
        viewerReaction: counts.viewer,
      };
    }),
    loveReceived,
    funReceived,
  };
}

type RankRow = {
  photoId: number;
  url: string;
  count: number;
  guest: { id: number; name: string; tableLabel: string | null };
};

export async function getRankings(): Promise<{
  romantica: RankRow[];
  divertida: RankRow[];
  general: RankRow[];
  winners: { romantica: number | null; divertida: number | null };
}> {
  const db = getDb();

  async function topFor(category: "romantica" | "divertida" | "general", type: "love" | "fun" | "like") {
    const rows = await db
      .select({
        photoId: photos.id,
        // Tile de 44px en el ranking — miniatura alcanza (fallback a display).
        url: sql<string>`coalesce(${photos.thumbUrl}, ${photos.url})`,
        guestId: posts.guestId,
        count: sql<number>`count(${reactions.id})`.as("count"),
      })
      .from(photos)
      .innerJoin(posts, eq(photos.postId, posts.id))
      .leftJoin(reactions, sql`${reactions.photoId} = ${photos.id} and ${reactions.type} = ${type}`)
      .where(eq(posts.category, category))
      .groupBy(photos.id, photos.url, photos.thumbUrl, posts.guestId)
      .orderBy(desc(sql`count`))
      .limit(10);

    const guestIds = [...new Set(rows.map((r) => r.guestId))];
    const guestRows = guestIds.length
      ? await db.select().from(guests).where(inArray(guests.id, guestIds))
      : [];
    const guestById = new Map(guestRows.map((g) => [g.id, g]));

    return rows.map((r) => ({
      photoId: r.photoId,
      url: r.url,
      count: Number(r.count),
      guest: {
        id: r.guestId,
        name: guestById.get(r.guestId)?.name ?? "—",
        tableLabel: guestById.get(r.guestId)?.tableLabel ?? null,
      },
    }));
  }

  const [romantica, divertida, general, winnerRows] = await Promise.all([
    topFor("romantica", "love"),
    topFor("divertida", "fun"),
    topFor("general", "like"),
    db.select().from(winners),
  ]);

  const winnerByCategory: { romantica: number | null; divertida: number | null } = {
    romantica: null,
    divertida: null,
  };
  for (const w of winnerRows) winnerByCategory[w.category] = w.photoId;

  return { romantica, divertida, general, winners: winnerByCategory };
}

export type GuestWinner = {
  category: "romantica" | "divertida";
  photoId: number;
  url: string;
  markedAt: Date;
};

// Fotos ganadoras que le pertenecen a este invitado — para la celebración
// con confeti en su feed (ver WinnerCelebration). Normalmente 0-2 filas
// (una por categoría premiada). markedAt viaja para que el "ya lo vi" en
// localStorage se pueda invalidar solo: si el admin desmarca y vuelve a
// marcar la misma foto ganadora, markedAt cambia y el modal se ve de nuevo
// sin tener que sincronizar un borrado activo entre admin y el invitado.
export async function getGuestWinners(guestId: number): Promise<GuestWinner[]> {
  const db = getDb();
  const rows = await db
    .select({ category: winners.category, photoId: winners.photoId, url: photos.url, markedAt: winners.markedAt })
    .from(winners)
    .innerJoin(photos, eq(winners.photoId, photos.id))
    .innerJoin(posts, eq(photos.postId, posts.id))
    .where(eq(posts.guestId, guestId));

  return rows;
}

export type AdminGuestRow = {
  id: number;
  name: string;
  tableLabel: string | null;
  invitationCode: string;
  seatIndex: number;
  hasPassword: boolean;
  email: string | null;
};

// Invitados registrados — el admin puede resetear la contraseña de alguien
// sin correo registrado (los que tienen correo se recuperan solos, ver
// actions/password-reset.ts).
export async function getAllGuestsAdmin(): Promise<AdminGuestRow[]> {
  const db = getDb();
  const rows = await db.select().from(guests).orderBy(guests.name);
  return rows.map((g) => ({
    id: g.id,
    name: g.name,
    tableLabel: g.tableLabel,
    invitationCode: g.invitationCode,
    seatIndex: g.seatIndex,
    hasPassword: !!g.passwordHash,
    email: g.email,
  }));
}

export type AdminPhotoRow = {
  photoId: number;
  url: string;
  thumbUrl: string;
  hasOriginal: boolean;
  category: string;
  loveCount: number;
  funCount: number;
  likeCount: number;
  guest: { name: string; tableLabel: string | null };
};

export async function getAllPhotosAdmin(): Promise<AdminPhotoRow[]> {
  const db = getDb();
  const photoRows = await db
    .select({
      photoId: photos.id,
      url: photos.url,
      thumbUrl: photos.thumbUrl,
      originalKey: photos.originalKey,
      category: posts.category,
      guestId: posts.guestId,
      createdAt: photos.createdAt,
    })
    .from(photos)
    .innerJoin(posts, eq(photos.postId, posts.id))
    .orderBy(desc(photos.createdAt));

  const photoIds = photoRows.map((p) => p.photoId);
  const guestIds = [...new Set(photoRows.map((p) => p.guestId))];

  const [reactionRows, guestRows] = await Promise.all([
    photoIds.length
      ? db.select().from(reactions).where(inArray(reactions.photoId, photoIds))
      : Promise.resolve([]),
    guestIds.length ? db.select().from(guests).where(inArray(guests.id, guestIds)) : Promise.resolve([]),
  ]);

  const guestById = new Map(guestRows.map((g) => [g.id, g]));
  const countsByPhoto = new Map<number, { love: number; fun: number; like: number }>();
  for (const r of reactionRows) {
    const c = countsByPhoto.get(r.photoId) ?? { love: 0, fun: 0, like: 0 };
    if (r.type === "love") c.love++;
    else if (r.type === "fun") c.fun++;
    else c.like++;
    countsByPhoto.set(r.photoId, c);
  }

  return photoRows.map((p) => {
    const counts = countsByPhoto.get(p.photoId) ?? { love: 0, fun: 0, like: 0 };
    const guest = guestById.get(p.guestId);
    return {
      photoId: p.photoId,
      url: p.url,
      thumbUrl: p.thumbUrl ?? p.url,
      hasOriginal: !!p.originalKey,
      category: p.category,
      loveCount: counts.love,
      funCount: counts.fun,
      likeCount: counts.like,
      guest: { name: guest?.name ?? "—", tableLabel: guest?.tableLabel ?? null },
    };
  });
}

export async function getPhotoIdByShareCode(code: string): Promise<number | null> {
  const db = getDb();
  const [row] = await db.select({ id: photos.id }).from(photos).where(eq(photos.shareCode, code)).limit(1);
  return row?.id ?? null;
}

// Vista pública de una foto compartida (visitante sin sesión): solo la
// publicación de esa foto (su carrusel), no el resto del álbum. Sin
// viewerReaction — el visitante no reacciona hasta iniciar sesión.
export async function getPublicPost(photoId: number): Promise<{ photos: PhotoDetail[]; thumbUrl: string } | null> {
  const db = getDb();
  const [target] = await db
    .select({ postId: photos.postId, url: photos.url, thumbUrl: photos.thumbUrl })
    .from(photos)
    .where(eq(photos.id, photoId))
    .limit(1);
  if (!target) return null;

  const [post] = await db.select().from(posts).where(eq(posts.id, target.postId)).limit(1);
  if (!post) return null;

  const [guest] = await db.select().from(guests).where(eq(guests.id, post.guestId)).limit(1);
  const photoRows = await db.select().from(photos).where(eq(photos.postId, post.id)).orderBy(photos.position);
  const reactionRows = await db
    .select()
    .from(reactions)
    .where(inArray(reactions.photoId, photoRows.map((ph) => ph.id)));

  const guestName = guest?.name ?? "—";
  return {
    thumbUrl: target.thumbUrl ?? target.url,
    photos: photoRows.map((ph) => {
      const mine = reactionRows.filter((r) => r.photoId === ph.id);
      return {
        id: ph.id,
        url: ph.url,
        shareCode: ph.shareCode,
        postId: post.id,
        caption: post.caption,
        loveCount: mine.filter((r) => r.type === "love").length,
        funCount: mine.filter((r) => r.type === "fun").length,
        likeCount: mine.filter((r) => r.type === "like").length,
        viewerReaction: null,
        guestId: post.guestId,
        guestName,
        guestInitials: initials(guestName),
        category: post.category,
        createdAt: post.createdAt,
      };
    }),
  };
}
