// scratch/lint_manager.mjs
import fs from 'fs';
import * as esbuild from 'esbuild';

const files = [
  'client/src/views/Manager/ManagerDashboard.jsx',
  'client/src/views/Manager/Reservations/CancellationRequestsView.jsx',
  'client/src/views/Customer/CustomerHeroPage.jsx'
];

for (const file of files) {
  try {
    const code = fs.readFileSync(file, 'utf-8');
    esbuild.transformSync(code, {
      loader: 'jsx',
      target: 'es2020'
    });
    console.log(`✓ Syntax valid: ${file}`);
  } catch (err) {
    console.error(`✗ Syntax error in ${file}:`, err.message);
  }
}
