/**
 * CloudBase Location 云函数
 *
 * 实现地点（Location）管理功能，包括：
 * - 创建地点（POST /plans/:plan_id/locations）
 * - 更新地点（PUT /plans/:plan_id/locations/:location_id）
 * - 删除地点（DELETE /plans/:plan_id/locations/:location_id）
 *
 * 数据存储方案：关联式方案（独立 locations 集合）
 * - 详见 ADR-001-Location-Data-Model.md
 *
 * 天气集成：
 * - 使用 QWeather (和风天气) API
 * - 实现内存缓存机制（TTL: 成功10分钟，失败1分钟）
 * - API Key 通过环境变量 QWEATHER_KEY 配置
 */

const cloudbase = require("@cloudbase/node-sdk");
const weatherClient = require("./weather");

const app = cloudbase.init({
  env: cloudbase.SYMBOL_CURRENT_ENV,
});

const db = app.database();

/**
 * CORS 配置
 * 所有响应添加标准 CORS 头，处理 OPTIONS 预检请求
 */
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
  };
}

/**
 * 解析请求体
 * @param {object} event - 云函数事件对象
 * @returns {object} 解析后的请求体
 */
function parseBody(event) {
  if (!event.body) {
    return {};
  }
  if (typeof event.body === 'string') {
    try {
      return JSON.parse(event.body);
    } catch (e) {
      console.error('[Parse] Failed to parse request body:', e.message);
      return {};
    }
  }
  return event.body;
}

/**
 * 验证必填字段
 * @param {object} data - 待验证的数据
 * @param {string[]} requiredFields - 必填字段列表
 * @throws {object} 验证失败抛出错误对象
 */
function validateRequiredFields(data, requiredFields) {
  const missingFields = requiredFields.filter(field => {
    const value = data[field];
    return value === undefined || value === null || value === '';
  });

  if (missingFields.length > 0) {
    const error = new Error(`Missing required fields: ${missingFields.join(', ')}`);
    error.statusCode = 400;
    throw error;
  }
}

/**
 * 验证数字字段
 * @param {object} data - 待验证的数据
 * @param {string[]} numberFields - 应为数字的字段列表
 * @throws {object} 验证失败抛出错误对象
 */
function validateNumberFields(data, numberFields) {
  for (const field of numberFields) {
    const value = data[field];
    if (value !== undefined && value !== null) {
      const numValue = Number(value);
      if (isNaN(numValue)) {
        const error = new Error(`Field '${field}' must be a number`);
        error.statusCode = 400;
        throw error;
      }
      data[field] = numValue;
    }
  }
}

/**
 * 检查 Plan 是否存在
 * @param {string} planId - Plan ID
 * @returns {Promise<object|null>} Plan 文档或 null
 */
async function checkPlanExists(planId) {
  try {
    const res = await db.collection('plans').doc(planId).get();
    if (!res.data || res.data.length === 0) {
      return null;
    }
    return res.data[0];
  } catch (error) {
    console.error('[CheckPlan] Database error:', error.message);
    throw error;
  }
}

/**
 * 创建地点
 * @param {string} planId - 关联的 Plan ID
 * @param {object} data - 地点数据
 * @returns {Promise<object>} 创建的地点对象
 */
async function createLocation(planId, data) {
  console.log(`[CreateLocation] Plan ID: ${planId}, Data:`, JSON.stringify(data));

  validateRequiredFields(data, ['name', 'lat', 'lng', 'day_index', 'time_slot', 'estimated_cost', 'duration']);
  validateNumberFields(data, ['lat', 'lng', 'day_index', 'estimated_cost', 'duration']);

  const plan = await checkPlanExists(planId);
  if (!plan) {
    const error = new Error('Plan not found');
    error.statusCode = 404;
    throw error;
  }

  const locationData = {
    plan_id: planId,
    name: data.name,
    lat: data.lat,
    lng: data.lng,
    day_index: data.day_index,
    time_slot: data.time_slot,
    estimated_cost: data.estimated_cost,
    duration: data.duration,
    remarks: data.remarks || null,
    weather: data.weather || null,
    created_at: new Date(),
    updated_at: new Date()
  };

  const res = await db.collection('locations').add(locationData);

  const newLocation = {
    _id: res.id,
    ...locationData
  };

  let weather = data.weather;
  if (!weather || !weather.ok || !weather.summary) {
    weather = await weatherClient.getWeatherSummary(data.lat, data.lng);
  }
  newLocation.weather = weather;

  console.log(`[CreateLocation] Success: ${res.id}`);
  return newLocation;
}

/**
 * 更新地点
 * @param {string} planId - 关联的 Plan ID
 * @param {string} locationId - Location ID
 * @param {object} data - 更新数据
 * @returns {Promise<object>} 更新后的地点对象
 */
async function updateLocation(planId, locationId, data) {
  console.log(`[UpdateLocation] Plan ID: ${planId}, Location ID: ${locationId}, Data:`, JSON.stringify(data));

  validateNumberFields(data, ['day_index', 'estimated_cost', 'duration']);

  const res = await db.collection('locations').doc(locationId).get();

  if (!res.data || res.data.length === 0) {
    const error = new Error('Location not found');
    error.statusCode = 404;
    throw error;
  }

  const location = res.data[0];

  if (location.plan_id !== planId) {
    const error = new Error('Location not found in this plan');
    error.statusCode = 404;
    throw error;
  }

  const updateData = {
    updated_at: new Date()
  };

  if (data.day_index !== undefined) {
    updateData.day_index = data.day_index;
  }
  if (data.time_slot !== undefined) {
    updateData.time_slot = data.time_slot;
  }
  if (data.estimated_cost !== undefined) {
    updateData.estimated_cost = data.estimated_cost;
  }
  if (data.duration !== undefined) {
    updateData.duration = data.duration;
  }
  if (data.remarks !== undefined) {
    updateData.remarks = data.remarks;
  }

  await db.collection('locations').doc(locationId).update(updateData);

  const updatedLocation = {
    ...location,
    ...updateData
  };

  const weather = await weatherClient.getWeatherSummary(updatedLocation.lat, updatedLocation.lng);
  updatedLocation.weather = weather;

  console.log(`[UpdateLocation] Success: ${locationId}`);
  return updatedLocation;
}

/**
 * 删除地点
 * @param {string} planId - 关联的 Plan ID
 * @param {string} locationId - Location ID
 * @returns {Promise<object>} 删除结果
 */
async function deleteLocation(planId, locationId) {
  console.log(`[DeleteLocation] Plan ID: ${planId}, Location ID: ${locationId}`);

  const res = await db.collection('locations').doc(locationId).get();

  if (!res.data || res.data.length === 0) {
    const error = new Error('Location not found');
    error.statusCode = 404;
    throw error;
  }

  const location = res.data[0];

  if (location.plan_id !== planId) {
    const error = new Error('Location not found in this plan');
    error.statusCode = 404;
    throw error;
  }

  const deleteResult = await db.collection('locations').doc(locationId).remove();

  if (deleteResult.deleted === 0) {
    const error = new Error('Failed to delete location');
    error.statusCode = 500;
    throw error;
  }

  console.log(`[DeleteLocation] Success: ${locationId}`);
  return { deleted: 1 };
}

/**
 * 获取特定 Plan 的所有地点列表
 * @param {string} planId - Plan ID
 * @returns {Promise<object[]>} 地点列表（包含天气信息）
 */
async function listLocationsByPlan(planId) {
  console.log(`[ListLocations] Plan ID: ${planId}`);

  const plan = await checkPlanExists(planId);
  if (!plan) {
    const error = new Error('Plan not found');
    error.statusCode = 404;
    throw error;
  }

  const res = await db.collection('locations')
    .where({ plan_id: planId })
    .orderBy('day_index', 'asc')
    .orderBy('time_slot', 'asc')
    .get();

  const locations = await Promise.all(
    res.data.map(async (location) => {
      let weather = location.weather;
      
      if (!weather || !weather.ok || !weather.summary) {
        weather = await weatherClient.getWeatherSummary(location.lat, location.lng);
      }
      
      return { ...location, weather };
    })
  );

  console.log(`[ListLocations] Found ${locations.length} locations`);
  return locations;
}

/**
 * 获取特定地点详情
 * @param {string} planId - Plan ID
 * @param {string} locationId - Location ID
 * @returns {Promise<object>} 地点对象（包含天气信息）
 */
async function getLocation(planId, locationId) {
  console.log(`[GetLocation] Plan ID: ${planId}, Location ID: ${locationId}`);

  const res = await db.collection('locations').doc(locationId).get();

  if (!res.data || res.data.length === 0) {
    const error = new Error('Location not found');
    error.statusCode = 404;
    throw error;
  }

  const location = res.data[0];

  if (location.plan_id !== planId) {
    const error = new Error('Location not found in this plan');
    error.statusCode = 404;
    throw error;
  }

  const weather = await weatherClient.getWeatherSummary(location.lat, location.lng);
  location.weather = weather;

  return location;
}

/**
 * 路由分发函数
 * 根据 HTTP 方法和路径分发请求到对应的处理函数
 * @param {object} event - 云函数事件对象
 * @returns {Promise<object>} 处理结果 { statusCode, body, headers }
 */
async function routeRequest(event) {
  const method = event.httpMethod;
  const path = event.path;

  console.log(`[Route] ${method} ${path}`);

  const pathPattern = /^\/plans\/([^\/]+)\/locations(?:\/([^\/]+))?$/;
  const match = path.match(pathPattern);

  if (!match) {
    const error = new Error('Route not found');
    error.statusCode = 404;
    throw error;
  }

  const [, planId, locationId] = match;

  if (method === 'POST' && !locationId) {
    const body = parseBody(event);
    const result = await createLocation(planId, body);
    return {
      statusCode: 201,
      data: result
    };

  } else if (method === 'GET' && !locationId) {
    const result = await listLocationsByPlan(planId);
    return {
      statusCode: 200,
      data: result
    };

  } else if (method === 'GET' && locationId) {
    const result = await getLocation(planId, locationId);
    return {
      statusCode: 200,
      data: result
    };

  } else if (method === 'PUT' && locationId) {
    const body = parseBody(event);
    const result = await updateLocation(planId, locationId, body);
    return {
      statusCode: 200,
      data: result
    };

  } else if (method === 'DELETE' && locationId) {
    const result = await deleteLocation(planId, locationId);
    return {
      statusCode: 200,
      data: result
    };

  } else {
    const error = new Error(`Method ${method} not allowed for this route`);
    error.statusCode = 405;
    throw error;
  }
}

/**
 * 云函数入口
 * 处理所有 HTTP 请求，统一返回 JSON 格式响应
 */
exports.main = async (event, context) => {
  console.log('[Location Function] Request received');
  console.log('[Location Function] Event:', JSON.stringify({
    httpMethod: event.httpMethod,
    path: event.path,
    queryStringParameters: event.queryStringParameters
  }));

  if (event.httpMethod === 'OPTIONS') {
    console.log('[Location Function] Handling OPTIONS request');
    return {
      statusCode: 204,
      headers: corsHeaders(),
      body: ''
    };
  }

  try {
    const result = await routeRequest(event);

    console.log(`[Location Function] Response: ${result.statusCode}`);
    return {
      statusCode: result.statusCode,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders()
      },
      body: JSON.stringify(result.data)
    };

  } catch (error) {
    console.error('[Location Function] Error:', error.message);
    console.error('[Location Function] Stack:', error.stack);

    const statusCode = error.statusCode || 500;
    const message = error.message || 'Internal server error';

    return {
      statusCode: statusCode,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders()
      },
      body: JSON.stringify({
        error: message,
        code: statusCode
      })
    };
  }
};
