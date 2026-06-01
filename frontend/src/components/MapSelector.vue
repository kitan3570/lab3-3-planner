<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue"
import { ApiError, apiFetch } from "../lib/api"
import { loadAmapJs } from "../lib/amap"

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

type Selected = { name: string; lat: number; lng: number }
const selected = ref<Selected | null>(null)

const timeSlot = ref<TimeSlot>("上午")
const estimatedCost = ref<number>(0)
const duration = ref<number>(60)
const remarks = ref<string>("")

const placeQuery = ref("")
const searching = ref(false)
const searchError = ref<string | null>(null)
const nameWarning = ref<string | null>(null)

const mapEl = ref<HTMLDivElement | null>(null)
const mapLoading = ref(false)
const mapReady = ref(false)
const mapError = ref<string | null>(null)

let AMap: any = null
let map: any = null
let marker: any = null
let geocoder: any = null
let placeSearch: any = null

const adding = ref(false)
const errorMessage = ref<string | null>(null)

const canAdd = computed(() => Boolean(props.planId) && Boolean(selected.value) && !adding.value)

async function ensureAmap() {
  if (mapReady.value || mapLoading.value) return
  mapLoading.value = true
  mapError.value = null
  try {
    const cfg = await apiFetch<{ amap_js_key?: string | null; amap_security_js_code?: string | null }>("/public-config")
    const key = (cfg.amap_js_key ?? "").trim()
    if (!key) throw new Error("未配置高德地图 Key，请在 CloudBase 控制台为 plan 云函数配置 AMAP_JS_KEY 环境变量")
    const jscode = (cfg.amap_security_js_code ?? "").trim()
    const apiOrigin = "https://lab3-d3gc0uqhg90f39d16.service.tcloudbase.com/plan"
    const serviceHost = `${apiOrigin}/_AMapService`
    AMap = await loadAmapJs(key, { securityJsCode: jscode || null, serviceHost })
    if (!mapEl.value) throw new Error("Map container missing")
    map = new AMap.Map(mapEl.value, {
      zoom: 11,
      center: [116.4, 39.9]
    })

    await new Promise<void>((resolve) => {
      AMap.plugin(["AMap.Geocoder", "AMap.PlaceSearch"], () => resolve())
    })
    geocoder = new AMap.Geocoder({ radius: 800, extensions: "all", city: "全国" })
    placeSearch = new AMap.PlaceSearch({ pageSize: 1, pageIndex: 1, city: "全国" })

    map.on("click", async (ev: any) => {
      const lng = Number(ev?.lnglat?.lng)
      const lat = Number(ev?.lnglat?.lat)
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return
      const resolved = await reverseGeocode(lng, lat)
      setSelection({ lng, lat, name: resolved.name, warning: resolved.warning })
    })

    mapReady.value = true
  } catch (e) {
    mapError.value = e instanceof Error ? e.message : String(e)
  } finally {
    mapLoading.value = false
  }
}

function setSelection(next: { lng: number; lat: number; name: string; warning?: string | null }) {
  selected.value = { name: next.name, lat: next.lat, lng: next.lng }
  errorMessage.value = null
  searchError.value = null
  nameWarning.value = next.warning ?? null
  if (!map || !AMap) return
  if (!marker) {
    marker = new AMap.Marker({ position: [next.lng, next.lat] })
    map.add(marker)
  } else {
    marker.setPosition([next.lng, next.lat])
  }
  map.setCenter([next.lng, next.lat])
  marker.setLabel({
    direction: "top",
    offset: new AMap.Pixel(0, -8),
    content: `<div style="padding:6px 8px;border-radius:10px;background:rgba(14,18,34,.78);border:1px solid rgba(255,255,255,.18);color:rgba(255,255,255,.92);font-size:12px;max-width:240px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(next.name)}</div>`
  })
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (ch) => {
    if (ch === "&") return "&amp;"
    if (ch === "<") return "&lt;"
    if (ch === ">") return "&gt;"
    if (ch === '"') return "&quot;"
    return "&#039;"
  })
}

function reverseGeocode(lng: number, lat: number): Promise<{ name: string; warning?: string | null }> {
  const fallback = `坐标点 ${lng.toFixed(6)},${lat.toFixed(6)}`
  if (!geocoder) return Promise.resolve({ name: fallback, warning: "地名解析服务未就绪" })
  const p = new Promise<{ name: string; warning?: string | null }>((resolve) => {
    geocoder.getAddress([lng, lat], (status: string, result: any) => {
      const regeocode = result?.regeocode
      const addr = regeocode?.formattedAddress
      const info = result?.info
      const infocode = result?.infocode
      if (status === "complete" && regeocode) {
        const poiName = regeocode?.pois?.[0]?.name
        const name = String(addr || poiName || fallback)
        resolve({ name, warning: name === fallback ? "未解析到地名" : null })
        return
      }
      const extra = [info, infocode].filter(Boolean).join(" / ")
      resolve({ name: fallback, warning: `地名解析失败：${extra || status}` })
    })
  })
  return Promise.race([
    p,
    new Promise<{ name: string; warning?: string | null }>((resolve) =>
      window.setTimeout(() => resolve({ name: fallback, warning: "地名解析超时（请检查 key/jscode/白名单）" }), 8000)
    )
  ])
}

function parseLngLat(query: string): { lng: number; lat: number } | null {
  const m = query
    .trim()
    .match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/)
  if (!m) return null
  const lng = Number(m[1])
  const lat = Number(m[2])
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null
  return { lng, lat }
}

function geocode(query: string): Promise<{ lng: number; lat: number; name: string; warning?: string | null } | null> {
  const q = query.trim()
  if (!q) return Promise.resolve(null)
  if (!geocoder) return Promise.resolve(null)
  const p = new Promise<{ lng: number; lat: number; name: string; warning?: string | null } | null>((resolve) => {
    geocoder.getLocation(q, (status: string, result: any) => {
      const loc = result?.geocodes?.[0]?.location
      const formatted = result?.geocodes?.[0]?.formattedAddress ?? q
      if (status === "complete" && loc) {
        const lng = Number(loc.lng)
        const lat = Number(loc.lat)
        if (Number.isFinite(lng) && Number.isFinite(lat)) resolve({ lng, lat, name: String(formatted) })
        else resolve(null)
      } else {
        resolve(null)
      }
    })
  })
  return Promise.race([
    p,
    new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 8000))
  ])
}

function placeSearchByKeyword(query: string): Promise<{ lng: number; lat: number; name: string } | null> {
  const q = query.trim()
  if (!q) return Promise.resolve(null)
  if (!placeSearch) return Promise.resolve(null)
  const p = new Promise<{ lng: number; lat: number; name: string } | null>((resolve) => {
    placeSearch.search(q, (status: string, result: any) => {
      const poi = result?.poiList?.pois?.[0]
      const loc = poi?.location
      if (status === "complete" && poi && loc) {
        const lng = Number(loc.lng)
        const lat = Number(loc.lat)
        if (Number.isFinite(lng) && Number.isFinite(lat)) resolve({ lng, lat, name: String(poi.name ?? q) })
        else resolve(null)
      } else {
        resolve(null)
      }
    })
  })
  return Promise.race([
    p,
    new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 8000))
  ])
}

async function searchPlace() {
  if (searching.value) return
  searchError.value = null
  const q = placeQuery.value.trim()
  if (!q) {
    searchError.value = "请输入地名或地址"
    return
  }
  if (!mapReady.value) {
    searchError.value = "地图未就绪"
    return
  }
  searching.value = true
  try {
    const ll = parseLngLat(q)
    if (ll) {
      const resolved = await reverseGeocode(ll.lng, ll.lat)
      setSelection({ lng: ll.lng, lat: ll.lat, name: resolved.name, warning: resolved.warning })
      return
    }

    const res1 = await geocode(q)
    if (res1) {
      setSelection(res1)
      return
    }

    const res2 = await placeSearchByKeyword(q)
    if (res2) {
      const resolved = await reverseGeocode(res2.lng, res2.lat)
      setSelection({ lng: res2.lng, lat: res2.lat, name: resolved.name || res2.name, warning: resolved.warning })
      return
    }

    searchError.value = "未找到匹配地点（请检查高德 Key 是否已开通地理编码/逆地理服务）"
  } finally {
    searching.value = false
  }
}

onMounted(() => {
  void ensureAmap()
})

onBeforeUnmount(() => {
  try {
    if (map) map.destroy()
  } catch {
  } finally {
    map = null
    marker = null
    geocoder = null
    placeSearch = null
  }
})

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

    <div class="mapWrap">
      <div ref="mapEl" class="map"></div>
      <div v-if="mapLoading" class="map__overlay">地图加载中…</div>
      <div v-else-if="mapError" class="map__overlay map__overlay--err">{{ mapError }}</div>
      <div v-else-if="!mapReady" class="map__overlay">地图未就绪</div>
    </div>

    <div class="mapBar">
      <div class="mapBar__left">
        <div class="mapBar__label">当前选点</div>
        <div v-if="selected" class="mapBar__value" :title="selected.name">
          {{ selected.name }}
          <span class="mapBar__coord">（{{ selected.lat }}, {{ selected.lng }}）</span>
        </div>
        <div v-if="selected && nameWarning" class="mapBar__warn">{{ nameWarning }}</div>
        <div v-else class="mapBar__value mapBar__value--idle">尚未选点</div>
      </div>

      <div class="mapBar__right">
        <div class="search">
          <input
            v-model="placeQuery"
            class="search__input"
            type="text"
            placeholder="输入地名/地址，回车搜索"
            :disabled="mapLoading || !mapReady"
            @keydown.enter.prevent="searchPlace"
          />
          <button class="search__btn" type="button" :disabled="searching || mapLoading || !mapReady" @click="searchPlace">
            {{ searching ? "搜索中…" : "搜索" }}
          </button>
        </div>
        <div v-if="searchError" class="searchErr">{{ searchError }}</div>
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
          {{ selected.name }}（{{ selected.lat }}, {{ selected.lng }}）将保存到规划 #{{ planId }} · 第 {{ dayIndex }} 天
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

.mapWrap {
  position: relative;
  height: 320px;
  overflow: hidden;
}

.map {
  height: 100%;
  width: 100%;
}

.map__overlay {
  position: absolute;
  inset: 0;
  display: grid;
  align-content: center;
  justify-items: center;
  text-align: center;
  padding: 24px;
  color: rgba(255, 255, 255, 0.92);
  background: radial-gradient(1200px 700px at 10% 0%, rgba(255, 221, 239, 0.9), rgba(255, 255, 255, 0)),
    radial-gradient(900px 600px at 100% 60%, rgba(208, 227, 255, 0.9), rgba(255, 255, 255, 0)),
    linear-gradient(135deg, rgba(12, 20, 48, 0.96), rgba(10, 12, 22, 0.92));
}

.map__overlay--err {
  color: rgba(255, 195, 205, 0.92);
}

.mapBar {
  padding: 12px 22px;
  border-bottom: 1px solid rgba(12, 16, 32, 0.08);
  display: grid;
  grid-template-columns: 1fr minmax(280px, 0.9fr);
  gap: 12px;
  align-items: center;
}

.mapBar__label {
  font-size: 12px;
  color: rgba(14, 21, 45, 0.7);
  font-weight: 650;
  letter-spacing: 0.02em;
}

.mapBar__value {
  margin-top: 6px;
  font-size: 13px;
  color: rgba(10, 14, 26, 0.95);
  font-weight: 750;
  letter-spacing: -0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mapBar__value--idle {
  color: rgba(14, 21, 45, 0.55);
  font-weight: 650;
}

.mapBar__coord {
  font-size: 12px;
  font-weight: 650;
  color: rgba(14, 21, 45, 0.62);
}

.mapBar__warn {
  margin-top: 6px;
  font-size: 12px;
  color: rgba(135, 18, 40, 0.92);
  font-weight: 650;
}

.search {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  align-items: center;
}

.search__input {
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

.search__input:focus {
  border-color: rgba(18, 54, 160, 0.55);
  box-shadow: 0 0 0 4px rgba(18, 54, 160, 0.12);
}

.search__btn {
  border-radius: 999px;
  padding: 10px 12px;
  border: 1px solid rgba(12, 16, 32, 0.14);
  font-weight: 750;
  letter-spacing: 0.01em;
  cursor: pointer;
  transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease, background 160ms ease;
  background: rgba(255, 255, 255, 0.7);
  color: rgba(14, 21, 45, 0.9);
}

.search__btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.search__btn:hover:not(:disabled) {
  transform: translateY(-1px);
  border-color: rgba(12, 16, 32, 0.2);
}

.searchErr {
  margin-top: 8px;
  font-size: 12px;
  color: rgba(135, 18, 40, 0.95);
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
  .mapWrap {
    height: 280px;
  }

  .mapBar {
    grid-template-columns: 1fr;
    padding: 12px 16px;
  }

  .panel__row {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .card__header {
    padding: 16px 16px 10px;
  }

  .card__title {
    font-size: 18px;
  }

  .card__subtitle {
    font-size: 12px;
  }

  .mapWrap {
    height: 240px;
  }

  .mapBar {
    grid-template-columns: 1fr;
    padding: 10px 14px;
    gap: 10px;
  }

  .mapBar__left {
    order: 2;
  }

  .mapBar__right {
    order: 1;
  }

  .search {
    grid-template-columns: 1fr auto;
    gap: 6px;
  }

  .search__input {
    padding: 10px 11px;
    font-size: 12px;
  }

  .search__btn {
    padding: 8px 10px;
    font-size: 12px;
  }

  .panel {
    padding: 12px 14px 16px;
  }

  .panel__row {
    grid-template-columns: 1fr;
    gap: 6px;
  }

  .field__input {
    padding: 10px 11px;
    font-size: 12px;
  }

  .cta {
    margin-top: 12px;
    gap: 8px;
  }

  .btn--cta {
    width: 100%;
    padding: 14px 16px;
    font-size: 14px;
    min-height: 48px;
  }

  .status {
    font-size: 11px;
    text-align: center;
  }
}
</style>
