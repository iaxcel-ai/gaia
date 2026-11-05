const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const facilitiesRoutes = require('./routes/facilities');
const referralsRoutes = require('./routes/referrals');

const app = express();

app.use(cors());
app.use(express.json());
app.use('/auth', authRoutes);
app.use('/facilities', facilitiesRoutes);
app.use('/referrals', referralsRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  const status = err.status || 500;
  const message = status < 500 ? 'Invalid request' : 'Internal server error';
  res.status(status).json({ error: message });
});

module.exports = app;
