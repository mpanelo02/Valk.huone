import express from 'express';
import fetch from 'node-fetch';
import rateLimit from 'express-rate-limit';
import Joi from 'joi';

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.ARANET_API_KEY;

// Validate configuration on startup
if (!API_KEY || API_KEY.length !== 32) {
  console.error('Invalid ARANET_API_KEY configuration');
  process.exit(1);
}

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: 'Too many requests, please try again later'
});

// Request validation schema
const sensorSchema = Joi.object({
  detailed: Joi.boolean().default(false)
});

// Apply middleware
app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  next();
});

app.get('/api/data', apiLimiter, async (req, res) => {
  try {
    // Validate request query parameters
    const { error } = sensorSchema.validate(req.query);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const [response1, response2, response3] = await Promise.all([
      fetch(`https://aranet.cloud/api/v1/measurements/last?sensor=1061612`, {
        headers: { 'ApiKey': API_KEY, 'Content-Type': 'application/json' }
      }),
      fetch(`https://aranet.cloud/api/v1/measurements/last?sensor=6305245`, {
        headers: { 'ApiKey': API_KEY, 'Content-Type': 'application/json' }
      }),
      fetch(`https://aranet.cloud/api/v1/measurements/last?sensor=3147479`, {
        headers: { 'ApiKey': API_KEY, 'Content-Type': 'application/json' }
      })
    ]);

    if (!response1.ok || !response2.ok || !response3.ok) {
      return res.status(502).json({ error: 'Error fetching data from Aranet' });
    }

    const data1 = await response1.json();
    const data2 = await response2.json();
    const data3 = await response3.json();

    // Simple response validation
    if (!data1.readings || !data2.readings || !data3.readings) {
      throw new Error('Invalid data structure from Aranet');
    }

    res.json({ 
      sensor1: data1, 
      sensor2: data2, 
      sensor3: data3 
    });

  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      detail: error.message 
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});