const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 5500;
const TEST_SITE_DIR = path.join(__dirname, '..', 'test-site');

const server = http.createServer((req, res) => {
  let filePath = path.join(TEST_SITE_DIR, req.url === '/' ? 'index.html' : req.url);

  if (!fs.existsSync(filePath)) {
    filePath = path.join(TEST_SITE_DIR, 'index.html');
  }

  const ext = path.extname(filePath);
  const contentType =
    ext === '.js' ? 'application/javascript' : ext === '.css' ? 'text/css' : 'text/html';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(500);
      res.end('Error loading ' + filePath);
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  });
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`[TEST-SITE] Second-origin demo site running at http://localhost:${PORT}`);
  });
}

module.exports = server;
