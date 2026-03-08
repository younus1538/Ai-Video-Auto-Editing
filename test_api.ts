import http from 'http';

function fetch(path: string) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:3000${path}`, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        console.log(`GET ${path}: Status ${res.statusCode}`);
        console.log(`Response: ${data}`);
        resolve(data);
      });
    }).on('error', (err) => {
      console.error(`GET ${path} failed:`, err);
      reject(err);
    });
  });
}

async function run() {
  await fetch('/api/test');
  await fetch('/api/licenses/status');
  
  // Test verify with dummy data
  const verifyData = JSON.stringify({ key: 'dummy-key', deviceId: 'dummy-device' });
  
  await new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/licenses/verify',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': verifyData.length
      }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        console.log(`POST /api/licenses/verify: Status ${res.statusCode}`);
        console.log(`Response: ${data}`);
        resolve(data);
      });
    });
    
    req.on('error', (err) => {
      console.error(`POST /api/licenses/verify failed:`, err);
      reject(err);
    });
    
    req.write(verifyData);
    req.end();
  });
}

run();
