import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Keep the suite out of the real ~/.entropos (database and generated key).
if (!process.env.ENTROPOS_DATA_DIR) {
  process.env.ENTROPOS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'entropos-test-'));
}
