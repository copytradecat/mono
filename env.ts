// config.ts in the root directory
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url); // get the resolved path to the file
const __dirname = path.dirname(__filename); // get the name of the directory
const rootDir = __dirname;
dotenv.config({ path: path.resolve(rootDir, '.env') });
dotenv.config({ path: path.resolve(rootDir, '.env.local') });

export {};