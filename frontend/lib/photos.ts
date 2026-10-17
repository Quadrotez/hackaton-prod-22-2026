export const PHOTO_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;

export function validatePhoto(file: File): string | null {
  if (!PHOTO_TYPES.includes(file.type)) return "Неподдерживаемый формат. Загрузите PNG, JPEG, GIF или WebP";
  if (file.size > PHOTO_MAX_BYTES) return "Файл слишком большой. Максимум 5 МБ";
  return null;
}
