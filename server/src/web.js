const express = require('express');
const fs = require('fs');
const path = require('path');

// Puts the API under /api and serves the built React client (when there is one) from the same address.
// One address means no CORS settings, and Socket.IO stays on the same origin as the page.
function createWebApp(api, clientDir) {
  const web = express();
  web.use('/api', api);

  if (fs.existsSync(path.join(clientDir, 'index.html'))) {
    web.use(express.static(clientDir));
    // Any other page address belongs to the React router, so send it the client page.
    web.use((req, res, next) => {
      const isApiOrSocket = req.path.startsWith('/api') || req.path.startsWith('/socket.io');
      if (req.method !== 'GET' || isApiOrSocket) return next();
      res.sendFile(path.join(clientDir, 'index.html'));
    });
  }

  return web;
}

module.exports = { createWebApp };
