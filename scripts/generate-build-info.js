'use strict';

const fs = require('fs');
const path = require('path');
const { getBuildInfo } = require('../lib/buildInfo');

const root = path.resolve(__dirname, '..');
const info = getBuildInfo(root);
const output = {
  product: info.product,
  version: info.version,
  commit: info.commit,
  shortCommit: info.shortCommit,
  fingerprint: info.fingerprint,
  builtAt: new Date().toISOString()
};

fs.writeFileSync(path.join(root, 'build-info.json'), JSON.stringify(output, null, 2) + '\n', 'utf8');
console.log(`Generated ${output.fingerprint}${output.commit ? '' : ' (commit unavailable)'}`);
