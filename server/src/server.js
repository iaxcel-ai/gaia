require('dotenv').config();
const http = require('http');
const app = require('./app');
const attachSocket = require('./socket');

const port = process.env.PORT || 4000;
const httpServer = http.createServer(app);
const io = attachSocket(httpServer);
app.set('io', io);

httpServer.listen(port, () => {
  console.log(`Gaia server listening on port ${port}`);
});
