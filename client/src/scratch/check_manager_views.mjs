// scratch/check_manager_views.mjs
import fs from 'fs';
import path from 'path';

const managerDir = 'client/src/views/Manager';

function scanDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...scanDir(full));
    } else if (entry.name.endsWith('.jsx') || entry.name.endsWith('.js')) {
      files.push(full);
    }
  }
  return files;
}

const allFiles = scanDir(managerDir);
console.log(`Scanning ${allFiles.length} manager files for undefined variables...`);

for (const f of allFiles) {
  const content = fs.readFileSync(f, 'utf-8');
  // Check pendingCancellationsCount
  if (content.includes('pendingCancellationsCount')) {
    const hasDef = content.includes('const [pendingCancellationsCount') || content.includes('let pendingCancellationsCount');
    console.log(`File: ${f}, has pendingCancellationsCount definition: ${hasDef}`);
  }
}
