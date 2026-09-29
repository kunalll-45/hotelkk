import React from 'react';
import ReactDOMServer from 'react-dom/server';
import CustomerHeroPage from '../client/src/views/Customer/CustomerHeroPage.jsx';
import TableQRActivationGate from '../client/src/views/Customer/TableQRActivationGate.jsx';
import { AuthProvider } from '../client/src/context/AuthContext.jsx';
import { SocketProvider } from '../client/src/context/SocketContext.jsx';

// Polyfill window, location, and alert for SSR testing
global.window = {
  location: { search: '', pathname: '/', origin: 'http://localhost:5173' },
  history: { replaceState() {} },
  addEventListener() {},
  removeEventListener() {},
  confirm() { return true; },
  alert() {}
};

async function testReactRender() {
  console.log('Testing CustomerHeroPage rendering...');
  try {
    const heroHtml = ReactDOMServer.renderToString(
      <AuthProvider>
        <SocketProvider>
          <CustomerHeroPage />
        </SocketProvider>
      </AuthProvider>
    );
    console.log('CustomerHeroPage rendered successfully! Length:', heroHtml.length);
    console.log('Contains "Manage / Review Bookings":', heroHtml.includes('Manage / Review Bookings'));
    console.log('Contains "Book Your Table":', heroHtml.includes('Book Your Table'));
    console.log('Contains "View Full Menu":', heroHtml.includes('View Full Menu'));
  } catch (e) {
    console.error('CustomerHeroPage render failed:', e);
  }

  console.log('\nTesting TableQRActivationGate rendering...');
  try {
    const gateHtml = ReactDOMServer.renderToString(
      <TableQRActivationGate tableNumber={5} />
    );
    console.log('TableQRActivationGate rendered successfully! Length:', gateHtml.length);
    console.log('Contains "Verify Your Table Booking":', gateHtml.includes('Verify Your Table Booking'));
    console.log('Contains "Table #5":', gateHtml.includes('Table #5'));
  } catch (e) {
    console.error('TableQRActivationGate render failed:', e);
  }
}

testReactRender();
