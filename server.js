import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import puppeteer from 'puppeteer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.json());

const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
}

function extractCallbackBlocks(html) {
  const blocks = [];
  const startPat = 'AF_initDataCallback({';
  let pos = 0;
  while ((pos = html.indexOf(startPat, pos)) !== -1) {
    let depth = 1, inStr = false, strCh = '';
    let i = pos + startPat.length - 1;
    for (i++; i < html.length; i++) {
      const c = html[i];
      if (inStr) { if (c === '\\') i++; else if (c === strCh) inStr = false; continue; }
      if (c === '"' || c === "'") { inStr = true; strCh = c; continue; }
      if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) { const rest = html.slice(i + 1); const m = rest.match(/^\s*\)\s*;/); if (m) { blocks.push(html.slice(pos, i + 1 + m[0].length)); pos = i + 1 + m[0].length; } else pos = i + 1; break; } }
    }
    if (depth !== 0) { pos = html.length; break; }
  }
  return blocks;
}

function extractImageUrls(html) {
  const images = [];
  let albumName = 'Google Photos Album';

  const blocks = extractCallbackBlocks(html);

  for (const fullBlock of blocks) {
    // Strip the outer AF_initDataCallback({ ... });
    const inner = fullBlock.replace(/^AF_initDataCallback\(\{/, '').replace(/\}\s*\)\s*;$/, '');
    const block = inner;

    // Check if this is ds:1 (contains full photo metadata)
    if (block.includes("key: 'ds:1'") || block.includes('key: "ds:1"')) {
      // Extract the data array
      const dataMatch = block.match(/data:(\[[\s\S]*)/);
      if (!dataMatch) continue;

      try {
        const rawData = dataMatch[1];
        const dataStr = rawData.replace(/,?\s*sideChannel\s*:\s*\{[^}]*\}\s*$/, '');
        const data = JSON.parse(dataStr);
        const items = data[1] || [];
        const contToken = data[2];
        const totalHint = data[0]?.[0];
        console.log(`ds:1: ${items.length} items, data[0]=${JSON.stringify(data[0]).slice(0, 100)}, data[2]=${JSON.stringify(data[2]).slice(0, 60)}`);

        // Try alternate pagination source: check for page tokens in data[0]
        let pageToken = contToken;
        // Sometimes Google puts the page token inside a nested array in data[0]
        if (!pageToken && Array.isArray(data[0]) && data[0].length > 3 && typeof data[0][2] === 'string') {
          pageToken = data[0][2];
          console.log(`Found alternate pageToken in data[0][2]: ${pageToken.substring(0, 30)}...`);
        }

        for (const item of items) {
          if (!Array.isArray(item)) continue;
          const photoId = item[0];
          if (typeof photoId !== 'string' || !photoId.startsWith('AF1Qip')) continue;
          const media = item[1];
          if (!Array.isArray(media)) continue;

          const mimePattern = /video\/\w+|\.mp4|\.webm|\.mov|quicktime|x-matroska|mpeg/i;
          const itemStr = JSON.stringify(item).toLowerCase();
          const isVideo = (
            // 1. Check if any sub-array in the item contains a video mime string
            item.some((el, ei) =>
              Array.isArray(el) && el.some((sub, si) =>
                typeof sub === 'string' && !(ei === 1 && si === 0) && mimePattern.test(sub)
              )
            ) ||
            // 2. Check media array elements for video indicators (skip URL at index 0)
            (Array.isArray(media) && media.some((m, i) =>
              i > 0 && typeof m === 'string' && mimePattern.test(m)
            )) ||
            // 3. Check URL for zero-width pattern (videos sometimes get =w0)
            (media[0] && typeof media[0] === 'string' && /=w0($|[^1-9])/.test(media[0])) ||
            // 4. Check item-level strings for video indicators
            item.some(el => typeof el === 'string' && /video|mp4|webm|mov|quicktime|mpeg/i.test(el)) ||
            // 5. Check if item[3] is a URL DIFFERENT from media[0] (Google Photos stores video URLs here)
            (item[3] !== undefined && item[3] !== null && typeof item[3] === 'string' &&
             (item[3].startsWith('https://') || item[3].startsWith('http://')) &&
             item[3] !== media[0]) ||
            // 6. Check deep metadata fields for video indicators
            (item[4] && JSON.stringify(item[4]).toLowerCase().includes('video')) ||
            (item[5] && JSON.stringify(item[5]).toLowerCase().includes('video')) ||
            (item[6] && JSON.stringify(item[6]).toLowerCase().includes('video')) ||
            (item[7] && JSON.stringify(item[7]).toLowerCase().includes('video')) ||
            // 7. Catch-all: brute-force check of the full serialized item
            /"video[^a-z]|"mp4"|"webm"|"quicktime"|"x-matroska"|media_type.*video/i.test(itemStr) ||
            // 8. Check if media array has more than 3 elements with non-lh3 URL at index 3
            (Array.isArray(media) && media.length > 3 && typeof media[3] === 'string' && !media[3].startsWith('https://lh3')) ||
            // 9. Check for zero/non-numeric dimensions (videos often have 0 or null width/height)
            (Array.isArray(media) && media.length >= 3 &&
             ((typeof media[1] === 'number' && media[1] <= 0) || media[1] === null) &&
             ((typeof media[2] === 'number' && media[2] <= 0) || media[2] === null))
          );
          const imageUrl = media[0];
          if (typeof imageUrl === 'string' && imageUrl.startsWith('https://lh3.googleusercontent.com/')) {
            const fullResUrl = imageUrl.replace(/=w\d+(-h\d+)?/, '=w1200');
            let timestamp = typeof item[2] === 'number' ? item[2] : null;
            if (timestamp !== null && timestamp < 100000000000) {
              timestamp *= 1000;
            }
            let videoUrl = null;
            if (typeof item[3] === 'string' && (item[3].startsWith('https://') || item[3].startsWith('http://')) && item[3] !== imageUrl) {
              videoUrl = item[3];
            } else if (Array.isArray(media) && media.length > 3 && typeof media[3] === 'string' && media[3].startsWith('http') && !media[3].includes('googleusercontent')) {
              videoUrl = media[3];
            }
            images.push({
              url: fullResUrl,
              photoId,
              timestamp,
              title: albumName,
              author: 'Google Photos',
              category: 'Synced',
              description: `From shared album: ${albumName}`,
              isVideo,
              videoUrl,
              originalUrl: imageUrl,
            });
          }
        }
      } catch (e) {
        console.error('JSON parse error in ds:1:', e.message);
      }
    }

    // Extract album name from ds:0
    if (!albumName || albumName === 'Google Photos Album') {
      if (block.includes("key: 'ds:0'") || block.includes('key: "ds:0"')) {
        try {
          const dataMatch = block.match(/data:(\[[\s\S]*)/);
          if (dataMatch) {
            const rawData = dataMatch[1];
            const dataStr = rawData.replace(/,?\s*sideChannel\s*:\s*\{[^}]*\}\s*$/, '');
            const data = JSON.parse(dataStr);
            const namePath = data[0]?.[1]?.[4]?.[1]?.[1]?.[1]?.[0]?.[3]?.[0]?.[1];
            if (namePath) albumName = namePath;
          }
        } catch (e) {
          // ignore
        }
      }
    }
  }

  console.log(`extractImageUrls: extracted ${images.length} images from album "${albumName}"`);
  return { images, albumName };
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Pick `limit` photos with maximum day-diversity
function selectImages(images, limit = 200) {
  if (images.length === 0) return { images: [], stats: { totalAll: 0, uniqueDays: 0, selectedCount: 0, usedDays: 0, limit } };

  // Group by calendar date
  let noDateIdx = 0;
  const groups = {};
  for (const img of images) {
    const key = img.timestamp
      ? new Date(img.timestamp).toISOString().slice(0, 10)
      : `__no_date__${String(noDateIdx++ % 100).padStart(3, '0')}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(img);
  }

  const uniqueDays = Object.keys(groups).length;

  let result;
  if (images.length <= limit) {
    result = shuffle(images);
  } else if (uniqueDays >= limit) {
    const pool = [];
    for (const [, group] of Object.entries(groups)) {
      pool.push(shuffle(group)[0]);
    }
    result = shuffle(pool).slice(0, limit);
  } else {
    const perDay = Math.ceil(limit / uniqueDays);
    const pool = [];
    for (const [, group] of Object.entries(groups)) {
      const shuffled = shuffle(group);
      pool.push(...shuffled.slice(0, Math.min(perDay, shuffled.length)));
    }
    if (pool.length < limit) {
      const usedIds = new Set(pool.map(p => p.photoId));
      const remaining = images.filter(i => !usedIds.has(i.photoId));
      pool.push(...shuffle(remaining).slice(0, limit - pool.length));
    }
    result = shuffle(pool).slice(0, limit);
  }

  const usedDays = new Set(
    result.map(i => i.timestamp ? new Date(i.timestamp).toISOString().slice(0, 10) : 'no-date')
  );
  const stats = {
    totalAll: images.length,
    uniqueDays,
    selectedCount: result.length,
    usedDays: usedDays.size,
    limit
  };
  console.log(`selectImages: ${stats.totalAll} total, ${stats.uniqueDays} unique days → picked ${stats.selectedCount} across ${stats.usedDays} days`);
  return { images: result, stats };
}

function extractFirstJSONValue(text) {
  // Extract the first complete JSON array or object from text using bracket depth tracking
  const start = text.search(/[\[{]/);
  if (start < 0) return null;
  let depth = 0, inString = false, escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (escaped) { escaped = false; continue; }
    if (c === '\\' && inString) { escaped = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === '[' || c === '{') depth++;
    if (c === ']' || c === '}') {
      depth--;
      if (depth === 0) {
        return JSON.parse(text.substring(start, i + 1));
      }
    }
  }
  return null;
}

function extractPhotosFromBatchResponse(text, debugIndex = -1) {
  const photos = [];
  try {
    // Strip batchexecute prefix to find start of JSON
    const stripped = text.replace(/^[\s\S]*?\n(?=\[)/, '');
    const af1Count = (stripped.match(/AF1Qip/g) || []).length;

    // Extract first JSON value (handles trailing data)
    const data = extractFirstJSONValue(stripped);
    if (!data) {
      if (debugIndex >= 0) console.log(`  batchParse[${debugIndex}]: no valid JSON found`);
      return photos;
    }

    // Batchexecute structure: [["wrb.fr","snAcKc","<json_encoded_data>",null,null]]
    let innerData = null;
    if (Array.isArray(data) && data.length > 0 && Array.isArray(data[0]) && data[0].length >= 3) {
      const innerStr = data[0][2];
      if (typeof innerStr === 'string' && innerStr.length > 100) {
        try { innerData = JSON.parse(innerStr); } catch (e) {}
      }
    }
    if (!innerData && Array.isArray(data)) {
      for (const el of data) {
        if (Array.isArray(el) && el.length >= 3 && typeof el[2] === 'string' && el[2].includes('AF1Qip')) {
          try { innerData = JSON.parse(el[2]); } catch(e) {}
          break;
        }
      }
    }
    // inner format: [null, [photoItems...]] — items at index 1
    let photoItems = innerData;
    if (Array.isArray(photoItems) && photoItems.length >= 2) {
      const idx1 = photoItems[1];
      if (Array.isArray(idx1)) photoItems = idx1;
    }

    function extractFrom(arr, depth = 0) {
      if (depth > 10 || !Array.isArray(arr)) return;
      if (arr.length >= 2 && typeof arr[0] === 'string' && arr[0].startsWith('AF1Qip') && Array.isArray(arr[1])) {
        const photoId = arr[0];
        const media = arr[1];
        const imageUrl = media[0];
        if (typeof imageUrl === 'string' && imageUrl.startsWith('https://lh3.googleusercontent.com/') && !photos.some(p => p.photoId === photoId)) {
          const fullResUrl = imageUrl.replace(/=w\d+(-h\d+)?/, '=w1200');
          let timestamp = typeof arr[2] === 'number' ? arr[2] : null;
          if (timestamp !== null && timestamp < 100000000000) timestamp *= 1000;
          const imageUrlLower = imageUrl.toLowerCase();
          const itemStr = JSON.stringify(arr).toLowerCase();
          const mimePattern = /video\/\w+|\.mp4|\.webm|\.mov|quicktime|x-matroska|mpeg/i;
          const checks = {
            url_w0: /=w0($|[^1-9])/.test(imageUrlLower),
            mime_media: Array.isArray(media) && media.some((m, i) => i > 0 && typeof m === 'string' && mimePattern.test(m)),
            arr3_url: typeof arr[3] === 'string' && arr[3].startsWith('http') && arr[3] !== imageUrl,
            subarray_mime: arr.some((el, ei) => Array.isArray(el) && el.some((sub, si) => typeof sub === 'string' && !(ei === 1 && si === 0) && mimePattern.test(sub))),
            meta_video: (arr[4] && JSON.stringify(arr[4]).toLowerCase().includes('video')) || (arr[5] && JSON.stringify(arr[5]).toLowerCase().includes('video')) || (arr[6] && JSON.stringify(arr[6]).toLowerCase().includes('video')),
            brute_force: /"video[^a-z]|"mp4"|"webm"|"quicktime"|"x-matroska"|media_type.*video/i.test(itemStr),
          };
          const isVideo = Object.values(checks).some(v => v);
          // Try to extract location
          let location = null;
          if (Array.isArray(media[8]) && typeof media[8][0] === 'number' && typeof media[8][1] === 'number') {
            location = `${media[8][0].toFixed(4)}, ${media[8][1].toFixed(4)}`;
          }
          // Extract video URL: arr[3] might be a different URL (video source) for videos
          let videoUrl = null;
          if (typeof arr[3] === 'string' && arr[3].startsWith('http') && arr[3] !== imageUrl) {
            videoUrl = arr[3];
          } else if (Array.isArray(media) && media.length > 3 && typeof media[3] === 'string' && media[3].startsWith('http') && !media[3].includes('googleusercontent')) {
            videoUrl = media[3];
          }
          photos.push({ url: fullResUrl, photoId, timestamp, title: 'Google Photos', author: 'Google Photos', category: 'Synced', description: 'From shared album', location, isVideo, originalUrl: imageUrl, videoUrl });
        }
        return;
      }
      for (const el of arr) extractFrom(el, depth + 1);
    }

    extractFrom(photoItems);
  } catch (e) {
    if (debugIndex >= 0) console.log(`  batchParse[${debugIndex}]: error: ${e.message}`);
  }
  return photos;
}

async function fetchAlbum(url) {
  let shareUrl = url;
  if (url.includes('photos.app.goo.gl')) {
    const redirectRes = await fetch(url, {
      method: 'HEAD',
      redirect: 'manual',
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const location = redirectRes.headers.get('location');
    if (location) shareUrl = location;
  }

  console.log(`fetchAlbum: navigating to ${shareUrl} with Puppeteer`);
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--window-position=-32000,-32000',
        '--window-size=1,1'
      ],
      spawnOptions: {
        windowsHide: true,
      }
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36');

    const capturedBatches = [];

    page.on('response', async (response) => {
      const rurl = response.url();
      if (response.status() !== 200) return;
      try {
        const buf = await response.buffer();
        const text = buf.toString();
        if (!text || text.length < 100) return;
        if (text.includes('AF1Qip')) {
          capturedBatches.push({ url: rurl.substring(0, 150), text, len: text.length });
        }
      } catch (e) {}
    });

    // Navigate
    await page.goto(shareUrl, { waitUntil: 'networkidle0', timeout: 30000 });

    // Wait for the page to render photos
    await page.waitForSelector('img[src*="lh3.googleusercontent.com"]', { timeout: 15000 }).catch(() => {
      console.log('Puppeteer: img selector timed out');
    });

    // Log initial state
    const pageUrl = page.url();
    console.log(`Puppeteer: page URL = ${pageUrl}`);

    // Try to extract data from the page's runtime state
    const runtimeData = await page.evaluate(() => {
      const results = {};
      // Check for various global state variables
      try { results.afData = typeof AF_initDataQueue !== 'undefined' ? JSON.stringify(AF_initDataQueue).substring(0, 500) : 'no AF_initDataQueue'; } catch(e) {}
      try { results.dataKeys = Object.keys(window).filter(k => k.startsWith('__') || k.startsWith('AF_')).join(', '); } catch(e) {}
      try { results.imgCount = document.querySelectorAll('img[src*="lh3.googleusercontent.com"]').length; } catch(e) {}
      return results;
    }).catch(() => ({}));
    console.log(`Puppeteer runtime:`, JSON.stringify(runtimeData).substring(0, 500));

    // Scroll to load all photos
    const maxScrolls = 80;
    let prevCount = 0;
    let noChangeCount = 0;

    for (let i = 0; i < maxScrolls; i++) {
      await page.evaluate(() => window.scrollBy(0, 4000));
      await new Promise(r => setTimeout(r, 1500));

      const count = await page.evaluate(() =>
        document.querySelectorAll('img[src*="lh3.googleusercontent.com"]').length
      ).catch(() => 0);

      if (count > prevCount) {
        console.log(`  scroll ${i + 1}: ${count} images`);
        prevCount = count;
        noChangeCount = 0;
      } else {
        noChangeCount++;
        if (noChangeCount >= 4) break;
      }
    }

    console.log(`Puppeteer: final image count = ${prevCount}, captured ${capturedBatches.length} batchexecute responses`);

    // Log details about captured batches
    for (const batch of capturedBatches) {
      console.log(`  batch: url=${batch.url}, len=${batch.len}, hasAF1Qip=${batch.text.includes('AF1Qip')}`);
    }

    // Parse initial HTML from the first page source
    const html = await page.content();
    const result = extractImageUrls(html);

    // Parse batchexecute responses for additional photos
    const seenIds = new Set(result.images.map(i => i.photoId));
    let extraCount = 0;

    for (let i = 0; i < capturedBatches.length; i++) {
      const batch = capturedBatches[i];
      const batchPhotos = extractPhotosFromBatchResponse(batch.text, i);
      for (const photo of batchPhotos) {
        if (!seenIds.has(photo.photoId)) {
          seenIds.add(photo.photoId);
          result.images.push(photo);
          extraCount++;
        }
      }
    }



    // Fallback: if we have more images in the DOM than extracted, extract from DOM
    if (prevCount > result.images.length) {
      console.log(`Puppeteer: extracting from DOM (${prevCount} in DOM vs ${result.images.length} parsed)`);
      const domPhotos = await page.evaluate(() => {
        const imgs = document.querySelectorAll('img[src*="lh3.googleusercontent.com"]');
        return Array.from(imgs).map((img, idx) => ({
          url: img.src,
          index: idx,
          alt: img.alt || '',
          parentClass: img.parentElement?.className || ''
        }));
      }).catch(() => []);
      console.log(`Puppeteer: extracted ${domPhotos.length} photos from DOM`);
      for (const dp of domPhotos) {
        const photoId = `dom-${dp.index}-${Date.now()}`;
        if (!result.images.some(i => i.url === dp.url)) {
          result.images.push({
            url: dp.url.replace(/=w\d+(-h\d+)?/, '=w1200'),
            photoId,
            timestamp: null,
            title: 'Google Photos',
            author: 'Google Photos',
            category: 'Synced',
            description: 'From shared album'
          });
          extraCount++;
        }
      }
    }

    // Final video detection pass: set videoUrl for all detected videos
    let videoDetectedCount = 0;
    for (const img of result.images) {
      if (!img.isVideo) {
        const url = img.url.toLowerCase();
        const origUrl = (img.originalUrl || '').toLowerCase();
        const isVid = (
          url.includes('/video/') || origUrl.includes('/video/') ||
          url.includes('video.googleusercontent') || origUrl.includes('video.googleusercontent') ||
          url.includes('=m&') || origUrl.includes('=m&') ||
          url.endsWith('=m') || origUrl.endsWith('=m') ||
          /=w0($|[^1-9])/.test(url) || /=w0($|[^1-9])/.test(origUrl) ||
          (img.photoId && typeof img.photoId === 'string' && img.photoId.startsWith('dom-'))
        );
        if (isVid) {
          img.isVideo = true;
        }
      }
      if (img.isVideo) {
        // videoUrl = base URL (proxy appends =dv at request time)
        img.videoUrl = img.videoUrl || (img.originalUrl || img.url).replace(/=w\d+(-h\d+)?/, '');
        videoDetectedCount++;
      }
    }
    if (videoDetectedCount > 0) {
      console.log(`Puppeteer: final filter detected ${videoDetectedCount} videos`);
    }

    console.log(`Puppeteer: total=${result.images.length} (${extraCount} from batches/DOM)`);
    return result;
  } catch (err) {
    console.error('Puppeteer error:', err.message);
    console.log('Falling back to plain HTTP fetch...');
    const pageRes = await fetch(shareUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const html = await pageRes.text();
    return extractImageUrls(html);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

app.post('/api/parse-album', async (req, res) => {
  const { url, urls: inputUrls } = req.body;
  const urls = inputUrls || (url ? [url] : []);

  if (urls.length === 0) {
    return res.status(400).json({ error: 'Please enter at least one Google Photos shared album link.' });
  }

  try {
    const allImages = [];

    for (const albumUrl of urls) {
      if (!albumUrl || (!albumUrl.includes('photos.app.goo.gl') && !albumUrl.includes('photos.google.com/share/'))) {
        continue;
      }
      try {
        const { images } = await fetchAlbum(albumUrl);
        allImages.push(...images);
      } catch (err) {
        console.error(`Error fetching album ${albumUrl}:`, err);
      }
    }

    if (allImages.length === 0) {
      return res.status(404).json({ error: 'No photos found in these albums. Links may be private or invalid.' });
    }

    console.log(`Fetched ${allImages.length} total items from ${urls.length} album(s)`);
    const videoCount = allImages.filter(img => img.isVideo).length;
    const photoCount = allImages.filter(img => !img.isVideo).length;
    console.log(`  → ${photoCount} photos, ${videoCount} videos`);
    const { stats } = selectImages(allImages);

    res.json({
      images: allImages,
      stats: { ...stats, videoCount },
      album: `${urls.length} album(s) merged — ${allImages.length} total photos`
    });
  } catch (err) {
    console.error('Parse album error:', err);
    res.status(500).json({ error: 'Could not fetch albums.' });
  }
});

// Proxy endpoint for video playback — appends =dv, follows redirect, streams content (MUST be before catch-all)
app.get('/api/video-proxy', async (req, res) => {
  const videoUrl = req.query.url;
  if (!videoUrl || typeof videoUrl !== 'string') {
    return res.status(400).send('Missing url parameter');
  }
  let dvUrl = videoUrl;
  if (videoUrl.includes('googleusercontent.com') && !videoUrl.includes('video-downloads')) {
    dvUrl = videoUrl.replace(/=w\d+(-h\d+)?/, '') + '=dv';
  }
  console.log(`video-proxy: fetching ${dvUrl.slice(0, 80)}...`);
  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
      'Accept': 'video/mp4,video/*;q=0.9,*/*;q=0.8',
      'Referer': 'https://photos.google.com/',
    };
    if (req.headers.range) {
      headers['Range'] = req.headers.range;
    }

    let response = await fetch(dvUrl, {
      method: 'GET',
      headers: headers,
      redirect: 'manual',
    });

    // Manually follow redirect to preserve custom headers like Range
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const redirectUrl = response.headers.get('location');
      if (redirectUrl) {
        console.log(`video-proxy: manually redirecting to ${redirectUrl.slice(0, 80)}...`);
        response = await fetch(redirectUrl, {
          method: 'GET',
          headers: headers,
          redirect: 'manual',
        });
      }
    }
    if (!response.ok && response.status !== 206) {
      return res.status(response.status).send('Video fetch failed: ' + response.status);
    }
    const contentType = response.headers.get('content-type') || '';
    const contentLength = response.headers.get('content-length');
    const contentRange = response.headers.get('content-range');
    console.log(`video-proxy: status=${response.status}, type=${contentType}, len=${contentLength}, range=${contentRange}`);
    
    // If we got HTML instead of video, check the body
    if (contentType.includes('text/html')) {
      const text = await response.text();
      console.log(`video-proxy: HTML response (${text.length} chars): ${text.slice(0, 500)}`);
      return res.status(502).send('Google returned HTML instead of video');
    }

    res.status(response.status);
    res.setHeader('Content-Type', contentType || 'video/mp4');
    if (contentLength) res.setHeader('Content-Length', contentLength);
    if (contentRange) res.setHeader('Content-Range', contentRange);
    res.setHeader('Accept-Ranges', 'bytes');

    if (response.body.pipe) {
      response.body.pipe(res);
    } else if (response.body.getReader) {
      const reader = response.body.getReader();
      const pump = async () => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) { res.end(); return; }
          res.write(Buffer.from(value));
        }
      };
      pump().catch(e => { if (!res.writableEnded) res.end(); });
    } else {
      const buf = Buffer.from(await response.arrayBuffer());
      res.end(buf);
    }
  } catch (e) {
    res.status(502).send('Video proxy error: ' + e.message);
  }
});

// SPA catch-all — serve index.html for all other GET requests (must be after all specific routes)
if (fs.existsSync(distPath)) {
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
});
