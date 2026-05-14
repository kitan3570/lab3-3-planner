type AMapGlobal = any

declare global {
  interface Window {
    AMap?: AMapGlobal
    _AMapSecurityConfig?: any
  }
}

let loadingPromise: Promise<AMapGlobal> | null = null

export function loadAmapJs(
  key: string,
  opts?: { securityJsCode?: string | null; serviceHost?: string | null }
): Promise<AMapGlobal> {
  if (window.AMap) return Promise.resolve(window.AMap)
  if (loadingPromise) return loadingPromise

  loadingPromise = new Promise((resolve, reject) => {
    if (opts?.securityJsCode || opts?.serviceHost) {
      window._AMapSecurityConfig = {
        ...(opts?.securityJsCode ? { securityJsCode: opts.securityJsCode } : {}),
        ...(opts?.serviceHost ? { serviceHost: opts.serviceHost } : {})
      }
    }
    const script = document.createElement("script")
    script.async = true
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(key)}`
    script.onload = () => {
      if (window.AMap) resolve(window.AMap)
      else reject(new Error("AMap SDK loaded but AMap is missing on window"))
    }
    script.onerror = () => reject(new Error("Failed to load AMap SDK"))
    document.head.appendChild(script)
  })

  return loadingPromise
}
