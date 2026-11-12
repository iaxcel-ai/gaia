// Tests use their own database, named after the dev one with "_test" added
// (gaia becomes gaia_test), so they never fill the dev database with test rows.
function testDatabaseUrl(devUrl) {
  const url = new URL(devUrl);
  url.pathname = `${url.pathname}_test`;
  return url.toString();
}

module.exports = { testDatabaseUrl };
