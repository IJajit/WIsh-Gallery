// Paste this into Chrome DevTools Console (F12) while viewing the album at:
// https://photos.google.com/share/AF1QipPT1a7sLoXSf_PNGMoSpMw_pk9M0UDoCUPrCqrIr1PHuU8j7C-znnVG7eR4y0rdUg?key=UjRVaEdmci1tR0tRajZxcm51aTA4UnlZeUp3WUl3

(async () => {
  const seen = new Set();
  const photos = [];
  let staleScrolls = 0;

  // First, extract from the initial page data
  const scripts = document.querySelectorAll('script');
  for (const script of scripts) {
    const text = script.textContent || '';
    const match = text.match(/AF_initDataCallback\(\{key:\s*'ds:1'.*?data:\s*(\[[\s\S]*?\])\s*\}\)\s*;/);
    if (match) {
      try {
        const data = JSON.parse(match[1]);
        const items = data[1] || [];
        for (const item of items) {
          if (Array.isArray(item) && typeof item[0] === 'string' && item[0].startsWith('AF1Qip')) {
            const media = item[1];
            if (Array.isArray(media) && typeof media[0] === 'string' && media[0].includes('googleusercontent')) {
              const pid = item[0];
              if (!seen.has(pid)) {
                seen.add(pid);
                photos.push({
                  photoId: pid,
                  url: media[0].replace(/=w\d+(-h\d+)?/, '=w1200'),
                  originalUrl: media[0],
                  timestamp: typeof item[2] === 'number' ? item[2] : null,
                });
              }
            }
          }
        }
        console.log(`Initial: ${items.length} items found, ${photos.length} unique`);
      } catch(e) { console.warn('Parse error:', e.message); }
    }
  }

  // Auto-scroll to trigger lazy loading
  console.log('Auto-scrolling to load more photos...');
  while (staleScrolls < 50) {
    const before = photos.length;
    window.scrollBy(0, window.innerHeight);
    // Wait for images to load
    await new Promise(r => setTimeout(r, 1500));

    // Check for new images in DOM
    const imgs = document.querySelectorAll('img[src*="googleusercontent"]');
    for (const img of imgs) {
      const src = img.src || '';
      const normalized = src.replace(/=w\d+(-h\d+)?/, '=w1200');
      const key = normalized;
      if (!seen.has(key)) {
        seen.add(key);
        photos.push({
          url: normalized,
          originalUrl: src,
          alt: img.alt || '',
        });
      }
    }

    if (photos.length > before) {
      staleScrolls = 0;
      console.log(`  ${photos.length} photos so far...`);
    } else {
      staleScrolls++;
    }
  }

  console.log(`\nDone! Total: ${photos.length} photos`);
  console.log(JSON.stringify(photos, null, 2));

  // Also provide download link
  const blob = new Blob([JSON.stringify(photos, null, 2)], {type: 'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'all-photos.json';
  a.click();
  console.log('Downloaded all-photos.json');
})();
