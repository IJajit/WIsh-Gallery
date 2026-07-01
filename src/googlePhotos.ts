/**
 * Google Photos Library API integration using Google Identity Services (GIS).
 *
 * Flow:
 * 1. User clicks "Sign in with Google"
 * 2. GIS opens a popup → user authorizes → we get an access_token
 * 3. We call Google Photos Library API with the access_token
 * 4. API supports pagination, so we can fetch ALL photos
 */

const PHOTOS_API_BASE = '/api/google-photos';
const SCOPES = 'openid email profile';

let accessToken: string | null = null;
let tokenExpiration: number = 0;

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (config: any) => void;
          prompt: (callback?: (notification: any) => void) => void;
        };
        oauth2?: {
          initTokenClient: (config: any) => any;
        };
      };
    };
  }
}

export function isGoogleAuthSupported(): boolean {
  return typeof window !== 'undefined' && !!window.google?.accounts?.oauth2;
}

export function isGoogleSignedIn(): boolean {
  return !!accessToken && Date.now() < tokenExpiration;
}

export function getGoogleAccessToken(): string | null {
  return isGoogleSignedIn() ? accessToken : null;
}

export function signOutGoogle(): void {
  accessToken = null;
  tokenExpiration = 0;
  localStorage.removeItem('gphotos_access_token');
  localStorage.removeItem('gphotos_token_expiry');
}

function saveToken(token: string, expiresAt: number): void {
  accessToken = token;
  tokenExpiration = expiresAt;
  localStorage.setItem('gphotos_access_token', token);
  localStorage.setItem('gphotos_token_expiry', String(expiresAt));
}

function loadSavedToken(): boolean {
  const saved = localStorage.getItem('gphotos_access_token');
  const expiry = localStorage.getItem('gphotos_token_expiry');
  if (saved && expiry && Date.now() < Number(expiry)) {
    accessToken = saved;
    tokenExpiration = Number(expiry);
    return true;
  }
  return false;
}

// Auto-restore token on module load so it survives page reloads
if (typeof window !== 'undefined') loadSavedToken();

/**
 * Initiate Google sign-in flow using GIS token client.
 * Returns a Promise that resolves with the access token.
 */
export function signInWithGoogle(clientId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!window.google?.accounts?.oauth2) {
      reject(new Error('Google Identity Services not loaded. Make sure the GIS script is included.'));
      return;
    }

    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      callback: (tokenResponse: any) => {
        if (tokenResponse.error) {
          reject(new Error(tokenResponse.error));
          return;
        }
        const token = tokenResponse.access_token;
        const expiresIn = tokenResponse.expires_in || 3600;
        const expiresAt = Date.now() + (expiresIn * 1000) - 60000;
        saveToken(token, expiresAt);
        resolve(token);
      },
      error_callback: (err: any) => {
        reject(new Error(err.message || 'Google sign-in failed'));
      },
    });

    tokenClient.requestAccessToken({ prompt: 'consent' });
  });
}

export function initGoogleAuth(clientId: string): void {
  if (loadSavedToken()) return;
  if (!window.google?.accounts?.id) return;

  window.google.accounts.id.initialize({
    client_id: clientId,
    callback: () => {},
  });
}

interface MediaItem {
  id: string;
  baseUrl: string;
  filename: string;
  mimeType: string;
  mediaMetadata: {
    creationTime: string;
    width: string;
    height: string;
    photo?: any;
    video?: {
      status: string;
    };
  };
  description?: string;
}

interface Album {
  id: string;
  title: string;
  productUrl: string;
  coverPhotoBaseUrl: string;
  mediaItemsCount: string;
  shareInfo?: {
    shareableUrl?: string;
    shareToken?: string;
    isJoined?: boolean;
  };
}

interface ListAlbumsResponse {
  albums?: Album[];
  nextPageToken?: string;
}

interface ListMediaItemsResponse {
  mediaItems?: MediaItem[];
  nextPageToken?: string;
}

async function apiFetch(path: string, token: string, signal?: AbortSignal): Promise<any> {
  const res = await fetch(`${PHOTOS_API_BASE}${path}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    signal,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google Photos API error ${res.status}: ${err}`);
  }

  return res.json();
}

export async function listAlbums(token: string, signal?: AbortSignal): Promise<Album[]> {
  const albums: Album[] = [];
  let pageToken: string | undefined;

  do {
    const query = pageToken ? `?pageToken=${pageToken}` : '';
    const data: ListAlbumsResponse = await apiFetch(`/albums${query}`, token, signal);
    if (data.albums) albums.push(...data.albums);
    pageToken = data.nextPageToken;
  } while (pageToken);

  return albums;
}

export async function findAlbumByTitle(token: string, title: string): Promise<Album | null> {
  const albums = await listAlbums(token);
  return albums.find(a => a.title.toLowerCase() === title.toLowerCase()) || null;
}

export async function findAlbumByUrl(token: string, shareUrl: string): Promise<Album | null> {
  const albums = await listAlbums(token);

  // Try to match by album ID extracted from URL
  const albumIdMatch = shareUrl.match(/\/share\/([A-Za-z0-9_-]+)/);
  if (albumIdMatch) {
    const targetId = albumIdMatch[1];
    const match = albums.find(a => a.id === targetId || a.id.startsWith(targetId));
    if (match) return match;
  }

  // Try to match by productUrl
  const match = albums.find(a => shareUrl.includes(a.id));
  if (match) return match;

  return null;
}

export async function joinSharedAlbum(token: string, shareUrl: string, signal?: AbortSignal): Promise<Album | null> {
  const albumIdMatch = shareUrl.match(/\/share\/([A-Za-z0-9_-]+)/);
  const albumKey = albumIdMatch ? albumIdMatch[1] : null;
  const urlKeyMatch = shareUrl.match(/[?&]key=([A-Za-z0-9_-]+)/);
  const urlKey = urlKeyMatch ? urlKeyMatch[1] : null;

  if (!albumKey) {
    console.warn('[OAuth] Could not extract album key from URL');
    return null;
  }

  // Try different share token formats
  const shareTokens = [albumKey];
  if (urlKey) {
    shareTokens.push(`${albumKey}:${urlKey}`);
  }

  for (const shareToken of shareTokens) {
    try {
      console.log('[OAuth] Joining shared album with token:', shareToken.slice(0, 40) + '...');
      const res = await fetch(`${PHOTOS_API_BASE}/sharedAlbums:join`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ shareToken }),
        signal,
      });

      if (!res.ok) {
        const errText = await res.text();
        console.warn(`[OAuth] Join with token ${shareToken.slice(0, 20)}... failed:`, res.status, errText.slice(0, 200));
        continue;
      }

      const data = await res.json();
      if (data && data.id) {
        console.log('[OAuth] Joined shared album:', data.title, '(' + (data.mediaItemsCount || '?') + ' items)');
        return data as Album;
      }
    } catch (err: any) {
      console.warn(`[OAuth] Join with token ${shareToken.slice(0, 20)}... error:`, err.message);
      continue;
    }
  }

  return null;
}

export async function listSharedAlbums(token: string, signal?: AbortSignal): Promise<Album[]> {
  const albums: Album[] = [];
  let pageToken: string | undefined;

  do {
    const query = pageToken ? `?pageToken=${pageToken}` : '';
    const res = await fetch(`${PHOTOS_API_BASE}/sharedAlbums${query}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      signal,
    });

    if (!res.ok) {
      const err = await res.text();
      console.warn('[OAuth] List shared albums failed:', err.slice(0, 200));
      break;
    }

    const data = await res.json();
    if (data.sharedAlbums) albums.push(...data.sharedAlbums);
    pageToken = data.nextPageToken;
  } while (pageToken);

  return albums;
}

export async function fetchAllMediaItems(token: string, albumId?: string, isShared?: boolean, signal?: AbortSignal): Promise<any[]> {
  const items: any[] = [];
  let pageToken: string | undefined;

  do {
    let path: string;
    if (albumId) {
      if (isShared) {
        // Shared album: /sharedAlbums/{id}/mediaItems is the official path
        path = `/sharedAlbums/${albumId}/mediaItems?pageSize=100`;
      } else {
        // Owned album: same path, no /shared/ prefix
        path = `/albums/${albumId}/mediaItems?pageSize=100`;
      }
    } else {
      // No album context: list all media items in the user's library
      path = `/mediaItems?pageSize=100`;
    }
    if (pageToken) path += `&pageToken=${pageToken}`;

    const data: ListMediaItemsResponse = await apiFetch(path, token, signal);

    if (data.mediaItems) {
      for (const item of data.mediaItems) {
        const isVideo = item.mimeType?.startsWith('video/') || item.mediaMetadata?.video?.status === 'READY';

        let videoUrl = null;
        if (isVideo) {
          videoUrl = `${item.baseUrl}=dv`;
        }

        items.push({
          url: `${item.baseUrl}=w1200`,
          photoId: item.id,
          timestamp: item.mediaMetadata?.creationTime
            ? new Date(item.mediaMetadata.creationTime).getTime()
            : null,
          title: item.filename || 'Google Photos',
          author: 'Google Photos',
          category: 'Synced',
          description: item.description || `From Google Photos album`,
          isVideo,
          videoUrl,
          originalUrl: item.baseUrl,
        });
      }
    }

    pageToken = data.nextPageToken;
  } while (pageToken);

  return items;
}

/**
 * Fetch ALL media items in a shared album via mediaItems:search with albumId filter.
 * This is the official Google Photos Library API approach and is more reliable than
 * /sharedAlbums/{id}/mediaItems (which can return empty for some shared album types).
 */
export async function fetchSharedAlbumViaSearch(token: string, albumId: string, signal?: AbortSignal): Promise<any[]> {
  const items: any[] = [];
  let pageToken: string | undefined;

  do {
    const body: any = { albumId, pageSize: 100 };
    if (pageToken) body.pageToken = pageToken;

    const res = await fetch(`${PHOTOS_API_BASE}/mediaItems:search`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`mediaItems:search failed: ${res.status} ${err.slice(0, 200)}`);
    }

    const data: ListMediaItemsResponse = await res.json();

    if (data.mediaItems) {
      for (const item of data.mediaItems) {
        const isVideo = item.mimeType?.startsWith('video/') || item.mediaMetadata?.video?.status === 'READY';

        let videoUrl = null;
        if (isVideo) {
          videoUrl = `${item.baseUrl}=dv`;
        }

        items.push({
          url: `${item.baseUrl}=w1200`,
          photoId: item.id,
          timestamp: item.mediaMetadata?.creationTime
            ? new Date(item.mediaMetadata.creationTime).getTime()
            : null,
          title: item.filename || 'Google Photos',
          author: 'Google Photos',
          category: 'Synced',
          description: item.description || `From Google Photos album`,
          isVideo,
          videoUrl,
          originalUrl: item.baseUrl,
        });
      }
    }

    pageToken = data.nextPageToken;
  } while (pageToken);

  return items;
}

function selectDiverseItems(items: any[], limit: number = 200): any[] {
  if (items.length <= limit) return [...items];

  const groups: Record<string, any[]> = {};
  let noDateIdx = 0;
  for (const item of items) {
    const key = item.timestamp
      ? new Date(item.timestamp).toISOString().slice(0, 10)
      : `__no_date__${String(noDateIdx++ % 100).padStart(3, '0')}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }

  const uniqueDays = Object.keys(groups).length;
  let result: any[];

  if (uniqueDays >= limit) {
    const pool: any[] = [];
    for (const [, group] of Object.entries(groups)) {
      pool.push(group[Math.floor(Math.random() * group.length)]);
    }
    result = pool.sort(() => Math.random() - 0.5).slice(0, limit);
  } else {
    const perDay = Math.ceil(limit / uniqueDays);
    const pool: any[] = [];
    for (const [, group] of Object.entries(groups)) {
      const shuffled = [...group].sort(() => Math.random() - 0.5);
      pool.push(...shuffled.slice(0, Math.min(perDay, shuffled.length)));
    }
    if (pool.length < limit) {
      const usedIds = new Set(pool.map(p => p.photoId));
      const remaining = items.filter(i => !usedIds.has(i.photoId));
      pool.push(...remaining.sort(() => Math.random() - 0.5).slice(0, limit - pool.length));
    }
    result = pool.sort(() => Math.random() - 0.5).slice(0, limit);
  }

  return result;
}

export async function syncAlbumViaOAuth(
  token: string,
  albumUrl: string,
  signal?: AbortSignal
): Promise<{ images: any[]; albumName: string; stats: any; diagnostic: string[] }> {
  const diagnostic: string[] = [];

  try {

  let resolvedUrl = albumUrl;
  if (albumUrl.includes('photos.app.goo.gl')) {
    try {
      diagnostic.push(`Expanding shortened URL: ${albumUrl}`);
      const res = await fetch('/api/resolve-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: albumUrl }),
        signal,
      });
      if (res.ok) {
        const data = await res.json();
        if (data.resolvedUrl) {
          resolvedUrl = data.resolvedUrl;
          diagnostic.push(`Expanded URL: ${resolvedUrl}`);
        }
      } else {
        diagnostic.push(`⚠ Failed to resolve shortened URL (status ${res.status})`);
      }
    } catch (e: any) {
      diagnostic.push(`⚠ Error resolving shortened URL: ${e.message}`);
    }
  }

  // Diagnostic: check token scopes
  try {
    const tokenInfoRes = await fetch('https://oauth2.googleapis.com/tokeninfo?access_token=' + token, { signal });
    const tokenInfo = await tokenInfoRes.json();
    diagnostic.push(`Token scopes: ${tokenInfo.scope || 'NONE'}`);
    diagnostic.push(`Token email: ${tokenInfo.email || 'unknown'}`);
    console.log('[OAuth] Token scopes:', tokenInfo.scope || 'NONE');
    if (!tokenInfo.scope || !tokenInfo.scope.includes('photoslibrary')) {
      diagnostic.push('⚠ Token DOES NOT include photoslibrary scope!');
      console.error('[OAuth] Token DOES NOT include photoslibrary scope! Scopes:', tokenInfo.scope);
    } else if (tokenInfo.scope.includes('photoslibrary.readonly') && !tokenInfo.scope.includes('photoslibrary ')) {
      diagnostic.push('⚠ Token has read-only scope — need full photoslibrary scope to join shared albums');
    }
  } catch (e: any) {
    diagnostic.push(`Token info check failed: ${e.message}`);
    console.warn('[OAuth] Could not verify token scopes:', e);
  }

  // Extract album key from the share URL
  const albumIdMatch = resolvedUrl.match(/\/share\/([A-Za-z0-9_-]+)/);
  const albumKey = albumIdMatch ? albumIdMatch[1] : null;
  diagnostic.push(`Album key: ${albumKey ? albumKey.slice(0, 30) + '...' : 'not found'}`);

  let items: any[] = [];
  let albumName = 'Google Photos Album';

  // Strategy 0: Try to join the shared album (requires full photoslibrary scope)
  if (albumKey) {
    try {
      diagnostic.push(`🔗 Attempting to join shared album via OAuth...`);
      const joinedAlbum = await joinSharedAlbum(token, resolvedUrl, signal);
      if (joinedAlbum) {
        diagnostic.push(`✅ Joined shared album: "${joinedAlbum.title}" (${joinedAlbum.mediaItemsCount} items)`);
        albumName = joinedAlbum.title;
        items = await fetchAllMediaItems(token, joinedAlbum.id, true, signal);
        diagnostic.push(`✅ /sharedAlbums/{id}/mediaItems returned ${items.length} media items`);

        // Fallback: if direct shared-album endpoint returns 0, use mediaItems:search
        if (items.length === 0) {
          try {
            diagnostic.push('🔄 Trying mediaItems:search fallback...');
            const searchItems = await fetchSharedAlbumViaSearch(token, joinedAlbum.id, signal);
            if (searchItems.length > 0) {
              items = searchItems;
              diagnostic.push(`✅ mediaItems:search returned ${items.length} media items`);
            } else {
              diagnostic.push('❌ mediaItems:search also returned 0 items');
            }
          } catch (err: any) {
            diagnostic.push(`❌ mediaItems:search error: ${err.message}`);
          }
        }
      } else {
        diagnostic.push('❌ Could not join shared album');
      }
    } catch (err: any) {
      diagnostic.push(`❌ joinSharedAlbum error: ${err.message}`);
      console.warn('[OAuth] joinSharedAlbum failed:', err.message);
    }
  }

  // Strategy 1: List shared albums (works if user has already saved the album)
  if (items.length === 0) {
    try {
      const sharedAlbums = await listSharedAlbums(token, signal);
      diagnostic.push(`📋 User has ${sharedAlbums.length} shared albums`);
      const match = sharedAlbums.find(a => {
        const shareableUrl = a.shareInfo?.shareableUrl?.toLowerCase() || '';
        const productUrl = a.productUrl?.toLowerCase() || '';
        const lowerUrl = resolvedUrl.toLowerCase();
        const inputUrl = albumUrl.toLowerCase();
        return (
          (shareableUrl && (lowerUrl.includes(shareableUrl) || shareableUrl.includes(lowerUrl) || inputUrl.includes(shareableUrl) || shareableUrl.includes(inputUrl))) ||
          (productUrl && (lowerUrl.includes(productUrl) || productUrl.includes(lowerUrl) || inputUrl.includes(productUrl) || productUrl.includes(inputUrl))) ||
          (albumKey && (a.id === albumKey || a.id.includes(albumKey) || albumKey.includes(a.id)))
        );
      }) || null;

      if (match) {
        diagnostic.push(`✅ Found matching shared album: "${match.title}" (${match.mediaItemsCount} items)`);
        albumName = match.title;
        items = await fetchAllMediaItems(token, match.id, true, signal);
        if (items.length > 0) {
          diagnostic.push(`✅ Shared album returned ${items.length} media items`);
        } else {
          diagnostic.push('⚠ Shared album returned 0 media items — trying mediaItems:search...');
          try {
            const searchItems = await fetchSharedAlbumViaSearch(token, match.id, signal);
            if (searchItems.length > 0) {
              items = searchItems;
              diagnostic.push(`✅ mediaItems:search returned ${items.length} media items`);
            } else {
              diagnostic.push('❌ mediaItems:search also returned 0 items');
            }
          } catch (err: any) {
            diagnostic.push(`❌ mediaItems:search error: ${err.message}`);
          }
        }
      } else {
        diagnostic.push('❌ No matching shared album found.');
        if (sharedAlbums.length > 0) {
          diagnostic.push(`   Available shared albums: ${sharedAlbums.map(a => `"${a.title}"`).join(', ')}`);
        }
        diagnostic.push('   Tip: Open the album in Google Photos, click "Save to library", then Sync again.');
      }
    } catch (err: any) {
      diagnostic.push(`❌ listSharedAlbums error: ${err.message}`);
      console.warn('[OAuth] Shared album list failed:', err.message);
    }
  }

  // Strategy 2: Owned albums list
  if (items.length === 0) {
    try {
      const albums = await listAlbums(token, signal);
      diagnostic.push(`📋 User has ${albums.length} owned albums`);
      const match = albums.find(a => {
        const productUrl = a.productUrl?.toLowerCase() || '';
        const lowerUrl = resolvedUrl.toLowerCase();
        const inputUrl = albumUrl.toLowerCase();
        return (
          (productUrl && (lowerUrl.includes(productUrl) || productUrl.includes(lowerUrl) || inputUrl.includes(productUrl) || productUrl.includes(inputUrl))) ||
          (albumKey && (a.id === albumKey || a.id.includes(albumKey) || albumKey.includes(a.id)))
        );
      }) || null;
      if (match) {
        diagnostic.push(`✅ Found matching owned album: "${match.title}" (${match.mediaItemsCount} items)`);
        albumName = match.title;
        items = await fetchAllMediaItems(token, match.id);
      } else {
        diagnostic.push('❌ No matching owned album');
      }
    } catch (err: any) {
      diagnostic.push(`❌ listAlbums error: ${err.message}`);
      console.warn('[OAuth] Album list match failed:', err.message);
    }
  }

  // Strategy 3: All media items (last-resort fallback)
  if (items.length === 0) {
    try {
      diagnostic.push('🔍 Falling back to all media items in user\'s library');
      items = await fetchAllMediaItems(token, undefined, undefined, signal);
      if (items.length > 0) {
        diagnostic.push(`✅ Found ${items.length} total media items in library`);
        diagnostic.push('ℹ These are ALL items in your library, not filtered to the shared album.');
      } else {
        diagnostic.push('❌ All media items returned 0 items');
      }
    } catch (err: any) {
      diagnostic.push(`❌ All media items error: ${err.message}`);
      console.warn('[OAuth] All media items failed:', err.message);
    }
  }

  if (items.length === 0) {
    diagnostic.push('');
    diagnostic.push('💡 To fix: open the shared album link in Google Photos while signed into the SAME Google account, then click ⋮ → "Save to your library". After that, sync again.');
  }

  // Strategy 4: Try direct album access with album key
  if (items.length === 0 && albumKey) {
    try {
      diagnostic.push(`🔍 Trying direct album access with key: ${albumKey.slice(0, 30)}...`);
      items = await fetchAllMediaItems(token, albumKey, false, signal);
      if (items.length > 0) {
        diagnostic.push(`✅ Direct album access returned ${items.length} items`);
        albumName = 'Shelter';
      } else {
        diagnostic.push('❌ Direct album access returned 0 items');
      }
    } catch (err: any) {
      diagnostic.push(`❌ Direct album access error: ${err.message}`);
      console.warn('[OAuth] Direct album access failed:', err.message);
    }
  }

  const selected = selectDiverseItems(items, 5000);

  const days = new Set(items.map((i: any) =>
    i.timestamp ? new Date(i.timestamp).toISOString().slice(0, 10) : 'no-date'
  ));
  const usedDays = new Set(selected.map((i: any) =>
    i.timestamp ? new Date(i.timestamp).toISOString().slice(0, 10) : 'no-date'
  ));

  const totalAll = items.length;
  const stats = {
    totalAll,
    uniqueDays: days.size,
    selectedCount: selected.length,
    usedDays: usedDays.size,
    limit: 5000,
    videoCount: items.filter((i: any) => i.isVideo).length,
  };

  diagnostic.push(`📊 Result: ${totalAll} total items, showing ${selected.length} across ${usedDays.size} days`);
  console.log(`[OAuth] Sync complete: ${totalAll} total → showing ${selected.length} across ${usedDays.size} days`);

  return { images: selected, albumName, stats, diagnostic };
  } catch (err: any) {
    diagnostic.push(`❌ syncAlbumViaOAuth error: ${err.message}`);
    console.error('[OAuth] syncAlbumViaOAuth failed:', err);
    return { images: [], albumName: 'Error', stats: null, diagnostic };
  }
}
