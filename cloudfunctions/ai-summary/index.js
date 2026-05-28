/**
 * CloudBase AI Summary 云函数
 * 
 * 实现 AI 辅助总结功能：
 * - 根据规划 ID 查询完整规划信息和关联地点
 * - 调用 DeepSeek 大模型生成出行总结建议
 * - 返回结构化的总结响应数据
 * 
 * API 接口：POST /plans/:plan_id/ai-summary
 * 
 * 环境变量配置：
 * - DEEPSEEK_API_KEY: DeepSeek API 密钥
 */

const cloudbase = require("@cloudbase/node-sdk");
const axios = require("axios");

const app = cloudbase.init({
  env: cloudbase.SYMBOL_CURRENT_ENV,
});

const db = app.database();

/**
 * CORS 配置
 * 所有响应添加标准 CORS 头
 */
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': 'https://lab3-d3gc0uqhg90f39d16-1433230905.tcloudbaseapp.com',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Max-Age': '86400'
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
 * 获取天气摘要文本
 * @param {object} weather - 天气对象
 * @returns {string} 天气摘要文本
 */
function getWeatherText(weather) {
  if (!weather) {
    return '天气不可用';
  }
  return weather.ok && weather.summary ? weather.summary : '天气不可用';
}

/**
 * 生成系统提示词
 * @returns {string} 系统提示词
 */
function getSystemPrompt() {
  return (
    "你是一个专业的出行规划助手。你将根据用户的出行规划信息、地点清单、天气与预算情况，" +
    "输出一段排版好的中文纯文本建议（不要使用 Markdown 语法，不要使用表格，不要用 #、-、* 等标记）。\n" +
    "请严格按以下固定分段标题格式输出，并且第一行必须从【总体摘要】开始：\n" +
    "【总体摘要】\n" +
    "【行程安排建议（上午）】\n" +
    "【行程安排建议（下午）】\n" +
    "【行程安排建议（晚上）】\n" +
    "【预算与花费】\n" +
    "【风险与备选方案】\n" +
    "每段用 2-4 行自然语言给出可执行建议（2-6 行也可，但优先简洁）。\n" +
    "全文尽量控制在 600-900 字以内，避免输出被截断。\n" +
    "不要泄露任何密钥信息。\n" +
    "只输出最终建议正文：禁止输出任何“构思/草稿/分析/约束条件/提示语/审查/检查/格式检查/字数统计”等过程文本，也不要复述提示词本身。"
  );
}

/**
 * 生成用户提示词
 * @param {object} plan - 规划对象
 * @param {array} locations - 地点列表
 * @returns {string} 用户提示词
 */
function generateUserPrompt(plan, locations) {
  const lines = [];
  
  lines.push(`出行规划：${plan.title}`);
  lines.push("");
  lines.push(`日期：${plan.date}`);
  lines.push(`人数：${plan.people_count}`);
  lines.push(`预算：¥${plan.budget}`);
  if (plan.preferences) {
    lines.push(`偏好：${plan.preferences}`);
  }
  if (plan.remarks) {
    lines.push(`备注：${plan.remarks}`);
  }
  lines.push("");
  lines.push("地点清单：");
  lines.push("");
  
  for (const loc of locations) {
    const weatherText = getWeatherText(loc.weather);
    const remarks = loc.remarks || "";
    const extra = remarks ? `；备注：${remarks}` : "";
    lines.push(
      `${loc.time_slot}｜${loc.name}｜${weatherText}｜¥${Math.round(loc.estimated_cost)}｜${loc.duration}分钟${extra}`
    );
  }
  
  const totalLocationsCost = locations.reduce((sum, loc) => sum + (loc.estimated_cost || 0), 0);
  const totalDuration = locations.reduce((sum, loc) => sum + (loc.duration || 0), 0);
  
  const slotCost = { "上午": 0, "下午": 0, "晚上": 0 };
  for (const loc of locations) {
    const slot = loc.time_slot;
    if (slotCost.hasOwnProperty(slot)) {
      slotCost[slot] += (loc.estimated_cost || 0);
    }
  }
  
  const budgetLeft = plan.budget - totalLocationsCost;
  
  lines.push("");
  lines.push("花费汇总：");
  lines.push("");
  lines.push(`地点预计花费合计：¥${Math.round(totalLocationsCost)}`);
  lines.push(`总停留时长：${totalDuration} 分钟`);
  lines.push(`上午/下午/晚上花费：¥${Math.round(slotCost["上午"])} / ¥${Math.round(slotCost["下午"])} / ¥${Math.round(slotCost["晚上"])}`);
  lines.push(`预算差额：¥${Math.round(budgetLeft)}（正数=剩余，负数=超支）`);
  
  return lines.join("\n");
}

/**
 * 调用 DeepSeek API 生成文本
 * @param {string} systemPrompt - 系统提示词
 * @param {string} userPrompt - 用户提示词
 * @returns {Promise<string>} 生成的文本
 */
async function generateText(systemPrompt, userPrompt) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  
  if (!apiKey) {
    throw new Error('DeepSeek API key not configured');
  }
  
  const url = 'https://api.deepseek.com/v1/chat/completions';
  
  const requestBody = {
    model: 'deepseek-chat',
    messages: [
      {
        role: 'system',
        content: systemPrompt
      },
      {
        role: 'user',
        content: userPrompt
      }
    ],
    temperature: 0.7,
    max_tokens: 1500
  };
  
  try {
    const response = await axios.post(url, requestBody, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 60000
    });
    
    const result = response.data;
    
    if (!result || !result.choices || result.choices.length === 0) {
      throw new Error('DeepSeek API returned empty response');
    }
    
    const text = result.choices[0].message.content.trim();
    
    if (!text) {
      throw new Error('DeepSeek API returned empty text');
    }
    
    return text;
    
  } catch (error) {
    console.error('[DeepSeek] API request failed:', error.message);
    
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;
      
      if (status === 401) {
        throw new Error('DeepSeek API authentication failed: invalid key');
      } else if (status === 429) {
        throw new Error('DeepSeek API rate limited: too many requests');
      } else if (status >= 500) {
        throw new Error('DeepSeek API server error');
      } else {
        const errorMsg = data.error ? data.error.message || JSON.stringify(data.error) : `HTTP error ${status}`;
        throw new Error(`DeepSeek API error: ${errorMsg}`);
      }
    } else if (error.code === 'ECONNABORTED') {
      throw new Error('DeepSeek API request timeout');
    } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      throw new Error('DeepSeek API network error');
    } else {
      throw new Error(`DeepSeek API request failed: ${error.message}`);
    }
  }
}

/**
 * 查询规划和关联地点
 * @param {string} planId - 规划 ID
 * @returns {Promise<object>} 包含规划和地点的对象
 */
async function getPlanWithLocations(planId) {
  console.log(`[GetPlan] Querying plan: ${planId}`);
  
  const planRes = await db.collection('plans').doc(planId).get();
  
  if (!planRes.data || planRes.data.length === 0) {
    throw new Error('Plan not found');
  }
  
  const plan = planRes.data[0];
  
  const locationsRes = await db.collection('locations')
    .where({ plan_id: planId })
    .orderBy('day_index', 'asc')
    .orderBy('time_slot', 'asc')
    .get();
  
  const locations = locationsRes.data;
  
  console.log(`[GetPlan] Found ${locations.length} locations for plan ${planId}`);
  
  return { plan, locations };
}

/**
 * 处理 AI 总结请求
 * @param {string} planId - 规划 ID
 * @returns {Promise<object>} 总结结果
 */
async function handleAiSummary(planId) {
  console.log(`[AI Summary] Processing plan: ${planId}`);
  
  const { plan, locations } = await getPlanWithLocations(planId);
  
  const systemPrompt = getSystemPrompt();
  const userPrompt = generateUserPrompt(plan, locations);
  
  console.log(`[AI Summary] Calling DeepSeek API, locations: ${locations.length}`);
  
  const text = await generateText(systemPrompt, userPrompt);
  
  console.log(`[AI Summary] Success, text length: ${text.length}`);
  
  return {
    text: text
  };
}

/**
 * 路由分发函数
 * @param {object} event - 云函数事件对象
 * @returns {Promise<object>} 处理结果
 */
async function routeRequest(event) {
  const method = event.httpMethod;
  const path = event.path;
  
  console.log(`[Route] ${method} ${path}`);
  
  const pathPattern = /^\/plans\/([^\/]+)\/ai-summary$/;
  const match = path.match(pathPattern);
  
  if (!match) {
    throw new Error('Route not found');
  }
  
  const planId = match[1];
  
  if (!planId) {
    throw new Error('Plan ID is required');
  }
  
  if (method === 'POST') {
    return await handleAiSummary(planId);
  } else {
    throw new Error(`Method ${method} not allowed for this route`);
  }
}

/**
 * 云函数入口
 * 处理所有 HTTP 请求，统一返回 JSON 格式响应
 */
exports.main = async (event, context) => {
  console.log('[AI Summary Function] Request received');
  console.log('[AI Summary Function] Event:', JSON.stringify({
    httpMethod: event.httpMethod,
    path: event.path,
    queryStringParameters: event.queryStringParameters
  }));
  
  if (event.httpMethod === 'OPTIONS') {
    console.log('[AI Summary Function] Handling OPTIONS request');
    return {
      statusCode: 204,
      headers: corsHeaders(),
      body: ''
    };
  }
  
  try {
    const result = await routeRequest(event);
    
    console.log('[AI Summary Function] Response: 200 OK');
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders()
      },
      body: JSON.stringify(result)
    };
    
  } catch (error) {
    console.error('[AI Summary Function] Error:', error.message);
    console.error('[AI Summary Function] Stack:', error.stack);
    
    let statusCode = 500;
    let message = error.message;
    
    if (error.message === 'Plan not found') {
      statusCode = 404;
    } else if (error.message.includes('API key not configured') || error.message.includes('authentication failed')) {
      statusCode = 503;
    } else if (error.message.includes('rate limited')) {
      statusCode = 429;
    } else if (error.message.includes('not allowed')) {
      statusCode = 405;
    } else if (error.message.includes('Route not found')) {
      statusCode = 404;
    }
    
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
