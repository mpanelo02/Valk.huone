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
// Add these functions to your server.js
async function fetchLatestShotId() {
  try {
    const response = await fetch(
      'https://app.sigrow.com/api/v2/camera/1171/shots',
      {
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': process.env.SIGROW_API_KEY
        }
      }
    );
    
    if (!response.ok) {
      throw new Error(`Failed to fetch camera shots: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (data && data.length > 0) {
      const lastShot = data[data.length - 1];
      console.log('Latest shot ID:', lastShot.id); // Log the shot ID
      return lastShot.id;
    }
    
    return null;
  } catch (error) {
    console.error(`Error fetching camera shots: ${error.message}`);
    return null;
  }
}

async function fetchCameraImage(shotId) {
  try {
    const response = await fetch(
      `https://app.sigrow.com/api/v2/camera/1171/shot/${shotId}/source`,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': process.env.SIGROW_API_KEY
        }
      }
    );
    
    if (!response.ok) {
      throw new Error(`Failed to fetch camera image: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Find the RGB image URL from the sources array
    const rgbImage = data.sources.find(source => source.type === 'RGB_JPG');
    
    if (rgbImage) {
      return {
        imageUrl: rgbImage.url,
        timestamp: data.date.in_gmt_timezone,
        temperature: data.climate_sensor_temperature,
        humidity: data.climate_sensor_humidity
      };
    }
    
    return null;
  } catch (error) {
    console.error(`Error fetching camera image: ${error.message}`);
    return null;
  }
}

// Update the camera endpoint
app.get('/api/camera', async (req, res) => {
  try {
    // First get the latest shot ID
    const shotId = await fetchLatestShotId();
    if (!shotId) {
      return res.status(404).json({ error: 'No camera shots found' });
    }
    
    // Then get the image data using the shot ID
    const imageData = await fetchCameraImage(shotId);
    if (imageData) {
      res.json(imageData);
    } else {
      res.status(404).json({ error: 'No camera image found' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
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
    console.log('Fetching sensor data...');
    
    // First get the current data
    const [current1, current2, current3] = await Promise.all([
      fetch(`https://aranet.cloud/api/v1/measurements/last?sensor=1061612`, {
        headers: { 'ApiKey': API_KEY, 'Content-Type': 'application/json' }
      }).then(res => res.ok ? res.json() : Promise.reject(new Error(`Sensor1 failed: ${res.statusText}`))),
      fetch(`https://aranet.cloud/api/v1/measurements/last?sensor=6305245`, {
        headers: { 'ApiKey': API_KEY, 'Content-Type': 'application/json' }
      }).then(res => res.ok ? res.json() : Promise.reject(new Error(`Sensor2 failed: ${res.statusText}`))),
      fetch(`https://aranet.cloud/api/v1/measurements/last?sensor=3147479`, {
        headers: { 'ApiKey': API_KEY, 'Content-Type': 'application/json' }
      }).then(res => res.ok ? res.json() : Promise.reject(new Error(`Sensor3 failed: ${res.statusText}`)))
    ]);

    // Fetch historical data
    const [
      tempHistory,
      humidityHistory,
      co2History,
      atmosphericPressHistory,
      moistureHistory,
      soilECHistory,
      poreECHistory
    ] = await Promise.all([
      fetchHistoricalData(1061612, 1),
      fetchHistoricalData(1061612, 2),
      fetchHistoricalData(3147479, 3),
      fetchHistoricalData(3147479, 4),
      fetchHistoricalData(6305245, 8),
      fetchHistoricalData(6305245, 10),
      fetchHistoricalData(6305245, 11)
    ]);

    res.json({ 
      sensor1: current1, 
      sensor2: current2, 
      sensor3: current3,
      tempHistory: tempHistory?.readings?.slice(0, 9999) || [],
      humidityHistory: humidityHistory?.readings?.slice(0, 9999) || [],
      co2History: co2History?.readings?.slice(0, 9999) || [],
      atmosphericPressHistory: atmosphericPressHistory?.readings?.slice(0, 9999) || [],
      moistureHistory: moistureHistory?.readings?.slice(0, 9999) || [],
      soilECHistory: soilECHistory?.readings?.slice(0, 9999) || [],
      poreECHistory: poreECHistory?.readings?.slice(0, 9999) || []
    });
    
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      detail: error.message
    });
  }
});