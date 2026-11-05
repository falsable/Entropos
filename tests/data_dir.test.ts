import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveDataDir } from '../src/server/storage';

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('default data dir is per user and not inside or above the install dir', () => {
  const dir = resolveDataDir({});
  assert.equal(path.basename(dir), '.entropos');
  const rel = path.relative(PACKAGE_ROOT, dir);
  const insideOrEqual = rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
  const above = path.relative(dir, PACKAGE_ROOT);
  const isAncestor = above !== '' && !above.startsWith('..') && !path.isAbsolute(above);
  assert.equal(insideOrEqual, false);
  assert.equal(isAncestor, false);
});

test('ENTROPOS_DATA_DIR overrides the default', () => {
  const custom = path.resolve(PACKAGE_ROOT, 'some', 'where');
  assert.equal(resolveDataDir({ ENTROPOS_DATA_DIR: custom }, '/home/x'), custom);
});
