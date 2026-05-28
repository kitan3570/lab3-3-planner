/**
 * Location 云函数单元测试
 * 测试 CRUD 操作、参数验证和错误处理
 */

const cloudbase = require('@cloudbase/node-sdk');
const weatherClient = require('./weather');

jest.mock('@cloudbase/node-sdk', () => {
  const mockDb = {
    collection: jest.fn()
  };
  return {
    init: jest.fn(() => ({
      database: jest.fn(() => mockDb)
    })),
    SYMBOL_CURRENT_ENV: 'test-env'
  };
});

jest.mock('./weather');

describe('Location Cloud Function', () => {
  let mockDb;
  let locationsCollection;
  let plansCollection;

  const mockLocationData = {
    _id: 'location123',
    plan_id: 'plan123',
    name: '外滩',
    lat: 31.2404,
    lng: 121.4901,
    day_index: 1,
    time_slot: '上午',
    estimated_cost: 100,
    duration: 120,
    remarks: '游览黄浦江',
    created_at: new Date(),
    updated_at: new Date()
  };

  const mockPlanData = {
    _id: 'plan123',
    title: '上海一日游',
    date: '2026-05-28'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    weatherClient.getWeatherSummary.mockResolvedValue({
      ok: true,
      summary: '多云 25°C',
      error: null
    });

    locationsCollection = {
      add: jest.fn(),
      get: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      doc: jest.fn()
    };

    plansCollection = {
      get: jest.fn(),
      doc: jest.fn()
    };

    mockDb = {
      collection: jest.fn((name) => {
        if (name === 'locations') return locationsCollection;
        if (name === 'plans') return plansCollection;
        return {};
      })
    };

    cloudbase.init.mockReturnValue({
      database: jest.fn(() => mockDb)
    });
  });

  describe('参数验证', () => {
    test('应该验证必填字段', () => {
      const { validateRequiredFields } = require('./index');

      expect(() => {
        validateRequiredFields({}, ['name', 'lat']);
      }).toThrow('Missing required fields: name, lat');

      expect(() => {
        validateRequiredFields({ name: 'test' }, ['name']);
      }).not.toThrow();
    });

    test('应该验证数字字段', () => {
      const { validateNumberFields } = require('./index');

      const data1 = { lat: '31.2304', lng: 121.4737 };
      validateNumberFields(data1, ['lat', 'lng']);
      expect(data1.lat).toBe(31.2304);
      expect(data1.lng).toBe(121.4737);

      const data2 = { lat: 'invalid' };
      expect(() => {
        validateNumberFields(data2, ['lat']);
      }).toThrow("Field 'lat' must be a number");
    });
  });

  describe('CORS Headers', () => {
    test('应该返回正确的 CORS 头', () => {
      const { corsHeaders } = require('./index');
      const headers = corsHeaders();

      expect(headers['Access-Control-Allow-Origin']).toBe('https://lab3-d3gc0uqhg90f39d16-1433230905.tcloudbaseapp.com');
      expect(headers['Access-Control-Allow-Headers']).toBe('Content-Type');
      expect(headers['Access-Control-Allow-Methods']).toBe('GET, POST, PUT, DELETE, OPTIONS');
    });
  });

  describe('路由分发', () => {
    test('应该正确解析路径参数', () => {
      const { routeRequest } = require('./index');

      plansCollection.doc().get.mockResolvedValue({ data: [mockPlanData] });

      locationsCollection.add.mockResolvedValue({ id: 'new-location-id' });
      locationsCollection.get.mockResolvedValue({ data: [] });

      const event1 = {
        httpMethod: 'POST',
        path: '/plans/plan123/locations',
        body: JSON.stringify({
          name: '外滩',
          lat: 31.2404,
          lng: 121.4901,
          day_index: 1,
          time_slot: '上午',
          estimated_cost: 100,
          duration: 120
        })
      };

      expect(() => routeRequest(event1)).not.toThrow();
    });

    test('应该处理无效路径', async () => {
      const { routeRequest } = require('./index');

      const event = {
        httpMethod: 'GET',
        path: '/invalid/path'
      };

      try {
        await routeRequest(event);
      } catch (error) {
        expect(error.statusCode).toBe(404);
        expect(error.message).toBe('Route not found');
      }
    });

    test('应该处理不支持的 HTTP 方法', async () => {
      const { routeRequest } = require('./index');

      const event = {
        httpMethod: 'PATCH',
        path: '/plans/plan123/locations/location123'
      };

      try {
        await routeRequest(event);
      } catch (error) {
        expect(error.statusCode).toBe(405);
        expect(error.message).toContain('not allowed');
      }
    });
  });

  describe('创建地点 (POST /plans/:plan_id/locations)', () => {
    test('应该成功创建地点', async () => {
      const { routeRequest } = require('./index');

      plansCollection.doc().get.mockResolvedValue({ data: [mockPlanData] });
      locationsCollection.add.mockResolvedValue({ id: 'new-location-id' });

      const event = {
        httpMethod: 'POST',
        path: '/plans/plan123/locations',
        body: {
          name: '外滩',
          lat: 31.2404,
          lng: 121.4901,
          day_index: 1,
          time_slot: '上午',
          estimated_cost: 100,
          duration: 120
        }
      };

      const result = await routeRequest(event);

      expect(result.statusCode).toBe(201);
      expect(result.data.name).toBe('外滩');
      expect(result.data.weather).toBeDefined();
    });

    test('应该在 Plan 不存在时返回 404', async () => {
      const { routeRequest } = require('./index');

      plansCollection.doc().get.mockResolvedValue({ data: [] });

      const event = {
        httpMethod: 'POST',
        path: '/plans/nonexistent/locations',
        body: {
          name: '外滩',
          lat: 31.2404,
          lng: 121.4901,
          day_index: 1,
          time_slot: '上午',
          estimated_cost: 100,
          duration: 120
        }
      };

      try {
        await routeRequest(event);
      } catch (error) {
        expect(error.statusCode).toBe(404);
        expect(error.message).toBe('Plan not found');
      }
    });

    test('应该在缺少必填字段时返回 400', async () => {
      const { routeRequest } = require('./index');

      plansCollection.doc().get.mockResolvedValue({ data: [mockPlanData] });

      const event = {
        httpMethod: 'POST',
        path: '/plans/plan123/locations',
        body: {
          name: '外滩'
        }
      };

      try {
        await routeRequest(event);
      } catch (error) {
        expect(error.statusCode).toBe(400);
        expect(error.message).toContain('Missing required fields');
      }
    });
  });

  describe('更新地点 (PUT /plans/:plan_id/locations/:location_id)', () => {
    test('应该成功更新地点', async () => {
      const { routeRequest } = require('./index');

      locationsCollection.doc().get.mockResolvedValue({ data: [mockLocationData] });
      locationsCollection.doc().update.mockResolvedValue({ updated: 1 });

      const event = {
        httpMethod: 'PUT',
        path: '/plans/plan123/locations/location123',
        body: {
          day_index: 2,
          time_slot: '下午'
        }
      };

      const result = await routeRequest(event);

      expect(result.statusCode).toBe(200);
      expect(result.data.day_index).toBe(2);
      expect(result.data.time_slot).toBe('下午');
    });

    test('应该在 Location 不存在时返回 404', async () => {
      const { routeRequest } = require('./index');

      locationsCollection.doc().get.mockResolvedValue({ data: [] });

      const event = {
        httpMethod: 'PUT',
        path: '/plans/plan123/locations/nonexistent',
        body: {
          day_index: 2
        }
      };

      try {
        await routeRequest(event);
      } catch (error) {
        expect(error.statusCode).toBe(404);
        expect(error.message).toBe('Location not found');
      }
    });

    test('应该在 Location 不属于该 Plan 时返回 404', async () => {
      const { routeRequest } = require('./index');

      locationsCollection.doc().get.mockResolvedValue({
        data: [{ ...mockLocationData, plan_id: 'different-plan' }]
      });

      const event = {
        httpMethod: 'PUT',
        path: '/plans/plan123/locations/location123',
        body: {
          day_index: 2
        }
      };

      try {
        await routeRequest(event);
      } catch (error) {
        expect(error.statusCode).toBe(404);
        expect(error.message).toBe('Location not found in this plan');
      }
    });
  });

  describe('删除地点 (DELETE /plans/:plan_id/locations/:location_id)', () => {
    test('应该成功删除地点', async () => {
      const { routeRequest } = require('./index');

      locationsCollection.doc().get.mockResolvedValue({ data: [mockLocationData] });
      locationsCollection.doc().remove.mockResolvedValue({ deleted: 1 });

      const event = {
        httpMethod: 'DELETE',
        path: '/plans/plan123/locations/location123'
      };

      const result = await routeRequest(event);

      expect(result.statusCode).toBe(200);
      expect(result.data.deleted).toBe(1);
    });

    test('应该在 Location 不存在时返回 404', async () => {
      const { routeRequest } = require('./index');

      locationsCollection.doc().get.mockResolvedValue({ data: [] });

      const event = {
        httpMethod: 'DELETE',
        path: '/plans/plan123/locations/nonexistent'
      };

      try {
        await routeRequest(event);
      } catch (error) {
        expect(error.statusCode).toBe(404);
      }
    });
  });

  describe('获取地点列表 (GET /plans/:plan_id/locations)', () => {
    test('应该返回地点列表', async () => {
      const { routeRequest } = require('./index');

      plansCollection.doc().get.mockResolvedValue({ data: [mockPlanData] });
      locationsCollection.get.mockResolvedValue({
        data: [mockLocationData, { ...mockLocationData, _id: 'location456' }]
      });

      const event = {
        httpMethod: 'GET',
        path: '/plans/plan123/locations'
      };

      const result = await routeRequest(event);

      expect(result.statusCode).toBe(200);
      expect(result.data).toHaveLength(2);
      expect(result.data[0].weather).toBeDefined();
    });
  });

  describe('OPTIONS 预检请求', () => {
    test('应该返回 204 状态码', async () => {
      const main = require('./index');

      const event = {
        httpMethod: 'OPTIONS',
        path: '/plans/plan123/locations'
      };

      const result = await main.main(event, {});

      expect(result.statusCode).toBe(204);
      expect(result.body).toBe('');
    });
  });
});
