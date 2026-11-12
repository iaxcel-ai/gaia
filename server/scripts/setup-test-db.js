// Creates the test database if it is missing and brings its schema up to date.
// Runs automatically before `npm test` (see "pretest" in package.json).
require('dotenv').config();
const { Client } = require('pg');
const { runner } = require('node-pg-migrate');
const { testDatabaseUrl } = require('../tests/testDatabase');

async function setup() {
  const testUrl = testDatabaseUrl(process.env.DATABASE_URL);
  const testName = new URL(testUrl).pathname.slice(1);

  // Connect to the dev database to check for, and create, the test database.
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const existing = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [testName]);
  if (existing.rows.length === 0) {
    await client.query(`CREATE DATABASE ${testName}`);
    console.log('Created database', testName);
  }
  await client.end();

  await runner({
    databaseUrl: testUrl,
    dir: 'migrations',
    direction: 'up',
    migrationsTable: 'pgmigrations',
    log: () => {},
  });
}

setup().catch((err) => {
  console.error(err);
  process.exit(1);
});
