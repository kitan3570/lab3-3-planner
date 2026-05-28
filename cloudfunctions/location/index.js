const express = require('express');
const cloudbase = require("@cloudbase/node-sdk");
const serverless = require('serverless-http');

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

    res.status(201).json({
      _id: result.id,
      ...locationData,
    });
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

    res.status(200).json(result.data);
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

    res.status(200).json(result.data[0]);
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
    res.status(200).json(result.data[0]);
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
