import React, { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Settings, Sliders, RefreshCw, X } from 'lucide-react';

interface ControlsProps {
  tilt: number;
  setTilt: (v: number) => void;
  radius: number;
  setRadius: (v: number) => void;
  carouselCount: number;
  setCarouselCount: (v: number) => void;
}

export default function Controls({
  tilt,
  setTilt,
  radius,
  setRadius,
  carouselCount,
  setCarouselCount,
}: ControlsProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleReset = () => {
    setTilt(30);
    setRadius(350);
  };

  return (
    <div id="controls-root" className="absolute bottom-6 right-6 z-40 select-none">
      {/* Settings Toggle Trigger Button - Rounded with custom border */}
      <div className="flex justify-end">
        <motion.button
          id="settings-trigger-btn"
          onClick={() => setIsOpen(!isOpen)}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          className="w-12 h-12 rounded-lg bg-white border border-[#cfc4c5] hover:border-black text-neutral-600 hover:text-black cursor-pointer transition-all duration-300 flex items-center justify-center shadow-[0_2px_10px_rgba(0,0,0,0.02)]"
          title="Gallery controls"
        >
          {isOpen ? <X id="x-settings-icon" size={18} /> : <Settings id="settings-icon" size={18} className="animate-spin-slow" />}
        </motion.button>
      </div>

      {/* Floating Control Box Panel - Rounded container matching wishboard panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={panelRef}
            id="settings-panel"
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="absolute bottom-14 right-0 w-[290px] sm:w-[320px] max-h-[75vh] overflow-y-auto custom-scrollbar bg-white rounded-xl border border-[#cfc4c5] p-5 shadow-[0_15px_40px_rgba(0,0,0,0.08)] flex flex-col gap-4 text-neutral-800"
          >
            {/* Header */}
            <div id="settings-header" className="flex items-center justify-between border-b border-[#cfc4c5]/30 pb-3">
              <div id="settings-title-group" className="flex items-center gap-2">
                <h4 id="settings-title" className="text-xs font-bold tracking-widest text-neutral-800 uppercase font-mono">Gallery Controller</h4>
              </div>
              <button
                id="reset-settings-btn"
                onClick={handleReset}
                className="text-[9px] font-bold tracking-widest text-neutral-400 hover:text-black uppercase flex items-center gap-1.5 transition-colors cursor-pointer font-mono border border-[#cfc4c5] px-2 py-1 rounded-md bg-white hover:border-black"
                title="Reset to original parameters"
              >
                <RefreshCw id="refresh-icon" size={9} />
                <span>Reset</span>
              </button>
            </div>

            {/* Content Controls */}
            <div id="settings-controls" className="space-y-4">
              {/* Slider 1: 3D Ring Tilt */}
              <div id="ctrl-tilt-group" className="space-y-1.5 p-3 bg-[#eef4fc]/30 border border-[#cfc4c5]/40 rounded-xl">
                <div id="tilt-label-row" className="flex justify-between text-[9px] font-bold text-neutral-400 uppercase tracking-widest font-mono">
                  <span>3D Plane Tilt</span>
                  <span id="tilt-value" className="text-neutral-800 font-mono">{tilt}°</span>
                </div>
                <input
                  id="tilt-range-input"
                  type="range"
                  min="30"
                  max="82"
                  value={tilt}
                  onChange={(e) => setTilt(Number(e.target.value))}
                  className="w-full h-1 bg-[#cfc4c5]/40 rounded-lg appearance-none cursor-pointer accent-black hover:accent-neutral-900"
                />
              </div>

              {/* Slider 2: Ring Radius */}
              <div id="ctrl-radius-group" className="space-y-1.5 p-3 bg-[#eef4fc]/30 border border-[#cfc4c5]/40 rounded-xl">
                <div id="radius-label-row" className="flex justify-between text-[9px] font-bold text-neutral-400 uppercase tracking-widest font-mono">
                  <span>Circle Radius</span>
                  <span id="radius-value" className="text-neutral-800 font-mono">{radius}px</span>
                </div>
                <input
                  id="radius-range-input"
                  type="range"
                  min="100"
                  max="700"
                  value={radius}
                  onChange={(e) => setRadius(Number(e.target.value))}
                  className="w-full h-1 bg-[#cfc4c5]/40 rounded-lg appearance-none cursor-pointer accent-black hover:accent-neutral-900"
                />
              </div>

              {/* Slider 3: Carousel Image Count */}
              <div id="ctrl-count-group" className="space-y-1.5 p-3 bg-[#eef4fc]/30 border border-[#cfc4c5]/40 rounded-xl">
                <div id="count-label-row" className="flex justify-between text-[9px] font-bold text-neutral-400 uppercase tracking-widest font-mono">
                  <span>Images Shown</span>
                  <span id="count-value" className="text-neutral-800 font-mono">{carouselCount}</span>
                </div>
                <input
                  id="count-range-input"
                  type="range"
                  min="10"
                  max="200"
                  step="10"
                  value={carouselCount}
                  onChange={(e) => setCarouselCount(Number(e.target.value))}
                  className="w-full h-1 bg-[#cfc4c5]/40 rounded-lg appearance-none cursor-pointer accent-black hover:accent-neutral-900"
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
