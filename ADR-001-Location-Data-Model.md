# Architecture Decision Record: Location 数据存储方案

## 日期
2026-05-28

## 状态
已接受

## 上下文
需要为 CloudBase 云函数实现地点（Location）管理功能，涉及以下接口：
- POST /api/plans/{plan_id}/locations - 创建地点
- PUT /api/plans/{plan_id}/locations/{location_id} - 更新地点
- DELETE /api/plans/{plan_id}/locations/{location_id} - 删除地点
- GET /api/plans/{plan_id} - 获取计划详情（包含地点列表和天气信息）

同时需要集成天气 API（QWeather）并实现缓存机制。

## 决策

### 选择方案 B: 关联式方案（独立 locations 集合）

**方案详情**：
- 创建独立的 `locations` 集合
- 通过 `plan_id` 字段与 `plans` 集合建立关联关系
- 每个 Location 文档包含：name, lat, lng, day_index, time_slot, estimated_cost, duration, remarks, weather

### 选择理由

#### 1. 数据规模考量
- 原系统使用 SQL 关系型数据库，采用关联式设计
- 实际出行规划中，一个 plan 可能包含数十个地点
- 嵌入式方案在 CloudBase NoSQL 中有 16KB 单文档限制

#### 2. 功能灵活性
- 支持独立查询、更新、删除单个地点
- 可以跨 plan 复用地点数据（未来扩展）
- 便于实现地点级别的访问控制和权限管理

#### 3. 性能考量
- CloudBase NoSQL 查询性能优秀，关联查询开销可控
- 通过索引（plan_id, day_index）优化查询性能
- 避免更新 plan 时携带大量地点数据

#### 4. 事务一致性
- CloudBase 支持集合级事务
- 可以保证 plan 和 locations 的操作原子性
- 便于实现级联删除等复杂业务逻辑

#### 5. 可扩展性
- 单个地点文档可以包含更多元数据
- 便于未来扩展地点的附加信息（图片、评论等）
- 与原 SQL 系统架构保持一致

## 技术实现细节

### 数据库设计

#### plans 集合
```json
{
  "_id": "ObjectId",
  "title": "string",
  "date": "Date",
  "budget": "number",
  "people_count": "number",
  "preferences": "string | null",
  "remarks": "string | null",
  "created_at": "Date",
  "updated_at": "Date"
}
```

#### locations 集合
```json
{
  "_id": "ObjectId",
  "plan_id": "string",
  "name": "string",
  "lat": "number",
  "lng": "number",
  "day_index": "number",
  "time_slot": "string",
  "estimated_cost": "number",
  "duration": "number",
  "remarks": "string | null",
  "weather": {
    "ok": "boolean",
    "summary": "string | null",
    "error": "string | null"
  },
  "created_at": "Date",
  "updated_at": "Date"
}
```

### 索引策略
- locations 集合在 `plan_id` 字段建立索引
- 支持按 day_index 和 time_slot 排序查询

### 天气 API 集成
- 使用 QWeather API (和风天气)
- API Key 通过环境变量 `process.env.QWEATHER_KEY` 读取
- 实现内存缓存机制，TTL 10分钟
- 实现优雅降级：错误时返回 {ok: false, error: "..."}

## 替代方案

### 方案 A: 嵌入式文档方案
**优点**：
- 单次查询获取完整数据
- 实现简单

**缺点**：
- 单文档 16KB 限制
- 更新地点需要更新整个 plan
- 不适合大量地点

**未选择原因**：数据规模限制和功能灵活性不足。

## 相关文档
- [plan/index.js](./cloudfunctions/plan/index.js) - Plan 云函数
- [location/index.js](./cloudfunctions/location/index.js) - Location 云函数
