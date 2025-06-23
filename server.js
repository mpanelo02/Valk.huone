import express from 'express';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.ARANET_API_KEY;

// Get directory name for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Directory for CSV files
const dataDir = path.join(__dirname, 'sensor_data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
}

// CSV file paths
const csvFiles = {
    temperature: path.join(dataDir, 'temperature.csv'),
    humidity: path.join(dataDir, 'humidity.csv'),
    co2: path.join(dataDir, 'co2.csv'),
    pressure: path.join(dataDir, 'pressure.csv'),
    moisture: path.join(dataDir, 'moisture.csv'),
    soilEC: path.join(dataDir, 'soilEC.csv')
};

// Initialize CSV files with headers if they don't exist
function initCSVFile(filePath, header) {
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, header);
    }
}

// Initialize all CSV files
initCSVFile(csvFiles.temperature, 'Timestamp,Value (°C)\n');
initCSVFile(csvFiles.humidity, 'Timestamp,Value (%)\n');
initCSVFile(csvFiles.co2, 'Timestamp,Value (ppm)\n');
initCSVFile(csvFiles.pressure, 'Timestamp,Value (hPa)\n');
initCSVFile(csvFiles.moisture, 'Timestamp,Value (%)\n');
initCSVFile(csvFiles.soilEC, 'Timestamp,Value (mS/cm)\n');

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  next();
});

// Helper function to append data to a specific CSV file
function appendDataToCSV(filePath, timestamp, value) {
    if (value === undefined || value === null) return;
    
    const csvRow = `${timestamp},${value}\n`;
    
    fs.appendFile(filePath, csvRow, (err) => {
        if (err) {
            console.error(`Error writing to ${filePath}:`, err);
        } else {
            console.log(`Data logged to ${path.basename(filePath)}: ${value}`);
        }
    });
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
    
    // Extract the values
    const timestamp = new Date().toISOString();
    const temperature = data1.readings?.find(r => r.metric === "1")?.value;
    const humidity = data1.readings?.find(r => r.metric === "2")?.value;
    const co2 = data3.readings?.find(r => r.metric === "3")?.value;
    const pressure = data3.readings?.find(r => r.metric === "4")?.value;
    const moisture = data2.readings?.find(r => r.metric === "8")?.value;
    const soilEC = data2.readings?.find(r => r.metric === "10")?.value;
    
    // Log each value to its own CSV file
    appendDataToCSV(csvFiles.temperature, timestamp, temperature);
    appendDataToCSV(csvFiles.humidity, timestamp, humidity);
    appendDataToCSV(csvFiles.co2, timestamp, co2);
    appendDataToCSV(csvFiles.pressure, timestamp, pressure);
    appendDataToCSV(csvFiles.moisture, timestamp, moisture);
    appendDataToCSV(csvFiles.soilEC, timestamp, soilEC);

    res.json({ sensor1: data1, sensor2: data2, sensor3: data3 });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error', detail: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Sensor data will be saved in: ${dataDir}`);
});