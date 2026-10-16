import { getAccessToken } from "@/lib/session";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export const NETWORK_ERROR_STATUS = 0;

// Тексты ошибок бэкенда → сообщения для пользователя
const detailMessages: Record<string, string> = {
  "Invalid email or password": "Неверный email или пароль",
  "A user with this email already exists": "Пользователь с таким email уже зарегистрирован",
  "Could not validate credentials": "Сессия истекла. Войдите снова",
  "Pet not found": "Питомец не найден",
  "Feeding record not found": "Запись о кормлении не найдена",
  "Photo not found": "Фото не найдено",
  "At least one field is required": "Измените хотя бы одно поле",
  "birth_date and approximate_age_years cannot both be provided":
    "Укажите либо дату рождения, либо примерный возраст",
  "liked and tolerated are required when this pet has not previously tried this food":
    "Для нового корма отметьте, понравился ли он и как питомец его перенёс",
  "food_name must not be blank": "Введите название корма",
  "Image exceeds the maximum allowed size": "Файл слишком большой",
  "Unsupported or invalid image; use PNG, JPEG, GIF, or WebP":
    "Неподдерживаемый формат. Загрузите PNG, JPEG, GIF или WebP",
  "Could not save pet photo": "Не удалось сохранить фото",
  // Стандартные ответы FastAPI на несуществующий маршрут или метод — функция ещё не готова на бэкенде
  "Not Found": "Эта функция пока недоступна",
  "Method Not Allowed": "Эта функция пока недоступна",
};

function statusMessage(status: number): string {
  if (status === NETWORK_ERROR_STATUS) return "Нет связи с сервером. Проверьте подключение и попробуйте ещё раз";
  if (status === 401) return "Сессия истекла. Войдите снова";
  if (status === 403) return "Недостаточно прав";
  if (status === 404) return "Ничего не найдено";
  if (status === 405 || status === 501) return "Эта функция пока недоступна";
  if (status === 413) return "Файл слишком большой";
  if (status === 422) return "Проверьте правильность введённых данных";
  if (status === 429) return "Слишком много запросов. Попробуйте чуть позже";
  if (status >= 500) return "Сервер временно недоступен. Попробуйте позже";
  return "Что-то пошло не так. Попробуйте ещё раз";
}

// message — всегда на русском и готово к показу; detail — исходный ответ бэкенда
export class ApiError extends Error {
  status: number;
  detail: string;

  constructor(status: number, detail: string) {
    super(detailMessages[detail] ?? statusMessage(status));
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

export function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

type FetchOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  // Подставить токен из сессии; без токена запрос не отправляется
  auth?: boolean;
};

async function parseError(response: Response): Promise<ApiError> {
  try {
    const data = (await response.json()) as { detail?: unknown };
    // Массив detail — ошибки валидации pydantic, для них хватает общего сообщения по статусу
    const detail = typeof data.detail === "string" ? data.detail : response.statusText;
    return new ApiError(response.status, detail);
  } catch {
    return new ApiError(response.status, response.statusText);
  }
}

async function request(
  path: string,
  { body, auth, headers, ...init }: FetchOptions,
): Promise<Response> {
  const requestHeaders = new Headers(headers);
  const isFormData =
    typeof FormData !== "undefined" && body instanceof FormData;

  if (
    body !== undefined &&
    !isFormData &&
    !requestHeaders.has("Content-Type")
  ) {
    requestHeaders.set("Content-Type", "application/json");
  }

  if (auth) {
    const token = getAccessToken();
    if (!token) throw new ApiError(401, "Not authenticated");
    requestHeaders.set("Authorization", `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: requestHeaders,
      body:
        body === undefined
          ? undefined
          : isFormData
            ? (body as FormData)
            : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(NETWORK_ERROR_STATUS, "Network error");
  }

  if (!response.ok) {
    throw await parseError(response);
  }

  return response;
}

export async function apiFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const response = await request(path, options);

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

// Для файлов, которые отдаются только с авторизацией (фото питомцев)
export async function apiFetchBlob(path: string, options: FetchOptions = {}): Promise<Blob> {
  const response = await request(path, options);
  return response.blob();
}
