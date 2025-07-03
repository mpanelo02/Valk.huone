import express from 'express';
import fetch from 'node-fetch';

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.ARANET_API_KEY;
const SIGROW_API_KEY = process.env.SIGROW_API_KEY; // Consider moving this to environment variables too

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  next();
});

// Function to fetch Sigrow camera last shot
async function fetchLastCameraShot() {
  try {
    const response = await fetch(
      'https://app.sigrow.com/api/v2/camera/1171/shots',
      {
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': SIGROW_API_KEY
        }
      }
    );
    
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const data = await response.json();
                console.log('Full API response:', data);

                const shots = data.shots; // Adjust this line based on actual structure

                if (Array.isArray(shots) && shots.length > 0) {
                    const lastShot = shots[shots.length - 1];
                    console.log('Last shot ID:', lastShot.id);
                } else {
                    console.log('No shots found.');
                }
            } catch (error) {
                console.error('Fetch error:', error);
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
    
    // Log the historical data to console
    if (tempHistory && tempHistory.readings) {
      console.log("Temperature History (first 10 readings):");
      console.log(tempHistory.readings.slice(0, 10).map(r => ({ time: r.time, value: r.value })));
    }
    if (humidityHistory && humidityHistory.readings) {
      console.log("Humidity History (first 10 readings):");
      console.log(humidityHistory.readings.slice(0, 10).map(r => ({ time: r.time, value: r.value })));
    }
    if (co2History && co2History.readings) {
      console.log("CO2 History (first 10 readings):");
      console.log(co2History.readings.slice(0, 10).map(r => ({ time: r.time, value: r.value })));
    }
    if (atmosphericPressHistory && atmosphericPressHistory.readings) {
      console.log("Atmospheric Pressure History (first 10 readings):");
      console.log(atmosphericPressHistory.readings.slice(0, 10).map(r => ({ time: r.time, value: r.value })));
    }
    if (moistureHistory && moistureHistory.readings) {
      console.log("Moisture History (first 10 readings):");
      console.log(moistureHistory.readings.slice(0, 10).map(r => ({ time: r.time, value: r.value })));
    }
    if (soilECHistory && soilECHistory.readings) {
      console.log("Soil EC History (first 10 readings):");
      console.log(soilECHistory.readings.slice(0, 10).map(r => ({ time: r.time, value: r.value })));
    }
    if (poreECHistory && poreECHistory.readings) {
      console.log("Pore EC History (first 10 readings):");
      console.log(poreECHistory.readings.slice(0, 10).map(r => ({ time: r.time, value: r.value })));
    }

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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});