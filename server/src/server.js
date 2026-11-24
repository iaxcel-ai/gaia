require('dotenv').config();
const http = require('http');
const path = require('path');
const app = require('./app');
const { createWebApp } = require('./web');
const attachSocket = require('./socket');

const port = process.env.PORT || 4000;
// In production the built client (client/dist) is served next to the API.
const web = createWebApp(app, path.join(__dirname, '../../client/dist'));
const httpServer = http.createServer(web);
const io = attachSocket(httpServer);
app.set('io', io);

httpServer.listen(port, () => {
  console.log(`Gaia server listening on port ${port}`);
});
