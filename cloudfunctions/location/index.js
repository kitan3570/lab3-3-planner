const express = require('express');
const cloudbase = require("@cloudbase/node-sdk");
const serverless = require('serverless-http');

const app = express();
const port = process.env.PORT || 9000;

const cb = cloudbase.init({
  env: cloudbase.SYMBOL_CURRENT_ENV,
});

const db = cb.database();

async function getWeatherSummary(lat, lng) {
  try {
    const host = (process.env.YOUR_QWEATHER_HOST || process.env.QWEATHER_HOST || 'https://devapi.qweather.com').replace(/\/$/, '');
    const key = process.env.YOUR_QWEATHER_KEY || process.env.QWEATHER_KEY;
    if (!key || key === 'your_qweather_key' || key === 'your_key') {
      return { ok: false, summary: "未配置真实天气 Key", error: "Missing/invalid QWEATHER_KEY" };
    }

    const weatherUrl = `https://${host}/v7/weather/now?location=${lng},${lat}&key=${key}`;
    const res = await fetch(weatherUrl);
    const text = await res.text();

    if (!text || text.trim() === '') {
      return { ok: false, summary: "天气 API 返回空响应", error: `HTTP ${res.status}` };
    }

    const data = JSON.parse(text);

    if (data.code === '200' && data.now) {
      return { ok: true, summary: `${data.now.text} ${data.now.temp}°C`, error: null };
    } else {
      return { ok: false, summary: "天气获取失败", error: data.code };
    }
  } catch (e) {
    console.error("Weather fetch error:", e);
    return { ok: false, summary: "天气请求异常", error: e.message };
  }
}

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
    service: 'location',
    status: 'ok',
    message: 'Location API is running'
  });
});

app.post('/plans/:planId/locations', async (req, res) => {
  try {
    const planId = req.params.planId;

    const planExists = await db.collection('plans').doc(planId).get();
    if (!planExists.data || planExists.data.length === 0) {
      return res.status(404).json({
        error: 'Plan not found'
      });
    }

    const data = req.body;
    if (!data.name || !data.lat || !data.lng || !data.day_index || !data.time_slot) {
      return res.status(400).json({
        error: 'Missing required fields: name, lat, lng, day_index, time_slot'
      });
    }

    const locationData = {
      plan_id: planId,
      name: data.name,
      lat: parseFloat(data.lat),
      lng: parseFloat(data.lng),
      day_index: parseInt(data.day_index),
      time_slot: data.time_slot,
      estimated_cost: data.estimated_cost ? parseFloat(data.estimated_cost) : 0,
      duration: data.duration ? parseInt(data.duration) : 60,
      remarks: data.remarks || null,
      weather: data.weather || null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    const result = await db.collection('locations').add(locationData);

    const newLocation = {
      id: result.id,
      ...locationData,
    };
    newLocation.weather = await getWeatherSummary(newLocation.lat, newLocation.lng);

    res.status(201).json(newLocation);
  } catch (error) {
    console.error('[Location] Error creating location:', error);
    res.status(500).json({
      error: error.message || 'Internal server error'
    });
  }
});

app.get('/plans/:planId/locations', async (req, res) => {
  try {
    const planId = req.params.planId;

    const result = await db.collection('locations')
      .where({ plan_id: planId })
      .orderBy('day_index', 'asc')
      .orderBy('time_slot', 'asc')
      .get();

    const locationsWithWeather = await Promise.all(result.data.map(async loc => {
      const location = { ...loc };
      location.id = location._id;
      delete location._id;
      location.weather = await getWeatherSummary(location.lat, location.lng);
      return location;
    }));

    res.status(200).json(locationsWithWeather);
  } catch (error) {
    console.error('[Location] Error listing locations:', error);
    res.status(500).json({
      error: error.message || 'Internal server error'
    });
  }
});

app.get('/plans/:planId/locations/:locationId', async (req, res) => {
  try {
    const locationId = req.params.locationId;

    const result = await db.collection('locations').doc(locationId).get();

    if (!result.data || result.data.length === 0) {
      return res.status(404).json({
        error: 'Location not found'
      });
    }

    const location = { ...result.data[0] };
    location.id = location._id;
    delete location._id;
    location.weather = await getWeatherSummary(location.lat, location.lng);

    res.status(200).json(location);
  } catch (error) {
    console.error('[Location] Error getting location:', error);
    res.status(500).json({
      error: error.message || 'Internal server error'
    });
  }
});

app.put('/plans/:planId/locations/:locationId', async (req, res) => {
  try {
    const planId = req.params.planId;
    const locationId = req.params.locationId;

    const getResult = await db.collection('locations').doc(locationId).get();
    if (!getResult.data || getResult.data.length === 0) {
      return res.status(404).json({
        error: 'Location not found'
      });
    }

    if (getResult.data[0].plan_id !== planId) {
      return res.status(403).json({
        error: 'Location does not belong to this plan'
      });
    }

    const data = req.body;
    const updateData = {
      updated_at: new Date(),
    };

    if (data.name !== undefined) updateData.name = data.name;
    if (data.lat !== undefined) updateData.lat = parseFloat(data.lat);
    if (data.lng !== undefined) updateData.lng = parseFloat(data.lng);
    if (data.day_index !== undefined) updateData.day_index = parseInt(data.day_index);
    if (data.time_slot !== undefined) updateData.time_slot = data.time_slot;
    if (data.estimated_cost !== undefined) updateData.estimated_cost = parseFloat(data.estimated_cost);
    if (data.duration !== undefined) updateData.duration = parseInt(data.duration);
    if (data.remarks !== undefined) updateData.remarks = data.remarks;
    if (data.weather !== undefined) updateData.weather = data.weather;

    await db.collection('locations').doc(locationId).update(updateData);

    const result = await db.collection('locations').doc(locationId).get();
    const location = { ...result.data[0] };
    location.id = location._id;
    delete location._id;
    location.weather = await getWeatherSummary(location.lat, location.lng);
    res.status(200).json(location);
  } catch (error) {
    console.error('[Location] Error updating location:', error);
    res.status(500).json({
      error: error.message || 'Internal server error'
    });
  }
});

app.delete('/plans/:planId/locations/:locationId', async (req, res) => {
  try {
    const planId = req.params.planId;
    const locationId = req.params.locationId;

    const getResult = await db.collection('locations').doc(locationId).get();
    if (!getResult.data || getResult.data.length === 0) {
      return res.status(404).json({
        error: 'Location not found'
      });
    }

    if (getResult.data[0].plan_id !== planId) {
      return res.status(403).json({
        error: 'Location does not belong to this plan'
      });
    }

    await db.collection('locations').doc(locationId).remove();

    res.status(200).json({
      message: 'Location deleted successfully'
    });
  } catch (error) {
    console.error('[Location] Error deleting location:', error);
    res.status(500).json({
      error: error.message || 'Internal server error'
    });
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
          console.error('[Location] Middleware error:', err);
          reject(err);
        }
      });
    } catch (err) {
      console.error('[Location] Error handling request:', err);
      reject(err);
    }
  });
};

if (require.main === module) {
  app.listen(port, () => {
    console.log(`[Location] Server running on port ${port}`);
  });
}

module.exports = app;
