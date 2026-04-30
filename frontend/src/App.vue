<script setup lang="ts">
import { computed, ref } from "vue"
import { ApiError, apiFetch } from "./lib/api"
import AISummaryCard from "./components/AISummaryCard.vue"
import Itinerary, { type LocationRead as ItineraryLocation } from "./components/Itinerary.vue"
import MapSelector from "./components/MapSelector.vue"
import PlanList from "./components/PlanList.vue"
import PlanForm, { type PlanRead } from "./components/PlanForm.vue"

type LocationRead = PlanRead["locations"][number]

const currentPlan = ref<PlanRead | null>(null)
const connecting = ref(false)
const connectError = ref<string | null>(null)
const connectOk = ref<string | null>(null)
const refreshing = ref(false)
const refreshError = ref<string | null>(null)
const hallOpen = ref(false)
const selectedDayIndex = ref(1)
const dayCount = ref(1)

const planId = computed(() => currentPlan.value?.id ?? null)
const locations = computed(() => currentPlan.value?.locations ?? [])
const totalEstimatedCost = computed(() => {
  return locations.value.reduce((sum, loc) => sum + (Number(loc.estimated_cost) || 0), 0)
})
const budgetExceeded = computed(() => {
  if (!currentPlan.value) return null
  const budget = Number(currentPlan.value.budget) || 0
  const total = totalEstimatedCost.value
  if (total <= budget) return null
  return { total, over: total - budget, budget }
})

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
    const plan = await apiFetch<PlanRead>(`/plans/${planId.value}`)
    currentPlan.value = plan
    syncDayCountFromPlan(plan)
  } catch {
    refreshError.value = "刷新规划失败"
    return
  } finally {
    refreshing.value = false
  }
}

async function openPlan(planId: number) {
  try {
    const plan = await apiFetch<PlanRead>(`/plans/${planId}`)
    currentPlan.value = plan
    selectedDayIndex.value = 1
    dayCount.value = Math.max(1, maxDayIndex(plan))
    hallOpen.value = false
  } catch (e) {
    console.error("open plan failed", e)
    connectError.value = e instanceof ApiError ? e.message : "打开规划失败"
  }
}

function onPlanDeleted(id: number) {
  if (currentPlan.value?.id === id) currentPlan.value = null
}

function onCreated(plan: PlanRead) {
  currentPlan.value = plan
  selectedDayIndex.value = 1
  dayCount.value = Math.max(1, maxDayIndex(plan))
}

function onReset() {
  currentPlan.value = null
  selectedDayIndex.value = 1
  dayCount.value = 1
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

function maxDayIndex(plan: PlanRead) {
  return plan.locations.reduce((m, l) => Math.max(m, Number((l as any).day_index) || 1), 1)
}

function syncDayCountFromPlan(plan: PlanRead | null) {
  if (!plan) {
    dayCount.value = 1
    selectedDayIndex.value = 1
    return
  }
  dayCount.value = Math.max(dayCount.value, maxDayIndex(plan))
  if (selectedDayIndex.value > dayCount.value) selectedDayIndex.value = dayCount.value
  if (selectedDayIndex.value < 1) selectedDayIndex.value = 1
}

function addDay() {
  dayCount.value = Math.max(1, dayCount.value + 1)
  selectedDayIndex.value = dayCount.value
}

function changeDay(day: number) {
  selectedDayIndex.value = Math.min(Math.max(1, day), dayCount.value)
}

async function deleteDay(day: number) {
  if (!currentPlan.value) return
  if (dayCount.value <= 1) return
  const ok = window.confirm(`确定删除第 ${day} 天吗？该天的地点会一并删除，后续天会自动前移。`)
  if (!ok) return

  const plan = currentPlan.value
  const targets = plan.locations.filter((l) => (Number((l as any).day_index) || 1) === day)
  const after = plan.locations.filter((l) => (Number((l as any).day_index) || 1) > day)

  try {
    for (const loc of targets) {
      await apiFetch<void>(`/plans/${plan.id}/locations/${loc.id}`, { method: "DELETE" })
    }
    for (const loc of after) {
      const oldDay = Number((loc as any).day_index) || 1
      await apiFetch<any>(`/plans/${plan.id}/locations/${loc.id}`, {
        method: "PUT",
        body: JSON.stringify({ day_index: oldDay - 1 })
      })
    }

    dayCount.value = Math.max(1, dayCount.value - 1)
    selectedDayIndex.value = Math.min(selectedDayIndex.value, dayCount.value)
    await refreshPlan()
  } catch (e) {
    console.error("delete day failed", e)
    connectError.value = e instanceof ApiError ? e.message : "删除当天失败"
  }
}

function sanitizeFilenamePart(value: string) {
  const v = value.trim() || "行程"
  return v.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 40)
}

function buildItineraryMarkdown(plan: PlanRead) {
  const date = plan.date
  const title = plan.title || "行程单"
  const people = plan.people_count
  const budget = plan.budget
  const preferences = plan.preferences ?? ""
  const remarks = plan.remarks ?? ""

  const byDay = new Map<number, LocationRead[]>()
  for (const loc of plan.locations) {
    const day = Number((loc as any).day_index) || 1
    const arr = byDay.get(day) ?? []
    arr.push(loc)
    byDay.set(day, arr)
  }

  const total = plan.locations.reduce((sum, l) => sum + (Number(l.estimated_cost) || 0), 0)
  const over = total - Number(budget)

  const lines: string[] = []
  lines.push(`# ${title}（行程单）`)
  lines.push("")
  lines.push(`- 日期：${date}`)
  lines.push(`- 人数：${people}`)
  lines.push(`- 预算：¥${Number(budget).toFixed(0)}`)
  if (preferences) lines.push(`- 偏好：${preferences}`)
  if (remarks) lines.push(`- 备注：${remarks}`)
  lines.push(`- 行程预计花费合计：¥${total.toFixed(0)}${over > 0 ? `（超出 ¥${over.toFixed(0)}）` : ""}`)
  lines.push("")

  lines.push(`---`)
  lines.push("")
  const days = Array.from(byDay.keys()).sort((a, b) => a - b)
  for (const day of days) {
    lines.push(`## 第 ${day} 天`)
    lines.push("")
    const locs = byDay.get(day) ?? []
    const slotGroups: Record<"上午" | "下午" | "晚上", LocationRead[]> = { 上午: [], 下午: [], 晚上: [] }
    for (const loc of locs) slotGroups[loc.time_slot].push(loc)

    for (const slot of ["上午", "下午", "晚上"] as const) {
      lines.push(`### ${slot}`)
      lines.push("")
      if (slotGroups[slot].length === 0) {
        lines.push(`（暂无地点）`)
        lines.push("")
        continue
      }
      for (const loc of slotGroups[slot]) {
        const weather = loc.weather?.ok && loc.weather.summary ? loc.weather.summary : "天气不可用"
        const note = loc.remarks ? `\n  - 备注：${loc.remarks}` : ""
        lines.push(`#### ${loc.name}`)
        lines.push(`- 天气：${weather}`)
        lines.push(`- 坐标：${loc.lat}, ${loc.lng}`)
        lines.push(`- 预计花费：¥${Number(loc.estimated_cost).toFixed(0)}`)
        lines.push(`- 停留时长：${Number(loc.duration)} 分钟${note}`)
        lines.push("")
      }
    }
  }

  lines.push(`---`)
  lines.push("")
  lines.push(`生成时间：${new Date().toLocaleString()}`)
  lines.push("")
  return lines.join("\n")
}

function downloadMarkdown(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function exportItinerary() {
  if (!currentPlan.value) return
  const titlePart = sanitizeFilenamePart(currentPlan.value.title || "行程单")
  const datePart = sanitizeFilenamePart(String(currentPlan.value.date || ""))
  const filename = `行程单-${titlePart}${datePart ? `-${datePart}` : ""}.md`
  const md = buildItineraryMarkdown(currentPlan.value)
  downloadMarkdown(filename, md)
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
        <button class="pill" type="button" @click="hallOpen = true">历史记录</button>
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

    <div v-if="budgetExceeded" class="banner banner--warn" role="alert">
      ⚠️ 警告：当前行程总花费 {{ budgetExceeded.total.toFixed(0) }} 元，已超出预算
      {{ budgetExceeded.over.toFixed(0) }} 元！
    </div>

    <main class="layout">
      <section class="upper">
        <div class="pane">
          <PlanForm @created="onCreated" @reset="onReset" />
        </div>
        <div class="pane">
          <MapSelector :plan-id="planId" :day-index="selectedDayIndex" @added="onLocationAdded" />
        </div>
      </section>

      <section class="lower">
        <div v-if="planId" class="lower__stack">
          <div class="lower__meta">
            <div v-if="refreshError" class="lower__error">{{ refreshError }}</div>
            <div v-else-if="refreshing" class="lower__hint">同步天气中…</div>
          </div>
          <div class="lower__grid">
            <Itinerary
              :plan-id="planId"
              :locations="locations as any"
              :day-index="selectedDayIndex"
              :day-count="dayCount"
              @updated="onLocationUpdated"
              @deleted="onLocationDeleted"
              @export="exportItinerary"
              @change-day="changeDay"
              @add-day="addDay"
              @delete-day="deleteDay"
            />
            <AISummaryCard :plan-id="planId" />
          </div>
        </div>
        <div v-else class="lower__empty">
          先在上方创建规划并添加地点，行程安排会在这里出现。
        </div>
      </section>
    </main>

    <footer class="foot">
      <span class="muted">API Base: /api</span>
    </footer>

    <PlanList :open="hallOpen" :current-plan-id="planId" @close="hallOpen = false" @open-plan="openPlan" @deleted="onPlanDeleted" />
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

.banner--warn {
  border-color: rgba(255, 90, 116, 0.55);
  background: rgba(255, 44, 86, 0.16);
}

.layout {
  display: grid;
  gap: 18px;
  max-width: 1320px;
  margin: 0 auto;
}

.upper {
  display: grid;
  grid-template-columns: minmax(360px, 1fr) minmax(420px, 1.2fr);
  gap: 18px;
  align-items: stretch;
}

.pane {
  display: flex;
  min-width: 0;
}

.pane :deep(.card) {
  width: 100%;
  height: 100%;
}

.lower {
  min-width: 0;
}

.lower__stack {
  display: grid;
  gap: 10px;
}

.lower__grid {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(280px, 0.6fr);
  gap: 14px;
  align-items: start;
}

.lower__meta {
  min-height: 16px;
}

.lower__hint {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.68);
  padding: 0 2px;
}

.lower__error {
  font-size: 12px;
  color: rgba(255, 144, 163, 0.95);
  padding: 0 2px;
}

.lower__empty {
  padding: 14px 16px;
  border-radius: 16px;
  border: 1px dashed rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.72);
  font-size: 13px;
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

  .upper {
    grid-template-columns: 1fr;
  }

  .lower__grid {
    grid-template-columns: 1fr;
  }
}
</style>
