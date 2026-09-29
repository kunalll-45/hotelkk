import React from 'react';
import { renderToString } from 'react-dom/server';

// Mock browser globals
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
    getElementById: (id) => null
  },
  AudioContext: class {
    constructor() {
      this.state = 'running';
      this.currentTime = 0;
      this.destination = {};
    }
  }
};
global.document = global.window.document;
global.localStorage = global.window.localStorage;
global.location = global.window.location;

async function testRender() {
  try {
    console.log('Testing App render...');
    // We import from client/dist bundle or compiled components
    const App = (await import('../client/src/App.jsx')).default;
    const html = renderToString(React.createElement(App));
    console.log('SUCCESS! Rendered HTML length:', html.length);
  } catch (err) {
    console.error('RENDER ERROR DETECTED:', err);
  }
}

testRender();
