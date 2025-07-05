import express from 'express';
import fetch from 'node-fetch';
import pg from 'pg'; // Add PostgreSQL client
import bodyParser from 'body-parser';


const { Pool } = pg;
const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.ARANET_API_KEY;
const SIGROW_API_KEY = process.env.SIGROW_API_KEY; // Consider moving this to environment variables too

// PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'your-local-connection-string',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Create table if it doesn't exist
async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS device_states (
        device VARCHAR(20) PRIMARY KEY,
        state VARCHAR(10) NOT NULL
      );
      
      INSERT INTO device_states (device, state)
      VALUES ('fan', 'OFF'), ('plantLight', 'OFF'), ('pump', 'OFF')
      ON CONFLICT (device) DO NOTHING;
    `);
    console.log('Database initialized');
  } catch (err) {
    console.error('Database initialization error:', err);
  }
}

initDB();

// Middleware
app.use(bodyParser.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// Get all device states
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


app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  next();
});

app.use(bodyParser.json());


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
        headers: { 'ApiKey': API_KEY, 'Content-Type': 'application/json' }
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
        headers: { 'ApiKey': API_KEY, 'Content-Type': 'application/json' }
      }),
      fetch(`https://aranet.cloud/api/v1/measurements/last?sensor=6305245`, {
        headers: { 'ApiKey': API_KEY, 'Content-Type': 'application/json' }
      }),
      fetch(`https://aranet.cloud/api/v1/measurements/last?sensor=3147479`, {
        headers: { 'ApiKey': API_KEY, 'Content-Type': 'application/json' }
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
  
  if (!['fan', 'plantLight', 'pump'].includes(device)) {
    return res.status(400).json({ error: 'Invalid device' });
  }

  try {
    await pool.query(
      'INSERT INTO device_states (device, state) VALUES ($1, $2) ' +
      'ON CONFLICT (device) DO UPDATE SET state = EXCLUDED.state',
      [device, state]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});




