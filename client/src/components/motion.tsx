/**
 * Shared motion for the public site, in CSS (design brief §8; R70). One easing curve and a few patterns, so the site
 * moves the same way everywhere, without an animation library on the public pages.
 *
 * A reveal is set on the element by script after the page is up, never in the HTML: a page rendered at build time
 * (scripts/prerender.ts) shows everything at once, and only what starts below the first screen waits to fade up when
 * it scrolls into view. With "reduce motion" on, nothing waits and nothing moves (index.css).
 */
import React, { useEffect, useRef } from "react";

export const EASE = [0.22, 1, 0.36, 1] as const;

const reducedMotion = () => typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Marks the element to fade up the first time it scrolls into view, if it starts below the first screen. */
function useReveal(ref: React.RefObject<HTMLElement | null>, stagger: boolean) {
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined" || reducedMotion()) return;
    // Already on screen (the first screen, or a page opened part-way down): it stays as it is.
    if (element.getBoundingClientRect().top < window.innerHeight) return;
    if (stagger) Array.from(element.children).forEach((child, index) => (child as HTMLElement).style.setProperty("--reveal-delay", `${(0.05 + index * 0.07).toFixed(2)}s`));
    element.dataset.reveal = "waiting";
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      element.dataset.reveal = "shown";
      observer.disconnect();
    }, { rootMargin: "0px 0px -60px 0px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, stagger]);
}

/** Fades and lifts its content into place the first time it scrolls into view. */
export function Reveal({ delay = 0, className, children, ...rest }: React.HTMLAttributes<HTMLDivElement> & { delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useReveal(ref, false);
  return (
    <div ref={ref} className={className} style={delay ? ({ "--reveal-delay": `${delay}s` } as React.CSSProperties) : undefined} {...rest}>
      {children}
    </div>
  );
}

/** A list whose items arrive one after another, 0.07 s apart, when it scrolls into view. */
export function Stagger({ as: Tag = "div", className, children, ...rest }: React.HTMLAttributes<HTMLElement> & { as?: "div" | "ul" | "ol" }) {
  const ref = useRef<HTMLElement>(null);
  useReveal(ref, true);
  return (
    <Tag ref={ref as never} data-stagger="" className={className} {...rest}>
      {children}
    </Tag>
  );
}

/** Thin bar along the top of the page showing how far the visitor has read. */
export function ScrollProgress() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let frame = 0;
    const draw = () => {
      frame = 0;
      const room = document.documentElement.scrollHeight - window.innerHeight;
      ref.current?.style.setProperty("transform", `scaleX(${room > 0 ? Math.min(1, window.scrollY / room) : 0})`);
    };
    const onScroll = () => { frame ||= window.requestAnimationFrame(draw); };
    draw();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);
  return <div ref={ref} aria-hidden data-scroll-progress="" className="fixed inset-x-0 top-0 z-[60] h-[3px] origin-left bg-gradient-to-r from-brand-plum via-highlight-ink to-highlight" style={{ transform: "scaleX(0)" }} />;
}
