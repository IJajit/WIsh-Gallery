import React, { useRef, useEffect, useState } from 'react';
import { ImageItem, CarouselMode } from '../types';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Carousel3DProps {
  images: ImageItem[];
  mode: CarouselMode;
  tilt: number;
  radius: number;
  selectedImage: ImageItem | null;
  onCloseSelectedImage: () => void;
  onImageClick: (image: ImageItem) => void;
  onActiveImageChange: (image: ImageItem) => void;
  onTiltChange?: (tilt: number) => void;
}

export default function Carousel3D({
  images,
  mode,
  tilt,
  radius,
  selectedImage,
  onCloseSelectedImage,
  onImageClick,
  onActiveImageChange,
  onTiltChange
}: Carousel3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const rotationRef = useRef<number>(0);
  const velocityRef = useRef<number>(0);
  const isDraggingRef = useRef<boolean>(false);
  const startXRef = useRef<number>(0);
  const startYRef = useRef<number>(0);
  const startRotationRef = useRef<number>(0);
  const startTiltRef = useRef<number>(tilt);
  const lastTimeRef = useRef<number>(0);
  const frameIdRef = useRef<number | null>(null);
  const lastActiveIdxRef = useRef<number>(-1);

  // Mouse tracking for continuous 3D dynamic camera tilt/rotation
  const mouseXRef = useRef<number>(0);
  const mouseYRef = useRef<number>(0);
  const targetMouseXRef = useRef<number>(0);
  const targetMouseYRef = useRef<number>(0);

  const [activeIdxState, setActiveIdxState] = useState<number>(-1);
  const [adjustedRadius, setAdjustedRadius] = useState<number>(radius);
  const [hoveredImage, setHoveredImage] = useState<ImageItem | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const hoverLeaveTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Responsive Radius Scaling
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 640) {
        // Mobile
        setAdjustedRadius(Math.min(radius, 280));
      } else if (window.innerWidth < 1024) {
        // Tablet
        setAdjustedRadius(Math.min(radius, 380));
      } else {
        // Desktop
        setAdjustedRadius(radius);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [radius]);

  // Escape key handler to close the selected static image
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedImage) {
        onCloseSelectedImage();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedImage, onCloseSelectedImage]);

  // Keep ring rotation synchronized when selected image changes
  useEffect(() => {
    if (selectedImage && images.length > 0) {
      const idx = images.findIndex((img) => img.id === selectedImage.id);
      if (idx !== -1) {
        const angleStepLocal = 360 / images.length;
        rotationRef.current = -idx * angleStepLocal;
      }
    }
  }, [selectedImage, images]);

  // Main 60fps Animation Loop
  useEffect(() => {
    // Track mouse coordinates over the window continuously
    const handleMouseMoveGlobal = (e: MouseEvent) => {
      if (selectedImage) return; // Ignore sway when focused on an image
      // Scale coordinates from -1 to 1 based on center of viewport
      targetMouseXRef.current = (e.clientX - window.innerWidth / 2) / (window.innerWidth / 2);
      targetMouseYRef.current = (e.clientY - window.innerHeight / 2) / (window.innerHeight / 2);
    };

    window.addEventListener('mousemove', handleMouseMoveGlobal);

    const update = () => {
      if (selectedImage) {
        // Completely freeze carousel rotation and sway when a photo is selected static
        const finalTilt = -tilt;
        const finalRotation = rotationRef.current;
        const finalRoll = 0;
        if (ringRef.current) {
          ringRef.current.style.transform = `rotateX(${finalTilt}deg) rotateY(${finalRotation}deg) rotateZ(${finalRoll}deg)`;
        }
        frameIdRef.current = requestAnimationFrame(update);
        return;
      }

      // Smoothly interpolate (lerp) the mouse offsets (always runs, even during hover)
      mouseXRef.current += (targetMouseXRef.current - mouseXRef.current) * 0.08;
      mouseYRef.current += (targetMouseYRef.current - mouseYRef.current) * 0.08;

      if (!isDraggingRef.current) {
        // Apply friction to the drag velocity
        velocityRef.current *= 0.96;
        if (Math.abs(velocityRef.current) < 0.002) {
          velocityRef.current = 0;
        }

        // Apply automatic rotation in 'animate' mode when there's no manual spin speed
        if (mode === 'animate' && velocityRef.current === 0) {
          rotationRef.current += 0.02;
        } else {
          rotationRef.current += velocityRef.current;
        }
      } else {
        // Decay speed when holding but not moving
        velocityRef.current *= 0.85;
      }

      // Keep rotation bound within 0 - 360
      rotationRef.current = ((rotationRef.current % 360) + 360) % 360;

      // Dynamic tilt, rotation, and roll offset — always active
      const finalTilt = -tilt + (mouseYRef.current * 4);
      const finalRotation = rotationRef.current + (mouseXRef.current * 20);
      const finalRoll = mouseXRef.current * -2.5;

      if (ringRef.current) {
        ringRef.current.style.transform = `rotateX(${finalTilt}deg) rotateY(${finalRotation}deg) rotateZ(${finalRoll}deg)`;
      }

      // Calculate which card is closest to the front (world angle closest to 0 deg)
      const N = images.length;
      if (N > 0) {
        const angleStep = 360 / N;
        // Since we translate in +Z, the card at local angle theta matches the front when container rotation matches -theta.
        const normalizedRotation = (-rotationRef.current % 360 + 360) % 360;
        const frontIdx = Math.round(normalizedRotation / angleStep) % N;

        if (frontIdx !== lastActiveIdxRef.current && frontIdx >= 0 && frontIdx < N) {
          lastActiveIdxRef.current = frontIdx;
          setActiveIdxState(frontIdx);
          onActiveImageChange(images[frontIdx]);
        }
      }

      frameIdRef.current = requestAnimationFrame(update);
    };

    frameIdRef.current = requestAnimationFrame(update);
    return () => {
      if (frameIdRef.current) {
        cancelAnimationFrame(frameIdRef.current);
      }
      window.removeEventListener('mousemove', handleMouseMoveGlobal);
    };
  }, [images, mode, tilt, selectedImage, onActiveImageChange]);

  // Handle Dragging / Swipe Physics
  const handleDragStart = (clientX: number, clientY: number) => {
    isDraggingRef.current = true;
    startXRef.current = clientX;
    startYRef.current = clientY;
    startRotationRef.current = rotationRef.current;
    startTiltRef.current = tilt;
    velocityRef.current = 0;
    lastTimeRef.current = performance.now();
  };

  const handleDragMove = (clientX: number, clientY: number) => {
    if (!isDraggingRef.current) return;

    const deltaX = clientX - startXRef.current;
    const now = performance.now();
    const dt = now - lastTimeRef.current;

    // Convert pixels dragged into rotation degrees
    const sensitivity = window.innerWidth < 640 ? 0.35 : 0.22;
    const deltaAngle = deltaX * sensitivity;
    const nextRotation = startRotationRef.current + deltaAngle;

    // Calculate instantaneous velocity (degrees per millisecond * 16ms per frame = degrees per frame)
    if (dt > 0) {
      const instantVelocity = (nextRotation - rotationRef.current) / dt * 16.6;
      // Low pass filter for smooth speed momentum
      velocityRef.current = velocityRef.current * 0.4 + instantVelocity * 0.6;
    }

    rotationRef.current = nextRotation;
    lastTimeRef.current = now;
  };

  const handleDragEnd = () => {
    isDraggingRef.current = false;
    // Cap velocity to prevent extreme spinning
    const maxVelocity = 12;
    velocityRef.current = Math.max(-maxVelocity, Math.min(maxVelocity, velocityRef.current));
  };

  // Mouse Handlers
  const onMouseDown = (e: React.MouseEvent) => {
    if (selectedImage) return; // Block dragging if image is selected static
    // Only drag with left click
    if (e.button !== 0) return;
    handleDragStart(e.clientX, e.clientY);
    
    // Set cursor styles on body to keep dragging feeling smooth even if mouse wanders
    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';

    const handleMouseUpGlobal = () => {
      handleDragEnd();
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mouseup', handleMouseUpGlobal);
      window.removeEventListener('mousemove', handleMouseMoveGlobal);
    };

    const handleMouseMoveGlobal = (moveEvent: MouseEvent) => {
      handleDragMove(moveEvent.clientX, moveEvent.clientY);
    };

    window.addEventListener('mouseup', handleMouseUpGlobal);
    window.addEventListener('mousemove', handleMouseMoveGlobal);
  };

  // Touch Handlers
  const onTouchStart = (e: React.TouchEvent) => {
    if (selectedImage) return; // Block drag on touch if image is selected static
    if (e.touches.length === 0) return;
    handleDragStart(e.touches[0].clientX, e.touches[0].clientY);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (selectedImage) return;
    if (e.touches.length === 0) return;
    handleDragMove(e.touches[0].clientX, e.touches[0].clientY);
  };

  const onTouchEnd = () => {
    if (selectedImage) return;
    handleDragEnd();
  };

  // Scroll Wheel Handler
  const onWheel = (e: React.WheelEvent) => {
    if (selectedImage) return; // Block scroll wheel on static select
    // Scroll can directly add velocity
    const scrollSensitivity = 0.08;
    velocityRef.current += e.deltaY * scrollSensitivity * (e.deltaMode === 1 ? 15 : 1);
  };

  // Manual Navigation Helpers (Arrows)
  const navigateStep = (direction: 'prev' | 'next') => {
    if (selectedImage) return;
    const N = images.length;
    if (N === 0) return;
    const angleStep = 360 / N;
    
    // Find the next neat angle multiple to animate towards
    let currentNorm = ((rotationRef.current % 360) + 360) % 360;
    
    let targetIdx = activeIdxState;
    if (direction === 'prev') {
      targetIdx = (activeIdxState - 1 + N) % N;
    } else {
      targetIdx = (activeIdxState + 1) % N;
    }
    
    // Target rotation is the angle that puts targetIdx at the front
    const targetAngle = -targetIdx * angleStep;
    
    // We want the shortest rotation distance
    let angleDiff = targetAngle - rotationRef.current;
    // Map difference to -180 to 180 range
    angleDiff = ((angleDiff + 180) % 360) - 180;
    
    // Inject this difference as a neat velocity impulse so it glides smoothly there
    velocityRef.current = angleDiff * 0.12;
  };

  const angleStep = 360 / images.length;

  return (
    <div
      id="carousel-3d-stage"
      className="relative w-full h-[65vh] flex items-center justify-center select-none overflow-visible"
      onWheel={onWheel}
    >
      {/* 3D Viewport container */}
      <div
        id="carousel-3d-viewport"
        ref={containerRef}
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        className={`relative w-[90%] max-w-5xl h-full flex items-center justify-center cursor-grab active:cursor-grabbing overflow-visible transition-all duration-500`}
        style={{
          perspective: '1500px',
          perspectiveOrigin: '50% 35%',
        }}
      >
        {/* Central Hover Image Preview - ONLY visible when NO image is statically selected */}
        <div
          id="center-preview"
          className={`absolute bg-white border-[2px] sm:border-[3px] border-white shadow-[0_30px_70px_rgba(0,0,0,0.3)] flex flex-col pointer-events-none select-none transition-all duration-300 w-[110px] h-[155px] sm:w-[155px] sm:h-[215px] md:w-[190px] md:h-[265px] z-40 ${
            hoveredImage && !selectedImage ? 'opacity-100 scale-100 translate-y-[-10px]' : 'opacity-0 scale-90 translate-y-0'
          }`}
          style={{
            transform: 'translateZ(200px)', // Elevates inside the 3D perspective field to stay cleanly on top
          }}
        >
          <div className="w-full h-full overflow-hidden bg-neutral-100 relative">
            {hoveredImage && (
              hoveredImage.url ? (
                <img
                  id="center-preview-img"
                  src={hoveredImage.url}
                  alt={hoveredImage.title}
                  className="w-full h-full object-cover animate-fade-in"
                />
              ) : (
                <div className="w-full h-full bg-neutral-100 animate-fade-in" />
              )
            )}
          </div>
        </div>

        {/* Rotating Ring - properties never change on hover (no CSS transition conflict) */}
        <div
          id="carousel-3d-ring"
          ref={ringRef}
          className={`relative w-0 h-0 flex items-center justify-center transform-gpu overflow-visible transition-all duration-700 ${
            selectedImage
              ? 'opacity-15 pointer-events-none filter blur-[2px]'
              : 'opacity-100'
          }`}
          style={{
            transformStyle: 'preserve-3d',
            transform: `rotateX(${-tilt}deg) rotateY(0deg) rotateZ(0deg)`,
            transition: isDraggingRef.current ? 'none' : 'transform 0.05s linear',
          }}
        >
          {images.map((image, idx) => {
            const localAngle = idx * angleStep;
            const isActive = idx === activeIdxState;
            const isHovered = hoveredIdx === idx;

            // Base vertical cylinder transform: rotated 90 degrees to point along the circular tangent (radial stack)
            const baseTransform = `rotateY(${localAngle}deg) translateZ(${adjustedRadius}px) rotateY(90deg)`;
            
            // Pop out on hover: slides upward along the vertical Y-axis and scales slightly
            const finalTransform = isHovered && !selectedImage
              ? `${baseTransform} translateY(-35px) scale(1.05)`
              : baseTransform;

            return (
              <div
                id={`card-3d-${idx}`}
                key={image.id}
                onMouseEnter={() => {
                  if (selectedImage) return;
                  if (hoverLeaveTimerRef.current) clearTimeout(hoverLeaveTimerRef.current);
                  setHoveredImage(image);
                  setHoveredIdx(idx);
                }}
                onMouseLeave={() => {
                  if (hoverLeaveTimerRef.current) clearTimeout(hoverLeaveTimerRef.current);
                  hoverLeaveTimerRef.current = setTimeout(() => {
                    setHoveredImage(null);
                    setHoveredIdx(null);
                  }, 80);
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (selectedImage) return;
                  
                  // Update ring angle to target the clicked image as the active one
                  const angleStepLocal = 360 / images.length;
                  const targetAngle = -idx * angleStepLocal;
                  rotationRef.current = targetAngle;
                  onActiveImageChange(image);
                  
                  // Trigger the full screen overlay immediately
                  onImageClick(image);
                }}
                className={`absolute w-[24px] h-[34px] sm:w-[32px] sm:h-[45px] md:w-[40px] md:h-[56px] rounded-none cursor-pointer transform-gpu overflow-hidden border-[1.5px] sm:border-[2px] border-white shadow-[0_4px_10px_rgba(0,0,0,0.1)] bg-white select-none ${
                  isActive 
                    ? 'z-20 filter brightness-105 border-neutral-300' 
                    : 'opacity-85 hover:opacity-100 hover:z-30'
                }`}
                style={{
                  transformStyle: 'preserve-3d',
                  transform: finalTransform,
                  transition: 'opacity 0.3s ease, border-color 0.3s ease, filter 0.3s ease, transform 0.05s ease-out'
                }}
              >
                {image.url ? (
                  <img
                    id={`card-image-${idx}`}
                    src={image.url}
                    alt={image.title}
                    className="w-full h-full object-cover select-none pointer-events-none transition-transform duration-500"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-full h-full bg-[#eef4fc]" />
                )}
              </div>
            );
          })}
        </div>

      </div>

    </div>
  );
}
