<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { ApiError, apiFetch } from "../lib/api"

type PlanSummary = {
  id: number
  title: string
  date: string
}

const props = defineProps<{
  open: boolean
  currentPlanId: number | null
}>()

const emit = defineEmits<{
  (e: "close"): void
  (e: "openPlan", planId: number): void
  (e: "deleted", planId: number): void
}>()

const loading = ref(false)
const errorMessage = ref<string | null>(null)
const plans = ref<PlanSummary[]>([])
const busyId = ref<number | null>(null)

const hasPlans = computed(() => plans.value.length > 0)

async function load() {
  loading.value = true
  errorMessage.value = null
  try {
    plans.value = await apiFetch<PlanSummary[]>("/plans", { method: "GET" })
  } catch (e) {
    console.error("load plans failed", e)
    errorMessage.value = e instanceof ApiError ? e.message : `加载失败: ${e instanceof Error ? e.message : String(e)}`
  } finally {
    loading.value = false
  }
}

watch(
  () => props.open,
  (v) => {
    if (v) void load()
  }
)

function close() {
  emit("close")
}

function openPlan(id: number) {
  emit("openPlan", id)
}

async function removePlan(id: number) {
  if (busyId.value) return
  busyId.value = id
  errorMessage.value = null
  try {
    await apiFetch<void>(`/plans/${id}`, { method: "DELETE" })
    plans.value = plans.value.filter((p) => p.id !== id)
    emit("deleted", id)
  } catch (e) {
    console.error("delete plan failed", e)
    errorMessage.value = e instanceof ApiError ? e.message : `删除失败: ${e instanceof Error ? e.message : String(e)}`
  } finally {
    busyId.value = null
  }
}
</script>

<template>
  <div v-if="open" class="overlay" role="dialog" aria-modal="true">
    <div class="backdrop" @click="close"></div>
    <section class="panel">
      <header class="panel__header">
        <div class="panel__kicker">History</div>
        <div class="panel__titleRow">
          <h2 class="panel__title">历史记录 · 规划列表</h2>
          <div class="panel__actions">
            <button class="btn btn--ghost" type="button" :disabled="loading" @click="load">刷新</button>
            <button class="iconBtn" type="button" @click="close" title="关闭">×</button>
          </div>
        </div>
        <p class="panel__subtitle">打开历史规划继续编辑，或删除不需要的规划。</p>
      </header>

      <div class="panel__body">
        <div v-if="errorMessage" class="alert" role="alert">
          {{ errorMessage }}
        </div>

        <div v-if="loading" class="loading">加载中…</div>

        <div v-else-if="!hasPlans" class="empty">暂无历史规划</div>

        <div v-else class="grid">
          <article v-for="p in plans" :key="p.id" class="card" :data-active="p.id === currentPlanId">
            <div class="card__top">
              <div class="card__title" :title="p.title">{{ p.title }}</div>
              <div class="badge" v-if="p.id === currentPlanId">当前</div>
            </div>
            <div class="card__meta">
              <span class="meta">#{{ p.id }}</span>
              <span class="meta">{{ p.date }}</span>
            </div>
            <div class="card__actions">
              <button class="btn btn--primary" type="button" :disabled="busyId === p.id" @click="openPlan(p.id)">
                打开
              </button>
              <button class="btn btn--danger" type="button" :disabled="busyId === p.id" @click="removePlan(p.id)">
                删除
              </button>
            </div>
          </article>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: grid;
  place-items: center;
  padding: 18px;
}

.backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(8px);
}

.panel {
  position: relative;
  width: min(980px, 100%);
  max-height: min(80vh, 720px);
  display: grid;
  grid-template-rows: auto 1fr;
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.06));
  border: 1px solid rgba(255, 255, 255, 0.16);
  box-shadow: 0 34px 90px rgba(0, 0, 0, 0.42);
  overflow: hidden;
  color: rgba(255, 255, 255, 0.94);
}

.panel__header {
  padding: 16px 18px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
}

.panel__kicker {
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

.panel__titleRow {
  margin-top: 10px;
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
}

.panel__title {
  margin: 0;
  font-size: 18px;
  letter-spacing: -0.01em;
}

.panel__actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.panel__subtitle {
  margin: 8px 0 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.66);
  line-height: 1.5;
}

.panel__body {
  padding: 14px 18px 18px;
  overflow: auto;
}

.alert {
  padding: 12px 12px;
  border-radius: 12px;
  background: rgba(255, 44, 86, 0.12);
  border: 1px solid rgba(255, 90, 116, 0.35);
  color: rgba(255, 255, 255, 0.92);
  font-size: 13px;
  margin-bottom: 12px;
}

.loading,
.empty {
  padding: 18px 4px;
  color: rgba(255, 255, 255, 0.7);
  font-size: 13px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.card {
  border-radius: 16px;
  padding: 12px 12px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(10, 12, 22, 0.34);
  box-shadow: 0 18px 44px rgba(0, 0, 0, 0.22);
  min-width: 0;
}

.card[data-active="true"] {
  border-color: rgba(83, 163, 255, 0.4);
  box-shadow: 0 18px 44px rgba(83, 163, 255, 0.12);
}

.card__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.card__title {
  font-weight: 850;
  letter-spacing: -0.01em;
  font-size: 14px;
  line-height: 1.25;
  word-break: break-word;
}

.badge {
  flex: 0 0 auto;
  border-radius: 999px;
  padding: 5px 8px;
  border: 1px solid rgba(83, 163, 255, 0.28);
  background: rgba(83, 163, 255, 0.12);
  color: rgba(214, 236, 255, 0.9);
  font-size: 12px;
  font-weight: 750;
}

.card__meta {
  margin-top: 8px;
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.meta {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.66);
}

.card__actions {
  margin-top: 12px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.btn {
  border-radius: 999px;
  padding: 10px 12px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  font-weight: 800;
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

.btn--primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 20px 48px rgba(38, 78, 198, 0.3);
}

.btn--danger {
  background: rgba(255, 44, 86, 0.12);
  border-color: rgba(255, 90, 116, 0.35);
  color: rgba(255, 195, 205, 0.92);
}

.btn--danger:hover:not(:disabled) {
  transform: translateY(-1px);
  background: rgba(255, 44, 86, 0.16);
  border-color: rgba(255, 90, 116, 0.45);
}

.btn--ghost {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.14);
  color: rgba(255, 255, 255, 0.9);
}

.btn--ghost:hover:not(:disabled) {
  transform: translateY(-1px);
  background: rgba(255, 255, 255, 0.09);
}

.iconBtn {
  width: 30px;
  height: 30px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.92);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  transition: transform 160ms ease, background 160ms ease, border-color 160ms ease;
}

.iconBtn:hover {
  transform: translateY(-1px);
  background: rgba(255, 255, 255, 0.09);
  border-color: rgba(255, 255, 255, 0.22);
}

@media (max-width: 980px) {
  .grid {
    grid-template-columns: 1fr;
  }
}
</style>
