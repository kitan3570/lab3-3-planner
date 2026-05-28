const express = require('express');
const cloudbase = require("@cloudbase/node-sdk");
const { v4: uuidv4 } = require("uuid");

const app = express();
const port = process.env.PORT || 9000;

const cb = cloudbase.init({
  env: cloudbase.SYMBOL_CURRENT_ENV,
});

const db = cb.database();

let collectionCreated = false;

async function ensureCollection(collectionName) {
  if (collectionCreated) return;

  try {
    await db.createCollection(collectionName);
    console.log(`[Plan] Created collection: ${collectionName}`);
  } catch (error) {
    if (error.code !== 'DATABASE_COLLECTION_EXISTS') {
      console.warn(`[Plan] Failed to create collection ${collectionName}:`, error.message);
    }
  }

  try {
    await db.createCollection('locations');
    console.log('[Plan] Created collection: locations');
  } catch (error) {
    if (error.code !== 'DATABASE_COLLECTION_EXISTS') {
      console.warn('[Plan] Failed to create collection locations:', error.message);
    }
  }

  collectionCreated = true;
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    res.status(204).send();
    return;
  }
  next();
});

app.get('/', async (req, res) => {
  res.status(200).json({
    service: 'plan',
    status: 'ok',
    message: 'Plan API is running'
  });
});

app.get('/plans', async (req, res) => {
  try {
    await ensureCollection('plans');
    const result = await db.collection('plans').orderBy('created_at', 'desc').get();
    res.status(200).json(result.data);
  } catch (error) {
    console.error('[Plan] Error listing plans:', error);
    res.status(500).json({
      error: error.message || 'Internal server error'
    });
  }
});

app.post('/plans', async (req, res) => {
  try {
    await ensureCollection('plans');

    const data = req.body;
    if (!data.title || !data.date || data.budget === undefined || data.people_count === undefined) {
      return res.status(400).json({
        error: 'Missing required fields: title, date, budget, people_count'
      });
    }

    const planData = {
      title: data.title,
      date: data.date,
      budget: parseFloat(data.budget),
      people_count: parseInt(data.people_count),
      preferences: data.preferences || null,
      remarks: data.remarks || null,
      locations: [],
      created_at: new Date(),
      updated_at: new Date(),
    };

    const result = await db.collection('plans').add(planData);

    res.status(201).json({
      id: result.id,
      ...planData,
      locations: [],
    });
  } catch (error) {
    console.error('[Plan] Error creating plan:', error);
    res.status(500).json({
      error: error.message || 'Internal server error'
    });
  }
});

app.get('/plans/:id', async (req, res) => {
  try {
    await ensureCollection('plans');
    const result = await db.collection('plans').doc(req.params.id).get();

    if (!result.data || result.data.length === 0) {
      return res.status(404).json({
        error: 'Plan not found'
      });
    }

    res.status(200).json(result.data[0]);
  } catch (error) {
    console.error('[Plan] Error getting plan:', error);
    res.status(500).json({
      error: error.message || 'Internal server error'
    });
  }
});

app.put('/plans/:id', async (req, res) => {
  try {
    await ensureCollection('plans');

    const getResult = await db.collection('plans').doc(req.params.id).get();
    if (!getResult.data || getResult.data.length === 0) {
      return res.status(404).json({
        error: 'Plan not found'
      });
    }

    const data = req.body;
    const updateData = {
      updated_at: new Date(),
    };

    if (data.title !== undefined) updateData.title = data.title;
    if (data.date !== undefined) updateData.date = data.date;
    if (data.budget !== undefined) updateData.budget = parseFloat(data.budget);
    if (data.people_count !== undefined) updateData.people_count = parseInt(data.people_count);
    if (data.preferences !== undefined) updateData.preferences = data.preferences;
    if (data.remarks !== undefined) updateData.remarks = data.remarks;

    await db.collection('plans').doc(req.params.id).update(updateData);

    const result = await db.collection('plans').doc(req.params.id).get();
    res.status(200).json(result.data[0]);
  } catch (error) {
    console.error('[Plan] Error updating plan:', error);
    res.status(500).json({
      error: error.message || 'Internal server error'
    });
  }
});

app.delete('/plans/:id', async (req, res) => {
  try {
    await ensureCollection('plans');

    const getResult = await db.collection('plans').doc(req.params.id).get();
    if (!getResult.data || getResult.data.length === 0) {
      return res.status(404).json({
        error: 'Plan not found'
      });
    }

    await db.collection('plans').doc(req.params.id).remove();
    await db.collection('locations').where({ plan_id: req.params.id }).remove();

    res.status(200).json({
      message: 'Plan deleted successfully'
    });
  } catch (error) {
    console.error('[Plan] Error deleting plan:', error);
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

function createResponseObject(res) {
  const response = {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json'
    },
    body: ''
  };

  res.status = function(code) {
    response.statusCode = code;
    return this;
  };

  res.setHeader = function(name, value) {
    response.headers[name] = value;
    return this;
  };

  res.json = function(data) {
    response.body = JSON.stringify(data);
    return response;
  };

  res.send = function(data) {
    if (data !== undefined) {
      response.body = typeof data === 'object' ? JSON.stringify(data) : String(data);
    }
    return response;
  };

  return response;
}

exports.main = async (event, context) => {
  console.log('[Plan] Received event:', JSON.stringify(event).substring(0, 500));

  return new Promise((resolve, reject) => {
    try {
      const method = (event.httpMethod || 'GET').toUpperCase();
      const path = event.path || '/';
      const query = event.queryStringParameters || {};
      const headers = event.headers || {};
      let body = event.body || '';

      if (event.isBase64Encoded) {
        body = Buffer.from(body, 'base64').toString('utf8');
      }

      const mockReq = {
        method: method,
        url: path,
        path: path,
        originalUrl: path,
        params: {},
        query: query,
        headers: headers,
        body: body,
        get: function(name) {
          return this.headers[name.toLowerCase()];
        },
        accepts: function() { return 'application/json'; },
        acceptsCharsets: function() { return 'utf-8'; },
        acceptsEncodings: function() { return '*'; },
        acceptsLanguages: function() { return '*'; },
        ip: headers['x-forwarded-for'] || '127.0.0.1',
        get method() { return this.method; },
        get url() { return this.url; }
      };

      const mockRes = createResponseObject({});

      app.handle(mockReq, mockRes, function(err) {
        if (err) {
          console.error('[Plan] Express error:', err);
          reject(err);
        } else {
          console.log('[Plan] Response:', mockRes.statusCode, mockRes.body.substring(0, 200));
          resolve(mockRes);
        }
      });
    } catch (err) {
      console.error('[Plan] Error:', err);
      reject(err);
    }
  });
};

if (require.main === module) {
  app.listen(port, () => {
    console.log(`[Plan] Server running on port ${port}`);
  });
}

module.exports = app;
