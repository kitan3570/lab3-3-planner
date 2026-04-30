export type ApiErrorShape = {
  status: number
  message: string
  details?: unknown
}

export class ApiError extends Error {
  readonly status: number
  readonly details?: unknown

  constructor(shape: ApiErrorShape) {
    super(shape.message)
    this.name = "ApiError"
    this.status = shape.status
    this.details = shape.details
  }
}

function getApiOrigin() {
  const origin = (import.meta.env.VITE_API_ORIGIN as string | undefined) ?? ""
  return origin.replace(/\/$/, "")
}

function getApiBasePath() {
  const base = (import.meta.env.VITE_API_BASE as string | undefined) ?? "/api"
  return base.startsWith("/") ? base : `/${base}`
}

export function apiUrl(path: string) {
  const p = path.startsWith("/") ? path : `/${path}`
  return `${getApiOrigin()}${getApiBasePath()}${p}`
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  })

  if (!res.ok) {
    let details: unknown = undefined
    try {
      details = await res.json()
    } catch {
      details = await res.text().catch(() => undefined)
    }
    const message =
      typeof details === "object" && details && "detail" in details
        ? String((details as any).detail)
        : `请求失败 (${res.status})`
    throw new ApiError({ status: res.status, message, details })
  }

  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

