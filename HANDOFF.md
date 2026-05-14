# 项目交接说明（HANDOFF）

## 1. 项目定位

这是一个“智能出行规划器”课程实验项目，采用严格前后端分离架构：

- 前端：Vue 3 + Vite + TypeScript
- 后端：FastAPI + SQLite
- 第三方能力：
  - 高德地图：地图展示、地理编码、逆地理、地名搜索
  - 和风天气：按地点坐标查询天气摘要
  - 大模型：生成 AI 辅助总结文本

项目当前已经实现：

- 新建规划、查看历史规划、删除规划
- 地图选点、搜索地名、加入地点
- 多日行程（按第 N 天切换）
- 按上午/下午/晚上分组展示地点
- 地点编辑、删除
- 行程单导出 Markdown
- 预算超额提醒
- AI 辅助总结

---

## 2. 项目目录

```text
lab3-2/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── __init__.py
│   │   │   └── router.py
│   │   ├── core/
│   │   │   └── settings.py
│   │   ├── db/
│   │   │   ├── __init__.py
│   │   │   ├── database.py
│   │   │   └── session.py
│   │   ├── third_party/
│   │   │   ├── clients/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── deepseek_client.py
│   │   │   │   ├── llm_client.py
│   │   │   │   └── weather_client.py
│   │   │   ├── __init__.py
│   │   │   ├── errors.py
│   │   │   └── http.py
│   │   ├── __init__.py
│   │   ├── main.py
│   │   ├── models.py
│   │   └── schemas.py
│   ├── .env.example
│   ├── .gitignore
│   ├── database.py
│   ├── main.py
│   ├── models.py
│   ├── requirements.txt
│   └── schemas.py
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── AISummaryCard.vue
│   │   │   ├── Itinerary.vue
│   │   │   ├── MapSelector.vue
│   │   │   ├── PlanForm.vue
│   │   │   └── PlanList.vue
│   │   ├── lib/
│   │   │   ├── amap.ts
│   │   │   └── api.ts
│   │   ├── App.vue
│   │   └── main.ts
│   ├── .gitignore
│   ├── index.html
│   ├── package-lock.json
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.js
├── README.md
├── git-log.md
├── chat-export.md
└── lab3-2-summary.md
```

---

## 3. 实际入口与运行方式

### 后端实际入口

当前真正使用的后端入口是：

- `backend/main.py`

虽然 `backend/app/main.py` 也存在，但现在项目运行和 README 启动命令走的是 `backend/main.py`，不要混淆。

### 前端入口

- `frontend/index.html`
- `frontend/src/main.ts`
- 根组件：`frontend/src/App.vue`

### 启动命令

后端：

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --reload --port 8000
```

前端：

```bash
cd frontend
npm install
npm run dev
```

默认访问：

- 前端：http://localhost:5173/
- 后端文档：http://localhost:8000/docs

---

## 4. 后端结构与职责

### 4.1 `backend/main.py`

这是当前项目最核心的后端文件，承担了：

- FastAPI 应用初始化
- CORS 配置
- 数据库启动初始化
- 规划与地点接口
- AI 总结接口
- 高德 Web 服务代理接口
- 前端公共配置接口

核心接口包括：

- `GET /api/health`
- `POST /api/plans`
- `GET /api/plans`
- `GET /api/plans/{plan_id}`
- `DELETE /api/plans/{plan_id}`
- `POST /api/plans/{plan_id}/locations`
- `PUT /api/plans/{plan_id}/locations/{location_id}`
- `DELETE /api/plans/{plan_id}/locations/{location_id}`
- `POST /api/plans/{plan_id}/ai-summary`
- `GET /api/public-config`
- `/_AMapService/*`

### 4.2 数据模型

主要模型在：

- `backend/app/models.py`

包含两个核心表：

- `Plan`
  - 标题、日期、预算、人数、偏好、备注
- `Location`
  - 名称、经纬度、`day_index`、时段、预计花费、停留时长、备注

关系：

- 一个 `Plan` 对应多个 `Location`
- 删除 `Plan` 时会级联删除关联地点

### 4.3 数据库初始化

数据库相关逻辑在：

- `backend/app/db/database.py`

特点：

- 使用 SQLite
- `init_db()` 会在启动时自动建表
- 对 `Location.day_index` 做了 SQLite 启动时缺列补列，兼容旧库

### 4.4 配置读取

配置在：

- `backend/app/core/settings.py`

目前已经固定读取：

- `backend/.env`

这样即使从不同目录启动后端，也不会读错 `.env`。

### 4.5 Schema

Pydantic schema 在：

- `backend/app/schemas.py`

主要负责：

- 请求体验证
- 响应体序列化
- `TimeSlot` 限定为“上午 / 下午 / 晚上”
- AI 返回 `{ text: string }`

### 4.6 第三方封装

位于：

- `backend/app/third_party/`

作用：

- `http.py`：统一 HTTP 请求与异常包装
- `errors.py`：第三方异常类型
- `weather_client.py`：天气查询
- `deepseek_client.py`：LLM 调用与 AI 输出清洗

特别说明：

- `deepseek_client.py` 虽然文件名叫 deepseek，但现在实际上兼容 OpenAI 风格接口，因此也可接智谱的兼容接口
- 这里已经加入“去除思考过程 / 草稿 / 自检 / 截断补救”的清洗逻辑

---

## 5. 前端结构与职责

### 5.1 `App.vue`

这是前端状态中心，主要负责：

- 保存当前规划 `currentPlan`
- 刷新规划详情
- 计算预算总额与超额提醒
- 协调各个组件之间的数据流

可以把它理解为当前前端的“页面编排层”。

### 5.2 `PlanForm.vue`

职责：

- 创建规划
- 录入标题、日期、预算、人数、偏好、备注
- 提供快捷模板

### 5.3 `MapSelector.vue`

职责：

- 加载高德 JS SDK
- 展示地图
- 点击地图选点并放置 Marker
- 逆地理显示地名
- 输入地名/地址搜索
- 将地点加入当前规划

注意：

- 地图 SDK 用的是 `AMAP_JS_KEY`
- 地理编码 / 逆地理 / 搜索依赖后端的 `/_AMapService/*` 代理
- 若这部分失效，第一优先检查 `.env` 里的高德 key 配置是否正确

### 5.4 `Itinerary.vue`

职责：

- 行程展示
- 多日 Tab 切换
- 按上午 / 下午 / 晚上分组
- 编辑地点信息
- 删除地点
- 删除当天
- 导出 Markdown 行程单

这是业务最密集的前端组件之一。

### 5.5 `AISummaryCard.vue`

职责：

- 点击后调用 `/api/plans/{id}/ai-summary`
- 展示 AI 返回文本
- 展示 Loading
- 展示错误信息

### 5.6 `PlanList.vue`

职责：

- 展示历史规划摘要列表
- 打开历史规划
- 删除历史规划

### 5.7 前端基础库

#### `frontend/src/lib/api.ts`

职责：

- 统一拼接 API 地址
- 基于 `VITE_API_ORIGIN` + `VITE_API_BASE`
- 统一处理 `ApiError`

#### `frontend/src/lib/amap.ts`

职责：

- 动态加载 AMap SDK
- 注入 `window._AMapSecurityConfig`

---

## 6. 核心数据流

### 创建规划

1. 前端 `PlanForm.vue` 提交
2. 调 `POST /api/plans`
3. 后端创建 `Plan`
4. 返回新规划
5. `App.vue` 更新当前规划状态

### 地图加点

1. `MapSelector.vue` 点击地图或输入地名搜索
2. 得到经纬度与地名
3. 用户填写时段 / 花费 / 时长 / 备注
4. 调 `POST /api/plans/{id}/locations`
5. 后端写入 `Location`
6. 后端顺便回填天气信息
7. 前端刷新/更新当前规划

### 编辑地点

1. `Itinerary.vue` 中修改字段
2. 调 `PUT /api/plans/{id}/locations/{location_id}`
3. 后端保存并回传最新地点

### 删除地点 / 删除规划

- 删除地点：`DELETE /api/plans/{id}/locations/{location_id}`
- 删除规划：`DELETE /api/plans/{id}`

### AI 总结

1. `AISummaryCard.vue` 点击按钮
2. 调 `POST /api/plans/{id}/ai-summary`
3. 后端聚合：
   - 规划信息
   - 地点清单
   - 天气
   - 预算与花费
4. 后端调用 LLM
5. 清洗文本后返回给前端
6. 前端展示纯文本结果

---

## 7. 环境变量与第三方依赖

后端 `.env` 关键项：

```env
APP_ENV=dev
DATABASE_URL=sqlite:///./app.db

QWEATHER_HOST=...
QWEATHER_KEY=...

DEEPSEEK_API_KEY=...
LLM_API_KEY=...
DEEPSEEK_BASE_URL=...
DEEPSEEK_MODEL=...

AMAP_JS_KEY=...
AMAP_WEB_KEY=...
AMAP_SECURITY_JSCODE=...
```

### 高德相关

- `AMAP_JS_KEY`
  - 用于前端地图 JS SDK 加载
- `AMAP_WEB_KEY`
  - 用于高德 Web 服务
  - 地理编码 / 逆地理 / 搜索需要它
- `AMAP_SECURITY_JSCODE`
  - 新 key 常需要配合使用

如果地图能显示但地名解析失败，优先排查：

- `AMAP_WEB_KEY` 是否为 Web 服务 Key
- 是否报 `USERKEY_PLAT_NOMATCH`
- `AMAP_SECURITY_JSCODE` 是否和当前 Key 匹配

### LLM 相关

- 当前实现支持 OpenAI 兼容接口风格
- 智谱可通过兼容接口调用
- 如果返回大量“草稿/构思/检查”，优先看 `deepseek_client.py` 的清洗逻辑

---

## 8. 当前已知易踩坑点

### 8.1 后端入口混淆

项目里存在：

- `backend/main.py`
- `backend/app/main.py`

但当前真正运行的是：

- `backend/main.py`

如果后续要重构成标准分层路由，需要统一入口，避免双 main 并存。

### 8.2 高德 Key 类型混淆

最常见问题：

- `AMAP_JS_KEY` 能加载地图
- 但 `AMAP_WEB_KEY` 没配对或平台不匹配
- 结果：地图显示正常，但地名解析与搜索失败

### 8.3 AI 输出不稳定

智谱/兼容模型可能出现：

- `content` 为空
- 内容出现在 `reasoning_content`
- 输出带思考过程
- 输出被截断

当前后端已做补救，但后续如果更换模型，仍需回归测试。

### 8.4 单文件过重

目前：

- `backend/main.py`
- `frontend/src/App.vue`
- `frontend/src/components/Itinerary.vue`
- `frontend/src/components/MapSelector.vue`

职责较重。若后续继续扩展，建议拆分：

- 后端按 router / service / repository 分层
- 前端把地图逻辑、AI 总结逻辑、多日行程逻辑进一步拆开

---

## 9. 接手建议

如果后续由别人继续维护，建议优先按以下顺序理解：

1. 先看 `README.md`
2. 再看 `HANDOFF.md`
3. 后端先从 `backend/main.py` 看起
4. 前端先从 `frontend/src/App.vue` 看起
5. 再分别进入：
   - `MapSelector.vue`
   - `Itinerary.vue`
   - `AISummaryCard.vue`
6. 最后查看：
   - `backend/app/third_party/clients/deepseek_client.py`
   - `backend/app/third_party/clients/weather_client.py`
   - `frontend/src/lib/api.ts`
   - `frontend/src/lib/amap.ts`

---

## 10. 开发与排查建议

### 本地调试时优先看

- 前端浏览器控制台
- 后端 uvicorn 日志
- `/api/public-config`
- `/api/health`
- `/docs`

### AI 有问题时看

- `.env` 是否正确加载
- `DEEPSEEK_BASE_URL`、`DEEPSEEK_MODEL` 是否与当前服务商兼容
- 后端日志里的 `[ai-summary]` 打印

### 地图有问题时看

- `GET /api/public-config`
- `/_AMapService/*` 请求是否返回高德错误码
- 是否出现：
  - `INVALID_USER_KEY`
  - `USERKEY_PLAT_NOMATCH`

---

## 11. 结论

这个项目已经从“基础 CRUD 规划器”扩展成了一个完整的小型前后端系统，包含：

- 数据持久化
- 多日行程组织
- 外部地图与天气服务接入
- AI 文本生成
- 前端复杂交互与状态联动

如果要继续维护，优先工作不是“重写”，而是：

- 先理解当前入口和数据流
- 再围绕热点文件做小步重构
- 最后逐渐把后端和前端都拆分成更清晰的模块

