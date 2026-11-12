// Loaded by Jest before each test file: point the app at the test database.
require('dotenv').config();
const { testDatabaseUrl } = require('./testDatabase');

process.env.DATABASE_URL = testDatabaseUrl(process.env.DATABASE_URL);
