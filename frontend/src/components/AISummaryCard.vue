<script setup lang="ts">
import { computed, ref } from "vue"
import { ApiError, apiFetch } from "../lib/api"

const props = defineProps<{
  planId: number | null
}>()

const loading = ref(false)
const errorMessage = ref<string | null>(null)
const text = ref<string>("")

const canGenerate = computed(() => Boolean(props.planId) && !loading.value)

async function generate() {
  if (!props.planId || loading.value) return
  loading.value = true
  errorMessage.value = null
  try {
    const res = await apiFetch<{ text: string }>(`/plans/${props.planId}/ai-summary`, { method: "POST" })
    const t = (res.text ?? "").trim()
    if (!t) {
      text.value = ""
      errorMessage.value = "AI 生成失败，请检查 CloudBase 控制台中 ai-summary 云函数的 DEEPSEEK_API_KEY 环境变量配置"
      return
    }
    text.value = t
  } catch (e) {
    console.error("详细错误", e)
    errorMessage.value = e instanceof ApiError ? e.message : `生成失败: ${e instanceof Error ? e.message : String(e)}`
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <section class="card">
    <header class="card__header">
      <div class="card__kicker">AI</div>
      <h2 class="card__title">AI 辅助总结</h2>
      <p class="card__subtitle">根据当前规划与地点信息，生成排版好的纯文本建议。</p>
    </header>

    <div class="card__body">
      <button class="btn btn--primary btn--cta" type="button" :disabled="!canGenerate" @click="generate">
        {{ loading ? "生成中…" : "生成智能建议" }}
      </button>

      <div v-if="!planId" class="hint">请先保存规划并添加地点</div>

      <div v-if="errorMessage" class="alert" role="alert">
        {{ errorMessage }}
      </div>

      <div v-else-if="text" class="out">
        <pre class="md">{{ text }}</pre>
      </div>
    </div>
  </section>
</template>

<style scoped>
.card {
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.06));
  border: 1px solid rgba(255, 255, 255, 0.16);
  box-shadow: 0 24px 60px rgba(7, 12, 28, 0.22);
  backdrop-filter: blur(10px);
  overflow: hidden;
  color: rgba(255, 255, 255, 0.94);
}

.card__header {
  padding: 16px 18px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
}

.card__kicker {
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

.card__title {
  margin: 10px 0 6px;
  font-size: 18px;
  letter-spacing: -0.01em;
}

.card__subtitle {
  margin: 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.66);
  line-height: 1.5;
}

.card__body {
  padding: 14px 18px 18px;
  display: grid;
  gap: 12px;
}

.btn {
  border-radius: 999px;
  padding: 10px 14px;
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

.btn--cta {
  width: min(520px, 100%);
}

.hint {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.66);
}

.alert {
  padding: 12px 12px;
  border-radius: 12px;
  background: rgba(255, 44, 86, 0.12);
  border: 1px solid rgba(255, 90, 116, 0.35);
  color: rgba(255, 255, 255, 0.92);
  font-size: 13px;
}

.out {
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(10, 12, 22, 0.34);
  padding: 12px 12px;
  max-height: 360px;
  overflow: auto;
}

.md {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 12.5px;
  line-height: 1.55;
  color: rgba(255, 255, 255, 0.88);
}
</style>
