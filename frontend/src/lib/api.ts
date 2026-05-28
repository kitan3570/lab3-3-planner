import cloudbase from "@cloudbase/js-sdk";

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

let app: ReturnType<typeof cloudbase.init> | null = null

function getApp() {
  if (!app) {
    app = cloudbase.init({
      env: "lab3-d3gc0uqhg90f39d16"
    })
  }
  return app
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const app = getApp()
  const method = init?.method?.toUpperCase() || "GET"
  
  try {
    const result = await app.callFunction({
      name: getFunctionName(path),
      data: buildEvent(path, method, init?.body as string)
    })

    const response = result.result

    if (response.statusCode >= 400) {
      const details = typeof response.body === "string" 
        ? JSON.parse(response.body) 
        : response.body
      
      throw new ApiError({
        status: response.statusCode,
        message: details?.error || details?.message || `请求失败 (${response.statusCode})`,
        details
      })
    }

    const body = typeof response.body === "string" 
      ? JSON.parse(response.body) 
      : response.body
    
    return body as T

  } catch (e) {
    if (e instanceof ApiError) {
      throw e
    }
    
    const message = e instanceof Error ? e.message : String(e)
    throw new ApiError({ status: 0, message: `网络请求失败: ${message}`, details: e })
  }
}

function getFunctionName(path: string): string {
  if (path.startsWith("/plans/") && path.includes("/locations")) {
    return "location"
  }
  if (path.startsWith("/plans/") && path.includes("/ai-summary")) {
    return "ai-summary"
  }
  if (path.startsWith("/plans")) {
    return "plan"
  }
  if (path.startsWith("/locations")) {
    return "location"
  }
  if (path.startsWith("/ai-summary")) {
    return "ai-summary"
  }
  return "plan"
}

function buildEvent(path: string, method: string, body?: string) {
  return {
    httpMethod: method,
    path: path,
    body: body || ""
  }
}

export function apiUrl(path: string): string {
  return path
}
