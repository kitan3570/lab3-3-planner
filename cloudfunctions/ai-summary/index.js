const express = require('express');
const cloudbase = require("@cloudbase/node-sdk");
const axios = require("axios");

const app = express();
const port = process.env.PORT || 9000;

const cb = cloudbase.init({
  env: cloudbase.SYMBOL_CURRENT_ENV,
});

const db = cb.database();

app.use(express.json());

app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    res.status(204).send();
    return;
  }
  next();
});

app.get('/', async (req, res) => {
  res.status(200).json({
    service: 'ai-summary',
    status: 'ok',
    message: 'AI Summary API is running'
  });
});

async function fetchPlanWithLocations(planId) {
  const planResult = await db.collection('plans').doc(planId).get();

  if (!planResult.data || planResult.data.length === 0) {
    throw { statusCode: 404, message: 'Plan not found' };
  }

  const plan = planResult.data[0];

  const locationsResult = await db.collection('locations')
    .where({ plan_id: planId })
    .orderBy('day_index', 'asc')
    .orderBy('time_slot', 'asc')
    .get();

  plan.locations = locationsResult.data;

  return plan;
}

function buildPrompt(plan) {
  const locationsByDay = {};
  plan.locations.forEach(location => {
    const day = location.day_index;
    if (!locationsByDay[day]) {
      locationsByDay[day] = [];
    }
    locationsByDay[day].push(location);
  });

  let locationsDesc = '';
  Object.keys(locationsByDay).sort((a, b) => parseInt(a) - parseInt(b)).forEach(day => {
    locationsDesc += `\n第${day}天：\n`;
    locationsByDay[day].forEach(loc => {
      const weather = loc.weather?.ok ? loc.weather.summary : '天气未知';
      locationsDesc += `  - ${loc.time_slot}：${loc.name}（${weather}，预计花费¥${loc.estimated_cost}，时长${loc.duration}分钟）`;
      if (loc.remarks) {
        locationsDesc += ` - ${loc.remarks}`;
      }
      locationsDesc += '\n';
    });
  });

  const prompt = `
你是一个智能出行规划助手。请根据以下旅行规划信息，生成一份详细的出行总结报告。

【规划信息】
标题：${plan.title}
日期：${plan.date}
预算：¥${plan.budget}
人数：${plan.people_count}人
偏好：${plan.preferences || '无'}
备注：${plan.remarks || '无'}

【行程安排】${locationsDesc || '\n暂无具体行程安排'}

【输出要求】
1. 总体摘要：简要概括整个行程的特点和亮点
2. 行程安排建议：分时段（上午、下午、晚上）给出详细的行程建议
3. 预算与花费：分析预算分配，给出合理的消费建议
4. 风险与备选方案：分析可能遇到的问题和应对措施

请用中文输出，语言要自然、友好，适合用户阅读。
`;

  return prompt.trim();
}

async function callDeepSeek(prompt) {
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    console.warn('[AI] DEEPSEEK_API_KEY not set, returning mock summary');
    return `
【总体摘要】
您的旅行计划看起来很棒！由于未配置 AI 服务，暂时无法生成详细的智能总结。

【行程安排建议】
请手动规划您的行程，合理安排时间和交通。

【预算建议】
建议提前做好预算规划，合理分配各项开支。

【温馨提示】
如需使用 AI 智能总结功能，请在 CloudBase 控制台配置 DEEPSEEK_API_KEY 环境变量。
    `.trim();
  }

  try {
    const response = await axios.post(
      'https://api.deepseek.com/v1/chat/completions',
      {
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: '你是一个专业的旅行规划助手，擅长为用户提供详细的出行建议和总结。'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 2000
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        timeout: 60000
      }
    );

    if (response.data && response.data.choices && response.data.choices.length > 0) {
      return response.data.choices[0].message.content;
    } else {
      throw new Error('Invalid API response');
    }
  } catch (error) {
    console.error('[AI] Error calling DeepSeek API:', error.message);
    throw { statusCode: 500, message: 'Failed to generate summary', details: error.message };
  }
}

app.post('/plans/:planId/ai-summary', async (req, res) => {
  const planId = req.params.planId;

  console.log(`[AI] Received request for plan: ${planId}`);

  try {
    const plan = await fetchPlanWithLocations(planId);
    console.log(`[AI] Plan loaded successfully, ${plan.locations.length} locations`);

    const prompt = buildPrompt(plan);
    console.log(`[AI] Prompt built, length: ${prompt.length}`);

    const summary = await callDeepSeek(prompt);
    console.log(`[AI] Summary generated, length: ${summary.length}`);

    res.status(200).json({
      text: summary
    });

  } catch (error) {
    console.error('[AI] Error:', error);

    if (error.statusCode) {
      res.status(error.statusCode).json({
        success: false,
        error: error.message,
        details: error.details
      });
    } else {
      res.status(500).json({
        success: false,
        error: error.message || 'Internal server error',
        details: error
      });
    }
  }
});

app.all('*', (req, res) => {
  res.status(404).json({
    error: 'Not found'
  });
});

exports.main = async (event, context) => {
  return new Promise((resolve, reject) => {
    const method = (event.httpMethod || 'GET').toUpperCase();
    let path = event.path || '/';

    const headers = event.headers || {};
    const body = event.body;
    const query = event.queryStringParameters || {};

    const mockReq = {
      method: method,
      url: path,
      path: path,
      params: {},
      query: query,
      headers: headers,
      body: body,
      get method() { return this.method; },
      get url() { return this.url; }
    };

    const mockRes = {
      statusCode: 200,
      headers: {},
      body: '',
      status: function(code) {
        this.statusCode = code;
        return this;
      },
      setHeader: function(name, value) {
        this.headers[name] = value;
        return this;
      },
      getHeader: function(name) {
        return this.headers[name];
      },
      json: function(data) {
        this.body = JSON.stringify(data);
        this.headers['Content-Type'] = 'application/json';
        resolve({
          statusCode: this.statusCode,
          headers: this.headers,
          body: this.body
        });
      },
      send: function(data) {
        if (data !== undefined) {
          this.body = typeof data === 'object' ? JSON.stringify(data) : String(data);
        }
        resolve({
          statusCode: this.statusCode,
          headers: this.headers,
          body: this.body
        });
      },
      end: function(data) {
        if (data !== undefined) {
          this.body = String(data);
        }
        resolve({
          statusCode: this.statusCode,
          headers: this.headers,
          body: this.body
        });
      }
    };

    try {
      app(mockReq, mockRes, function(err) {
        if (err) {
          console.error('[AI] Middleware error:', err);
          reject(err);
        }
      });
    } catch (err) {
      console.error('[AI] Error handling request:', err);
      reject(err);
    }
  });
};

if (require.main === module) {
  app.listen(port, () => {
    console.log(`[AI-Summary] Server running on port ${port}`);
  });
}

module.exports = app;
