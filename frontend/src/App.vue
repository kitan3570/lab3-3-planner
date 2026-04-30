<script setup lang="ts">
import { computed, ref } from "vue"
import { ApiError, apiFetch } from "./lib/api"
import MapSelector from "./components/MapSelector.vue"
import PlanForm, { type PlanRead } from "./components/PlanForm.vue"

type LocationRead = PlanRead["locations"][number]

const currentPlan = ref<PlanRead | null>(null)
const connecting = ref(false)
const connectError = ref<string | null>(null)

const planId = computed(() => currentPlan.value?.id ?? null)
const locations = computed(() => currentPlan.value?.locations ?? [])

async function checkBackend() {
  connecting.value = true
  connectError.value = null
  try {
    await apiFetch<{ ok: boolean }>("/health")
  } catch (e) {
    connectError.value = e instanceof ApiError ? e.message : "后端连接失败"
  } finally {
    connecting.value = false
  }
}

async function refreshPlan() {
  if (!planId.value) return
  try {
    currentPlan.value = await apiFetch<PlanRead>(`/plans/${planId.value}`)
  } catch {
    return
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

    <main class="main">
      <div class="left">
        <PlanForm @created="onCreated" @reset="onReset" />
        <section class="list cardList" v-if="planId">
          <header class="list__header">
            <h3 class="list__title">已加入地点</h3>
            <div class="list__meta">{{ locations.length }} 个</div>
          </header>

          <div v-if="locations.length === 0" class="list__empty">还没有地点，去右侧点一下地图。</div>

          <ul v-else class="items">
            <li v-for="loc in locations" :key="loc.id" class="item">
              <div class="item__main">
                <div class="item__name">{{ loc.name }}</div>
                <div class="item__sub">
                  <span class="tag">{{ loc.time_slot }}</span>
                  <span class="muted">{{ loc.lat }}, {{ loc.lng }}</span>
                </div>
              </div>
              <div class="item__aside">
                <div class="item__cost">¥{{ loc.estimated_cost }}</div>
                <div class="item__dur">{{ loc.duration }} min</div>
              </div>
            </li>
          </ul>
        </section>
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

.main {
  display: grid;
  grid-template-columns: 1fr 1.2fr;
  gap: 16px;
  max-width: 1200px;
  margin: 0 auto;
  align-items: start;
}

.left,
.right {
  display: grid;
  gap: 16px;
}

.cardList {
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.06));
  border: 1px solid rgba(255, 255, 255, 0.16);
  box-shadow: 0 24px 60px rgba(7, 12, 28, 0.22);
  backdrop-filter: blur(10px);
  overflow: hidden;
}

.list__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 16px 18px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
}

.list__title {
  margin: 0;
  font-size: 16px;
  letter-spacing: -0.01em;
}

.list__meta {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.62);
}

.list__empty {
  padding: 16px 18px 18px;
  color: rgba(255, 255, 255, 0.7);
  font-size: 13px;
}

.items {
  list-style: none;
  padding: 10px 10px 14px;
  margin: 0;
  display: grid;
  gap: 10px;
}

.item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 12px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
}

.item__name {
  font-weight: 750;
  letter-spacing: -0.01em;
}

.item__sub {
  margin-top: 6px;
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.tag {
  display: inline-flex;
  align-items: center;
  padding: 5px 9px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.16);
  font-size: 12px;
  font-weight: 700;
}

.item__aside {
  text-align: right;
  min-width: 92px;
}

.item__cost {
  font-weight: 800;
}

.item__dur {
  margin-top: 6px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.64);
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
