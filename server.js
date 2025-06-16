
import express from 'express';
import fetch from 'node-fetch';

const app = express();
const PORT = 3000;
// const API_KEY = process.env.k7muwjwzgzmjgx6ahqu29jkjhetq7swe;

// Add CORS middleware to allow requests from your frontend
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// app.get('/api/data', async (req, res) => {
//     try {
//         const response1 = await fetch('https://aranet.cloud/api/v1/measurements/last?sensor=1061612', {
//             headers: {
//                 'ApiKey': 'k7muwjwzgzmjgx6ahqu29jkjhetq7swe',
//                 'Content-Type': 'application/json'
//             }
//         });
//         // const response2 = await fetch('https://aranet.cloud/api/v1/measurements/last?sensor=6305245', {
//         //     headers: {
//         //         'ApiKey': 'k7muwjwzgzmjgx6ahqu29jkjhetq7swe',
//         //         'Content-Type': 'application/json'
//         //     }
//         // });

//         if (!response1.ok) {
//             return res.status(response1.status).json({ 
//                 error: 'Error fetching data from Aranet',
//                 status: response1.status,
//                 statusText: response1.statusText
//             });
//         }
//         // if (!response2.ok) {
//         //     return res.status(response2.status).json({ 
//         //         error: 'Error fetching data from Aranet',
//         //         status: response2.status,
//         //         statusText: response2.statusText
//         //     });
//         // }

//         const data1 = await response1.json();
//         res.json(data1);
//         // const data2 = await response2.json();
//         // res.json(data2);
//     } catch (error) {
//         res.status(500).json({ 
//             error: 'Internal server error', 
//             detail: error.message 
//         });
//     }
// });

app.get('/api/data', async (req, res) => {
    try {
        const [response1, response2] = await Promise.all([
            fetch('https://aranet.cloud/api/v1/measurements/last?sensor=1061612', {
                headers: {
                    'ApiKey': 'k7muwjwzgzmjgx6ahqu29jkjhetq7swe',
                    'Content-Type': 'application/json'
                }
            }),
            fetch('https://aranet.cloud/api/v1/measurements/last?sensor=6305245', {
                headers: {
                    'ApiKey': 'k7muwjwzgzmjgx6ahqu29jkjhetq7swe',
                    'Content-Type': 'application/json'
                }
            })
        ]);

        if (!response1.ok || !response2.ok) {
            return res.status(500).json({ 
                error: 'Error fetching data from Aranet',
                status1: response1.status,
                status2: response2.status
            });
        }

        const data1 = await response1.json();
        const data2 = await response2.json();
        
        res.json({
            sensor1: data1,
            sensor2: data2
        });
    } catch (error) {
        res.status(500).json({ 
            error: 'Internal server error', 
            detail: error.message 
        });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://192.168.1.100:${PORT}`);
    // console.log(`Server running at http://localhost:${PORT}`);
});