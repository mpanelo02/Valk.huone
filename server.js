import express from 'express';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.ARANET_API_KEY;

// Enable CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  next();
});

// Function to append data to a CSV file
function logData(data) {
  const date = new Date();
  const timestamp = date.toISOString();
  const logEntry = `${timestamp},${data.temperature},${data.humidity},${data.co2},${data.atmosphericPressure},${data.moisture},${data.soilEC}\n`;

  const logDir = path.join(__dirname, 'logs');
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir);
  }

  const logFilePath = path.join(logDir, 'sensor_data.csv');
  
  // Write headers if the file doesn't exist
  if (!fs.existsSync(logFilePath)) {
    const headers = 'Timestamp,Temperature (°C),Humidity (%),CO2 (ppm),Atmospheric Pressure (hPa),Soil Moisture (%),Soil EC (mS/cm)\n';
    fs.writeFileSync(logFilePath, headers);
  }

  // Append the data
  fs.appendFileSync(logFilePath, logEntry);
}

app.get('/api/data', async (req, res) => {
  try {
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
      return res.status(500).json({ error: 'Error fetching data from Aranet' });
    }

    const data1 = await response1.json();
    const data2 = await response2.json();
    const data3 = await response3.json();

    // Extract the required data
    const tempHumidityData = data1.readings || [];
    const moistureSoilECData = data2.readings || [];
    const atmosphereCO2Data = data3.readings || [];

    const temperatureReading = tempHumidityData.find(r => r.metric === "1");
    const humidityReading = tempHumidityData.find(r => r.metric === "2");
    const moistureReading = moistureSoilECData.find(r => r.metric === "8");
    const soilECReading = moistureSoilECData.find(r => r.metric === "10");
    const co2Reading = atmosphereCO2Data.find(r => r.metric === "3");
    const atmosphericPressReading = atmosphereCO2Data.find(r => r.metric === "4");

    const sensorData = {
      temperature: temperatureReading ? parseFloat(temperatureReading.value).toFixed(1) : '--',
      humidity: humidityReading ? parseFloat(humidityReading.value).toFixed(1) : '--',
      co2: co2Reading ? parseFloat(co2Reading.value).toFixed(0) : '--',
      atmosphericPressure: atmosphericPressReading ? parseFloat(atmosphericPressReading.value).toFixed(1) : '--',
      moisture: moistureReading ? parseFloat(moistureReading.value).toFixed(1) : '--',
      soilEC: soilECReading ? parseFloat(soilECReading.value).toFixed(3) : '--'
    };

    // Log the data to a CSV file
    logData(sensorData);

    res.json({ sensor1: data1, sensor2: data2, sensor3: data3 });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error', detail: error.message });
  }
});

// Endpoint to download the logged data
app.get('/api/download', (req, res) => {
  const logFilePath = path.join(__dirname, 'logs', 'sensor_data.csv');
  if (fs.existsSync(logFilePath)) {
    res.download(logFilePath);
  } else {
    res.status(404).json({ error: 'No data available for download' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});