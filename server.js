import express from 'express';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { createObjectCsvWriter } from 'csv-writer';
import admin from 'firebase-admin';

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.ARANET_API_KEY;

// Initialize Firebase Admin
const serviceAccount = JSON.parse(fs.readFileSync('/etc/secrets/firebase-key.json')); // path from Render secret file

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: 'your-project-id.appspot.com', // replace with your bucket
});

const bucket = admin.storage().bucket();

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

    const record = {
      timestamp: new Date().toISOString(),
      temperature: data1.data.find(d => d.parameter === 'temperature')?.value,
      humidity: data1.data.find(d => d.parameter === 'humidity')?.value,
      co2: data1.data.find(d => d.parameter === 'co2')?.value,
      pressure: data2.data.find(d => d.parameter === 'pressure')?.value,
      moisture: data3.data.find(d => d.parameter === 'moisture')?.value,
      soilEC: data3.data.find(d => d.parameter === 'electricalConductivity')?.value,
    };

    const filePath = `/tmp/data-${Date.now()}.csv`;
    const csvWriter = createObjectCsvWriter({
      path: filePath,
      header: [
        { id: 'timestamp', title: 'Timestamp' },
        { id: 'temperature', title: 'Temperature' },
        { id: 'humidity', title: 'Humidity' },
        { id: 'co2', title: 'CO2' },
        { id: 'pressure', title: 'Pressure' },
        { id: 'moisture', title: 'Moisture' },
        { id: 'soilEC', title: 'SoilEC' },
      ]
    });

    await csvWriter.writeRecords([record]);

    // Upload to Firebase Storage
    const uploadResponse = await bucket.upload(filePath, {
      destination: `sensor-data/${path.basename(filePath)}`,
      public: true,
      metadata: {
        contentType: 'text/csv',
      }
    });

    const file = uploadResponse[0];
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${file.name}`;

    res.json({ message: 'Data saved and uploaded to Firebase Storage', url: publicUrl });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error', detail: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
