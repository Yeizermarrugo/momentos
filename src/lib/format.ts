export function relativeTime(date: Date) {
  const diffMs = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "recién";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `hace ${days} d`;
}

export const CATEGORY_LABEL: Record<string, string> = {
  romantica: "Romántica",
  divertida: "Divertida",
  general: "General",
};

// Descripción por foto: corta a propósito — "unas palabras bonitas", no un
// párrafo. Largo de un tweet clásico, alcanza para una frase con sentido.
export const MAX_CAPTION_LENGTH = 140;
