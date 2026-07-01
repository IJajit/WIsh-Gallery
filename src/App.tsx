/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ArrowLeft, ArrowRight, Link2, Upload, Trash2, FolderPlus, Heart, Menu, Image, Shuffle, Loader2, LogIn, LogOut } from 'lucide-react';
import { getGalleryItems } from './data';
import { ImageItem, CarouselMode } from './types';
import Carousel3D from './components/Carousel3D';
import Controls from './components/Controls';
import {
  isGoogleSignedIn,
  signInWithGoogle,
  signOutGoogle,
  getGoogleAccessToken,
  syncAlbumViaOAuth,
} from './googlePhotos';

interface WishAlbum {
  id: string;
  name: string;
  items: ImageItem[];
}

const DEFAULT_WISHES: ImageItem[] = [
  {
    id: 'wish-1',
    url: 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=600&q=80',
    title: 'Dream Villa by the Sea',
    author: 'Luxury Retreat',
    category: 'Travel Wish',
    description: 'A beautiful white modernist villa perched above the crystal blue Mediterranean waters, embodying calm, spaciousness, and luxury.'
  },
  {
    id: 'wish-2',
    url: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=600&q=80',
    title: 'Inspiring Creative Studio',
    author: 'Workspace',
    category: 'Career Wish',
    description: 'An elegant, sunlit double-height designer workspace featuring minimalist timber furniture, warm desk lamps, and lush green fiddle leaf figs.'
  },
  {
    id: 'wish-3',
    url: 'https://images.unsplash.com/photo-1472214222541-d510753a4907?auto=format&fit=crop&w=600&q=80',
    title: 'Wanderlust in Switzerland',
    author: 'Alpine Exploration',
    category: 'Adventure Wish',
    description: 'Walking through a sea of wild buttercups in a vibrant Swiss alpine valley, surrounded by dramatic snowcapped peaks and fresh clean air.'
  },
  {
    id: 'wish-4',
    url: 'https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=600&q=80',
    title: 'Vintage Sports Convertible',
    author: 'Heritage Design',
    category: 'Passion Wish',
    description: 'An iconic vintage roadster in pristine emerald-green metallic, ready for winding weekend drives along the rugged coastline.'
  },
  {
    id: 'wish-5',
    url: 'https://images.unsplash.com/photo-1513542789411-b6a5d4f31634?auto=format&fit=crop&w=600&q=80',
    title: 'Modern Art Exhibition',
    author: 'Artistic Pursuit',
    category: 'Creation Wish',
    description: 'Visiting world-class contemporary art installations to spark fresh inspiration and cultivate geometric aesthetic appreciation.'
  },
  {
    id: 'wish-6',
    url: 'https://images.unsplash.com/photo-1490730141103-6cac27aaab94?auto=format&fit=crop&w=600&q=80',
    title: 'Sunset Peace & Mindfulness',
    author: 'Zen Balance',
    category: 'Personal Wish',
    description: 'Sitting peacefully during a golden hour sunset, taking in the calm breeze, reflecting on goals, and enjoying the present moment.'
  }
];

export default function App() {
  const [tilt, setTilt] = useState<number>(30);
  const [radius, setRadius] = useState<number>(350);
  const [galleryType] = useState<'architecture' | 'art' | 'nature' | 'mixed'>('mixed');
  const [mode] = useState<CarouselMode>('scroll');
  const [activeImage, setActiveImage] = useState<ImageItem | null>(null);
  const [selectedImage, setSelectedImage] = useState<ImageItem | null>(null);
  const [gallerySource, setGallerySource] = useState<'default' | 'wish'>('wish');
  const [carouselCount, setCarouselCount] = useState<number>(200);

  const [wishAlbums, setWishAlbums] = useState<WishAlbum[]>(() => {
    try {
      const saved = localStorage.getItem('wish_photo_gallery_albums');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.error('Error loading wish albums:', e);
    }
    return [{ id: 'default-wishlist', name: 'My Core Goals & Wishes', items: DEFAULT_WISHES }];
  });

  const [activeWishAlbumId, setActiveWishAlbumId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('wish_photo_gallery_albums');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && Array.isArray(parsed) && parsed.length > 0) {
          return parsed[0].id;
        }
      }
    } catch (_) {}
    return 'default-wishlist';
  });

  const [isAddingItem, setIsAddingItem] = useState<boolean>(false);
  const [newItemTitle, setNewItemTitle] = useState<string>('');
  const [newItemUrl, setNewItemUrl] = useState<string>('');
  const [newItemCategory, setNewItemCategory] = useState<string>('Personal');
  const [newItemDesc, setNewItemDesc] = useState<string>('');
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [isCreatingAlbum, setIsCreatingAlbum] = useState<boolean>(false);
  const [newAlbumName, setNewAlbumName] = useState<string>('');
  const [isPhotosPanelOpen, setIsPhotosPanelOpen] = useState<boolean>(false);
  const [isBoardItemsExpanded, setIsBoardItemsExpanded] = useState<boolean>(true);
  const [albumUrls, setAlbumUrls] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('wish_gphotos_album_urls');
      if (saved) { const p = JSON.parse(saved); if (Array.isArray(p) && p.length > 0 && p.some((u: string) => u.trim().length > 0)) return p; }
    } catch {}
    return [''];
  });
  const [albumLoading, setAlbumLoading] = useState<boolean>(false);
  const [albumError, setAlbumError] = useState<string>('');
  const [refreshKey, setRefreshKey] = useState<number>(0);
  const [lastSyncedAlbumUrls, setLastSyncedAlbumUrls] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('wish_gphotos_last_urls');
      if (saved) { const p = JSON.parse(saved); if (Array.isArray(p) && p.length > 0) return p; }
    } catch {}
    return [];
  });

  const [syncStats, setSyncStats] = useState<{ totalAll: number; uniqueDays: number; selectedCount: number; usedDays: number; videoCount?: number } | null>(null);
  const syncStatsTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const [googleSignedIn, setGoogleSignedIn] = useState<boolean>(isGoogleSignedIn());
  const [googleClientId, setGoogleClientId] = useState<string>('');
  const [allowedEmails, setAllowedEmails] = useState<string>('ishanjajit@gmail.com');
  const [syncDiagnostics, setSyncDiagnostics] = useState<string[]>([]);

  const [scrapeServiceUrl, setScrapeServiceUrl] = useState<string>('');
  useEffect(() => {
    fetch('/api/config')
      .then(r => r.json())
      .then(cfg => {
        if (cfg.googleClientId) setGoogleClientId(cfg.googleClientId);
        if (cfg.scrapeServiceUrl) setScrapeServiceUrl(cfg.scrapeServiceUrl);
        if (cfg.allowedEmails) setAllowedEmails(cfg.allowedEmails);
      })
      .catch(() => {});
  }, []);

  const showSyncStats = (stats: typeof syncStats) => {
    setSyncStats(stats);
    if (syncStatsTimerRef.current) clearTimeout(syncStatsTimerRef.current);
    syncStatsTimerRef.current = setTimeout(() => setSyncStats(null), 5000);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const wishPanelRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!isPhotosPanelOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (wishPanelRef.current && !wishPanelRef.current.contains(e.target as Node)) {
        setIsPhotosPanelOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isPhotosPanelOpen]);

  useEffect(() => {
    localStorage.setItem('wish_photo_gallery_albums', JSON.stringify(wishAlbums));
  }, [wishAlbums]);

  useEffect(() => {
    localStorage.setItem('wish_gphotos_album_urls', JSON.stringify(albumUrls));
  }, [albumUrls]);

  useEffect(() => {
    if (lastSyncedAlbumUrls.length > 0) localStorage.setItem('wish_gphotos_last_urls', JSON.stringify(lastSyncedAlbumUrls));
  }, [lastSyncedAlbumUrls]);

  const activeWishAlbum = useMemo(() => {
    return wishAlbums.find(a => a.id === activeWishAlbumId) || wishAlbums[0];
  }, [wishAlbums, activeWishAlbumId]);

  const baseImages = useMemo(() => getGalleryItems(galleryType), [galleryType]);

  const images = useMemo(() => {
    let sourceList: ImageItem[] = [];
    if (gallerySource === 'wish' && activeWishAlbum) {
      if (activeWishAlbum.items.length > 0) {
        sourceList = activeWishAlbum.items;
      } else {
        // Generate 24 empty white boxes
        sourceList = Array.from({ length: 24 }, (_, i) => ({
          id: `dummy-${activeWishAlbumId}-${i}`,
          url: '',
          title: 'Empty Goal Box',
          author: '',
          category: 'Wish',
          description: 'Empty visual card. Drag-and-drop or upload an image to populate it.'
        }));
      }
    } else {
      sourceList = baseImages;
    }
    if (sourceList.length === 0) return [];
    const shuffled = [...sourceList];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, carouselCount);
  }, [baseImages, gallerySource, activeWishAlbum, activeWishAlbumId, refreshKey, carouselCount]);

  useEffect(() => {
    if (images.length > 0) setActiveImage(images[0]);
  }, [images]);

  const handleFileUpload = (file: File) => {
    if (!file.type.startsWith('image/')) { alert('Please upload a valid image file.'); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64Url = e.target?.result as string;
      if (base64Url) {
        const newItem: ImageItem = { id: `wish-upload-${Date.now()}`, url: base64Url, title: file.name.split('.')[0] || 'My Uploaded Wish', author: 'Me', category: 'Uploaded', description: `Custom goal uploaded on ${new Date().toLocaleDateString()}.` };
        setWishAlbums(prev => prev.map(album => album.id === activeWishAlbumId ? { ...album, items: [newItem, ...album.items] } : album));
        setGallerySource('wish');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleAddItemByUrl = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemUrl.trim()) return;
    const newItem: ImageItem = { id: `wish-url-${Date.now()}`, url: newItemUrl.trim(), title: newItemTitle.trim() || 'My Wish', author: 'Inspiration', category: newItemCategory || 'Personal', description: newItemDesc.trim() || 'Inspirational visual goal added to your active wish board.' };
    setWishAlbums(prev => prev.map(album => album.id === activeWishAlbumId ? { ...album, items: [newItem, ...album.items] } : album));
    setNewItemTitle(''); setNewItemUrl(''); setNewItemCategory('Personal'); setNewItemDesc(''); setIsAddingItem(false); setGallerySource('wish');
  };

  const handleDeleteItem = (itemId: string) => {
    setWishAlbums(prev => prev.map(album => {
      if (album.id === activeWishAlbumId) {
        const baseId = itemId.split('-dup-')[0];
        return { ...album, items: album.items.filter(item => item.id !== baseId) };
      }
      return album;
    }));
  };

  const handleCreateAlbum = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAlbumName.trim()) return;
    const newId = `wish-album-${Date.now()}`;
    setWishAlbums(prev => [...prev, { id: newId, name: newAlbumName.trim(), items: [] }]);
    setActiveWishAlbumId(newId); setNewAlbumName(''); setIsCreatingAlbum(false); setGallerySource('wish');
  };

  const handleDeleteAlbum = (albumId: string) => {
    if (wishAlbums.length <= 1) { alert("You need to keep at least one wish album active."); return; }
    const filtered = wishAlbums.filter(a => a.id !== albumId);
    setWishAlbums(filtered); setActiveWishAlbumId(filtered[0].id);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFileUpload(e.dataTransfer.files[0]);
  };

  const handleGoogleSignIn = async () => {
    if (!googleClientId) {
      setAlbumError('Google Client ID not configured. Add GOOGLE_CLIENT_ID env var in Vercel dashboard.');
      return;
    }
    try {
      setAlbumLoading(true);
      setAlbumError('');
      await signInWithGoogle(googleClientId);
      setGoogleSignedIn(true);
    } catch (err: any) {
      setAlbumError(err.message || 'Google sign-in failed.');
    } finally {
      setAlbumLoading(false);
    }
  };

  const handleGoogleSignOut = () => {
    signOutGoogle();
    setGoogleSignedIn(false);
    // Clear all synced data on sign-out
    setWishAlbums(prev => prev.map(album => ({
      ...album,
      items: album.items.filter(item => !item.id.startsWith('google-photos-')),
    })));
    setAlbumUrls(['']);
    setLastSyncedAlbumUrls([]);
    setAlbumError('');
    setSyncStats(null);
    setSyncDiagnostics([]);
    localStorage.removeItem('wish_gphotos_album_urls');
    localStorage.removeItem('wish_gphotos_last_urls');
  };

  const handleSyncAlbum = async () => {
    if (albumLoading) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      setAlbumLoading(false);
      setAlbumError('Sync cancelled by user.');
      return;
    }

    const validUrls = albumUrls.map(u => u.trim()).filter(u => u.length > 0);
    if (validUrls.length === 0) return;
    setAlbumLoading(true);
    setAlbumError('');
    setSyncDiagnostics([]);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      if (googleSignedIn) {
        const token = getGoogleAccessToken();
        if (!token) {
          setAlbumError('Google sign-in expired. Please sign in again.');
          setAlbumLoading(false);
          return;
        }

        // 1. Fetch user profile from Google to verify email
        const tokenInfoRes = await fetch('https://oauth2.googleapis.com/tokeninfo?access_token=' + token, { signal: controller.signal });
        if (!tokenInfoRes.ok) {
          throw new Error('Google session expired. Please sign out and sign in again.');
        }
        const tokenInfo = await tokenInfoRes.json();
        const userEmail = tokenInfo.email;
        if (!userEmail) {
          throw new Error('Could not retrieve your Google account email.');
        }

        // 2. Security Check: verify if the logged-in email is authorized
        const allowedList = allowedEmails.toLowerCase().split(',').map((e: string) => e.trim());
        if (!allowedList.includes(userEmail.toLowerCase())) {
          throw new Error(`Access Denied: Your Google account (${userEmail}) is not authorized to sync albums on this site.`);
        }

        // 3. Since the Google Photos Library API deprecated broad read scopes as of March 31, 2025 (returning 403 scope errors),
        // we use the public scraper endpoint to retrieve the photos, securing it behind the email validation above.
        const scraperUrl = scrapeServiceUrl || '';
        const endpoint = scraperUrl
          ? `${scraperUrl.replace(/\/$/, '')}/scrape`
          : '/api/scrape-album';

        const res = await fetch(endpoint + '?_=' + Date.now(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ urls: validUrls }),
          signal: controller.signal,
        });

        const data = await res.json();
        if (!res.ok || data.error) {
          throw new Error(data.error || 'Could not fetch albums.');
        }
        if (!data.images || data.images.length === 0) {
          throw new Error('No photos found in these albums. Make sure the album is public/shared.');
        }

        const newItems = data.images.map((img: any, i: number) => ({
          id: `google-photos-${Date.now()}-${i}`,
          url: img.url,
          title: img.title || 'Google Photos',
          author: 'Google Photos',
          category: 'Synced',
          description: img.description || 'Imported from Google Photos shared album.',
          timestamp: img.timestamp || undefined,
          isVideo: img.isVideo || undefined,
          videoUrl: img.videoUrl || undefined,
        }));

        setWishAlbums(prev => prev.map(album => {
          if (album.id !== activeWishAlbumId) return album;
          const nonSynced = album.items.filter(item => !item.id.startsWith('google-photos-'));
          return { ...album, items: [...newItems, ...nonSynced] };
        }));
        setGallerySource('wish');
        setLastSyncedAlbumUrls(validUrls);
        if (data.stats) showSyncStats(data.stats);
        return;
      } else {
        throw new Error('Please sign in with Google to sync external albums.');
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setAlbumError('Sync cancelled.');
      } else {
        setAlbumError(err?.message || 'Sync failed. Try again.');
      }
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      setAlbumLoading(false);
    }
  };

  const refreshStartRef = useRef<number>(0);

  const handleRefreshPhotos = async () => {
    if (albumLoading) return;
    const totalItems = activeWishAlbum ? activeWishAlbum.items.length : 0;
    if (totalItems === 0) return;
    refreshStartRef.current = Date.now();
    setAlbumLoading(true);
    // Just reshuffle locally — pick a new random 200 from the already-synced pool
    setRefreshKey(k => k + 1);
    const elapsed = Date.now() - refreshStartRef.current;
    if (elapsed < 600) {
      setTimeout(() => setAlbumLoading(false), 600 - elapsed);
    } else {
      setAlbumLoading(false);
    }
  };

  const handlePrevImage = () => {
    if (!selectedImage || images.length === 0) return;
    const idx = images.findIndex((img) => img.id === selectedImage.id);
    if (idx !== -1) { const prev = (idx - 1 + images.length) % images.length; setSelectedImage(images[prev]); setActiveImage(images[prev]); }
  };

  const handleNextImage = () => {
    if (!selectedImage || images.length === 0) return;
    const idx = images.findIndex((img) => img.id === selectedImage.id);
    if (idx !== -1) { const next = (idx + 1) % images.length; setSelectedImage(images[next]); setActiveImage(images[next]); }
  };

  // Clear old cached data on version mismatch to force re-sync
  useEffect(() => {
    const VERSION = 3;
    const stored = localStorage.getItem('wish_gallery_version');
    if (stored !== String(VERSION)) {
      localStorage.removeItem('wish_photo_gallery_albums');
      localStorage.removeItem('wish_gphotos_last_urls');
      localStorage.setItem('wish_gallery_version', String(VERSION));
    }
  }, []);

  useEffect(() => {
    if (selectedImage) {
      localStorage.setItem('debug_selected_image', JSON.stringify({
        id: selectedImage.id,
        hasVideoUrl: !!selectedImage.videoUrl,
        videoUrl: selectedImage.videoUrl ? selectedImage.videoUrl.slice(0, 80) : null,
        isVideo: selectedImage.isVideo,
        url: selectedImage.url?.slice(0, 80),
        hasTimestamp: !!selectedImage.timestamp,
        hasLocation: !!selectedImage.location,
        idPrefix: selectedImage.id?.slice(0, 20),
      }));
    }
  }, [selectedImage]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedImage(null);
      else if (e.key === 'ArrowLeft' && selectedImage) handlePrevImage();
      else if (e.key === 'ArrowRight' && selectedImage) handleNextImage();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedImage, images]);

  return (
    <div id="app-container" className="relative w-full min-h-screen bg-white flex flex-col justify-center items-center overflow-hidden select-none font-sans text-neutral-900">
      <div
        id="app-content-wrapper"
        className="relative w-full min-h-screen flex flex-col justify-between items-center transition-all duration-700 ease-out"
        style={{ filter: selectedImage ? 'blur(4px)' : 'none', transform: selectedImage ? 'scale(0.98)' : 'scale(1)', pointerEvents: selectedImage ? 'none' : 'auto' }}
      >
        <main id="app-main-stage" className="relative w-full flex-1 flex items-center justify-center z-10 overflow-visible py-4 sm:py-6">
          <div key={`carousel-wrapper-${refreshKey}`}>
            <Carousel3D
              images={images}
              mode={mode}
              tilt={tilt}
              radius={radius}
              selectedImage={selectedImage}
              onCloseSelectedImage={() => setSelectedImage(null)}
              onImageClick={(img) => setSelectedImage(img)}
              onActiveImageChange={(img) => setActiveImage(img)}
              onTiltChange={setTilt}
            />
          </div>
        </main>

        <Controls tilt={tilt} setTilt={setTilt} radius={radius} setRadius={setRadius} carouselCount={carouselCount} setCarouselCount={setCarouselCount} />

        <div id="photos-sync-root" ref={wishPanelRef} className="absolute bottom-20 right-6 z-30 select-none">
          <div className="flex flex-col items-end gap-2">
            <motion.button
              id="refresh-btn"
              onClick={handleRefreshPhotos}
              disabled={albumLoading}
              whileHover={albumLoading ? {} : { scale: 1.03 }}
              whileTap={albumLoading ? {} : { scale: 0.97 }}
              className="w-12 h-12 rounded-lg bg-white border border-[#cfc4c5] hover:border-black text-neutral-600 hover:text-black transition-all duration-300 flex items-center justify-center shadow-[0_2px_10px_rgba(0,0,0,0.02)] disabled:cursor-wait disabled:opacity-70 relative cursor-pointer"
              title={albumLoading ? 'Syncing...' : 'Shuffle & Refresh Photos'}
            >
              {albumLoading ? (
                <span className="block w-[18px] h-[18px] border-2 border-neutral-400 border-t-neutral-900 rounded-full" style={{ animation: 'spin 0.7s linear infinite' }} />
              ) : (
                <Shuffle size={18} />
              )}
            </motion.button>
            <motion.button
              id="photos-trigger-btn"
              onClick={() => setIsPhotosPanelOpen(!isPhotosPanelOpen)}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className="w-12 h-12 rounded-lg bg-white border border-[#cfc4c5] hover:border-black text-neutral-600 hover:text-black cursor-pointer transition-all duration-300 flex items-center justify-center shadow-[0_2px_10px_rgba(0,0,0,0.02)]"
              title="Manage Wish Board"
            >
              {isPhotosPanelOpen ? <X size={18} /> : gallerySource === 'wish' ? <Heart size={18} className="text-rose-500 fill-rose-500" /> : <Menu size={18} />}
            </motion.button>
          </div>

          <AnimatePresence>
            {isPhotosPanelOpen && (
              <motion.div
                id="photos-sync-panel"
                initial={{ opacity: 0, y: 12, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.98 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
                className="absolute bottom-14 right-0 w-[300px] sm:w-[340px] max-h-[75vh] overflow-y-auto custom-scrollbar bg-white rounded-xl border border-[#cfc4c5] p-5 shadow-[0_15px_40px_rgba(0,0,0,0.08)] flex flex-col gap-4 text-neutral-800"
              >
                <div className="space-y-5">
                  {/* Top section: Wish Board Selector */}
                  <div className="space-y-3">
                    {isCreatingAlbum ? (
                      <form onSubmit={handleCreateAlbum} className="flex gap-1.5 bg-white border border-[#cfc4c5] p-1 rounded-lg">
                        <input
                          type="text"
                          required
                          autoFocus
                          placeholder="e.g. Shelter, Living Room"
                          value={newAlbumName}
                          onChange={(e) => setNewAlbumName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') {
                              setIsCreatingAlbum(false);
                              setNewAlbumName('');
                            }
                          }}
                          className="flex-1 text-[11px] font-mono px-2 py-1 bg-transparent text-neutral-800 focus:outline-none placeholder:text-neutral-300"
                        />
                        <button type="submit" className="bg-black hover:bg-neutral-900 text-white text-[9px] px-2.5 py-1.5 font-mono font-bold uppercase rounded-md cursor-pointer transition-colors">Create</button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsCreatingAlbum(false);
                            setNewAlbumName('');
                          }}
                          className="bg-neutral-100 hover:bg-neutral-200 text-neutral-600 text-[9px] px-2.5 py-1.5 font-mono font-bold uppercase rounded-md cursor-pointer transition-colors"
                          title="Cancel creation (Escape)"
                        >
                          Cancel
                        </button>
                      </form>
                    ) : (
                      <div className="flex overflow-x-auto gap-2.5 custom-scrollbar pb-1">
                        {wishAlbums.map((album) => {
                          const isActive = album.id === activeWishAlbumId && gallerySource === 'wish';
                          return (
                            <button
                              key={album.id}
                              onClick={() => {
                                setActiveWishAlbumId(album.id);
                                setGallerySource('wish');
                              }}
                              className={`whitespace-nowrap px-4 py-2 border rounded-lg font-mono text-[9px] font-bold tracking-wider transition-all active:scale-95 cursor-pointer uppercase flex items-center justify-center ${
                                isActive
                                  ? 'bg-black text-white border-black'
                                  : 'bg-white text-neutral-700 border-[#cfc4c5] hover:border-black'
                              }`}
                            >
                              {album.name}
                            </button>
                          );
                        })}
                        {/* Inline NEW Button */}
                        <button
                          onClick={() => setIsCreatingAlbum(true)}
                          className="whitespace-nowrap px-4 py-2 border rounded-lg font-mono text-[9px] font-bold tracking-wider hover:border-black text-neutral-500 hover:text-black uppercase flex items-center justify-center gap-1 cursor-pointer transition-colors bg-white border-[#cfc4c5]"
                        >
                          <FolderPlus size={10} />
                          <span>NEW</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Board Items section card */}
                  <section className="bg-white border border-[#cfc4c5] rounded-xl overflow-hidden shadow-sm">
                    <div
                      className="px-4 py-3 flex justify-between items-center bg-white cursor-pointer select-none"
                      onClick={() => setIsBoardItemsExpanded(!isBoardItemsExpanded)}
                    >
                      <div className="flex items-center gap-1.5">
                        <h2 className="font-mono text-[10px] font-bold text-neutral-800 tracking-widest uppercase flex items-center justify-center">
                          {`BOARD ITEMS (${activeWishAlbum.items.length})`}
                        </h2>
                        <span className="material-symbols-outlined text-neutral-400 !text-[14px] flex items-center justify-center">
                          {isBoardItemsExpanded ? 'expand_less' : 'expand_more'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        {wishAlbums.length > 1 && (
                          <button
                            onClick={() => handleDeleteAlbum(activeWishAlbumId)}
                            className="text-neutral-400 hover:text-red-500 cursor-pointer transition-colors p-1 flex items-center justify-center"
                            title="Delete current board"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    </div>

                    {isBoardItemsExpanded && (
                      <div className="px-4 pb-4 pt-1.5 max-h-[190px] overflow-y-auto custom-scrollbar">
                        {activeWishAlbum.items.length === 0 ? (
                          <div className="text-[9px] font-mono text-neutral-400 italic bg-neutral-50 py-4 text-center border border-dashed border-[#cfc4c5]/30 rounded-lg">
                            No items yet. Add photos below!
                          </div>
                        ) : (
                          <div className="grid grid-cols-3 gap-2">
                            {activeWishAlbum.items.map((item) => {
                              const isVideo = !!item.videoUrl || item.isVideo;
                              return (
                                <div key={item.id} className="relative group aspect-square bg-[#e8eef6] rounded-xl overflow-hidden border border-[#cfc4c5]/30">
                                  <img
                                    src={item.url}
                                    alt={item.title}
                                    className="w-full h-full object-cover cursor-pointer"
                                    referrerPolicy="no-referrer"
                                    onClick={() => setSelectedImage(item)}
                                  />
                                  
                                  {isVideo && (
                                    <div className="absolute top-2 left-2 w-6 h-6 rounded-full bg-white/40 backdrop-blur-sm flex items-center justify-center text-neutral-800 pointer-events-none">
                                      <span className="material-symbols-outlined !text-[14px]">play_circle</span>
                                    </div>
                                  )}

                                  <button
                                    onClick={() => handleDeleteItem(item.id)}
                                    className="absolute top-2 right-2 w-6 h-6 bg-[#ba1a1a] hover:bg-red-700 text-white flex items-center justify-center cursor-pointer transition-colors rounded-md shadow-sm"
                                    title="Delete Item"
                                  >
                                    <X size={12} className="stroke-[2.5]" />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </section>

                  {gallerySource === 'wish' && (
                    <>
                      {/* Google Photos Sync Section (Link External Album) - Moved directly below board items */}
                      <section className="bg-white border border-[#cfc4c5] rounded-xl overflow-hidden shadow-sm">
                        <div className="px-4 pt-3.5 pb-1 bg-white">
                          <h2 className="font-mono text-[10px] font-bold text-neutral-800 tracking-widest uppercase">LINK EXTERNAL ALBUM</h2>
                        </div>
                        
                        <div className="px-4 pb-4 pt-2 space-y-3">
                          {googleClientId && !googleSignedIn ? (
                            <div className="flex flex-col items-center gap-3 py-3">
                              <div className="w-8 h-8 rounded-full bg-neutral-100 flex items-center justify-center">
                                <LogIn size={14} className="text-neutral-500" />
                              </div>
                              <p className="text-[10px] font-mono text-neutral-500 text-center leading-relaxed">
                                Sign in with Google to access all photos<br />
                                and videos from your shared albums
                              </p>
                              <button
                                onClick={handleGoogleSignIn}
                                disabled={albumLoading}
                                className="w-full bg-black hover:bg-neutral-900 text-white py-3 text-[9px] font-mono font-bold uppercase rounded-lg flex items-center justify-center gap-2 cursor-pointer transition-colors"
                              >
                                {albumLoading ? (
                                  <>
                                    <span className="block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    <span>SIGNING IN...</span>
                                  </>
                                ) : (
                                  <>
                                    <LogIn size={12} />
                                    <span>SIGN IN WITH GOOGLE</span>
                                  </>
                                )}
                              </button>
                              {albumError && (
                                <p className="text-[9px] font-mono text-red-500 mt-1 leading-relaxed text-center whitespace-pre-wrap">{albumError}</p>
                              )}
                            </div>
                          ) : (
                            <>
                              {googleClientId && googleSignedIn && (
                                <div className="flex items-center gap-2 pb-2 border-b border-[#cfc4c5]/30">
                                  <div className="flex items-center gap-1.5 flex-1">
                                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                                    <span className="text-[8px] font-mono text-neutral-500 uppercase tracking-wider">Connected to Google</span>
                                  </div>
                                  <button
                                    onClick={handleGoogleSignOut}
                                    className="text-[8px] font-mono text-neutral-400 hover:text-red-500 uppercase tracking-wider flex items-center gap-1 cursor-pointer transition-colors"
                                  >
                                    <LogOut size={10} />
                                    <span>Sign Out</span>
                                  </button>
                                </div>
                              )}

                              {!googleClientId && (
                                <div className="flex items-center gap-2 pb-2 border-b border-[#cfc4c5]/30">
                                  <div className="w-2 h-2 bg-amber-500 rounded-full" />
                                  <span className="text-[8px] font-mono text-neutral-500 uppercase tracking-wider leading-relaxed">
                                    Google Client ID not set. Add GOOGLE_CLIENT_ID to your env and configure OAuth at console.cloud.google.com.
                                  </span>
                                </div>
                              )}

                              {albumUrls.map((url, idx) => (
                                <div key={idx} className="relative w-full">
                                  <input
                                    type="url"
                                    placeholder="https://photos.app.goo.gl/..."
                                    value={url}
                                    onChange={(e) => {
                                      const next = [...albumUrls];
                                      next[idx] = e.target.value;
                                      setAlbumUrls(next);
                                      setAlbumError('');
                                      setSyncDiagnostics([]);
                                    }}
                                    className="w-full bg-white border border-[#cfc4c5] rounded-lg pl-3.5 pr-9 py-3 font-mono text-[10px] focus:outline-none focus:border-black placeholder:text-neutral-300 shadow-sm animate-fade-in"
                                  />
                                  {albumUrls.length > 1 && (
                                    <button
                                      onClick={() => {
                                        setAlbumUrls(prev => prev.filter((_, i) => i !== idx));
                                        setAlbumError('');
                                        setSyncDiagnostics([]);
                                      }}
                                      className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-red-500 transition-colors text-[10px] font-mono font-bold cursor-pointer"
                                    >
                                      X
                                    </button>
                                  )}
                                </div>
                              ))}
                              
                              <div className="grid grid-cols-2 gap-2 mt-2">
                                <button
                                  onClick={() => { setAlbumUrls(prev => [...prev, '']); setAlbumError(''); setSyncDiagnostics([]); }}
                                  className="bg-white border border-[#cfc4c5] hover:border-black text-black py-3 text-[9px] font-mono font-bold uppercase rounded-lg flex items-center justify-center gap-1 tracking-wider cursor-pointer transition-colors"
                                >
                                  <span>Add another link</span>
                                </button>

                                <button
                                  onClick={handleSyncAlbum}
                                  className="bg-black hover:bg-neutral-900 text-white py-3 text-[10px] font-mono font-bold uppercase tracking-widest rounded-lg flex items-center justify-center gap-2 cursor-pointer transition-colors"
                                >
                                  {albumLoading ? (
                                    <>
                                      <span className="block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                      <span>CANCEL SYNC</span>
                                    </>
                                  ) : (
                                    <span>SYNC</span>
                                  )}
                                </button>
                              </div>

                              {albumError && (
                                <p className="text-[9px] font-mono text-red-500 mt-1 leading-relaxed whitespace-pre-wrap">{albumError}</p>
                              )}
                            </>
                          )}
                        </div>
                      </section>

                      {/* Images Card */}
                      <section className="bg-white border border-[#cfc4c5] rounded-xl overflow-hidden shadow-sm">
                        <div className="px-4 pt-3.5 pb-1 bg-white">
                          <h2 className="font-mono text-[10px] font-bold text-neutral-800 tracking-widest uppercase">IMAGES</h2>
                        </div>
                        <div className="px-4 pb-4 pt-2">
                          <div
                            onDragEnter={handleDrag}
                            onDragOver={handleDrag}
                            onDragLeave={handleDrag}
                            onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}
                            className="border-2 border-dashed border-[#cfc4c5]/40 rounded-xl bg-[#f6f9ff]/50 p-6 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-neutral-50 transition-all"
                          >
                            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { if (e.target.files && e.target.files[0]) handleFileUpload(e.target.files[0]); }} />
                            <button className="bg-white border border-[#cfc4c5] px-5 py-2.5 rounded-lg flex items-center gap-2 mb-3 shadow-sm hover:border-black font-mono text-[9px] font-bold uppercase tracking-wider text-black">
                              <Upload size={12} />
                              <span>UPLOAD</span>
                            </button>
                            <p className="text-[10px] text-neutral-500 font-sans leading-relaxed">
                              Choose images or drag & drop it here.<br/>
                              <span className="text-[8px] opacity-60">JPG, JPEG, PNG and WEBP, Max 20 MB.</span>
                            </p>
                          </div>
                        </div>
                      </section>

                      {/* Import From Web Card */}
                      <section className="bg-white border border-[#cfc4c5] rounded-xl overflow-hidden shadow-sm">
                        <div className="px-4 pt-3.5 pb-1 bg-white">
                          <h2 className="font-mono text-[10px] font-bold text-neutral-800 tracking-widest uppercase">IMPORT FROM WEB</h2>
                        </div>
                        <div className="px-4 pb-4 pt-2 space-y-3.5">
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">
                              <Link2 size={13} />
                            </span>
                            <input
                              type="url"
                              required
                              placeholder="Paste URL here..."
                              value={newItemUrl}
                              onChange={(e) => setNewItemUrl(e.target.value)}
                              className="w-full bg-white border border-[#cfc4c5] rounded-lg pl-9 pr-3.5 py-3 font-mono text-[10px] focus:outline-none focus:border-black placeholder:text-neutral-300 transition-colors shadow-sm"
                            />
                          </div>

                          <button
                            onClick={handleAddItemByUrl}
                            className="w-full bg-black hover:bg-neutral-900 text-white py-3 text-[10px] font-mono font-bold uppercase tracking-widest rounded-lg flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                          >
                            <span>ADD</span>
                          </button>
                        </div>
                      </section>
                    </>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Fullscreen focus overlay */}
      <AnimatePresence>
        {selectedImage && (
          <div id="fullscreen-focus-overlay" className="fixed inset-0 z-50 flex flex-col items-center justify-center p-4 sm:p-6">
            <motion.div id="fullscreen-focus-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }} className="absolute inset-0 bg-neutral-900/40 cursor-pointer" onClick={() => setSelectedImage(null)} />
            <div className="absolute left-3 sm:left-6 md:left-10 z-20">
              <button id="fullscreen-prev-btn" onClick={handlePrevImage} className="flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-white/10 hover:bg-white text-white hover:text-neutral-900 border border-white/20 hover:border-transparent transition-all duration-300 shadow-[0_4px_15px_rgba(0,0,0,0.12)] cursor-pointer hover:scale-110 active:scale-95 backdrop-blur-sm" title="Previous Image (Left Arrow Key)"><ArrowLeft size={16} className="stroke-[2.5]" /></button>
            </div>
            <div className="absolute right-3 sm:right-6 md:right-10 z-20">
              <button id="fullscreen-next-btn" onClick={handleNextImage} className="flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-white/10 hover:bg-white text-white hover:text-neutral-900 border border-white/20 hover:border-transparent transition-all duration-300 shadow-[0_4px_15px_rgba(0,0,0,0.12)] cursor-pointer hover:scale-110 active:scale-95 backdrop-blur-sm" title="Next Image (Right Arrow Key)"><ArrowRight size={16} className="stroke-[2.5]" /></button>
            </div>
            <motion.div
              id="fullscreen-focus-card"
              initial={{ opacity: 0, scale: 0.9, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 30 }}
              transition={{ type: 'spring', damping: 25, stiffness: 180 }}
              className="relative bg-white border-[3px] sm:border-[4px] border-white shadow-[0_45px_100px_rgba(0,0,0,0.25)] select-none z-10"
              onClick={(e) => e.stopPropagation()}
            >
              {(() => {
                const useVideo = !!selectedImage.videoUrl;
                console.log(`Overlay: id=${selectedImage.id.slice(0,30)}, videoUrl=${selectedImage.videoUrl ? selectedImage.videoUrl.slice(0,50) : '(none)'}, isVideo=${!!selectedImage.isVideo}, rendering=${useVideo ? 'VIDEO' : 'IMG'}`);
                if (useVideo) {
                  const proxySrc = '/api/video-proxy?url=' + encodeURIComponent(selectedImage.videoUrl);
                  return (
                    <video id="fullscreen-focus-video" src={proxySrc} controls autoPlay className="max-w-[90vw] max-h-[75vh] w-auto h-auto object-contain select-none block bg-black"
                      onError={(e) => console.error('Video play error:', (e.target as HTMLVideoElement).error)}
                      onLoadedMetadata={(e) => console.log('Video metadata loaded, duration:', (e.target as HTMLVideoElement).duration)}
                    />
                  );
                }
                return (
                  <img id="fullscreen-focus-img" src={selectedImage.url} alt={selectedImage.title} className="max-w-[90vw] max-h-[75vh] w-auto h-auto object-contain select-none pointer-events-none block" referrerPolicy="no-referrer" />
                );
              })()}

              {(selectedImage.timestamp || selectedImage.location) && (
                <div className="px-4 py-2.5 bg-white border-t border-neutral-100 flex flex-col gap-0.5">
                  {selectedImage.timestamp && (
                    <div className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider">
                      {new Date(selectedImage.timestamp).toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
                      {selectedImage.location ? ' · ' + selectedImage.location : ''}
                    </div>
                  )}
                  {selectedImage.location && !selectedImage.timestamp && (
                    <div className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider">
                      {selectedImage.location}
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Sync Complete Stats Toast */}
      <AnimatePresence>
        {syncStats && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="fixed bottom-6 left-6 z-50 bg-white border border-neutral-900/10 shadow-[0_8px_30px_rgba(0,0,0,0.06)] px-4 py-3"
          >
            <div className="flex items-center gap-3">
              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
              <div className="flex flex-col gap-0.5">
                <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-neutral-500">Sync Complete</div>
                <div className="text-[11px] font-mono text-neutral-800 leading-tight">
                  <span className="font-semibold">{syncStats.totalAll}</span> total · <span className="font-semibold">{syncStats.uniqueDays}</span> days · showing <span className="font-semibold">{syncStats.selectedCount}</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
