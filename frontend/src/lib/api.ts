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

// 云函数 HTTP 调用地址
const CLOUDBASE_URL = "https://lab3-d3gc0uqhg90f39d16.service.tcloudbase.com"

function getFunctionUrl(path: string): string {
  if (path.includes("/locations")) {
    return `${CLOUDBASE_URL}/location`
  }
  if (path.includes("/ai-summary")) {
    return `${CLOUDBASE_URL}/ai-summary`
  }
  return `${CLOUDBASE_URL}/plan`
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const method = init?.method?.toUpperCase() || "GET"
  const url = getFunctionUrl(path)

  let fullPath = url + path
  console.log(`[API] Calling: ${method} ${fullPath}`)

  try {
    const response = await fetch(fullPath, {
      method: method,
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: init?.body,
      mode: "cors",
      cache: "no-cache"
    })

    console.log(`[API] Response status:`, response.status)

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[API] HTTP error: ${response.status}`, errorText)

      throw new ApiError({
        status: response.status,
        message: `HTTP 请求失败: ${response.status} ${response.statusText}`,
        details: errorText
      })
    }

    const result = await response.json()
    console.log(`[API] Response:`, result)

    return result as T

  } catch (e) {
    console.error(`[API] Error:`, e)

    if (e instanceof ApiError) {
      throw e
    }

    const message = e instanceof Error ? e.message : String(e)

    throw new ApiError({
      status: 0,
      message: `网络请求失败: ${message}`,
      details: e
    })
  }
}

export function apiUrl(path: string): string {
  return path
}
