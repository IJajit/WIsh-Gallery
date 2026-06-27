# Google Photos Shared Album Sync — Design Spec

## Overview

Allow users to paste a Google Photos shared album link into the wish board panel, and have all photos from that album synced into the 3D carousel automatically. The first version uses a backend proxy to parse the shared album page (no OAuth required).

## Architecture

```
[Browser] --POST /api/parse-album { url }--> [Express server]
[Express] --fetch page HTML-----------------> [Google Photos CDN]
[Express] <--extract image JSON-------------- [Google Photos CDN]
[Express] --return { images[] }-------------> [Browser]
[Browser] --add images to current wish board-> [localStorage + Carousel3D]
```

## Backend

- Add a new route `POST /api/parse-album` to the existing Express server
- Accepts `{ url: string }` in the request body
- Validates the URL matches `photos.app.goo.gl` or `photos.google.com/share/`
- Fetches the HTML page server-side using `fetch()`
- Extracts the embedded JSON data from `<script>` tags by matching the `AF_initDataCallback` pattern (Google Photos shared album pages embed image data using this format)
- Parses the image metadata: full-resolution image URLs, titles, and descriptions from the callback data
- Returns `{ images: Array<{ url: string, title: string, author: string, category: string, description: string }> }`
- On error, returns `{ error: string }` with appropriate status code

## Frontend

- Add a "Link Google Photos Album" section in the wish board panel (below the URL adder)
- Contains a text input for the album URL and a "Sync" button
- On submit:
  1. Call `POST /api/parse-album` with the URL
  2. On success: prepend all returned photos to the current wish board's items list
  3. On error: show an inline error message
- Uses the existing `setWishAlbums` state to append items (same pattern as URL upload)
- Loading state on the button during fetch
- Existing images have a `source` field set to `'google-photos'` for future differentiation

## Error Handling

- Invalid URL → inline error "Please enter a valid Google Photos shared album link"
- Network/server error → "Could not fetch album. The link may be private or invalid."
- Empty album → "This album appears to be empty."
- Rate limiting → reuse existing alert pattern

## Files Changed

| File | Change |
|------|--------|
| `src/App.tsx` | Add shared album input UI, sync handler, loading state |
| `server.js` (new) | Express server with `/api/parse-album` route |
| `package.json` | Add `server` script to run both Vite + Express |
| `vite.config.ts` | Proxy `/api` to Express during dev |

## Out of Scope (v1)

- OAuth / Google Photos Library API
- Two-way sync
- Automatic periodic refresh
- Multiple album linking
