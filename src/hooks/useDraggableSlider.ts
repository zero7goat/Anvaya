import React, { useRef, useState, useCallback, useEffect } from "react";

/**
 * Enhanced hook for smooth, slippery horizontal dragging and swiping on sliders/carousels.
 * 
 * Features:
 * - Fluid 1:1 pointer tracking during drag (no scroll-behavior fighting or jitter)
 * - Inertial physics on release: slippery, slow momentum glide that gently decelerates
 * - Support for both mouse and touch events
 * - Seamless interruptibility (touching/clicking halts momentum immediately)
 * - Smooth, graceful easing for arrow navigation (no instant snap or twitch)
 * - Smart click suppression to prevent card clicks during/after dragging
 */
export function useDraggableSlider<T extends HTMLElement = HTMLDivElement>() {
  const sliderRef = useRef<T | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Mutable animation and tracking state to avoid unnecessary React re-renders
  const animRef = useRef({
    isDown: false,
    startX: 0,
    scrollLeft: 0,
    hasMoved: false,
    dragDistance: 0,
    lastX: 0,
    lastTime: 0,
    velocity: 0, // px per millisecond
    rafId: 0,
    lastDragEndTime: 0,
    isGliding: false,
  });

  // Cancel any active momentum or animation frame
  const cancelMomentum = useCallback(() => {
    if (animRef.current.rafId) {
      cancelAnimationFrame(animRef.current.rafId);
      animRef.current.rafId = 0;
    }
    animRef.current.isGliding = false;
  }, []);

  // Slippery, slow momentum glide after pointer release
  const startMomentumGlide = useCallback(() => {
    const el = sliderRef.current;
    if (!el) return;

    let v = animRef.current.velocity;
    // Minimum threshold for glide
    if (Math.abs(v) < 0.08) {
      animRef.current.isGliding = false;
      return;
    }

    animRef.current.isGliding = true;
    let lastTimestamp = performance.now();
    // Friction coefficient per 16ms frame: 0.955 delivers a slippery, slow, luxurious glide
    const baseFriction = 0.958;

    const step = (now: number) => {
      const dt = Math.min(now - lastTimestamp, 32); // cap frame delta
      lastTimestamp = now;

      if (!el || !animRef.current.isGliding) return;

      // Adjust friction to frame rate
      const currentFriction = Math.pow(baseFriction, dt / 16.67);
      v *= currentFriction;

      // Move slider
      el.scrollLeft -= v * dt;

      // Soft boundary dampening
      const maxScroll = el.scrollWidth - el.clientWidth;
      if (el.scrollLeft <= 0) {
        el.scrollLeft = 0;
        animRef.current.isGliding = false;
        return;
      } else if (el.scrollLeft >= maxScroll) {
        el.scrollLeft = maxScroll;
        animRef.current.isGliding = false;
        return;
      }

      // Stop once velocity is negligible (slow finish)
      if (Math.abs(v) > 0.015) {
        animRef.current.rafId = requestAnimationFrame(step);
      } else {
        animRef.current.isGliding = false;
      }
    };

    cancelMomentum();
    animRef.current.rafId = requestAnimationFrame(step);
  }, [cancelMomentum]);

  // Handle pointer down (Mouse)
  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0 || !sliderRef.current) return;

      cancelMomentum();
      const el = sliderRef.current;
      const state = animRef.current;

      state.isDown = true;
      state.hasMoved = false;
      state.dragDistance = 0;
      state.startX = e.pageX - el.offsetLeft;
      state.scrollLeft = el.scrollLeft;
      state.lastX = e.pageX;
      state.lastTime = performance.now();
      state.velocity = 0;

      setIsDragging(true);
    },
    [cancelMomentum]
  );

  // Handle pointer move (Mouse)
  const onMouseMove = useCallback((e: React.MouseEvent) => {
    const state = animRef.current;
    const el = sliderRef.current;
    if (!state.isDown || !el) return;

    e.preventDefault();

    const currentX = e.pageX;
    const now = performance.now();
    const dt = Math.max(now - state.lastTime, 1);
    const dx = currentX - state.lastX;

    // Track smoothed instantaneous velocity (px / ms)
    const instantaneousV = dx / dt;
    state.velocity = state.velocity * 0.4 + instantaneousV * 0.6;

    state.lastX = currentX;
    state.lastTime = now;

    const x = currentX - el.offsetLeft;
    const walk = x - state.startX;
    state.dragDistance = Math.abs(walk);

    if (state.dragDistance > 5) {
      state.hasMoved = true;
    }

    el.scrollLeft = state.scrollLeft - walk;
  }, []);

  // Stop drag & initiate slippery glide
  const endDrag = useCallback(() => {
    const state = animRef.current;
    if (state.isDown) {
      if (state.hasMoved) {
        state.lastDragEndTime = Date.now();
      }
      state.isDown = false;
      setIsDragging(false);

      if (state.hasMoved) {
        startMomentumGlide();
      }
    }
  }, [startMomentumGlide]);

  const onMouseUp = useCallback(() => {
    endDrag();
  }, [endDrag]);

  const onMouseLeave = useCallback(() => {
    endDrag();
  }, [endDrag]);

  // Touch event handlers for mobile & tablets
  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!sliderRef.current || e.touches.length === 0) return;
      cancelMomentum();

      const el = sliderRef.current;
      const state = animRef.current;
      const touch = e.touches[0];

      state.isDown = true;
      state.hasMoved = false;
      state.dragDistance = 0;
      state.startX = touch.pageX - el.offsetLeft;
      state.scrollLeft = el.scrollLeft;
      state.lastX = touch.pageX;
      state.lastTime = performance.now();
      state.velocity = 0;
      setIsDragging(true);
    },
    [cancelMomentum]
  );

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const state = animRef.current;
    const el = sliderRef.current;
    if (!state.isDown || !el || e.touches.length === 0) return;

    const touch = e.touches[0];
    const currentX = touch.pageX;
    const now = performance.now();
    const dt = Math.max(now - state.lastTime, 1);
    const dx = currentX - state.lastX;

    const instantaneousV = dx / dt;
    state.velocity = state.velocity * 0.4 + instantaneousV * 0.6;

    state.lastX = currentX;
    state.lastTime = now;

    const x = currentX - el.offsetLeft;
    const walk = x - state.startX;
    state.dragDistance = Math.abs(walk);

    if (state.dragDistance > 5) {
      state.hasMoved = true;
    }

    el.scrollLeft = state.scrollLeft - walk;
  }, []);

  const onTouchEnd = useCallback(() => {
    endDrag();
  }, [endDrag]);

  // Check whether recent user interaction was a drag to prevent child card click triggering
  const wasRecentlyDragged = useCallback(() => {
    const state = animRef.current;
    return (
      state.hasMoved ||
      state.isGliding ||
      Date.now() - state.lastDragEndTime < 200
    );
  }, []);

  // Programmatic smooth slow scroll helpers for arrow navigation buttons
  const smoothScrollToOffset = useCallback((delta: number, duration: number = 650) => {
    const el = sliderRef.current;
    if (!el) return;
    cancelMomentum();

    const start = el.scrollLeft;
    const target = start + delta;
    const startTime = performance.now();

    // Standard easeInOutCubic for a smooth, slow, unhurried transition
    const easeInOutCubic = (t: number) =>
      t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

    const animateScroll = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeInOutCubic(progress);

      el.scrollLeft = start + (target - start) * eased;

      if (progress < 1) {
        animRef.current.rafId = requestAnimationFrame(animateScroll);
      }
    };

    animRef.current.rafId = requestAnimationFrame(animateScroll);
  }, [cancelMomentum]);

  const scrollLeftBy = useCallback(
    (amount: number = 320) => {
      smoothScrollToOffset(-amount, 650);
    },
    [smoothScrollToOffset]
  );

  const scrollRightBy = useCallback(
    (amount: number = 320) => {
      smoothScrollToOffset(amount, 650);
    },
    [smoothScrollToOffset]
  );

  // Ensure window-level mouseup cleans up if dragged out of browser window
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (animRef.current.isDown) {
        endDrag();
      }
    };
    window.addEventListener("mouseup", handleGlobalMouseUp);
    return () => {
      window.removeEventListener("mouseup", handleGlobalMouseUp);
      cancelMomentum();
    };
  }, [endDrag, cancelMomentum]);

  return {
    sliderRef,
    isDragging,
    wasRecentlyDragged,
    scrollLeftBy,
    scrollRightBy,
    dragProps: {
      onMouseDown,
      onMouseMove,
      onMouseUp,
      onMouseLeave,
      onTouchStart,
      onTouchMove,
      onTouchEnd,
      className: `overflow-x-auto no-scrollbar select-none will-change-scroll ${
        isDragging ? "cursor-grabbing" : "cursor-grab"
      }`,
      style: {
        scrollBehavior: "auto" as const, // Prevents fighting with direct drag updates
        WebkitOverflowScrolling: "touch" as const,
      },
    },
  };
}
