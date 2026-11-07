import { run } from 'node:test';
import { spec } from 'node:test/reporters';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const testFile = path.resolve(__dirname, 'suite.test.ts');

console.log('===========================================================');
console.log('  🧪 Running ClubRoom Comprehensive Automated Test Suite');
console.log('===========================================================');

run({ files: [testFile] })
  .compose(spec)
  .pipe(process.stdout);

