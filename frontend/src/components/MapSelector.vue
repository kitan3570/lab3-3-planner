<script setup lang="ts">
import { computed, ref } from "vue"
import { ApiError, apiFetch } from "../lib/api"

type TimeSlot = "上午" | "下午" | "晚上"

type LocationCreate = {
  name: string
  lat: number
  lng: number
  day_index: number
  time_slot: TimeSlot
  estimated_cost: number
  duration: number
  remarks?: string | null
}

type LocationRead = {
  id: number
  plan_id: number
  name: string
  lat: number
  lng: number
  day_index: number
  time_slot: TimeSlot
  estimated_cost: number
  duration: number
  remarks?: string | null
  weather?: { ok: boolean; summary?: string | null; error?: string | null } | null
}

const props = defineProps<{
  planId: number | null
  dayIndex: number
}>()

const emit = defineEmits<{
  (e: "added", location: LocationRead): void
}>()

const selected = ref<{
  name: string
  lat: number
  lng: number
  xPct: number
  yPct: number
} | null>(null)

const timeSlot = ref<TimeSlot>("上午")
const estimatedCost = ref<number>(0)
const duration = ref<number>(60)
const remarks = ref<string>("")

const adding = ref(false)
const errorMessage = ref<string | null>(null)

const canAdd = computed(() => Boolean(props.planId) && Boolean(selected.value) && !adding.value)

function onMapClick(e: MouseEvent) {
  const el = e.currentTarget as HTMLElement
  const rect = el.getBoundingClientRect()
  const x = (e.clientX - rect.left) / rect.width
  const y = (e.clientY - rect.top) / rect.height

  const lat = Number((39.9 - (y - 0.5) * 0.6).toFixed(6))
  const lng = Number((116.4 + (x - 0.5) * 0.8).toFixed(6))

  selected.value = {
    name: `选点 ${lng},${lat}`,
    lat,
    lng,
    xPct: Number((x * 100).toFixed(2)),
    yPct: Number((y * 100).toFixed(2))
  }
  errorMessage.value = null
}

async function addToPlan() {
  if (!props.planId || !selected.value || adding.value) return
  adding.value = true
  errorMessage.value = null

  const payload: LocationCreate = {
    name: selected.value.name,
    lat: selected.value.lat,
    lng: selected.value.lng,
    day_index: props.dayIndex,
    time_slot: timeSlot.value,
    estimated_cost: Number(estimatedCost.value),
    duration: Number(duration.value),
    remarks: remarks.value.trim() ? remarks.value.trim() : null
  }

  try {
    const location = await apiFetch<LocationRead>(`/plans/${props.planId}/locations`, {
      method: "POST",
      body: JSON.stringify(payload)
    })
    emit("added", location)
  } catch (e) {
    console.error("add location failed", e)
    errorMessage.value = e instanceof ApiError ? e.message : `加入失败: ${e instanceof Error ? e.message : String(e)}`
  } finally {
    adding.value = false
  }
}
</script>

<template>
  <section class="card">
    <header class="card__header">
      <div class="card__kicker">Map</div>
      <h2 class="card__title">地图选点</h2>
      <p class="card__subtitle">
        点击地图区域选择一个点，再加入当前规划。
        <span v-if="!planId" class="card__hint">（请先保存规划）</span>
      </p>
    </header>

    <div class="map" @click="onMapClick" role="button" tabindex="0">
      <div class="map__grid" aria-hidden="true"></div>
      <div
        v-if="selected"
        class="pin"
        :style="{ left: `${selected.xPct}%`, top: `${selected.yPct}%` }"
      >
        <div class="pin__dot"></div>
        <div class="pin__label">
          <div class="pin__name">{{ selected.name }}</div>
          <div class="pin__meta">{{ selected.lat }}, {{ selected.lng }}</div>
        </div>
      </div>
      <div v-else class="map__empty">
        <div class="map__emptyTitle">点击选择地点</div>
        <div class="map__emptySub">这里是地图占位区域，可替换为高德/其他地图 SDK</div>
      </div>
    </div>

    <div class="panel">
      <div class="panel__row">
        <label class="field">
          <span class="field__label">时段</span>
          <select v-model="timeSlot" class="field__input">
            <option value="上午">上午</option>
            <option value="下午">下午</option>
            <option value="晚上">晚上</option>
          </select>
        </label>

        <label class="field">
          <span class="field__label">预计花费</span>
          <input v-model.number="estimatedCost" class="field__input" type="number" min="0" step="10" />
        </label>

        <label class="field">
          <span class="field__label">停留时长（分钟）</span>
          <input v-model.number="duration" class="field__input" type="number" min="0" step="10" />
        </label>
      </div>

      <label class="field field--full">
        <span class="field__label">地点备注</span>
        <input v-model="remarks" class="field__input" type="text" placeholder="例如：门票/排队时间/拍照点…" />
      </label>

      <div v-if="errorMessage" class="alert" role="alert">
        {{ errorMessage }}
      </div>

      <div class="cta">
        <button class="btn btn--primary btn--cta" type="button" :disabled="!canAdd" @click="addToPlan">
          <span class="btn__text">{{ adding ? "加入中…" : "加入当前规划" }}</span>
        </button>
        <div class="status" v-if="selected && planId">
          将保存到规划 #{{ planId }}
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.card {
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0.78));
  border: 1px solid rgba(255, 255, 255, 0.6);
  box-shadow: 0 24px 60px rgba(7, 12, 28, 0.22);
  backdrop-filter: blur(10px);
  overflow: hidden;
  color: rgba(10, 14, 26, 0.95);
}

.card__header {
  padding: 22px 22px 14px;
  border-bottom: 1px solid rgba(12, 16, 32, 0.08);
}

.card__kicker {
  display: inline-flex;
  align-items: center;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(14, 21, 45, 0.06);
  color: rgba(14, 21, 45, 0.75);
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-size: 11px;
}

.card__title {
  margin: 10px 0 6px;
  font-size: 22px;
  letter-spacing: -0.02em;
}

.card__subtitle {
  margin: 0;
  color: rgba(14, 21, 45, 0.7);
  font-size: 13px;
  line-height: 1.5;
}

.card__hint {
  color: rgba(160, 35, 96, 0.9);
  font-weight: 650;
}

.map {
  position: relative;
  height: 320px;
  cursor: crosshair;
  background: radial-gradient(1200px 700px at 10% 0%, rgba(255, 221, 239, 0.9), rgba(255, 255, 255, 0)),
    radial-gradient(900px 600px at 100% 60%, rgba(208, 227, 255, 0.9), rgba(255, 255, 255, 0)),
    linear-gradient(135deg, rgba(12, 20, 48, 0.96), rgba(10, 12, 22, 0.92));
  overflow: hidden;
}

.map:focus {
  outline: none;
  box-shadow: inset 0 0 0 4px rgba(18, 54, 160, 0.22);
}

.map__grid {
  position: absolute;
  inset: 0;
  opacity: 0.28;
  background-image: linear-gradient(rgba(255, 255, 255, 0.14) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.12) 1px, transparent 1px);
  background-size: 44px 44px;
  mask-image: radial-gradient(circle at 30% 30%, rgba(0, 0, 0, 1), rgba(0, 0, 0, 0));
}

.map__empty {
  position: absolute;
  inset: 0;
  display: grid;
  align-content: center;
  justify-items: center;
  gap: 8px;
  color: rgba(255, 255, 255, 0.92);
  text-align: center;
  padding: 24px;
}

.map__emptyTitle {
  font-size: 18px;
  font-weight: 750;
  letter-spacing: -0.02em;
}

.map__emptySub {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.72);
  max-width: 44ch;
  line-height: 1.5;
}

.pin {
  position: absolute;
  transform: translate(-50%, -50%);
  pointer-events: none;
}

.pin__dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.95);
  box-shadow: 0 0 0 8px rgba(160, 35, 96, 0.22), 0 0 0 18px rgba(30, 84, 210, 0.16);
}

.pin__label {
  margin-top: 10px;
  padding: 10px 10px;
  border-radius: 14px;
  background: rgba(14, 18, 34, 0.75);
  border: 1px solid rgba(255, 255, 255, 0.18);
  box-shadow: 0 18px 44px rgba(0, 0, 0, 0.32);
  color: rgba(255, 255, 255, 0.95);
  width: max-content;
  max-width: 260px;
}

.pin__name {
  font-weight: 750;
  letter-spacing: -0.02em;
}

.pin__meta {
  margin-top: 4px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.72);
}

.panel {
  padding: 16px 22px 22px;
}

.panel__row {
  display: grid;
  grid-template-columns: repeat(3, minmax(140px, 1fr));
  gap: 8px;
}

.field {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.field--full {
  margin-top: 12px;
}

.field__label {
  font-size: 12px;
  color: rgba(14, 21, 45, 0.75);
  font-weight: 650;
  letter-spacing: 0.02em;
}

.field__input {
  width: 100%;
  min-width: 0;
  border-radius: 12px;
  padding: 11px 12px;
  border: 1px solid rgba(12, 16, 32, 0.12);
  background: rgba(255, 255, 255, 0.8);
  color: rgba(10, 14, 26, 0.95);
  outline: none;
  transition: box-shadow 160ms ease, border-color 160ms ease;
}

.field__input:focus {
  border-color: rgba(18, 54, 160, 0.55);
  box-shadow: 0 0 0 4px rgba(18, 54, 160, 0.12);
}

.alert {
  margin-top: 12px;
  padding: 12px 12px;
  border-radius: 12px;
  background: rgba(205, 37, 65, 0.08);
  border: 1px solid rgba(205, 37, 65, 0.18);
  color: rgba(135, 18, 40, 0.95);
  font-size: 13px;
}

.cta {
  margin-top: 14px;
  display: grid;
  justify-items: center;
  gap: 10px;
}

.btn {
  border-radius: 999px;
  padding: 10px 14px;
  border: 1px solid rgba(12, 16, 32, 0.14);
  font-weight: 700;
  letter-spacing: 0.01em;
  cursor: pointer;
  transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease, background 160ms ease;
}

.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.btn--primary {
  color: white;
  border-color: rgba(12, 26, 82, 0.15);
  background: linear-gradient(135deg, rgba(28, 66, 185, 0.96), rgba(160, 35, 96, 0.94));
  box-shadow: 0 18px 40px rgba(38, 78, 198, 0.26);
}

.btn--cta {
  width: min(420px, 100%);
  padding: 12px 16px;
  font-size: 14px;
}

.btn--primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 20px 48px rgba(38, 78, 198, 0.3);
}

.status {
  font-size: 12px;
  color: rgba(14, 21, 45, 0.7);
}

@media (max-width: 980px) {
  .map {
    height: 280px;
  }

  .panel__row {
    grid-template-columns: 1fr;
  }
}
</style>
