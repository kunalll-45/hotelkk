async function checkPort3000() {
  try {
    const res = await fetch('http://localhost:3000/');
    const text = await res.text();
    console.log(`Port 3000 root status: ${res.status}, length: ${text.length}`);
    console.log('Sample content:\n', text.substring(0, 300));

    // Check assets in index.html
    const assetMatch = text.match(/\/assets\/[^\"]+/g);
    console.log('Referenced assets in port 3000 HTML:', assetMatch);

    if (assetMatch) {
      for (const a of assetMatch) {
        const assetRes = await fetch(`http://localhost:3000${a}`);
        console.log(`Asset ${a} status: ${assetRes.status}`);
      }
    }
  } catch (e) {
    console.error('Port 3000 error:', e);
  }
}

checkPort3000();
