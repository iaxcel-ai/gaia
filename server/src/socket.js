const { Server } = require('socket.io');
const { verifyToken } = require('./services/authService');

function attachSocket(httpServer) {
  const io = new Server(httpServer, { cors: { origin: '*' } });

  io.on('connection', (socket) => {
    const payload = verifyToken(socket.handshake.auth?.token);
    if (!payload) {
      socket.disconnect();
      return;
    }
    if (payload.facility_id) {
      socket.join(`facility:${payload.facility_id}`);
    }
  });

  return io;
}

module.exports = attachSocket;
