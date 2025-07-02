import express from 'express';
import fetch from 'node-fetch';

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.ARANET_API_KEY;

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  next();
});

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
    const [current1, current2, current3] = await Promise.all([
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

    if (!current1.ok || !current2.ok || !current3.ok) {
      return res.status(500).json({ error: 'Error fetching current data from Aranet' });
    }

    const currentData1 = await current1.json();
    const currentData2 = await current2.json();
    const currentData3 = await current3.json();

    // Now fetch historical data for temperature (metric 1) from sensor 1061612
    const tempHistory = await fetchHistoricalData(1061612, 1);
    const humidityHistory = await fetchHistoricalData(1061612, 2);
    
    // Log the historical data to console
    if (tempHistory && tempHistory.readings) {
      console.log("Temperature History (first 10 readings):");
      console.log(tempHistory.readings.slice(0, 10).map(r => r.value));
    }
    
    if (humidityHistory && humidityHistory.readings) {
      console.log("Humidity History (first 10 readings):");
      console.log(humidityHistory.readings.slice(0, 10).map(r => r.value));
    }

    res.json({ 
      sensor1: currentData1, 
      sensor2: currentData2, 
      sensor3: currentData3,
      tempHistory: tempHistory ? tempHistory.readings.slice(0, 1000) : [], // Limit to first 1000 readings
      humidityHistory: humidityHistory ? humidityHistory.readings.slice(0, 1000) : [] // Limit to first 1000 readings
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error', detail: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});