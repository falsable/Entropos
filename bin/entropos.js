#!/usr/bin/env node

/**
 * Entropos CLI & MCP Gateway Launcher
 * Allows running Entropos via:
 *   npx @falsable/entropos [options]
 * or after global install:
 *   entropos [options]
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

// Handle CLI flags (--help, -h, --version, -v)
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Entropos — Complexity Router & MCP Gateway (v0.1.0)
Usage:
  entropos [options]
  npx @falsable/entropos [options]

Options:
  --port <number>       Port to listen on (default: $PORT or 3000)
  --host <string>       Host interface (default: 127.0.0.1)
  --help, -h            Show this help message
  --version, -v         Show version

Endpoints:
  OpenAI Proxy (/v1):   http://localhost:3000/v1
  MCP Gateway:          http://localhost:3000/mcp
  MCP SSE Stream:       http://localhost:3000/mcp/sse
  Console Dashboard:    http://localhost:3000/app
`);
  process.exit(0);
}

if (args.includes('--version') || args.includes('-v')) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
    console.log(`entropos v${pkg.version}`);
  } catch {
    console.log('entropos v0.1.0');
  }
  process.exit(0);
}

// Pass port if provided via --port
const portIdx = args.indexOf('--port');
if (portIdx !== -1 && args[portIdx + 1]) {
  process.env.PORT = args[portIdx + 1];
}

// Pass host if provided via --host
const hostIdx = args.indexOf('--host');
if (hostIdx !== -1 && args[hostIdx + 1]) {
  process.env.HOST = args[hostIdx + 1];
}

// Check if pre-bundled dist/server.js exists, otherwise run tsx server.ts
const bundledServer = path.join(rootDir, 'dist', 'server.js');
const sourceServer = path.join(rootDir, 'server.ts');

if (fs.existsSync(bundledServer)) {
  import(bundledServer).catch((err) => {
    console.error('Failed to start Entropos server:', err);
    process.exit(1);
  });
} else {
  const tsxBin = path.join(rootDir, 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx');
  const child = spawn(tsxBin, [sourceServer, ...args], {
    stdio: 'inherit',
    env: process.env,
    cwd: rootDir,
  });

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });
}
