import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function defaultTargetRoot() {
  return path.resolve(__dirname, '../../..');
}

export function defaultVendorRoot() {
  return path.join(defaultTargetRoot(), 'vendor/claude-deep-work-v6.4.0');
}
