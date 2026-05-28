/**
 * 天气客户端单元测试
 * 测试天气 API 调用、缓存机制和错误处理
 */

const weatherClient = require('./weather');

jest.mock('axios');

describe('Weather Client', () => {
  beforeEach(() => {
    weatherClient.clearCache();
    jest.clearAllMocks();
    delete process.env.QWEATHER_KEY;
  });

  describe('getWeatherSummary', () => {
    test('应该返回缓存的天气数据', async () => {
      const lat = 31.2304;
      const lng = 121.4737;

      const mockResponse = {
        data: {
          code: '200',
          now: {
            text: '多云',
            temp: '18'
          }
        }
      };

      require('axios').get.mockResolvedValue(mockResponse);

      const result1 = await weatherClient.getWeatherSummary(lat, lng);
      expect(result1.ok).toBe(true);
      expect(result1.summary).toBe('多云 18°C');

      const result2 = await weatherClient.getWeatherSummary(lat, lng);
      expect(result2).toEqual(result1);
      expect(axios.get).toHaveBeenCalledTimes(1);
    });

    test('应该正确处理缺失的 API Key', async () => {
      const lat = 31.2304;
      const lng = 121.4737;

      const result = await weatherClient.getWeatherSummary(lat, lng);

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Weather API credentials are missing');
      expect(result.summary).toBeNull();
    });

    test('应该正确处理 API 错误响应', async () => {
      const lat = 31.2304;
      const lng = 121.4737;
      process.env.QWEATHER_KEY = 'test-api-key';

      const mockResponse = {
        data: {
          code: '401',
          message: 'Invalid key'
        }
      };

      require('axios').get.mockResolvedValue(mockResponse);

      const result = await weatherClient.getWeatherSummary(lat, lng);

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Weather API error: code=401');
    });

    test('应该正确处理网络超时', async () => {
      const lat = 31.2304;
      const lng = 121.4737;
      process.env.QWEATHER_KEY = 'test-api-key';

      const error = new Error('timeout');
      error.code = 'ECONNABORTED';
      require('axios').get.mockRejectedValue(error);

      const result = await weatherClient.getWeatherSummary(lat, lng);

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Weather API request timeout');
    });

    test('应该正确处理网络错误', async () => {
      const lat = 31.2304;
      const lng = 121.4737;
      process.env.QWEATHER_KEY = 'test-api-key';

      const error = new Error('Network Error');
      error.code = 'ENOTFOUND';
      require('axios').get.mockRejectedValue(error);

      const result = await weatherClient.getWeatherSummary(lat, lng);

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Weather API network error');
    });

    test('应该正确处理 HTTP 错误状态码', async () => {
      const lat = 31.2304;
      const lng = 121.4737;
      process.env.QWEATHER_KEY = 'test-api-key';

      const error = new Error('Server Error');
      error.response = { status: 500 };
      require('axios').get.mockRejectedValue(error);

      const result = await weatherClient.getWeatherSummary(lat, lng);

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Weather API HTTP error: 500');
    });

    test('应该正确生成缓存键', () => {
      const key1 = weatherClient.generateCacheKey(31.2304, 121.4737);
      const key2 = weatherClient.generateCacheKey(31.23042, 121.47372);
      const key3 = weatherClient.generateCacheKey(31.2305, 121.4738);

      expect(key1).toBe('31.230:121.474');
      expect(key1).toBe(key2);
      expect(key1).not.toBe(key3);
    });

    test('应该正确获取缓存统计', async () => {
      const lat = 31.2304;
      const lng = 121.4737;
      process.env.QWEATHER_KEY = 'test-api-key';

      const mockResponse = {
        data: {
          code: '200',
          now: {
            text: '晴',
            temp: '25'
          }
        }
      };

      require('axios').get.mockResolvedValue(mockResponse);

      await weatherClient.getWeatherSummary(lat, lng);
      await weatherClient.getWeatherSummary(32.0603, 118.7969);

      const stats = weatherClient.getCacheStats();

      expect(stats.size).toBe(2);
      expect(stats.keys).toHaveLength(2);
    });
  });

  describe('clearCache', () => {
    test('应该清除所有缓存', async () => {
      const lat = 31.2304;
      const lng = 121.4737;
      process.env.QWEATHER_KEY = 'test-api-key';

      const mockResponse = {
        data: {
          code: '200',
          now: {
            text: '晴',
            temp: '25'
          }
        }
      };

      require('axios').get.mockResolvedValue(mockResponse);

      await weatherClient.getWeatherSummary(lat, lng);

      let stats = weatherClient.getCacheStats();
      expect(stats.size).toBe(1);

      weatherClient.clearCache();

      stats = weatherClient.getCacheStats();
      expect(stats.size).toBe(0);
    });
  });
});
