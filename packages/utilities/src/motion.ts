/** Reduced-motion support (SPEC section 13.6, section 16.2). */
import { getCommonConfig } from '@absoluteui/core';

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Animate only when configuration allows it and the user has not requested reduced motion. */
export function shouldAnimate(): boolean {
  return getCommonConfig().animation !== 'none' && !prefersReducedMotion();
}
