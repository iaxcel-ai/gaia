const http = require('http');
const { io: ioClient } = require('socket.io-client');
const app = require('../src/app');
const attachSocket = require('../src/socket');
const { issueToken } = require('../src/services/authService');

let httpServer;
let io;
let port;

beforeAll((done) => {
  httpServer = http.createServer(app);
  io = attachSocket(httpServer);
  httpServer.listen(0, () => { port = httpServer.address().port; done(); });
});

afterAll((done) => { io.close(); httpServer.close(done); });

test('a connection without a token is disconnected', (done) => {
  const client = ioClient(`http://localhost:${port}`, { auth: {} });
  client.on('disconnect', () => { client.close(); done(); });
});

test('a connection with a valid token joins its facility room', (done) => {
  const token = issueToken({ id: 1, username: 'nurse1', role: 'nurse', facility_id: 7 });
  const client = ioClient(`http://localhost:${port}`, { auth: { token } });
  client.on('connect', () => {
    setTimeout(() => {
      expect(io.sockets.adapter.rooms.get('facility:7')?.size).toBe(1);
      client.close();
      done();
    }, 50);
  });
});
