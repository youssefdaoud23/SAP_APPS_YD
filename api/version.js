'use strict';

const { getBuildInfo } = require('../lib/buildInfo');

module.exports = async function versionHandler(req, res) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'Only GET is supported' }));
    return;
  }

  const info = getBuildInfo();
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.end(JSON.stringify({ ...info, servedAt: new Date().toISOString() }));
};
