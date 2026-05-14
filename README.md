# Lab 3-2 智能出行规划器

严格前后端分离：

- 前端：Vue 3 + Vite（只调用后端 `/api`）
- 后端：Python + FastAPI + SQLite（统一封装第三方 API，前端不接触任何 API Key）

## 功能概览

- 规划管理：新建规划、打开历史规划、删除规划
- 地点管理：地图选点加入规划、编辑地点信息、删除地点
- 多日行程：按“第 N 天”切换，支持新增一天与删除当天（删除后后续天自动前移）
- 行程展示：按上午/下午/晚上分组展示与编辑
- 导出：导出行程单为 Markdown（.md 下载）
- 预算提醒：实时计算总花费，超出预算会提示警告
- AI 辅助总结：按需调用 DeepSeek 生成建议文本（后端读取 Key）

## 目录结构

- `frontend/` 前端工程
- `backend/` 后端工程

## 启动后端

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --reload --port 8000
```

## 启动前端

```bash
cd frontend
npm install
npm run dev
```

前端开发服务器通过 `VITE_API_ORIGIN` 指定后端地址，默认使用 `http://localhost:8000`。

## 环境变量（后端 .env）

复制 `backend/.env.example` 到 `backend/.env` 后按需填写：
(.env 文件可能被隐藏，可在 IDE 中查看)

- 天气（可选，未配置也能使用规划主流程）：
  - `QWEATHER_HOST`（或 `YOUR_QWEATHER_HOST`）
  - `QWEATHER_KEY`（或 `YOUR_QWEATHER_KEY`）
- AI（可选，未配置时 AI 总结接口会返回 503）：
  - `DEEPSEEK_API_KEY`（或 `LLM_API_KEY`）
  - `DEEPSEEK_BASE_URL`（默认 `https://api.deepseek.com/v1`）
  - `DEEPSEEK_MODEL`（默认 `deepseek-chat`）
- 地图（高德 JS API，必须提供给浏览器加载脚本；建议在高德控制台设置域名白名单）：
  - `AMAP_JS_KEY`
  - `AMAP_WEB_KEY`（高德 Web 服务 Key，用于地理编码/逆地理/POI 搜索；推荐单独申请）
  - `AMAP_SECURITY_JSCODE`（2021-12-02 之后申请的 key 通常需要；配合后端代理转发使用）

## 前端环境变量（frontend/.env，可选）

如果后端不是跑在本机 8000 端口（例如部署到服务器），在 `frontend/.env` 设置：

```env
VITE_API_ORIGIN=http://localhost:8000
VITE_API_BASE=/api
```

## 运行与使用

1. 启动后端与前端后，打开前端页面：`http://localhost:5173/`
2. 先在“规划信息”里填写标题/日期/预算等并保存规划
3. 在“地图选点”中：
   - 点击地图放置 Marker（会显示地名与坐标）
   - 或在地图下方输入地名/地址搜索并定位
   - 填写时段/花费/停留时长/备注后点击“加入当前规划”
4. 在“已选地点·行程安排”中：
   - 按“第 N 天”切换多日行程，支持新增一天与删除当天
   - 按上午/下午/晚上分组编辑地点信息或删除地点
   - 导出行程单为 Markdown（.md 下载）
   - 若总花费超出预算会显示警报
5. 在“AI 辅助总结”中点击生成建议（需要配置 LLM Key）
6. 点击右上角“历史记录”可查看/打开/删除历史规划

## 常用接口（后端）

所有接口均以 `/api` 为前缀：

- `GET /api/health`
- `POST /api/plans` 新建规划
- `GET /api/plans` 历史规划摘要列表（id/title/date）
- `GET /api/plans/{plan_id}` 获取规划详情（含 locations + weather）
- `DELETE /api/plans/{plan_id}` 删除规划（级联删除地点）
- `POST /api/plans/{plan_id}/locations` 加入地点（支持 `day_index`，默认 1）
- `PUT /api/plans/{plan_id}/locations/{location_id}` 更新地点（支持更新 `day_index`）
- `DELETE /api/plans/{plan_id}/locations/{location_id}` 删除地点
- `POST /api/plans/{plan_id}/ai-summary` 生成 AI 总结（返回纯文本）
- `GET /api/public-config` 前端公共配置（用于下发高德 JS key）
  - 前端通过该接口获取 `AMAP_JS_KEY/AMAP_SECURITY_JSCODE`，再动态加载高德 JS SDK
  - 高德 Web 服务请求通过 `/_AMapService/*` 由后端转发并自动追加 `key/jscode`
