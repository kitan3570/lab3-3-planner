import { spawn } from "node:child_process"
import { createInterface } from "node:readline"

function startServer() {
  const env = {
    ...process.env,
    INTEGRATION_IDE: "Trae",
    HOME: "/Users/li/Desktop/lab3-2/.cloudbase-home"
  }

  const child = spawn("npx", ["--yes", "@cloudbase/cloudbase-mcp@latest"], {
    env,
    stdio: ["pipe", "pipe", "inherit"]
  })

  child.on("exit", (code) => {
    if (code !== 0) process.exitCode = code ?? 1
  })
  return child
}

function createMcpClient(proc) {
  let nextId = 1
  const pending = new Map()

  const rl = createInterface({ input: proc.stdout })
  rl.on("line", (line) => {
    const s = line.trim()
    if (!s) return
    let msg
    try {
      msg = JSON.parse(s)
    } catch {
      return
    }
    if (msg && msg.id !== undefined && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      if (msg.error) reject(new Error(typeof msg.error === "string" ? msg.error : JSON.stringify(msg.error)))
      else resolve(msg.result)
    }
  })

  function request(method, params) {
    const id = nextId++
    proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n")
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject })
      setTimeout(() => {
        if (!pending.has(id)) return
        pending.delete(id)
        reject(new Error(`timeout: ${method}`))
      }, 30000)
    })
  }

  function notify(method, params) {
    proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n")
  }

  return { request, notify }
}

async function main() {
  const proc = startServer()
  const client = createMcpClient(proc)

  await client.request("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "cloudbase-mcp-env-list", version: "0.0.1" }
  })
  try {
    client.notify("initialized", {})
  } catch {}

  const res = await client.request("tools/call", {
    name: "envQuery",
    arguments: { action: "list", limit: 50, offset: 0 }
  })

  console.log(JSON.stringify(res, null, 2))
  proc.kill("SIGTERM")
}

main().catch((e) => {
  console.error(String(e?.stack || e))
  process.exitCode = 1
})

