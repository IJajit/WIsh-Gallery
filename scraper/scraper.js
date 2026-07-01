/**
 * Standalone Google Photos scraper microservice.
 *
 * Deploy on Render.com (free tier) or any Node host that supports Puppeteer.
 *
 * Why a separate service?
 *  - Vercel serverless functions can't run a real browser.
 *  - Google Photos Library API requires OAuth app verification (returns 403
 *    for unverified apps even with the right scopes).
 *  - A headless browser scrolls the album page to trigger lazy-loading and
 *    captures ALL photos in original order, with timestamps and video URLs.
 *
 * Endpoints:
 *   POST /scrape    { urls: string[] } -> { images, stats, album }
 *   GET  /health    -> { ok: true, uptime }
 */

import express from 'express';
import puppeteer from 'puppeteer';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const PORT = process.env.PORT || 3001;
const MAX_SCROLL_PASSES = parseInt(process.env.MAX_SCROLL_PASSES || '60', 10);
const SCROLL_SETTLE_MS = parseInt(process.env.SCROLL_SETTLE_MS || '1200', 10);

let browser = null;
async function getBrowser() {
  if (browser && browser.connected) return browser;
  browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-blink-features=AutomationControlled',
    ],
  });
  return browser;
}

function isShortenedUrl(u) {
  return typeof u === 'string' && u.includes('photos.app.goo.gl');
}

async function resolveShortUrl(url) {
  if (!isShortenedUrl(url)) return url;
  try {
    // Use GET with manual redirect so we can grab the Location header.
    // Some Google short-URL servers don't follow HEAD redirects, so try GET as fallback.
    let res = await fetch(url, { method: 'GET', redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0' } });
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const loc = res.headers.get('location');
      if (loc) return new URL(loc, url).toString();
    }
    // Some servers return 200 with a <meta refresh> or client-side redirect
    res = await fetch(url, { method: 'GET', redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0' } });
    return res.url || url;
  } catch (e) {
    console.warn(`[scrape] resolveShortUrl error: ${e.message}`);
    return url;
  }
}

function looksLikeVideo(itemStr) {
  return /video|mp4|webm|quicktime|x-matroska|mpeg/i.test(itemStr);
}

function parseItemsFromJson(items) {
  const out = [];
  for (const item of items || []) {
    if (!Array.isArray(item)) continue;
    const pid = item[0];
    const media = item[1];
    if (typeof pid !== 'string' || !pid.startsWith('AF1Qip')) continue;
    if (!Array.isArray(media)) continue;
    const origUrl = media[0];
    if (typeof origUrl !== 'string' || !origUrl.includes('googleusercontent')) continue;
    const itemStr = JSON.stringify(item);
    const isVideo = looksLikeVideo(itemStr);
    let videoUrl = null;
    if (isVideo) {
      videoUrl = `${origUrl.split('=')[0]}=dv`;
    }
    out.push({
      photoId: pid,
      url: origUrl.replace(/=w\d+(-h\d+)?/, '=w1200'),
      originalUrl: origUrl,
      timestamp: typeof item[2] === 'number' ? item[2] : null,
      isVideo,
      videoUrl,
    });
  }
  return out;
}

async function scrapeAlbum(albumUrl, onProgress) {
  const shareUrl = await resolveShortUrl(albumUrl);
  console.log(`[scrape] opening ${shareUrl}`);
  if (onProgress) onProgress(`Opening ${shareUrl.slice(0, 80)}...`);

  const browserInstance = await getBrowser();
  const page = await browserInstance.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
  );

  // Mask webdriver property to bypass bot detection on datacenter IPs
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
    });
  });

  const items = new Map();
  page.on('response', async (res) => {
    const url = res.url();
    if (!url.includes('batchexecute') && !url.includes('_/PhotosUi')) return;
    try {
      const text = await res.text();
      for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('[')) continue;
        let parsed;
        try { parsed = JSON.parse(trimmed); } catch { continue; }
        if (!Array.isArray(parsed)) continue;
        for (const entry of parsed) {
          if (!Array.isArray(entry) || entry[0] !== 'wrb.fr') continue;
          const raw = entry[2];
          if (typeof raw !== 'string') continue;
          let inner;
          try { inner = JSON.parse(raw); } catch { continue; }
          const arr = Array.isArray(inner[1]) ? inner[1] : null;
          if (!arr) continue;
          for (const img of parseItemsFromJson(arr)) {
            if (!items.has(img.photoId)) items.set(img.photoId, img);
          }
        }
      }
    } catch { /* ignore */ }
  });

  try {
    await page.goto(shareUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  } catch (e) {
    console.warn(`[scrape] navigation warning: ${e.message}`);
  }

  // Parse initial HTML for ds:1
  try {
    const html = await page.content();
    const m = html.match(/AF_initDataCallback\(\{key:\s*'ds:1'[\s\S]*?data:\s*(\[[\s\S]*?\})\s*\)\s*;/);
    if (m) {
      const start = m.index + m[0].indexOf('data:') + 5;
      let depth = 0, end = -1, inStr = false, strCh = '';
      for (let i = start; i < html.length; i++) {
        const c = html[i];
        if (inStr) { if (c === '\\') { i++; continue; } if (c === strCh) inStr = false; continue; }
        if (c === '"' || c === "'") { inStr = true; strCh = c; continue; }
        if (c === '[') depth++;
        else if (c === ']') { depth--; if (depth === 0) { end = i; break; } }
      }
      if (end > start) {
        const dataStr = html.slice(start, end + 1)
          .replace(/,\s*sideChannel\s*:\s*\{[\s\S]*?\}\s*$/, '');
        try {
          const data = JSON.parse(dataStr);
          const arr = Array.isArray(data[1]) ? data[1] : [];
          for (const img of parseItemsFromJson(arr)) {
            if (!items.has(img.photoId)) items.set(img.photoId, img);
          }
        } catch (e) { /* ignore */ }
      }
    }
  } catch (e) {
    console.warn(`[scrape] HTML parse error: ${e.message}`);
  }

  if (onProgress) onProgress(`Loaded ${items.size} initial items. Scrolling for more...`);

  if (items.size === 0) {
    const pageTitle = await page.title();
    const pageContentSnippet = (await page.content()).slice(0, 1000);
    console.warn(`[scrape] no items found. Page title: "${pageTitle}". Content snippet:`, pageContentSnippet);
    await page.close();
    throw new Error(`Puppeteer found 0 photos. Page title: "${pageTitle}". Make sure the album is shared publically.`);
  }

  let staleScrolls = 0;
  while (staleScrolls < MAX_SCROLL_PASSES) {
    const before = items.size;
    try {
      await page.keyboard.press('PageDown');
      await new Promise(r => setTimeout(r, 300));
      
      // Programmatic scroll of window and all scrollable containers
      await page.evaluate(() => {
        window.scrollBy(0, window.innerHeight * 2);
        const scrollables = Array.from(document.querySelectorAll('*')).filter(el => {
          const style = window.getComputedStyle(el);
          return (
            (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
            el.scrollHeight > el.clientHeight
          );
        });
        for (const el of scrollables) {
          el.scrollTop += el.clientHeight * 2;
        }
      });

      await new Promise(r => setTimeout(r, 300));
      await page.keyboard.press('End');
      await new Promise(r => setTimeout(r, SCROLL_SETTLE_MS));
    } catch (e) {
      console.warn(`[scrape] scroll error: ${e.message}`);
    }

    if (items.size > before) {
      staleScrolls = 0;
      console.log(`[scrape] ${items.size} unique items so far...`);
      if (onProgress) onProgress(`${items.size} items loaded...`);
    } else {
      staleScrolls++;
    }
  }

  await page.close();

  const all = Array.from(items.values());
  all.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  return all;
}

app.get('/health', (req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

app.post('/scrape', async (req, res) => {
  const { url, urls: inputUrls } = req.body || {};
  const urls = inputUrls || (url ? [url] : []);
  if (urls.length === 0) {
    return res.status(400).json({ error: 'No urls provided' });
  }
  if (urls.length > 10) {
    return res.status(400).json({ error: 'Maximum 10 urls per request' });
  }

  try {
    let lastError = null;
    const all = [];
    for (const u of urls) {
      if (!u || (!u.includes('photos.app.goo.gl') && !u.includes('photos.google.com/share/'))) {
        continue;
      }
      try {
        const imgs = await scrapeAlbum(u);
        all.push(...imgs);
      } catch (err) {
        console.error(`[scrape] error for ${u}:`, err.message);
        lastError = err.message;
      }
    }

    if (all.length === 0) {
      return res.status(404).json({
        error: lastError
          ? `Scrape failed: ${lastError}`
          : 'No photos found. The album may be private or invalid.'
      });
    }

    const videoCount = all.filter(i => i.isVideo).length;
    const uniqueDays = new Set(
      all.map(i => i.timestamp ? new Date(i.timestamp).toISOString().slice(0, 10) : 'no-date')
    ).size;

    res.json({
      images: all.map(img => ({
        url: img.url,
        title: 'Google Photos',
        author: 'Google Photos',
        category: 'Synced',
        description: 'Imported from Google Photos shared album.',
        timestamp: img.timestamp || undefined,
        isVideo: img.isVideo,
        videoUrl: img.videoUrl,
        photoId: img.photoId,
      })),
      stats: {
        totalAll: all.length,
        uniqueDays,
        selectedCount: all.length,
        usedDays: uniqueDays,
        videoCount,
      },
      album: `${urls.length} album(s) merged — ${all.length} total items`,
    });
  } catch (err) {
    console.error('[scrape] unexpected error:', err);
    res.status(500).json({ error: err.message || 'Scrape failed' });
  }
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`[scraper] listening on 0.0.0.0:${PORT}`);
});

const shutdown = async () => {
  console.log('[scraper] shutting down...');
  if (browser) {
    try { await browser.close(); } catch {}
  }
  server.close(() => process.exit(0));
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
