'use strict';

const fs = require('fs');
const path = require('path');

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return null; }
}

function resolveGitDir(root) {
  const dotGit = path.join(root, '.git');
  try {
    const stat = fs.statSync(dotGit);
    if (stat.isDirectory()) return dotGit;
    if (stat.isFile()) {
      const text = fs.readFileSync(dotGit, 'utf8').trim();
      const match = /^gitdir:\s*(.+)$/i.exec(text);
      if (match) return path.resolve(root, match[1]);
    }
  } catch {}
  return null;
}

function readPackedRef(gitDir, ref) {
  try {
    const lines = fs.readFileSync(path.join(gitDir, 'packed-refs'), 'utf8').split(/\r?\n/);
    for (const line of lines) {
      if (!line || line.startsWith('#') || line.startsWith('^')) continue;
      const [sha, name] = line.trim().split(/\s+/, 2);
      if (name === ref && /^[0-9a-f]{40}$/i.test(sha)) return sha.toLowerCase();
    }
  } catch {}
  return null;
}

function resolveGitCommit(root) {
  const envSha = process.env.BUILD_COMMIT_SHA || process.env.GIT_COMMIT || process.env.GITHUB_SHA || '';
  if (/^[0-9a-f]{7,40}$/i.test(envSha)) return { commit: envSha.toLowerCase(), source: 'environment' };

  const gitDir = resolveGitDir(root);
  if (!gitDir) return null;
  try {
    const head = fs.readFileSync(path.join(gitDir, 'HEAD'), 'utf8').trim();
    if (/^[0-9a-f]{40}$/i.test(head)) return { commit: head.toLowerCase(), source: 'git' };
    const match = /^ref:\s*(.+)$/i.exec(head);
    if (!match) return null;
    const ref = match[1].trim();
    try {
      const sha = fs.readFileSync(path.join(gitDir, ref), 'utf8').trim();
      if (/^[0-9a-f]{40}$/i.test(sha)) return { commit: sha.toLowerCase(), source: 'git' };
    } catch {}
    const packed = readPackedRef(gitDir, ref);
    return packed ? { commit: packed, source: 'git-packed' } : null;
  } catch {
    return null;
  }
}

function getBuildInfo(root = path.resolve(__dirname, '..')) {
  const pkg = readJson(path.join(root, 'package.json')) || {};
  const generated = readJson(path.join(root, 'build-info.json')) || {};
  const git = resolveGitCommit(root);
  const commit = git?.commit || generated.commit || null;
  const version = String(pkg.version || generated.version || '0.0.0');
  const shortCommit = commit ? String(commit).slice(0, 8) : null;

  return {
    product: 'Invarture App Studio',
    version,
    commit,
    shortCommit,
    fingerprint: shortCommit ? `v${version}+${shortCommit}` : `v${version}`,
    commitSource: git?.source || (generated.commit ? 'docker-build' : 'unavailable'),
    builtAt: generated.builtAt || process.env.BUILD_TIMESTAMP || null,
    environment: process.env.NODE_ENV || 'development',
    node: process.version
  };
}

module.exports = { getBuildInfo, resolveGitCommit };
