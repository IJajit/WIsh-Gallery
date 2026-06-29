import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.json());

const distPath = path.join(__dirname, '../dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
}

// ─── HTML Parsing Helpers ────────────────────────────────────────────────────

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
      else if (c === '}') {
        depth--;
        if (depth === 0) {
          const rest = html.slice(i + 1);
          const m = rest.match(/^\s*\)\s*;/);
          if (m) { blocks.push(html.slice(pos, i + 1 + m[0].length)); pos = i + 1 + m[0].length; }
          else pos = i + 1;
          break;
        }
      }
    }
    if (depth !== 0) { pos = html.length; break; }
  }
  return blocks;
}

/**
 * Shared helper: convert a raw items array (from ds:1 or batchexecute) into
 * our normalised image objects. Mutates `out` array in place for efficiency.
 */
function parseBatchItems(rawItems, out, albumName) {
  albumName = albumName || 'Google Photos Album';
  for (const item of rawItems) {
    if (!Array.isArray(item)) continue;
    const photoId = item[0];
    if (typeof photoId !== 'string' || !photoId.startsWith('AF1Qip')) continue;
    const media = item[1];
    if (!Array.isArray(media)) continue;

    const mimePattern = /video\/\w+|\.mp4|\.webm|\.mov|quicktime|x-matroska|mpeg/i;
    const itemStr = JSON.stringify(item).toLowerCase();
    const isVideo = (
      item.some((el, ei) =>
        Array.isArray(el) && el.some((sub, si) =>
          typeof sub === 'string' && !(ei === 1 && si === 0) && mimePattern.test(sub)
        )
      ) ||
      (Array.isArray(media) && media.some((m, idx) =>
        idx > 0 && typeof m === 'string' && mimePattern.test(m)
      )) ||
      (media[0] && typeof media[0] === 'string' && /=w0($|[^1-9])/.test(media[0])) ||
      item.some(el => typeof el === 'string' && /video|mp4|webm|mov|quicktime|mpeg/i.test(el)) ||
      (item[3] !== undefined && item[3] !== null && typeof item[3] === 'string' &&
       (item[3].startsWith('https://') || item[3].startsWith('http://')) &&
       item[3] !== media[0]) ||
      (item[4] && JSON.stringify(item[4]).toLowerCase().includes('video')) ||
      (item[5] && JSON.stringify(item[5]).toLowerCase().includes('video')) ||
      (item[6] && JSON.stringify(item[6]).toLowerCase().includes('video')) ||
      (item[7] && JSON.stringify(item[7]).toLowerCase().includes('video')) ||
      /\"video[^a-z]|\"mp4\"|\"webm\"|\"quicktime\"|\"x-matroska\"|media_type.*video/i.test(itemStr) ||
      (Array.isArray(media) && media.length > 3 && typeof media[3] === 'string' && !media[3].startsWith('https://lh3')) ||
      (Array.isArray(media) && media.length >= 3 &&
       ((typeof media[1] === 'number' && media[1] <= 0) || media[1] === null) &&
       ((typeof media[2] === 'number' && media[2] <= 0) || media[2] === null))
    );

    const imageUrl = media[0];
    if (typeof imageUrl === 'string' && imageUrl.startsWith('https://lh3.googleusercontent.com/')) {
      const fullResUrl = imageUrl.replace(/=w\d+(-h\d+)?/, '=w1200');
      let timestamp = typeof item[2] === 'number' ? item[2] : null;
      if (timestamp !== null && timestamp < 100000000000) timestamp *= 1000;
      let videoUrl = null;
      if (typeof item[3] === 'string' && (item[3].startsWith('https://') || item[3].startsWith('http://')) && item[3] !== imageUrl) {
        videoUrl = item[3];
      } else if (Array.isArray(media) && media.length > 3 && typeof media[3] === 'string' && media[3].startsWith('http') && !media[3].includes('googleusercontent')) {
        videoUrl = media[3];
      }
      out.push({
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
}

/**
 * Parse the initial album HTML page.
 * Returns { images, albumName, contToken, albumId }
 * where contToken is the page-continuation token for batchexecute pagination.
 */
function extractImageUrls(html) {
  const images = [];
  let albumName = 'Google Photos Album';
  // The AH_uQ... value at data[2] in ds:1 is Google's auth/session token for batchexecute
  let authToken = null;
  // The actual page continuation token is stored differently (in data[0] nested)
  let contToken = null;
  let albumId = null;

  const blocks = extractCallbackBlocks(html);

  for (const fullBlock of blocks) {
    const inner = fullBlock.replace(/^AF_initDataCallback\(\{/, '').replace(/\}\s*\)\s*;$/, '');
    const block = inner;

    // ds:1 — photo items + continuation tokens
    if (block.includes("key: 'ds:1'") || block.includes('key: "ds:1"')) {
      const dataMatch = block.match(/data:(\[[\s\S]*)/);
      if (!dataMatch) continue;
      try {
        const rawData = dataMatch[1];
        const dataStr = rawData.replace(/,?\s*sideChannel\s*:\s*\{[^}]*\}\s*$/, '');
        const data = JSON.parse(dataStr);
        const rawItems = data[1] || [];
        const rawD2 = data[2];
        // data[3] contains album metadata: [albumId, albumName, timestamps...]
        const meta = Array.isArray(data[3]) ? data[3] : null;

        console.log(`ds:1: ${rawItems.length} items, data[0]=${JSON.stringify(data[0]).slice(0, 80)}, data[2]=${JSON.stringify(rawD2).slice(0, 80)}`);

        // data[2] in shared albums is the AH_uQ... auth token for batchexecute
        if (typeof rawD2 === 'string' && rawD2.startsWith('AH_uQ')) {
          authToken = rawD2;
          console.log(`ds:1: found authToken (${authToken.length} chars)`);
        } else if (typeof rawD2 === 'string' && rawD2.length > 5) {
          contToken = rawD2;
        }

        // data[3][0] = album ID, data[3][1] = album name
        if (meta) {
          if (typeof meta[0] === 'string' && meta[0].length > 10) {
            albumId = meta[0];
            console.log(`ds:1: albumId from data[3][0]: ${albumId.slice(0, 30)}...`);
          }
          if (typeof meta[1] === 'string' && meta[1].length > 0 && (!albumName || albumName === 'Google Photos Album')) {
            albumName = meta[1];
            console.log(`ds:1: albumName from data[3][1]: "${albumName}"`);
          }
        }

        // Also scan data[0] for a page continuation token
        if (Array.isArray(data[0])) {
          for (let i = 0; i < Math.min(data[0].length, 10); i++) {
            const el = data[0][i];
            if (typeof el === 'string' && el.length > 20 && !el.startsWith('AH_uQ') && !el.startsWith('AF1Qip') && !el.startsWith('http')) {
              contToken = el;
              console.log(`ds:1: found possible pageToken in data[0][${i}]: ${el.slice(0, 30)}...`);
              break;
            }
          }
        }

        parseBatchItems(rawItems, images, albumName);
      } catch (e) {
        console.error('JSON parse error in ds:1:', e.message);
      }
    }
  }

  console.log(`extractImageUrls: ${images.length} images, contToken=${contToken ? contToken.slice(0,20)+'...' : 'null'}, authToken=${authToken ? 'found' : 'null'}, albumId=${albumId ? albumId.slice(0,20)+'...' : 'null'}`);
  return { images, albumName, contToken, albumId, authToken };
}

// ─── batchexecute Pagination ─────────────────────────────────────────────────

/**
 * Parse Google\'s batchexecute chunked-JSON response format:
 *   )]}\'\n\n<length>\n<json>\n<length>\n<json>\n...
 */
function parseChunks(text) {
  const chunks = [];
  let pos = text.indexOf('\n');
  if (pos === -1) return chunks;
  pos = pos + 1;
  while (pos < text.length) {
    while (pos < text.length && text[pos] === '\n') pos++;
    if (pos >= text.length) break;
    const lenEnd = text.indexOf('\n', pos);
    if (lenEnd === -1) break;
    const length = parseInt(text.slice(pos, lenEnd), 10);
    if (isNaN(length) || length <= 0) break;
    pos = lenEnd + 1;
    if (pos + length > text.length) break;
    const jsonStr = text.slice(pos, pos + length);
    try { chunks.push(JSON.parse(jsonStr)); } catch (e) { /* skip bad chunks */ }
    pos = pos + length;
  }
  return chunks;
}

/**
 * Fetch one page from a shared album via batchexecute RPC.
 * Tries multiple RPC IDs and payload formats.
 */
async function fetchNextPage(shareUrl, albumId, pageToken, cookies, authToken) {
  const rpcIds = ['snAcKc', 'UJlKrf', 'gs3fp'];
  const baseUrl = 'https://photos.google.com/_/PhotosUi/data/batchexecute?source-path=/&f.sid=-1&bl=boq_photos-shared-albums&hl=en&soc-app=5&soc-platform=1&soc-device=1&rt=c';

  const commonHeaders = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Origin': 'https://photos.google.com',
    'Referer': shareUrl,
    'X-Same-Domain': '1',
  };
  if (cookies) commonHeaders['Cookie'] = cookies;

  console.log('fetchNextPage:' + (pageToken ? ' token=' + pageToken.slice(0,20) : ' token=null') + ' cookies=' + (cookies?'yes':'no') + ' auth=' + (authToken?'yes':'no'));

  for (const rpcId of rpcIds) {
    const payloads = [JSON.stringify([albumId, pageToken, null, null, null, null, 1])];
    if (authToken) {
      payloads.push(JSON.stringify([albumId, authToken, null, pageToken, null]));
    }

    for (const inner of payloads) {
      const rpcPayload = JSON.stringify([[ [rpcId, inner, null, 'generic'] ]]);
      const bodyStr = 'f.req=' + encodeURIComponent(rpcPayload) + '&at=&';
      const batchUrl = baseUrl + '&rpcids=' + rpcId;

      let res;
      try {
        res = await fetch(batchUrl, { method: 'POST', headers: commonHeaders, body: bodyStr });
      } catch (e) {
        console.warn('fetchNextPage: network error: ' + e.message);
        continue;
      }

      if (!res.ok) {
        console.warn('fetchNextPage: HTTP ' + res.status + ' rpc=' + rpcId);
        continue;
      }

      const text = await res.text();
      const chunks = parseChunks(text);
      for (const chunk of chunks) {
        if (!Array.isArray(chunk)) continue;
        const wrb = Array.isArray(chunk[0]) && chunk[0][0] === 'wrb.fr' ? chunk[0] : chunk.find(function(e) { return Array.isArray(e) && e[0] === 'wrb.fr'; });
        if (!wrb) continue;
        const rawData = wrb[2];
        if (typeof rawData === 'string') {
          try {
            const innerData = JSON.parse(rawData);
            const rawItems = Array.isArray(innerData[1]) ? innerData[1] : (Array.isArray(innerData[0]) ? innerData[0] : []);
            var rawNextToken = innerData[2] || null;
            var nextToken = (typeof rawNextToken === 'string' && rawNextToken.length > 5) ? rawNextToken : null;
            if (rawItems.length > 0 || nextToken) {
              console.log('fetchNextPage OK rpc=' + rpcId + ' items=' + rawItems.length + ' next=' + (nextToken ? nextToken.slice(0,20)+'...' : 'null'));
              return { items: rawItems, nextToken: nextToken };
            }
          } catch (e) { /* skip parse errors */ }
        }
        // Check error status
        var st = wrb[5];
        if (Array.isArray(st) && st[0] === 5) {
          // error code 5 — try next RPC/payload
        }
      }
    }
  }
  return { items: [], nextToken: null };
}
// ─── Core Album Fetcher ──────────────────────────────────────────────────────

async function fetchAlbum(url) {
  // Resolve short URLs (photos.app.goo.gl)
  let shareUrl = url;
  if (url.includes('photos.app.goo.gl')) {
    try {
      const redirectRes = await fetch(url, {
        method: 'HEAD',
        redirect: 'manual',
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      const location = redirectRes.headers.get('location');
      if (location) shareUrl = location;
    } catch (e) {
      console.warn('fetchAlbum: could not resolve short URL:', e.message);
    }
  }

  // Extract album key from URL path — handles both formats:
  //   https://photos.google.com/share/AF1QipXXX
  //   https://photos.google.com/share/AF1QipXXX?key=YYYY
  const urlAlbumKey = shareUrl.match(/\/share\/([^/?#]+)/)?.[1] || null;
  if (urlAlbumKey) console.log(`fetchAlbum: album key from URL: ${urlAlbumKey.slice(0, 30)}...`);

  console.log(`fetchAlbum: fetching initial page from ${shareUrl}`);
  const pageRes = await fetch(shareUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    }
  });

  // Capture cookies set by Google for use in subsequent requests
  const rawCookies = pageRes.headers.get('set-cookie');
  let cookieString = null;
  if (rawCookies) {
    cookieString = rawCookies.split(/,(?=[^;]+=[^;]+;|[^;]+=)/)
      .map(c => c.trim().split(';')[0].trim())
      .filter(Boolean)
      .join('; ');
    console.log(`fetchAlbum: captured ${cookieString.split(';').length} cookies`);
  }

  const html = await pageRes.text();
  const { images, albumName, contToken, albumId, authToken } = extractImageUrls(html);

  // Use URL-extracted key as primary album ID for batchexecute
  const effectiveAlbumId = urlAlbumKey || albumId;

  // Pagination via batchexecute RPC (snAcKc):
  // - authToken (AH_uQ...) is required for authenticated calls
  // - We start with pageToken=null (first RPC page) and follow continuation tokens
  // - Items from each page are de-duplicated by photoId
  if (authToken && effectiveAlbumId) {
    console.log(`fetchAlbum: starting batchexecute pagination from ${images.length} initial items (authToken=${authToken.slice(0,15)}...)`);
    const seenIds = new Set(images.map(i => i.photoId));
    let pageToken = null;
    let page = 1;
    const MAX_PAGES = 50;

    while (page <= MAX_PAGES) {
      const { items, nextToken } = await fetchNextPage(shareUrl, effectiveAlbumId, pageToken, cookieString, authToken);
      const newItems = items.filter(item => {
        const pid = Array.isArray(item) && typeof item[0] === 'string' ? item[0] : null;
        return pid && !seenIds.has(pid);
      });
      if (newItems.length > 0) {
        parseBatchItems(newItems, images, albumName);
        newItems.forEach(item => {
          const pid = Array.isArray(item) && typeof item[0] === 'string' ? item[0] : null;
          if (pid) seenIds.add(pid);
        });
      }
      console.log(`fetchAlbum: page ${page}: raw=${items.length} new=${newItems.length} total=${images.length} nextToken=${nextToken ? nextToken.slice(0,20)+'...' : 'null'}`);
      if (!nextToken) break;
      pageToken = nextToken;
      page++;
      await new Promise(r => setTimeout(r, 150));
    }
    console.log(`fetchAlbum: done — ${images.length} total from ${page} page(s)`);
  } else {
    console.log(`fetchAlbum: no pagination. authToken=${authToken ? 'found' : 'missing'}, albumId=${effectiveAlbumId ? effectiveAlbumId.slice(0,20)+'...' : 'null'}. Returning ${images.length} items from initial page.`);
  }

  return { images, albumName };
}

// ─── Utility Functions ───────────────────────────────────────────────────────

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

// ─── API Routes ──────────────────────────────────────────────────────────────

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
      pump().catch(() => { if (!res.writableEnded) res.end(); });
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

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`API server running on http://localhost:${PORT}`);
  });
}

export default app;
