// scratch/scan_entire_app.mjs
import fs from 'fs';
import path from 'path';
import * as parser from '@babel/parser';
import traverseModule from '@babel/traverse';
const traverse = traverseModule.default || traverseModule;

const clientDir = 'client/src';

const STANDARD_GLOBALS = new Set([
  // JS Globals
  'window', 'document', 'navigator', 'console', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
  'Date', 'Math', 'Number', 'String', 'Boolean', 'Array', 'Object', 'Function', 'RegExp', 'Error', 'TypeError',
  'RangeError', 'ReferenceError', 'SyntaxError', 'JSON', 'Promise', 'Map', 'Set', 'WeakMap', 'WeakSet',
  'Intl', 'fetch', 'alert', 'confirm', 'prompt', 'localStorage', 'sessionStorage', 'location', 'history',
  'URL', 'URLSearchParams', 'FormData', 'Blob', 'File', 'FileReader', 'Event', 'CustomEvent', 'Image',
  'Audio', 'requestAnimationFrame', 'cancelAnimationFrame', 'encodeURIComponent', 'decodeURIComponent',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'Infinity', 'NaN', 'undefined', 'null', 'self',
  'atob', 'btoa', 'process', 'Buffer', 'globalThis', 'Proxy', 'Reflect', 'encodeURI'
]);

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
console.log(`Analyzing ${files.length} client source files for any undefined identifiers...\n`);

let totalErrors = 0;

for (const filePath of files) {
  const code = fs.readFileSync(filePath, 'utf-8');
  let ast;
  try {
    ast = parser.parse(code, {
      sourceType: 'module',
      plugins: ['jsx']
    });
  } catch (err) {
    console.error(`❌ Parse error in ${filePath}:`, err.message);
    totalErrors++;
    continue;
  }

  const fileUndeclared = [];

  try {
    traverse(ast, {
      ReferencedIdentifier(identPath) {
        const name = identPath.node.name;
        
        // Skip JSX tags (e.g. div, span)
        if (identPath.parent.type === 'JSXOpeningElement' && identPath.parent.name === identPath.node) {
          // If lowercase HTML tag like <div> or <span>
          if (/^[a-z]/.test(name)) return;
        }
        if (identPath.parent.type === 'JSXClosingElement' && identPath.parent.name === identPath.node) {
          if (/^[a-z]/.test(name)) return;
        }
        // Skip property access obj[name] or obj.name
        if (identPath.parent.type === 'MemberExpression' && identPath.parent.property === identPath.node && !identPath.parent.computed) {
          return;
        }
        // Skip object key { name: value }
        if (identPath.parent.type === 'ObjectProperty' && identPath.parent.key === identPath.node && !identPath.parent.computed) {
          return;
        }

        if (STANDARD_GLOBALS.has(name)) return;

        // Check if binding exists in Babel scope
        const binding = identPath.scope.getBinding(name);
        if (!binding) {
          fileUndeclared.push({
            name,
            line: identPath.node.loc?.start?.line || 'unknown'
          });
        }
      }
    });
  } catch (err) {
    console.error(`Traverse error in ${filePath}:`, err.message);
  }

  if (fileUndeclared.length > 0) {
    console.log(`⚠️  ${filePath}:`);
    for (const u of fileUndeclared) {
      console.log(`    Line ${u.line}: Undefined identifier '${u.name}'`);
    }
    totalErrors += fileUndeclared.length;
  } else {
    // console.log(`✓ ${filePath} clean`);
  }
}

console.log(`\nScan complete! Found ${totalErrors} issue(s) across client code.`);
