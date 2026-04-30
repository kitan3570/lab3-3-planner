<script setup lang="ts">
import { computed, reactive, watch } from "vue"
import { ApiError, apiFetch } from "../lib/api"

type TimeSlot = "上午" | "下午" | "晚上"

type WeatherInfo = {
  ok: boolean
  summary?: string | null
  error?: string | null
}

export type LocationRead = {
  id: number
  plan_id: number
  name: string
  lat: number
  lng: number
  time_slot: TimeSlot
  estimated_cost: number
  duration: number
  remarks?: string | null
  weather?: WeatherInfo | null
}

type LocationUpdate = {
  time_slot?: TimeSlot | null
  estimated_cost?: number | null
  duration?: number | null
  remarks?: string | null
}

const props = defineProps<{
  planId: number
  locations: LocationRead[]
}>()

const emit = defineEmits<{
  (e: "updated", location: LocationRead): void
  (e: "deleted", locationId: number): void
}>()

const drafts = reactive<Record<number, LocationUpdate & { name: string; lat: number; lng: number }>>({})
const saving = reactive<Record<number, boolean>>({})
const error = reactive<Record<number, string | null>>({})
const timers = new Map<number, number>()

watch(
  () => props.locations,
  (next) => {
    for (const loc of next) {
      if (!drafts[loc.id]) {
        drafts[loc.id] = {
          name: loc.name,
          lat: loc.lat,
          lng: loc.lng,
          time_slot: loc.time_slot,
          estimated_cost: loc.estimated_cost,
          duration: loc.duration,
          remarks: loc.remarks ?? null
        }
      } else {
        drafts[loc.id].name = loc.name
        drafts[loc.id].lat = loc.lat
        drafts[loc.id].lng = loc.lng
      }
      if (saving[loc.id] === undefined) saving[loc.id] = false
      if (error[loc.id] === undefined) error[loc.id] = null
    }
  },
  { immediate: true, deep: true }
)

const grouped = computed(() => {
  const bucket: Record<TimeSlot, LocationRead[]> = { 上午: [], 下午: [], 晚上: [] }
  for (const loc of props.locations) bucket[loc.time_slot].push(loc)
  return bucket
})

function scheduleSave(locationId: number) {
  error[locationId] = null
  const prev = timers.get(locationId)
  if (prev) window.clearTimeout(prev)
  const t = window.setTimeout(() => void save(locationId), 650)
  timers.set(locationId, t)
}

async function save(locationId: number) {
  if (saving[locationId]) return
  saving[locationId] = true
  error[locationId] = null
  try {
    const payload: LocationUpdate = {
      time_slot: drafts[locationId].time_slot ?? null,
      estimated_cost: drafts[locationId].estimated_cost ?? null,
      duration: drafts[locationId].duration ?? null,
      remarks: drafts[locationId].remarks ?? null
    }
    const updated = await apiFetch<LocationRead>(`/plans/${props.planId}/locations/${locationId}`, {
      method: "PUT",
      body: JSON.stringify(payload)
    })
    emit("updated", updated)
  } catch (e) {
    console.error("update location failed", e)
    error[locationId] = e instanceof ApiError ? e.message : `更新失败: ${e instanceof Error ? e.message : String(e)}`
  } finally {
    saving[locationId] = false
  }
}

async function remove(locationId: number) {
  if (saving[locationId]) return
  saving[locationId] = true
  error[locationId] = null
  try {
    await apiFetch<void>(`/plans/${props.planId}/locations/${locationId}`, { method: "DELETE" })
    emit("deleted", locationId)
  } catch (e) {
    console.error("delete location failed", e)
    error[locationId] = e instanceof ApiError ? e.message : `删除失败: ${e instanceof Error ? e.message : String(e)}`
  } finally {
    saving[locationId] = false
  }
}
</script>

<template>
  <section class="board">
    <header class="board__header">
      <div class="board__kicker">Itinerary</div>
      <div class="board__titleRow">
        <h3 class="board__title">已选地点 · 行程安排</h3>
        <div class="board__meta">自动保存</div>
      </div>
      <p class="board__subtitle">按“上午 / 下午 / 晚上”分组；修改后会自动同步到后端。</p>
    </header>

    <div class="cols">
      <section v-for="slot in (['上午', '下午', '晚上'] as const)" :key="slot" class="col">
        <header class="col__header">
          <div class="col__dot" :data-slot="slot"></div>
          <div class="col__name">{{ slot }}</div>
          <div class="col__count">{{ grouped[slot].length }}</div>
        </header>

        <div v-if="grouped[slot].length === 0" class="col__empty">暂无地点</div>

        <div v-else class="cards">
          <article v-for="loc in grouped[slot]" :key="loc.id" class="card">
            <div class="card__top">
              <div class="card__name" :title="loc.name">{{ loc.name }}</div>
              <button class="iconBtn" type="button" :disabled="saving[loc.id]" @click="remove(loc.id)" title="删除">
                ×
              </button>
            </div>

            <div class="card__sub">
              <span v-if="loc.weather?.ok && loc.weather.summary" class="pill pill--ok">{{ loc.weather.summary }}</span>
              <span v-else-if="loc.weather && !loc.weather.ok" class="pill pill--down" title="天气服务不可用">天气不可用</span>
              <span v-else class="pill pill--idle">天气获取中…</span>
              <span class="coord">{{ loc.lat }}, {{ loc.lng }}</span>
            </div>

            <div class="form">
              <label class="field">
                <span class="field__label">时段</span>
                <select
                  v-model="drafts[loc.id].time_slot"
                  class="field__input"
                  :disabled="saving[loc.id]"
                  @change="scheduleSave(loc.id)"
                >
                  <option value="上午">上午</option>
                  <option value="下午">下午</option>
                  <option value="晚上">晚上</option>
                </select>
              </label>

              <label class="field">
                <span class="field__label">预计花费</span>
                <input
                  v-model.number="drafts[loc.id].estimated_cost"
                  class="field__input"
                  type="number"
                  min="0"
                  step="10"
                  :disabled="saving[loc.id]"
                  @input="scheduleSave(loc.id)"
                />
              </label>

              <label class="field">
                <span class="field__label">停留(分钟)</span>
                <input
                  v-model.number="drafts[loc.id].duration"
                  class="field__input"
                  type="number"
                  min="0"
                  step="10"
                  :disabled="saving[loc.id]"
                  @input="scheduleSave(loc.id)"
                />
              </label>
            </div>

            <div class="note">
              <label class="field field--full">
                <span class="field__label">备注</span>
                <textarea
                  v-model="drafts[loc.id].remarks"
                  class="field__input field__textarea"
                  rows="2"
                  :disabled="saving[loc.id]"
                  @input="scheduleSave(loc.id)"
                  placeholder="例如：门票/排队/最佳拍照点…"
                />
              </label>

              <div class="card__foot">
                <div v-if="error[loc.id]" class="err">{{ error[loc.id] }}</div>
                <div v-else class="hint">
                  <span v-if="saving[loc.id]" class="sync">保存中…</span>
                  <span v-else class="ok">已同步</span>
                </div>
              </div>
            </div>
          </article>
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.board {
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.06));
  border: 1px solid rgba(255, 255, 255, 0.16);
  box-shadow: 0 24px 60px rgba(7, 12, 28, 0.22);
  backdrop-filter: blur(10px);
  overflow: hidden;
  color: rgba(255, 255, 255, 0.94);
}

.board__header {
  padding: 16px 18px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
}

.board__kicker {
  display: inline-flex;
  align-items: center;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-weight: 750;
  font-size: 11px;
}

.board__titleRow {
  margin-top: 10px;
  display: flex;
  gap: 10px;
  align-items: baseline;
  justify-content: space-between;
}

.board__title {
  margin: 0;
  font-size: 16px;
  letter-spacing: -0.01em;
}

.board__meta {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.66);
}

.board__subtitle {
  margin: 8px 0 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.66);
  line-height: 1.5;
}

.cols {
  display: grid;
  grid-template-columns: repeat(3, minmax(360px, 1fr));
  gap: 14px;
  padding: 14px;
  overflow-x: auto;
}

.col {
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.04);
  overflow: hidden;
  min-width: 0;
}

.col__header {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 10px;
  align-items: center;
  padding: 12px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.col__dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  box-shadow: 0 0 0 6px rgba(255, 255, 255, 0.06);
}

.col__dot[data-slot="上午"] {
  background: rgba(54, 214, 153, 0.9);
  box-shadow: 0 0 0 6px rgba(54, 214, 153, 0.16);
}

.col__dot[data-slot="下午"] {
  background: rgba(83, 163, 255, 0.9);
  box-shadow: 0 0 0 6px rgba(83, 163, 255, 0.16);
}

.col__dot[data-slot="晚上"] {
  background: rgba(255, 170, 74, 0.95);
  box-shadow: 0 0 0 6px rgba(255, 170, 74, 0.16);
}

.col__name {
  font-weight: 800;
  letter-spacing: -0.01em;
}

.col__count {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
}

.col__empty {
  padding: 12px 12px 14px;
  color: rgba(255, 255, 255, 0.66);
  font-size: 12px;
}

.cards {
  display: grid;
  gap: 12px;
  padding: 12px;
}

.card {
  border-radius: 16px;
  padding: 12px 12px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(10, 12, 22, 0.38);
  box-shadow: 0 18px 44px rgba(0, 0, 0, 0.22);
  min-width: 0;
}

.card__top {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  justify-content: space-between;
}

.card__name {
  font-weight: 850;
  letter-spacing: -0.01em;
  font-size: 14px;
  line-height: 1.25;
  word-break: break-word;
}

.iconBtn {
  width: 28px;
  height: 28px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.92);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  transition: transform 160ms ease, background 160ms ease, border-color 160ms ease;
  flex: 0 0 auto;
}

.iconBtn:hover:not(:disabled) {
  transform: translateY(-1px);
  border-color: rgba(255, 90, 116, 0.55);
  background: rgba(255, 44, 86, 0.12);
}

.iconBtn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.card__sub {
  margin-top: 10px;
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.pill {
  display: inline-flex;
  align-items: center;
  padding: 5px 9px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  font-size: 12px;
  font-weight: 750;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.82);
}

.pill--ok {
  background: rgba(54, 214, 153, 0.08);
  color: rgba(214, 255, 236, 0.82);
}

.pill--down {
  background: rgba(255, 90, 116, 0.08);
  color: rgba(255, 195, 205, 0.84);
}

.pill--idle {
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.68);
}

.coord {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
}

.form {
  margin-top: 12px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.field {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.field--full {
  margin-top: 10px;
}

.field__label {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.68);
  font-weight: 700;
  letter-spacing: 0.02em;
}

.field__input {
  width: 100%;
  min-width: 0;
  border-radius: 12px;
  padding: 10px 10px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.92);
  outline: none;
  transition: box-shadow 160ms ease, border-color 160ms ease;
}

.field__input:focus {
  border-color: rgba(83, 163, 255, 0.6);
  box-shadow: 0 0 0 4px rgba(83, 163, 255, 0.16);
}

.field__textarea {
  resize: vertical;
  min-height: 72px;
}

.note {
  margin-top: 10px;
  display: grid;
  gap: 8px;
}

.card__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.hint {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.66);
}

.sync {
  color: rgba(255, 255, 255, 0.78);
}

.ok {
  color: rgba(54, 214, 153, 0.86);
}

.err {
  font-size: 12px;
  color: rgba(255, 144, 163, 0.95);
  line-height: 1.35;
}

@media (max-width: 980px) {
  .form {
    grid-template-columns: 1fr;
  }
}
</style>
