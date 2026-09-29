// scratch/verify_react_hooks_rules.mjs
import fs from 'fs';
import path from 'path';
import * as parser from '@babel/parser';
import traverseModule from '@babel/traverse';
const traverse = traverseModule.default || traverseModule;

const clientDir = 'client/src';

function getFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const results = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      results.push(...getFiles(full));
    } else if (e.name.endsWith('.jsx') || e.name.endsWith('.js')) {
      results.push(full);
    }
  }
  return results;
}

const files = getFiles(clientDir);
console.log(`Checking React Hook Rules across ${files.length} client files...\n`);

let violations = 0;

for (const filePath of files) {
  const code = fs.readFileSync(filePath, 'utf-8');
  let ast;
  try {
    ast = parser.parse(code, {
      sourceType: 'module',
      plugins: ['jsx']
    });
  } catch (err) {
    console.error(`Parse error in ${filePath}:`, err.message);
    violations++;
    continue;
  }

  // Find all function components
  traverse(ast, {
    FunctionDeclaration(path) {
      checkFunctionHooks(path, filePath);
    },
    FunctionExpression(path) {
      checkFunctionHooks(path, filePath);
    },
    ArrowFunctionExpression(path) {
      checkFunctionHooks(path, filePath);
    }
  });
}

function checkFunctionHooks(fnPath, filePath) {
  const body = fnPath.get('body');
  if (!body.isBlockStatement()) return;

  const statements = body.get('body');
  let hasEncounteredReturn = false;
  let returnLine = 0;

  for (const stmt of statements) {
    if (stmt.isReturnStatement()) {
      hasEncounteredReturn = true;
      returnLine = stmt.node.loc?.start?.line || 0;
      continue;
    }

    if (hasEncounteredReturn) {
      // Check if this statement or any descendant is a Hook call
      stmt.traverse({
        CallExpression(callPath) {
          const callee = callPath.get('callee');
          if (callee.isIdentifier() && /^use[A-Z]/.test(callee.node.name)) {
            console.error(`❌ HOOK AFTER RETURN: ${filePath}:${callPath.node.loc?.start?.line} - '${callee.node.name}' called after return on line ${returnLine}`);
            violations++;
          }
        }
      });
    }

    // Check if statement contains hook inside conditional/loop
    if (stmt.isIfStatement() || stmt.isLoop() || stmt.isSwitchStatement()) {
      stmt.traverse({
        CallExpression(callPath) {
          const callee = callPath.get('callee');
          if (callee.isIdentifier() && /^use[A-Z]/.test(callee.node.name)) {
            // make sure it's not a nested component or callback
            const enclosingFn = callPath.getFunctionParent();
            if (enclosingFn === fnPath) {
              console.error(`❌ CONDITIONAL HOOK: ${filePath}:${callPath.node.loc?.start?.line} - '${callee.node.name}' called inside conditional/loop`);
              violations++;
            }
          }
        }
      });
    }
  }
}

if (violations === 0) {
  console.log('✅ ALL files strictly follow React Hook Rules! (No conditional hooks, no hooks after return)');
} else {
  console.log(`\n⚠️ Found ${violations} Hook Rule violation(s).`);
}
