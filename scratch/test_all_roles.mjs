import React from 'react';
import { renderToString } from 'react-dom/server';

function createMockWindow(role, tableNum = 1, managerUser = null) {
  return {
    location: { search: '', origin: 'http://localhost:3000', pathname: '/', href: 'http://localhost:3000/' },
    localStorage: {
      getItem: (k) => {
        if (k === 'kk_active_role') return role;
        if (k === 'kk_table_number') return String(tableNum);
        if (k === 'kk_manager_user') return managerUser ? JSON.stringify(managerUser) : null;
        return null;
      },
      setItem: () => {},
      removeItem: () => {},
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
}

async function testAllRoles() {
  const roles = [
    { role: 'Home' },
    { role: 'Customer' },
    { role: 'Waiter' },
    { role: 'Manager', user: null },
    { role: 'Manager', user: { id: 1, username: 'kunal_owner', fullName: 'Kunal K.' } }
  ];

  for (const config of roles) {
    console.log(`\n=== Testing Role: ${config.role} (User: ${JSON.stringify(config.user)}) ===`);
    global.window = createMockWindow(config.role, 1, config.user);
    global.document = global.window.document;
    global.localStorage = global.window.localStorage;
    global.location = global.window.location;

    try {
      const App = (await import('../client/src/App.jsx')).default;
      const html = renderToString(React.createElement(App));
      console.log(`PASS! Rendered HTML length: ${html.length}`);
    } catch (err) {
      console.error(`FAIL FOR ROLE ${config.role}:`, err);
    }
  }
}

testAllRoles();
