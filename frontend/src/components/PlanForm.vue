<script setup lang="ts">
import { computed, reactive, ref } from "vue"
import { ApiError, apiFetch } from "../lib/api"

type PlanCreate = {
  title: string
  date: string
  budget: number
  people_count: number
  preferences?: string | null
  remarks?: string | null
}

type LocationRead = {
  id: number
  plan_id: number
  name: string
  lat: number
  lng: number
  day_index: number
  time_slot: "上午" | "下午" | "晚上"
  estimated_cost: number
  duration: number
  remarks?: string | null
  weather?: { ok: boolean; summary?: string | null; error?: string | null } | null
}

export type PlanRead = {
  id: number
  title: string
  date: string
  budget: number
  people_count: number
  preferences?: string | null
  remarks?: string | null
  locations: LocationRead[]
}

const emit = defineEmits<{
  (e: "created", plan: PlanRead): void
  (e: "reset"): void
}>()

const form = reactive({
  title: "",
  date: "",
  budget: 0,
  people_count: 1,
  preferences: "",
  remarks: ""
})

const loading = ref(false)
const errorMessage = ref<string | null>(null)

const canSubmit = computed(() => {
  return Boolean(form.title.trim()) && Boolean(form.date) && form.budget >= 0 && form.people_count > 0
})

function applyTemplate(kind: "day" | "weekend") {
  if (kind === "day") {
    form.title = "城市一日游"
    form.budget = 500
    form.preferences = "轻松节奏；1-2 个核心景点 + 2-3 个美食点；尽量步行/地铁"
  } else {
    form.title = "周末轻松游"
    form.budget = 1200
    form.preferences = "慢游；景点与咖啡/书店穿插；避免过早出门；留足休息时间"
  }
}

async function submit() {
  if (!canSubmit.value || loading.value) return
  loading.value = true
  errorMessage.value = null

  const payload: PlanCreate = {
    title: form.title.trim(),
    date: form.date,
    budget: Number(form.budget),
    people_count: Number(form.people_count),
    preferences: form.preferences.trim() ? form.preferences.trim() : null,
    remarks: form.remarks.trim() ? form.remarks.trim() : null
  }

  try {
    const plan = await apiFetch<PlanRead>("/plans", {
      method: "POST",
      body: JSON.stringify(payload)
    })
    emit("created", plan)
  } catch (e) {
    console.error("create plan failed", e)
    errorMessage.value = e instanceof ApiError ? e.message : `保存失败: ${e instanceof Error ? e.message : String(e)}`
  } finally {
    loading.value = false
  }
}

function reset() {
  form.title = ""
  form.date = ""
  form.budget = 0
  form.people_count = 1
  form.preferences = ""
  form.remarks = ""
  errorMessage.value = null
  emit("reset")
}
</script>

<template>
  <section class="card">
    <header class="card__header">
      <div class="card__kicker">Plan</div>
      <div class="headRow">
        <h2 class="card__title">规划信息</h2>
        <div class="tpl">
          <button class="chip" type="button" @click="applyTemplate('day')">一日游模板</button>
          <button class="chip" type="button" @click="applyTemplate('weekend')">周末轻松游模板</button>
        </div>
      </div>
      <p class="card__subtitle">先保存规划，再在右侧选点加入地点。</p>
    </header>

    <form class="form" @submit.prevent="submit">
      <div class="grid">
        <label class="field">
          <span class="field__label">标题</span>
          <input v-model="form.title" class="field__input" type="text" placeholder="例如：周末一日游" />
        </label>

        <label class="field">
          <span class="field__label">出行日期</span>
          <input v-model="form.date" class="field__input" type="date" />
        </label>

        <label class="field">
          <span class="field__label">预算（元）</span>
          <input v-model.number="form.budget" class="field__input" type="number" min="0" step="10" />
        </label>

        <label class="field">
          <span class="field__label">人数</span>
          <input v-model.number="form.people_count" class="field__input" type="number" min="1" step="1" />
        </label>
      </div>

      <label class="field field--full">
        <span class="field__label">偏好</span>
        <input v-model="form.preferences" class="field__input" type="text" placeholder="美食 / 景点 / 亲子 / 轻松…" />
      </label>

      <label class="field field--full">
        <span class="field__label">备注</span>
        <textarea v-model="form.remarks" class="field__input field__textarea" rows="3" placeholder="例如：尽量避开人多，节奏慢一点" />
      </label>

      <div v-if="errorMessage" class="alert" role="alert">
        {{ errorMessage }}
      </div>

      <div class="actions">
        <button class="btn btn--primary" type="submit" :disabled="!canSubmit || loading">
          <span class="btn__text">{{ loading ? "保存中…" : "保存 / 新建规划" }}</span>
        </button>
        <button class="btn btn--ghost" type="button" @click="reset" :disabled="loading">
          清空
        </button>
      </div>
    </form>
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
  gap: 8px;
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

.headRow {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.tpl {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.chip {
  border-radius: 999px;
  padding: 8px 10px;
  border: 1px solid rgba(12, 16, 32, 0.14);
  background: rgba(14, 21, 45, 0.05);
  color: rgba(14, 21, 45, 0.9);
  font-weight: 750;
  letter-spacing: 0.01em;
  cursor: pointer;
  transition: transform 160ms ease, background 160ms ease, border-color 160ms ease;
}

.chip:hover {
  transform: translateY(-1px);
  border-color: rgba(12, 16, 32, 0.2);
  background: rgba(14, 21, 45, 0.08);
}

.card__subtitle {
  margin: 0;
  color: rgba(14, 21, 45, 0.7);
  font-size: 13px;
  line-height: 1.5;
}

.form {
  padding: 18px 22px 22px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px 16px;
}

.field {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.field--full {
  margin-top: 14px;
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
  transition: box-shadow 160ms ease, border-color 160ms ease, transform 160ms ease;
}

.field__input:focus {
  border-color: rgba(18, 54, 160, 0.55);
  box-shadow: 0 0 0 4px rgba(18, 54, 160, 0.12);
}

.field__textarea {
  resize: vertical;
  min-height: 92px;
}

.alert {
  margin-top: 14px;
  padding: 12px 12px;
  border-radius: 12px;
  background: rgba(205, 37, 65, 0.08);
  border: 1px solid rgba(205, 37, 65, 0.18);
  color: rgba(135, 18, 40, 0.95);
  font-size: 13px;
}

.actions {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-top: 16px;
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

.btn--primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 20px 48px rgba(38, 78, 198, 0.3);
}

.btn--ghost {
  background: rgba(255, 255, 255, 0.65);
  color: rgba(14, 21, 45, 0.85);
}

.btn--ghost:hover:not(:disabled) {
  transform: translateY(-1px);
  border-color: rgba(12, 16, 32, 0.2);
}

@media (max-width: 980px) {
  .grid {
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

  .headRow {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }

  .tpl {
    justify-content: stretch;
    gap: 6px;
  }

  .chip {
    flex: 1;
    padding: 8px 10px;
    font-size: 12px;
    text-align: center;
  }

  .form {
    padding: 14px 14px 16px;
  }

  .grid {
    grid-template-columns: 1fr;
    gap: 10px;
  }

  .field__input {
    padding: 10px 11px;
    font-size: 12px;
  }

  .field__label {
    font-size: 11px;
  }

  .field--full {
    margin-top: 12px;
  }

  .field__textarea {
    min-height: 72px;
  }

  .alert {
    margin-top: 12px;
    padding: 10px 11px;
    font-size: 12px;
  }

  .actions {
    flex-direction: column;
    gap: 8px;
    margin-top: 14px;
  }

  .btn {
    flex: 1;
    padding: 14px 16px;
    font-size: 14px;
    min-height: 48px;
  }

  .btn--primary {
    order: 1;
  }

  .btn--ghost {
    order: 2;
  }
}
</style>
