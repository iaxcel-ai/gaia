const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');
const api = require('../src/app');
const { createWebApp } = require('../src/web');

let clientDir;

// A stand-in for the built React client: one page and one asset.
beforeAll(() => {
  clientDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gaia-client-'));
  fs.writeFileSync(path.join(clientDir, 'index.html'), '<html>Gaia client</html>');
  fs.mkdirSync(path.join(clientDir, 'assets'));
  fs.writeFileSync(path.join(clientDir, 'assets', 'app.js'), 'console.log("app")');
});

afterAll(() => {
  fs.rmSync(clientDir, { recursive: true, force: true });
});

test('the API answers under /api', async () => {
  const web = createWebApp(api, clientDir);
  const res = await request(web).get('/api/health');
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ ok: true });

  const protectedRoute = await request(web).get('/api/facilities');
  expect(protectedRoute.status).toBe(401);
});

test('the client page is served at the root and at any client-side route', async () => {
  const web = createWebApp(api, clientDir);
  const root = await request(web).get('/');
  expect(root.status).toBe(200);
  expect(root.text).toContain('Gaia client');

  const route = await request(web).get('/referrals/new/5');
  expect(route.status).toBe(200);
  expect(route.text).toContain('Gaia client');
});

test('built client files are served as they are', async () => {
  const web = createWebApp(api, clientDir);
  const res = await request(web).get('/assets/app.js');
  expect(res.status).toBe(200);
  expect(res.text).toContain('console.log');
});

test('an unknown /api path is a 404, not the client page', async () => {
  const web = createWebApp(api, clientDir);
  const res = await request(web).get('/api/nothing-here');
  expect(res.status).toBe(404);
  expect(res.text).not.toContain('Gaia client');
});

test('without a built client only the API is served', async () => {
  const web = createWebApp(api, path.join(clientDir, 'missing'));
  expect((await request(web).get('/api/health')).status).toBe(200);
  expect((await request(web).get('/')).status).toBe(404);
});
