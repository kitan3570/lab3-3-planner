<script setup lang="ts">
import { computed, ref } from "vue"
import { ApiError, apiFetch } from "./lib/api"
import Itinerary, { type LocationRead as ItineraryLocation } from "./components/Itinerary.vue"
import MapSelector from "./components/MapSelector.vue"
import PlanForm, { type PlanRead } from "./components/PlanForm.vue"

type LocationRead = PlanRead["locations"][number]

const currentPlan = ref<PlanRead | null>(null)
const connecting = ref(false)
const connectError = ref<string | null>(null)
const connectOk = ref<string | null>(null)
const refreshing = ref(false)
const refreshError = ref<string | null>(null)

const planId = computed(() => currentPlan.value?.id ?? null)
const locations = computed(() => currentPlan.value?.locations ?? [])

async function checkBackend() {
  connecting.value = true
  connectError.value = null
  connectOk.value = null
  try {
    await apiFetch<{ ok: boolean }>("/health")
    connectOk.value = "后端连接正常（/api/health）"
  } catch (e) {
    console.error("health check failed", e)
    connectError.value = e instanceof ApiError ? e.message : "后端连接失败"
  } finally {
    connecting.value = false
  }
}

async function refreshPlan() {
  if (!planId.value) return
  try {
    refreshing.value = true
    refreshError.value = null
    currentPlan.value = await apiFetch<PlanRead>(`/plans/${planId.value}`)
  } catch {
    refreshError.value = "刷新规划失败"
    return
  } finally {
    refreshing.value = false
  }
}

function onCreated(plan: PlanRead) {
  currentPlan.value = plan
}

function onReset() {
  currentPlan.value = null
}

async function onLocationAdded(location: LocationRead) {
  if (!currentPlan.value) return
  currentPlan.value = {
    ...currentPlan.value,
    locations: [...currentPlan.value.locations, location]
  }
  await refreshPlan()
}

function onLocationUpdated(location: ItineraryLocation) {
  if (!currentPlan.value) return
  currentPlan.value = {
    ...currentPlan.value,
    locations: currentPlan.value.locations.map((l) => (l.id === location.id ? (location as any) : l))
  }
}

function onLocationDeleted(locationId: number) {
  if (!currentPlan.value) return
  currentPlan.value = {
    ...currentPlan.value,
    locations: currentPlan.value.locations.filter((l) => l.id !== locationId)
  }
}
</script>

<template>
  <div class="page">
    <header class="top">
      <div class="brand">
        <div class="brand__mark" aria-hidden="true"></div>
        <div class="brand__text">
          <div class="brand__title">智能出行规划器</div>
          <div class="brand__subtitle">前端仅访问本地后端 API；第三方 Key 全部由后端托管</div>
        </div>
      </div>

      <div class="toolbar">
        <button class="pill" type="button" @click="checkBackend" :disabled="connecting">
          {{ connecting ? "检查中…" : "检查后端连接" }}
        </button>
        <div class="pill pill--info" v-if="planId">当前规划 #{{ planId }}</div>
      </div>
    </header>

    <div v-if="connectError" class="banner" role="alert">
      {{ connectError }}
    </div>

    <div v-else-if="connectOk" class="banner banner--ok" role="status">
      {{ connectOk }}
    </div>

    <main class="main">
      <div class="left">
        <PlanForm @created="onCreated" @reset="onReset" />
        <div v-if="planId" class="stack">
          <div v-if="refreshError" class="stack__error">{{ refreshError }}</div>
          <div v-if="refreshing" class="stack__hint">同步天气中…</div>
          <Itinerary
            :plan-id="planId"
            :locations="locations as any"
            @updated="onLocationUpdated"
            @deleted="onLocationDeleted"
          />
        </div>
      </div>

      <div class="right">
        <MapSelector :plan-id="planId" @added="onLocationAdded" />
      </div>
    </main>

    <footer class="foot">
      <span class="muted">API Base: /api</span>
    </footer>
  </div>
</template>

<style scoped>
@import url("https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=IBM+Plex+Sans:wght@400;600;700&display=swap");

:global(*),
:global(*::before),
:global(*::after) {
  box-sizing: border-box;
}

:global(html),
:global(body) {
  height: 100%;
  margin: 0;
}

.page {
  min-height: 100vh;
  padding: 24px;
  background: radial-gradient(900px 700px at 12% 8%, rgba(255, 214, 238, 0.78), rgba(255, 255, 255, 0)),
    radial-gradient(900px 700px at 84% 22%, rgba(198, 226, 255, 0.75), rgba(255, 255, 255, 0)),
    radial-gradient(1100px 700px at 42% 92%, rgba(236, 255, 207, 0.48), rgba(255, 255, 255, 0)),
    linear-gradient(135deg, #0c1020, #0b0f1b 40%, #0c122a);
  font-family: "IBM Plex Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  color: rgba(255, 255, 255, 0.94);
}

.top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  margin: 0 auto 16px;
  max-width: 1200px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}

.brand__mark {
  width: 44px;
  height: 44px;
  border-radius: 14px;
  background: radial-gradient(circle at 30% 25%, rgba(255, 255, 255, 0.95), rgba(255, 255, 255, 0)),
    linear-gradient(135deg, rgba(28, 66, 185, 0.96), rgba(160, 35, 96, 0.92));
  box-shadow: 0 18px 40px rgba(38, 78, 198, 0.22);
}

.brand__title {
  font-family: "Fraunces", ui-serif, "Times New Roman", serif;
  font-size: 22px;
  letter-spacing: -0.02em;
}

.brand__subtitle {
  margin-top: 3px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.66);
  max-width: 64ch;
  line-height: 1.4;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.pill {
  border-radius: 999px;
  padding: 10px 12px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.9);
  font-weight: 700;
  cursor: pointer;
  transition: transform 160ms ease, border-color 160ms ease, background 160ms ease;
}

.pill:hover:not(:disabled) {
  transform: translateY(-1px);
  border-color: rgba(255, 255, 255, 0.26);
  background: rgba(255, 255, 255, 0.09);
}

.pill:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.pill--info {
  cursor: default;
}

.banner {
  max-width: 1200px;
  margin: 0 auto 16px;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid rgba(255, 90, 116, 0.35);
  background: rgba(255, 44, 86, 0.12);
  color: rgba(255, 255, 255, 0.92);
}

.banner--ok {
  border-color: rgba(54, 214, 153, 0.35);
  background: rgba(54, 214, 153, 0.12);
}

.main {
  display: grid;
  grid-template-columns: minmax(320px, 1fr) minmax(360px, 1.2fr);
  gap: 18px;
  max-width: 1200px;
  margin: 0 auto;
  align-items: start;
}

.left,
.right {
  display: grid;
  gap: 16px;
}

.stack {
  display: grid;
  gap: 10px;
}

.stack__hint {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.68);
  padding: 0 2px;
}

.stack__error {
  font-size: 12px;
  color: rgba(255, 144, 163, 0.95);
  padding: 0 2px;
}

.muted {
  color: rgba(255, 255, 255, 0.64);
  font-size: 12px;
}

.foot {
  max-width: 1200px;
  margin: 16px auto 0;
  padding-top: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

@media (max-width: 980px) {
  .page {
    padding: 16px;
  }

  .top {
    flex-direction: column;
    align-items: stretch;
  }

  .main {
    grid-template-columns: 1fr;
  }
}
</style>
