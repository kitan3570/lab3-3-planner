const cloudbase = require("@cloudbase/node-sdk");
const { v4: uuidv4 } = require("uuid");

const app = cloudbase.init({
  env: cloudbase.SYMBOL_CURRENT_ENV,
});

const db = app.database();

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

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  };
}

function parseBody(event) {
  if (!event.body) {
    return {};
  }
  if (typeof event.body === 'string') {
    try {
      return JSON.parse(event.body);
    } catch (e) {
      return {};
    }
  }
  return event.body;
}

function parsePathParams(path) {
  const match = path.match(/^\/plans\/([^\/]+)$/);
  if (match) {
    return { id: match[1] };
  }
  return {};
}

async function createPlan(data) {
  if (!data.title || !data.date || data.budget === undefined || data.people_count === undefined) {
    throw {
      statusCode: 400,
      message: 'Missing required fields: title, date, budget, people_count'
    };
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

  const res = await db.collection('plans').add(planData);

  return {
    statusCode: 201,
    data: {
      id: res.id,
      ...planData,
      locations: [],
    }
  };
}

async function listPlans() {
  const res = await db.collection('plans').orderBy('created_at', 'desc').get();

  return {
    statusCode: 200,
    data: res.data
  };
}

async function getPlan(id) {
  const res = await db.collection('plans').doc(id).get();

  if (!res.data || res.data.length === 0) {
    throw {
      statusCode: 404,
      message: 'Plan not found'
    };
  }

  return {
    statusCode: 200,
    data: res.data[0]
  };
}

async function deletePlan(id) {
  const res = await db.collection('plans').doc(id).remove();

  if (res.deleted === 0) {
    throw {
      statusCode: 404,
      message: 'Plan not found'
    };
  }

  return {
    statusCode: 200,
    data: { deleted: res.deleted }
  };
}

async function routeRequest(event) {
  const method = event.httpMethod;
  const path = event.path;
  const pathParams = parsePathParams(path);

  if (method === 'GET' && path === '/plans') {
    return await listPlans();
  } else if (method === 'POST' && path === '/plans') {
    const body = parseBody(event);
    return await createPlan(body);
  } else if (method === 'GET' && pathParams.id) {
    return await getPlan(pathParams.id);
  } else if (method === 'DELETE' && pathParams.id) {
    return await deletePlan(pathParams.id);
  } else {
    throw {
      statusCode: 404,
      message: 'Route not found'
    };
  }
}

exports.main = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders(),
      body: ''
    };
  }

  try {
    await ensureCollection('plans');
    
    const result = await routeRequest(event);

    return {
      statusCode: result.statusCode,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders()
      },
      body: JSON.stringify(result.data)
    };
  } catch (error) {
    console.error('Error:', error);

    const statusCode = error.statusCode || 500;
    const message = error.message || 'Internal server error';

    return {
      statusCode: statusCode,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders()
      },
      body: JSON.stringify({ error: message })
    };
  }
};
