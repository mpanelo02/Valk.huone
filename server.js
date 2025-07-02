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
    
    const data = await response.json();
    
    // Format the data to include both time and value
    if (data.readings) {
      return data.readings.map(reading => ({
        time: reading.time, // Keep the original timestamp
        value: reading.value,
        // Or if you want formatted time:
        // time: new Date(reading.time).toISOString(),
        // timeFormatted: formatTime(new Date(reading.time))
      }));
    }
    return [];
  } catch (error) {
    console.error(`Error fetching historical data: ${error.message}`);
    return [];
  }
}

// Helper function to format time (optional)
function formatTime(date) {
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
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

    // Fetch historical data with timestamps
    const [tempHistory, humidityHistory] = await Promise.all([
      fetchHistoricalData(1061612, 1),
      fetchHistoricalData(1061612, 2)
    ]);

    // Log sample data with timestamps
    if (tempHistory.length > 0) {
      console.log("Sample Temperature Data with Timestamps:");
      console.log(tempHistory.slice(0, 3)); // Show first 3 entries with time and value
    }
    
    if (humidityHistory.length > 0) {
      console.log("Sample Humidity Data with Timestamps:");
      console.log(humidityHistory.slice(0, 3)); // Show first 3 entries with time and value
    }

    res.json({ 
      sensor1: currentData1, 
      sensor2: currentData2, 
      sensor3: currentData3,
      tempHistory: tempHistory.slice(0, 9999), // First 9999 temperature readings with time
      humidityHistory: humidityHistory.slice(0, 9999) // First 9999 humidity readings with time
    });
  } catch (error) {
    console.error("API Error:", error);
    res.status(500).json({ error: 'Internal server error', detail: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});