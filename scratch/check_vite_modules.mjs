async function checkViteModules() {
  const urls = [
    'http://localhost:5173/',
    'http://localhost:5173/src/main.jsx',
    'http://localhost:5173/src/App.jsx',
    'http://localhost:5173/src/context/AuthContext.jsx',
    'http://localhost:5173/src/views/Customer/CustomerHeroPage.jsx',
    'http://localhost:5173/src/views/Customer/TableQRActivationGate.jsx',
    'http://localhost:5173/src/components/RoleSwitcherBar.jsx',
    'http://localhost:5173/src/components/NotificationToast.jsx'
  ];

  for (const u of urls) {
    try {
      const res = await fetch(u);
      const text = await res.text();
      console.log(`[${res.status}] ${u} (Length: ${text.length})`);
      if (res.status >= 400 || text.includes('error') || text.includes('Error:')) {
        console.error(`ERROR FOUND IN: ${u}\n`, text.substring(0, 500));
      }
    } catch (e) {
      console.error(`FAILED TO FETCH: ${u}`, e.message);
    }
  }
}

checkViteModules();
