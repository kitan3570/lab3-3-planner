/**
 * 天气 API 客户端模块
 * 使用 QWeather (和风天气) API 获取实时天气信息
 * 实现内存缓存机制减少 API 调用频率
 */

const axios = require('axios');

/**
 * 缓存存储：{ cacheKey: { expiresAt: timestamp, value: weatherData } }
 * @type {Map<string, {expiresAt: number, value: object}>}
 */
const weatherCache = new Map();

/**
 * 缓存 TTL 配置（秒）
 */
const CACHE_TTL = {
  SUCCESS: 600,    // 成功响应：10分钟
  ERROR: 60,        // 错误响应：1分钟
  NO_CREDENTIALS: 30  // 无凭证：30秒
};

/**
 * 生成缓存键
 * 将经纬度四舍五入到小数点后3位，减少缓存粒度
 * @param {number} lat - 纬度
 * @param {number} lng - 经度
 * @returns {string} 缓存键
 */
function generateCacheKey(lat, lng) {
  return `${lat.toFixed(3)}:${lng.toFixed(3)}`;
}

/**
 * 获取缓存数据
 * @param {string} cacheKey - 缓存键
 * @returns {object|null} 缓存的天气数据或null（未命中或已过期）
 */
function getFromCache(cacheKey) {
  const cached = weatherCache.get(cacheKey);
  if (!cached) {
    return null;
  }

  if (Date.now() > cached.expiresAt) {
    weatherCache.delete(cacheKey);
    return null;
  }

  return cached.value;
}

/**
 * 设置缓存数据
 * @param {string} cacheKey - 缓存键
 * @param {object} value - 天气数据
 * @param {number} ttlSeconds - 过期时间（秒）
 */
function setCache(cacheKey, value, ttlSeconds) {
  weatherCache.set(cacheKey, {
    expiresAt: Date.now() + (ttlSeconds * 1000),
    value
  });
}

/**
 * 获取实时天气信息
 * 集成缓存机制，避免频繁调用 API
 *
 * @param {number} lat - 纬度
 * @param {number} lng - 经度
 * @returns {Promise<object>} 天气信息对象 { ok: boolean, summary: string|null, error: string|null }
 */
async function getWeatherSummary(lat, lng) {
  const cacheKey = generateCacheKey(lat, lng);

  const cached = getFromCache(cacheKey);
  if (cached) {
    console.log(`[Weather] Cache hit for ${cacheKey}`);
    return cached;
  }

  console.log(`[Weather] Cache miss for ${cacheKey}, fetching from API`);

  const apiKey = process.env.QWEATHER_KEY;

  if (!apiKey) {
    console.warn('[Weather] QWeather API key not configured');
    const errorResult = {
      ok: false,
      summary: null,
      error: 'Weather API credentials are missing'
    };
    setCache(cacheKey, errorResult, CACHE_TTL.NO_CREDENTIALS);
    return errorResult;
  }

  try {
    const response = await axios.get(
      `https://devapi.qweather.com/v7/weather/now`,
      {
        params: {
          location: `${lng},${lat}`,
          key: apiKey
        },
        timeout: 5000
      }
    );

    const data = response.data;

    if (data.code !== '200') {
      console.error(`[Weather] API error: code=${data.code}`);
      const errorResult = {
        ok: false,
        summary: null,
        error: `Weather API error: code=${data.code}`
      };
      setCache(cacheKey, errorResult, CACHE_TTL.ERROR);
      return errorResult;
    }

    const now = data.now || {};
    const text = (now.text || '').trim();
    const temp = (now.temp || '').trim();
    const summary = `${text} ${temp}°C`.trim();

    const successResult = {
      ok: true,
      summary: summary,
      error: null
    };

    console.log(`[Weather] Success: ${summary}`);
    setCache(cacheKey, successResult, CACHE_TTL.SUCCESS);
    return successResult;

  } catch (error) {
    console.error('[Weather] API request failed:', error.message);

    let errorMessage;
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      errorMessage = 'Weather API request timeout';
    } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      errorMessage = 'Weather API network error';
    } else if (error.response) {
      errorMessage = `Weather API HTTP error: ${error.response.status}`;
    } else {
      errorMessage = `Weather API request error: ${error.message}`;
    }

    const errorResult = {
      ok: false,
      summary: null,
      error: errorMessage
    };

    setCache(cacheKey, errorResult, CACHE_TTL.ERROR);
    return errorResult;
  }
}

/**
 * 清除所有缓存（用于测试或手动刷新）
 */
function clearCache() {
  weatherCache.clear();
  console.log('[Weather] Cache cleared');
}

/**
 * 获取缓存统计信息（用于监控）
 * @returns {object} 缓存统计 { size: number, keys: string[] }
 */
function getCacheStats() {
  return {
    size: weatherCache.size,
    keys: Array.from(weatherCache.keys())
  };
}

module.exports = {
  getWeatherSummary,
  clearCache,
  getCacheStats,
  generateCacheKey
};
