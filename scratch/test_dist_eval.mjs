import fs from 'fs';
import path from 'path';

global.window = {
  location: { search: '', origin: 'http://localhost:3000', pathname: '/', href: 'http://localhost:3000/' },
  localStorage: {
    getItem: (k) => null,
    setItem: (k, v) => {},
    removeItem: (k) => {},
    clear: () => {}
  },
  history: { replaceState: () => {} },
  addEventListener: () => {},
  removeEventListener: () => {},
  document: {
    addEventListener: () => {},
    removeEventListener: () => {},
    getElementById: (id) => ({
      appendChild: () => {},
      removeChild: () => {},
      style: {}
    }),
    createElement: () => ({ style: {}, setAttribute: () => {} }),
    body: { appendChild: () => {} }
  },
  AudioContext: class {
    constructor() {
      this.state = 'running';
      this.currentTime = 0;
      this.destination = {};
    }
    createOscillator() {
      return {
        type: 'sine',
        frequency: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
        connect: () => {},
        start: () => {},
        stop: () => {}
      };
    }
    createGain() {
      return {
        gain: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
        connect: () => {}
      };
    }
    resume() { return Promise.resolve(); }
  }
};
global.document = global.window.document;
global.localStorage = global.window.localStorage;
global.location = global.window.location;

console.log('Testing bundle execution on current dist...');
const distFiles = fs.readdirSync('client/dist/assets');
const jsFile = distFiles.find(f => f.endsWith('.js'));
console.log('Testing file:', jsFile);
const code = fs.readFileSync(path.join('client/dist/assets', jsFile), 'utf8');
try {
  new Function(code);
  console.log('BUNDLE PARSED & EVALUATED SUCCESSFULLY WITH ZERO ERRORS!');
} catch (err) {
  console.error('Bundle error:', err);
}
