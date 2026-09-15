'use strict';

const fs = require('fs');
const path = require('path');

function loadEnvFile(filename = '.env') {
  const file = path.resolve(process.cwd(), filename);
  if (!fs.existsSync(file)) return false;
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx < 1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (process.env[key] == null) process.env[key] = value.replace(/\\n/g, '\n');
  }
  return true;
}

module.exports = { loadEnvFile };
