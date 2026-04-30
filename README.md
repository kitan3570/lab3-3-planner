# Lab 3-2 智能出行规划器

严格前后端分离：

- 前端：Vue 3 + Vite（只调用后端 `/api`）
- 后端：Python + FastAPI + SQLite（统一封装第三方 API，前端不接触任何 API Key）

## 目录结构

- `frontend/` 前端工程
- `backend/` 后端工程

## 启动后端

```bash
cd backend
python -m venv .venv
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

前端开发服务器默认通过 Vite proxy 将 `/api` 转发到 `http://localhost:8000`。
