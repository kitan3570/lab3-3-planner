<script setup lang="ts">
type HealthResponse = { ok: boolean }

async function pingBackend() {
  const res = await fetch("/api/health")
  const data = (await res.json()) as HealthResponse
  alert(data.ok ? "后端已连通" : "后端未就绪")
}
</script>

<template>
  <main style="padding: 24px">
    <h1>智能出行规划器</h1>
    <p>前端只调用后端 /api，不直接使用任何第三方 API Key。</p>
    <button type="button" @click="pingBackend">连通性测试</button>
  </main>
</template>
