import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

let rootDir: string;

if (typeof __dirname !== 'undefined') {
  // CommonJS
  rootDir = __dirname;
} else {
  // ES modules
  const __filename = fileURLToPath(import.meta.url);
  rootDir = path.dirname(__filename);
}

// Fallback to process.cwd() if both methods fail
if (!rootDir) {
  rootDir = process.cwd();
}

dotenv.config({ path: path.resolve(rootDir, '.env') });
dotenv.config({ path: path.resolve(rootDir, '.env.local') });

export {};