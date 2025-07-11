import express from 'express';
import fetch from 'node-fetch';
import pg from 'pg'; // Add PostgreSQL client
import bodyParser from 'body-parser';


const { Pool } = pg;
const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.ARANET_API_KEY;
const SIGROW_API_KEY = process.env.SIGROW_API_KEY; // Consider moving this to environment variables too

const AUTOMATION_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours in ms
const PUMP_DURATION = 60 * 1000; // 1 minute in ms

// async function setupPumpAutomation() {
//   // Calculate time until next 6 AM or 6 PM
//   const now = new Date();
//   const currentHour = now.getHours();
  
//   // Determine next trigger time (6 AM or 6 PM)
//   let nextTriggerHour = currentHour < 6 ? 6 : 
//                        currentHour < 18 ? 18 : 6;
  
//   // If it's already past 6 PM, schedule for next day 6 AM
//   if (nextTriggerHour === 6 && currentHour >= 6) {
//     nextTriggerHour = 6;
//     now.setDate(now.getDate() + 1);
//   }
  
//   const nextTriggerTime = new Date(
//     now.getFullYear(),
//     now.getMonth(),
//     now.getDate(),
//     nextTriggerHour,
//     0, 0, 0
//   );
  
//   const timeUntilTrigger = nextTriggerTime - new Date();
  
//   setTimeout(async () => {
//     console.log(`[${new Date().toISOString()}] AUTOMATION: Turning pump ON (scheduled)`);
//     // Turn pump ON
//     await pool.query(
//       'INSERT INTO device_states (device, state) VALUES ($1, $2) ' +
//       'ON CONFLICT (device) DO UPDATE SET state = EXCLUDED.state',
//       ['pump', 'ON']
//     );
    
//     console.log(`Pump turned ON at ${new Date().toISOString()}`);
    
//     // Turn pump OFF after 1 minute
//     setTimeout(async () => {
//       console.log(`[${new Date().toISOString()}] AUTOMATION: Turning pump OFF after 1 minute`);
//       await pool.query(
//         'INSERT INTO device_states (device, state) VALUES ($1, $2) ' +
//         'ON CONFLICT (device) DO UPDATE SET state = EXCLUDED.state',
//         ['pump', 'OFF']
//       );
//       console.log(`Pump turned OFF at ${new Date().toISOString()}`);
      
//       // Schedule next automation cycle
//       setupPumpAutomation();
//     }, PUMP_DURATION);
//   }, timeUntilTrigger);
// }
// Update the setupPumpAutomation function
async function setupPumpAutomation() {
  try {
    // First check if automation is still ON
    const result = await pool.query(
      'SELECT state FROM device_states WHERE device = $1',
      ['automation']
    );
    
    if (result.rows[0]?.state !== 'ON') {
      console.log('Automation is OFF - stopping scheduled pump automation');
      return;
    }

    // Calculate time until next 7 AM or 7 PM
    const now = new Date();
    const currentHour = now.getHours();
    
    // Determine next trigger time (7 AM or 7 PM)
    let nextTriggerHour = currentHour < 7 ? 7 : 
                         currentHour < 19 ? 19 : 7;
    
    // If it's already past 7 PM, schedule for next day 7 AM
    if (nextTriggerHour === 7 && currentHour >= 7) {
      now.setDate(now.getDate() + 1);
    }
    
    const nextTriggerTime = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      nextTriggerHour,
      0, 0, 0
    );
    
    const timeUntilTrigger = nextTriggerTime - now;
    
    console.log(`Next pump automation scheduled for ${nextTriggerTime.toISOString()} (in ${Math.round(timeUntilTrigger/1000/60)} minutes)`);
    
    setTimeout(async () => {
      // Check again if automation is still ON
      const checkResult = await pool.query(
        'SELECT state FROM device_states WHERE device = $1',
        ['automation']
      );
      
      if (checkResult.rows[0]?.state !== 'ON') {
        console.log('Automation was turned OFF - cancelling pump activation');
        return;
      }

      console.log(`[${new Date().toISOString()}] AUTOMATION: Turning pump ON (scheduled)`);
      // Turn pump ON
      await pool.query(
        'INSERT INTO device_states (device, state) VALUES ($1, $2) ' +
        'ON CONFLICT (device) DO UPDATE SET state = EXCLUDED.state',
        ['pump', 'ON']
      );
      
      console.log(`Pump turned ON at ${new Date().toISOString()}`);
      
      // Turn pump OFF after 1 minute
      setTimeout(async () => {
        console.log(`[${new Date().toISOString()}] AUTOMATION: Turning pump OFF after 1 minute`);
        await pool.query(
          'INSERT INTO device_states (device, state) VALUES ($1, $2) ' +
          'ON CONFLICT (device) DO UPDATE SET state = EXCLUDED.state',
          ['pump', 'OFF']
        );
        console.log(`Pump turned OFF at ${new Date().toISOString()}`);
        
        // Schedule next automation cycle
        setupPumpAutomation();
      }, PUMP_DURATION);
    }, timeUntilTrigger);
  } catch (err) {
    console.error('Error in pump automation:', err);
    // Retry after 5 minutes if there was an error
    setTimeout(setupPumpAutomation, 5 * 60 * 1000);
  }
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
      
      -- Insert default value only if table is empty
      INSERT INTO light_intensity (value) 
      SELECT 50 WHERE NOT EXISTS (SELECT 1 FROM light_intensity);
      
      -- Insert default device states if they don't exist
      INSERT INTO device_states (device, state)
      SELECT 'fan', 'OFF' WHERE NOT EXISTS (SELECT 1 FROM device_states WHERE device = 'fan');
      
      INSERT INTO device_states (device, state)
      SELECT 'pump', 'OFF' WHERE NOT EXISTS (SELECT 1 FROM device_states WHERE device = 'pump');

      -- Insert default automation state if it doesn't exist
      INSERT INTO device_states (device, state)
      SELECT 'automation', 'OFF' WHERE NOT EXISTS (SELECT 1 FROM device_states WHERE device = 'automation');
    `);
    console.log('Database initialized');
  } catch (err) {
    console.error('Database initialization error:', err);
    process.exit(1); // Exit if we can't initialize the database
  }
}

// Middleware
app.use(bodyParser.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});


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
    // Get current intensity to compare
    const current = await pool.query(
      'SELECT value FROM light_intensity ORDER BY created_at DESC LIMIT 1'
    );
    const currentIntensity = current.rows[0]?.value;
    
    // Only log if value changed
    if (currentIntensity !== intensity) {
      console.log(`[${new Date().toISOString()}] Light intensity changed from ${currentIntensity} to ${intensity}`);
    }

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


// app.post('/api/update-device-state', async (req, res) => {
//   const { device, state } = req.body;
  
//   if (!['fan', 'pump', 'automation'].includes(device)) {
//     return res.status(400).json({ error: 'Invalid device' });
//   }

//   try {
//     // Get current state to compare
//     const current = await pool.query(
//       'SELECT state FROM device_states WHERE device = $1',
//       [device]
//     );
//     const currentState = current.rows[0]?.state;
    
//     // Only log if state changed
//     if (currentState !== state) {
//       console.log(`[${new Date().toISOString()}] Device ${device} state changed from ${currentState} to ${state}`);
      
//       // If automation is being turned on, start the automation process
//       if (device === 'automation' && state === 'ON') {
//         setupPumpAutomation();
//       }
//     }

//     await pool.query(
//       'INSERT INTO device_states (device, state) VALUES ($1, $2) ' +
//       'ON CONFLICT (device) DO UPDATE SET state = EXCLUDED.state',
//       [device, state]
//     );
//     res.json({ success: true });
//   } catch (err) {
//     console.error('Error updating device state:', err);
//     res.status(500).json({ error: 'Database error' });
//   }
// });

app.post('/api/update-device-state', async (req, res) => {
  const { device, state } = req.body;
  
  if (!['fan', 'pump', 'automation'].includes(device)) {
    return res.status(400).json({ error: 'Invalid device' });
  }

  try {
    // Get current state to compare
    const current = await pool.query(
      'SELECT state FROM device_states WHERE device = $1',
      [device]
    );
    const currentState = current.rows[0]?.state;
    
    // Only log if state changed
    if (currentState !== state) {
      console.log(`[${new Date().toISOString()}] Device ${device} state changed from ${currentState} to ${state}`);
      
      // If automation is being turned on, start the automation process
      if (device === 'automation' && state === 'ON') {
        setupPumpAutomation();
      }
    }

    await pool.query(
      'INSERT INTO device_states (device, state) VALUES ($1, $2) ' +
      'ON CONFLICT (device) DO UPDATE SET state = EXCLUDED.state',
      [device, state]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating device state:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// async function startServer() {
//   try {
//     await initDB();
    
//     // Check if automation is on and start the automation process if needed
//     const result = await pool.query(
//       'SELECT state FROM device_states WHERE device = $1',
//       ['automation']
//     );
    
//     if (result.rows[0]?.state === 'ON') {
//       setupPumpAutomation();
//     }
    
//     app.listen(PORT, () => {
//       console.log(`Server running on port ${PORT}`);
//     });
//   } catch (error) {
//     console.error('Failed to start server:', error);
//     process.exit(1);
//   }
// }

async function startServer() {
  try {
    await initDB();
    
    // Check if automation is on and start the automation process if needed
    const result = await pool.query(
      'SELECT state FROM device_states WHERE device = $1',
      ['automation']
    );
    
    if (result.rows[0]?.state === 'ON') {
      console.log('Automation is ON - starting pump automation schedule');
      setupPumpAutomation();
    } else {
      console.log('Automation is OFF - no scheduled pump automation');
    }
    
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();