import express from 'express';
import fetch from 'node-fetch';
import pg from 'pg'; // Add PostgreSQL client
import bodyParser from 'body-parser';
// import cors from 'cors';

const { Pool } = pg;
const app = express();
const PORT = process.env.PORT || 3000;
const ARANET_API_KEY = process.env.ARANET_API_KEY;
const SIGROW_API_KEY = process.env.SIGROW_API_KEY; // Consider moving this to environment variables too
const WEATHER_API_KEY = process.env.WEATHER_API_KEY;

app.use(cors({
    origin: ['http://127.0.0.1:5500', 'http://localhost:3000', 'http://localhost:5500'],
    credentials: true
}));

app.get('/api/weather', async (req, res) => {
    try {
        // Add CORS headers specifically for this endpoint
        res.header('Access-Control-Allow-Origin', 'http://127.0.0.1:5500');
        res.header('Access-Control-Allow-Methods', 'GET');
        
        const response = await fetch(
            `http://api.weatherapi.com/v1/current.json?key=${WEATHER_API_KEY}&q=Vantaa&aqi=no`,
            {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            }
        );
        
        if (!response.ok) {
            throw new Error(`Weather API error! status: ${response.status}`);
        }
        
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Weather API error:', error);
        res.status(500).json({ 
            error: 'Failed to fetch weather data',
            detail: error.message 
        });
    }
});

function logDeviceStateChange(device, state) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] Device state changed - Device: ${device}, State: ${state}`);
}

// PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://valk_huone_1_user:yuHDs6SGhVjdkP2XbL16zbFhbL1OWsFr@dpg-d1ki9i3e5dus73ejpdpg-a/valk_huone_1',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});


async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS device_states (
        device VARCHAR(50) PRIMARY KEY,
        state VARCHAR(10) NOT NULL
      );
      
      CREATE TABLE IF NOT EXISTS light_intensity (
        id SERIAL PRIMARY KEY,
        value INT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS light_schedule (
        id SERIAL PRIMARY KEY,
        start_hour INT NOT NULL,
        start_minute INT NOT NULL,
        end_hour INT NOT NULL,
        end_minute INT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS pump_schedule (
        id SERIAL PRIMARY KEY,
        first_irrigation_hour INT NOT NULL,
        first_irrigation_minute INT NOT NULL,
        second_irrigation_hour INT NOT NULL,
        second_irrigation_minute INT NOT NULL,
        duration_seconds INT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS warning_thresholds (
        id SERIAL PRIMARY KEY,
        temp_high DECIMAL(5,2) NOT NULL,
        temp_low DECIMAL(5,2) NOT NULL,
        humid_high DECIMAL(5,2) NOT NULL,
        humid_low DECIMAL(5,2) NOT NULL,
        co2_high INT NOT NULL,
        co2_low INT NOT NULL,
        moisture_high DECIMAL(5,2) NOT NULL,
        moisture_low DECIMAL(5,2) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    try {
        await pool.query('SELECT moisture_high FROM warning_thresholds LIMIT 1');
    } catch (err) {
        if (err.code === '42703') { // undefined column error code
            console.log('Adding missing moisture columns to warning_thresholds');
            await pool.query(`
                ALTER TABLE warning_thresholds 
                ADD COLUMN IF NOT EXISTS moisture_high DECIMAL(5,2) DEFAULT 34.0,
                ADD COLUMN IF NOT EXISTS moisture_low DECIMAL(5,2) DEFAULT 30.0
            `);
            await pool.query(`
                ALTER TABLE warning_thresholds 
                ALTER COLUMN moisture_high SET NOT NULL,
                ALTER COLUMN moisture_low SET NOT NULL
            `);
        }
    }
    
    // Insert default values and log them
    const initResults = await Promise.all([
      pool.query(`
        INSERT INTO light_intensity (value) 
        SELECT 50 WHERE NOT EXISTS (SELECT 1 FROM light_intensity)
        RETURNING value
      `),
      
      pool.query(`
        INSERT INTO device_states (device, state)
        SELECT 'fan', 'OFF' WHERE NOT EXISTS (SELECT 1 FROM device_states WHERE device = 'fan')
        RETURNING device, state
      `),

      pool.query(`
        INSERT INTO device_states (device, state)
        SELECT 'plantLight', 'OFF' WHERE NOT EXISTS (SELECT 1 FROM device_states WHERE device = 'plantLight')
        RETURNING device, state
      `),
      
      pool.query(`
        INSERT INTO device_states (device, state)
        SELECT 'pump', 'OFF' WHERE NOT EXISTS (SELECT 1 FROM device_states WHERE device = 'pump')
        RETURNING device, state
      `),
      
      pool.query(`
        INSERT INTO device_states (device, state)
        SELECT 'autobot', 'OFF' WHERE NOT EXISTS (SELECT 1 FROM device_states WHERE device = 'autobot')
        RETURNING device, state
      `),

      pool.query(`
        INSERT INTO light_schedule (start_hour, start_minute, end_hour, end_minute)
        SELECT 8, 10, 23, 50 WHERE NOT EXISTS (SELECT 1 FROM light_schedule)
        RETURNING start_hour, start_minute, end_hour, end_minute
      `),

      pool.query(`
        INSERT INTO pump_schedule (first_irrigation_hour, first_irrigation_minute, second_irrigation_hour, second_irrigation_minute, duration_seconds)
        SELECT 9, 10, 21, 10, 60 
        WHERE NOT EXISTS (SELECT 1 FROM pump_schedule)
      `),

      pool.query(`
        INSERT INTO warning_thresholds (temp_high, temp_low, humid_high, humid_low, co2_high, co2_low, moisture_high, moisture_low)
        SELECT 23.0, 20.0, 75.0, 62.0, 620, 580, 34.0, 30.0
        WHERE NOT EXISTS (SELECT 1 FROM warning_thresholds)
        RETURNING *
      `)
    ]);
    
    // Log initialized states
    initResults.slice(1).forEach(result => {
      if (result.rows.length > 0) {
        const row = result.rows[0];
        if (row.device) {
          logDeviceStateChange(row.device, row.state);
        } else if (row.start_hour !== undefined) {
          const timestamp = new Date().toISOString();
          console.log(`[${timestamp}] Initial light schedule set: ${row.start_hour}:${row.start_minute} to ${row.end_hour}:${row.end_minute}`);
        }
      }
    });

    // Log initialized optimal range / thresholds
    const thresholdsResult = initResults[initResults.length - 1];
    if (thresholdsResult.rows.length > 0) {
      const thresholds = thresholdsResult.rows[0];
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] Initial warning thresholds set:
        Temp: ${thresholds.temp_low}-${thresholds.temp_high}°C,
        Humidity: ${thresholds.humid_low}-${thresholds.humid_high}%,
        CO2: ${thresholds.co2_low}-${thresholds.co2_high}ppm,
        Moisture: ${thresholds.moisture_low}-${thresholds.moisture_high}%
      `);
    }
    
    console.log('Database initialized');
  } catch (err) {
    console.error('Database initialization error:', err);
    process.exit(1);
  }
}

// Middleware
// In server.js - temporary fix for testing
// app.use((req, res, next) => {
//     res.header('Access-Control-Allow-Origin', '*');
//     res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
//     res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    
//     if (req.method === 'OPTIONS') {
//         return res.status(200).end();
//     }
    
//     next();
// });
app.use((req, res, next) => {
    const allowedOrigins = [
        'http://127.0.0.1:5500',
        'http://localhost:3000', 
        'http://localhost:5500',
        'https://strawberries-git-main-marks-projects-07a4f883.vercel.app',
        'https://strawberries.vercel.app' // Add your main domain if different
    ];
    
    const origin = req.headers.origin;
    
    if (allowedOrigins.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin);
    }
    
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Credentials', 'true');
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    next();
});

app.use(bodyParser.json());


// Light intensity endpoints
app.get('/api/light-intensity', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT value FROM light_intensity ORDER BY created_at DESC LIMIT 1'
    );
    res.json({ intensity: result.rows[0]?.value || 50 });
  } catch (err) {
    console.error('Error fetching light intensity:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/light-intensity', async (req, res) => {
  const { intensity } = req.body;
  
  if (intensity === undefined || intensity < 0 || intensity > 100) {
    return res.status(400).json({ error: 'Invalid intensity value' });
  }

  try {
    await pool.query(
      'INSERT INTO light_intensity (value) VALUES ($1)',
      [intensity]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating light intensity:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Settings endpoint to handle both light schedule and thresholds
app.post('/api/settings', async (req, res) => {
  const { lightSchedule, warningThresholds } = req.body;
  
  if (!lightSchedule || !warningThresholds) {
    return res.status(400).json({ error: 'Missing schedule or thresholds' });
  }

    // Validate light schedule
    if (
        lightSchedule.startHour === undefined || lightSchedule.startHour < 0 || lightSchedule.startHour > 23 ||
        lightSchedule.startMinute === undefined || lightSchedule.startMinute < 0 || lightSchedule.startMinute > 59 ||
        lightSchedule.endHour === undefined || lightSchedule.endHour < 0 || lightSchedule.endHour > 23 ||
        lightSchedule.endMinute === undefined || lightSchedule.endMinute < 0 || lightSchedule.endMinute > 59
    ) {
        return res.status(400).json({ error: 'Invalid light schedule values' });
    }

    // Validate thresholds
    if (
        warningThresholds.tempHigh === undefined || 
        warningThresholds.tempLow === undefined ||
        warningThresholds.humidHigh === undefined || 
        warningThresholds.humidLow === undefined ||
        warningThresholds.co2High === undefined || 
        warningThresholds.co2Low === undefined ||
        warningThresholds.moistureHigh === undefined || 
        warningThresholds.moistureLow === undefined
    ) {
        return res.status(400).json({ error: 'Missing threshold values' });
    }

  try {
    // Start a transaction
    await pool.query('BEGIN');
    
    // Update light schedule
    const scheduleResult = await pool.query(
      'INSERT INTO light_schedule (start_hour, start_minute, end_hour, end_minute) ' +
      'VALUES ($1, $2, $3, $4) RETURNING *',
      [
        lightSchedule.startHour,
        lightSchedule.startMinute,
        lightSchedule.endHour,
        lightSchedule.endMinute
      ]
    );
    
    // Update warning thresholds
    const thresholdsResult = await pool.query(
      'INSERT INTO warning_thresholds (temp_high, temp_low, humid_high, humid_low, co2_high, co2_low, moisture_high, moisture_low) ' +
      'VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
      [
        warningThresholds.tempHigh,
        warningThresholds.tempLow,
        warningThresholds.humidHigh,
        warningThresholds.humidLow,
        warningThresholds.co2High,
        warningThresholds.co2Low,
        warningThresholds.moistureHigh,
        warningThresholds.moistureLow
      ]
    );
    
    // Commit the transaction
    await pool.query('COMMIT');
    
    if (scheduleResult.rows.length > 0 && thresholdsResult.rows.length > 0) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] Settings updated:
        Light schedule: ${scheduleResult.rows[0].start_hour}:${scheduleResult.rows[0].start_minute} to ${scheduleResult.rows[0].end_hour}:${scheduleResult.rows[0].end_minute}
        Warning thresholds:
          Temp: ${thresholdsResult.rows[0].temp_low}-${thresholdsResult.rows[0].temp_high}°C,
          Humidity: ${thresholdsResult.rows[0].humid_low}-${thresholdsResult.rows[0].humid_high}%,
          CO2: ${thresholdsResult.rows[0].co2_low}-${thresholdsResult.rows[0].co2_high}ppm,
          Moisture: ${thresholdsResult.rows[0].moisture_low}-${thresholdsResult.rows[0].moisture_high}%
      `);

      res.json({
        success: true,
        lightSchedule: scheduleResult.rows[0],
        warningThresholds: thresholdsResult.rows[0]
      });
    } else {
      await pool.query('ROLLBACK');
      res.status(500).json({ error: 'Failed to save settings' });
    }
  } catch (err) {
    await pool.query('ROLLBACK');
    console.error('Error updating settings:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Light schedule endpoints
app.get('/api/light-schedule', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT start_hour, start_minute, end_hour, end_minute FROM light_schedule ORDER BY created_at DESC LIMIT 1'
    );
    if (result.rows.length > 0) {
      const schedule = result.rows[0];
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] Retrieved light schedule: ${schedule.start_hour}:${schedule.start_minute} to ${schedule.end_hour}:${schedule.end_minute}`);
      res.json(schedule);
    } else {
      res.status(404).json({ error: 'No schedule found' });
    }
  } catch (err) {
    console.error('Error fetching light schedule:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/light-schedule', async (req, res) => {
  const { startHour, startMinute, endHour, endMinute } = req.body;
  
  // Validate input
  if ([startHour, startMinute, endHour, endMinute].some(val => 
    val === undefined || val < 0 || 
    (val > 23 && (val === startHour || val === endHour)) ||
    (val > 59 && (val === startMinute || val === endMinute))
  )) {
    return res.status(400).json({ error: 'Invalid schedule values' });
  }

  try {
    const result = await pool.query(
      'INSERT INTO light_schedule (start_hour, start_minute, end_hour, end_minute) VALUES ($1, $2, $3, $4) RETURNING *',
      [startHour, startMinute, endHour, endMinute]
    );
    
    if (result.rows.length > 0) {
      const newSchedule = result.rows[0];
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] Light schedule updated: ${newSchedule.start_hour}:${newSchedule.start_minute} to ${newSchedule.end_hour}:${newSchedule.end_minute}`);
      res.json({ success: true, schedule: newSchedule });
    } else {
      res.status(500).json({ error: 'Failed to save schedule' });
    }
  } catch (err) {
    console.error('Error updating light schedule:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get current pump schedule
app.get('/api/pump-schedule', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT first_irrigation_hour, first_irrigation_minute, ' +
      'second_irrigation_hour, second_irrigation_minute, duration_seconds ' +
      'FROM pump_schedule ORDER BY created_at DESC LIMIT 1'
    );
    res.json(result.rows[0] || {});
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/pump-schedule', async (req, res) => {
  const { 
    firstIrrigationHour, 
    firstIrrigationMinute,
    secondIrrigationHour,
    secondIrrigationMinute,
    durationSeconds
  } = req.body;

  // Validate input
  if (
    firstIrrigationHour === undefined || firstIrrigationHour < 0 || firstIrrigationHour > 23 ||
    firstIrrigationMinute === undefined || firstIrrigationMinute < 0 || firstIrrigationMinute > 59 ||
    secondIrrigationHour === undefined || secondIrrigationHour < 0 || secondIrrigationHour > 23 ||
    secondIrrigationMinute === undefined || secondIrrigationMinute < 0 || secondIrrigationMinute > 59 ||
    durationSeconds === undefined || durationSeconds < 1 || durationSeconds > 3600
  ) {
    return res.status(400).json({ error: 'Invalid pump schedule values' });
  }

  try {
    const result = await pool.query(
      'INSERT INTO pump_schedule (first_irrigation_hour, first_irrigation_minute, ' +
      'second_irrigation_hour, second_irrigation_minute, duration_seconds) ' +
      'VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [
        firstIrrigationHour,
        firstIrrigationMinute,
        secondIrrigationHour,
        secondIrrigationMinute,
        durationSeconds
      ]
    );
    
    // Enhanced logging
    if (result.rows.length > 0) {
      const newSchedule = result.rows[0];
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] Pump schedule updated:
        1st Irrigation: ${newSchedule.first_irrigation_hour.toString().padStart(2, '0')}:${newSchedule.first_irrigation_minute.toString().padStart(2, '0')}
        2nd Irrigation: ${newSchedule.second_irrigation_hour.toString().padStart(2, '0')}:${newSchedule.second_irrigation_minute.toString().padStart(2, '0')}
        Duration: ${newSchedule.duration_seconds} seconds
      `);
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating pump schedule:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get all device states endpoints
app.get('/api/device-states', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM device_states');
    const states = {};
    result.rows.forEach(row => {
      states[row.device] = row.state;
    });
    res.json(states);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Get all range / thresholds endpoints
app.get('/api/warning-thresholds', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT temp_high, temp_low, humid_high, humid_low, co2_high, co2_low, moisture_high, moisture_low ' +
      'FROM warning_thresholds ORDER BY created_at DESC LIMIT 1'
    );
    
    if (result.rows.length > 0) {
      res.json(result.rows[0]);
    } else {
      res.status(404).json({ error: 'No thresholds found' });
    }
  } catch (err) {
    console.error('Error fetching warning thresholds:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/warning-thresholds', async (req, res) => {
  const { tempHigh, tempLow, humidHigh, humidLow, co2High, co2Low, moistureHigh, moistureLow } = req.body;

  // Validate input
  if (
    tempHigh === undefined || tempLow === undefined ||
    humidHigh === undefined || humidLow === undefined ||
    co2High === undefined || co2Low === undefined ||
    moistureHigh === undefined || moistureLow === undefined
  ) {
    return res.status(400).json({ error: 'Missing threshold values' });
  }

  try {
    const result = await pool.query(
      'INSERT INTO warning_thresholds (temp_high, temp_low, humid_high, humid_low, co2_high, co2_low, moisture_high, moisture_low) ' +
      'VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
      [tempHigh, tempLow, humidHigh, humidLow, co2High, co2Low, moistureHigh, moistureLow]
    );
    
    if (result.rows.length > 0) {
      const newThresholds = result.rows[0];
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] Warning thresholds updated:
        Temp: ${newThresholds.temp_low}-${newThresholds.temp_high}°C,
        Humidity: ${newThresholds.humid_low}-${newThresholds.humid_high}%,
        CO2: ${newThresholds.co2_low}-${newThresholds.co2_high}ppm,
        Moisture: ${newThresholds.moisture_low}-${newThresholds.moisture_high}%
      `);

      res.json(newThresholds);
    } else {
      res.status(500).json({ error: 'Failed to save thresholds' });
    }
  } catch (err) {
    console.error('Error updating warning thresholds:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  next();
});


app.use(bodyParser.json());

// Log helper
async function logCurrentSchedule() {
  try {
    const result = await pool.query(
      'SELECT start_hour, start_minute, end_hour, end_minute FROM light_schedule ORDER BY created_at DESC LIMIT 1'
    );
    if (result.rows.length > 0) {
      const schedule = result.rows[0];
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] Current light schedule: ${schedule.start_hour}:${schedule.start_minute} to ${schedule.end_hour}:${schedule.end_minute}`);
    }
  } catch (err) {
    console.error('Error logging current schedule:', err);
  }
}

// Call this periodically if you want (e.g., every hour)
setInterval(logCurrentSchedule, 3600000); // Every hour


const base_api_url = "https://app.sigrow.com/api/v2/camera/1171/shots";
        const headers = {
            'Content-Type': 'application/json',
            'X-API-Key': SIGROW_API_KEY
        };

async function fetchLastCameraShot() {
    try {
        const response = await fetch(base_api_url, {
            method: 'GET',
            headers: headers
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        const shots = data.shots;

        if (Array.isArray(shots) && shots.length > 0) {
            const lastShot = shots[shots.length - 1];
            const image_url = `https://app.sigrow.com/api/v2/camera/1171/shot/${lastShot.id}/source`;

            const imageResponse = await fetch(image_url, {
                method: 'GET',
                headers: headers
            });

            if (!imageResponse.ok) {
                throw new Error(`Image fetch error! status: ${imageResponse.status}`);
            }

            const imageData = await imageResponse.json();
            const sources = imageData.sources;
            
            if (Array.isArray(sources)) {
                const rgbImage = sources.find(source => source.type === "RGB_JPG");
                if (rgbImage) {
                    return {
                        id: lastShot.id,
                        timestamp: lastShot.timestamp,
                        imageUrl: rgbImage.url
                    };
                }
            }
        }
        return null;
    } catch (error) {
        console.error('Fetch error:', error);
        return null;
    }
}

fetchLastCameraShot();

// Function to fetch historical data
async function fetchHistoricalData(sensorId, metric) {
  try {
    const response = await fetch(
      `https://aranet.cloud/api/v1/measurements/history?sensor=${sensorId}&metric=${metric}`, 
      {
        headers: { 'ApiKey': ARANET_API_KEY, 'Content-Type': 'application/json' }
      }
    );
    
    if (!response.ok) {
      throw new Error(`Failed to fetch data for sensor ${sensorId}, metric ${metric}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error(`Error fetching historical data: ${error.message}`);
    return null;
  }
}

app.get('/api/data', async (req, res) => {
  try {
    // First get the current data as before
    const [current1, current2, current3, cameraShot] = await Promise.all([
      fetch(`https://aranet.cloud/api/v1/measurements/last?sensor=1061612`, {
        headers: { 'ApiKey': ARANET_API_KEY, 'Content-Type': 'application/json' }
      }),
      fetch(`https://aranet.cloud/api/v1/measurements/last?sensor=6305245`, {
        headers: { 'ApiKey': ARANET_API_KEY, 'Content-Type': 'application/json' }
      }),
      fetch(`https://aranet.cloud/api/v1/measurements/last?sensor=3147479`, {
        headers: { 'ApiKey': ARANET_API_KEY, 'Content-Type': 'application/json' }
      }),
      fetchLastCameraShot() // Get the camera shot data
    ]);

    if (!current1.ok || !current2.ok || !current3.ok) {
      return res.status(500).json({ error: 'Error fetching current data from Aranet' });
    }

    const currentData1 = await current1.json();
    const currentData2 = await current2.json();
    const currentData3 = await current3.json();

    // Now fetch historical data for temperature (metric 1) from sensor 1061612
    const tempHistory = await fetchHistoricalData(1061612, 1);
    const humidityHistory = await fetchHistoricalData(1061612, 2);
    const co2History = await fetchHistoricalData(3147479, 3);
    const atmosphericPressHistory = await fetchHistoricalData(3147479, 4);
    const moistureHistory = await fetchHistoricalData(6305245, 8);
    const soilECHistory = await fetchHistoricalData(6305245, 10);
    const poreECHistory = await fetchHistoricalData(6305245, 11);
    
    res.json({ 
      sensor1: currentData1, 
      sensor2: currentData2, 
      sensor3: currentData3,
      tempHistory: tempHistory ? tempHistory.readings.slice(0, 9999) : [], // Limit to first 9999 readings
      humidityHistory: humidityHistory ? humidityHistory.readings.slice(0, 9999) : [], // Limit to first 9999 readings
      co2History: co2History ? co2History.readings.slice(0, 9999) : [], // Limit to first 9999 readings
      atmosphericPressHistory: atmosphericPressHistory ? atmosphericPressHistory.readings.slice(0, 9999) : [], // Limit to first 9999 readings
      moistureHistory: moistureHistory ? moistureHistory.readings.slice(0, 9999) : [], // Limit to first 9999 readings
      soilECHistory: soilECHistory ? soilECHistory.readings.slice(0, 9999) : [], // Limit to first 9999 readings
      poreECHistory: poreECHistory ? poreECHistory.readings.slice(0, 9999) : [], // Limit to first 9999 readings
      lastCameraShot: cameraShot // Include the camera shot data in the response
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error', detail: error.message });
  }
});

let deviceStates = {
  fan: "OFF",
  plantLight: "OFF",
  pump: "OFF"
};

app.get('/api/device-states', (req, res) => {
  res.json(deviceStates);
});


app.post('/api/update-device-state', async (req, res) => {
  const { device, state } = req.body;
  
  if (!['fan', 'plantLight', 'pump', 'autobot'].includes(device)) {
    return res.status(400).json({ error: 'Invalid device' });
  }

  try {
    // First get the current state for comparison
    const currentState = await pool.query(
      'SELECT state FROM device_states WHERE device = $1',
      [device]
    );
    
    const previousState = currentState.rows[0]?.state || 'UNKNOWN';
    
    await pool.query(
      'INSERT INTO device_states (device, state) VALUES ($1, $2) ' +
      'ON CONFLICT (device) DO UPDATE SET state = EXCLUDED.state',
      [device, state]
    );
    
    // Log the change if it's different
    if (previousState !== state) {
      logDeviceStateChange(device, state);
    }
    
    res.json({ success: true });
  } catch (err) {
    console.error('Database error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});


async function startServer() {
  try {
    await initDB();
    
    // Log the current schedule on startup
    await logCurrentSchedule();

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();