import { useEffect, useRef, useState } from 'react';

const NAV_LEFT = 24;
const NAV_TOP = 19;
const NAV_FONT = 18;
const BACKDROP_FADE_END = 0.3; // backdrop is gone by this fraction of the scroll

const lerp = (a, b, t) => a + (b - a) * t;
// Ease-out: fast at first, settles gently — reads as smooth rather than mechanical,
// and gets the logo mostly out of the hero's way early instead of hanging in the
// middle of the screen while the headline fades in underneath it.
const easeOut = (t) => 1 - Math.pow(1 - t, 2.4);

// Full-screen splash on load: giant centered wordmark over a backdrop. As the
// user scrolls, the wordmark shrinks + slides from screen-center into the
// navbar's brand slot on an eased curve.
//
// Performance note: the text is rendered ONCE at its final resting font-size
// (18px) and animated purely via `transform: translate() scale()`. Animating
// font-size/top/left directly (the first version of this component did)
// forces layout on every scroll frame; transform is GPU-composited and never
// triggers layout or paint, which is what actually makes this feel smooth.
export default function IntroLogoMorph({ progress }) {
  const textRef = useRef(null);
  const [baseSize, setBaseSize] = useState(null); // { w, h } at NAV_FONT
  const [viewport, setViewport] = useState({ w: 1200, h: 800 });

  useEffect(() => {
    const update = () => {
      setViewport({ w: window.innerWidth, h: window.innerHeight });
      if (textRef.current) {
        // offsetWidth/Height reflect the element's untransformed layout box —
        // unlike getBoundingClientRect(), they aren't affected by the scale()
        // transform already applied mid-scroll, so re-measuring on resize
        // can't get corrupted by whatever scale happens to be active then.
        setBaseSize({ w: textRef.current.offsetWidth, h: textRef.current.offsetHeight });
      }
    };
    update();
    window.addEventListener('resize', update);
    // The wordmark renders in the Archivo webfont, loaded async via <link>.
    // If it swaps in after this initial measurement (the common case — fonts
    // rarely beat first paint), offsetWidth/Height silently change out from
    // under baseSize, and every scale/position value derived from it goes
    // stale mid-scroll — this is what caused the morph to snap/jump.
    document.fonts?.ready.then(update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const shrinkT = easeOut(progress);
  // scale() doesn't affect layout, so a naive viewport-driven scale can push
  // the visually-enlarged text past the screen edges on narrow phones with
  // no scrollbar to reveal it — it'd just be silently clipped. Cap the big
  // scale so the rendered text never exceeds ~90% of viewport width.
  const desiredScale = (viewport.w * 0.09) / NAV_FONT;
  const widthCap = baseSize ? (viewport.w * 0.9) / baseSize.w : desiredScale;
  const bigScale = Math.max(1.6, Math.min(6.5, desiredScale, widthCap));

  let translateX = NAV_LEFT;
  let translateY = NAV_TOP;
  let scale = 1;

  if (baseSize) {
    const startScale = bigScale;
    const startX = viewport.w / 2 - (baseSize.w * startScale) / 2;
    const startY = viewport.h / 2 - (baseSize.h * startScale) / 2;
    translateX = lerp(startX, NAV_LEFT, shrinkT);
    translateY = lerp(startY, NAV_TOP, shrinkT);
    scale = lerp(startScale, 1, shrinkT);
  }

  const ownOpacity = progress > 0.92 ? Math.max(0, 1 - (progress - 0.92) / 0.08) : 1;
  const backdropOpacity = Math.max(0, 1 - progress / BACKDROP_FADE_END);

  if (ownOpacity <= 0 && backdropOpacity <= 0) return null;

  return (
    <>
      {backdropOpacity > 0 && (
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 49,
            background: 'var(--page-plane)',
            opacity: backdropOpacity,
            pointerEvents: progress < BACKDROP_FADE_END ? 'auto' : 'none',
          }}
        >
          <div className="hero-blobs" style={{ opacity: 0.5 }}>
            <div className="hero-blob-1" />
            <div className="hero-blob-2" />
          </div>
        </div>
      )}
      {ownOpacity > 0 && (
        <div
          ref={textRef}
          aria-hidden="true"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            fontFamily: 'var(--font-display)',
            fontSize: NAV_FONT,
            fontWeight: 800,
            letterSpacing: '-0.01em',
            zIndex: 50,
            pointerEvents: 'none',
            opacity: baseSize ? ownOpacity : 0,
            transform: `translate3d(${translateX}px, ${translateY}px, 0) scale(${scale})`,
            transformOrigin: 'top left',
            willChange: 'transform, opacity',
            background: 'linear-gradient(90deg, var(--accent), var(--accent-2))',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
            whiteSpace: 'nowrap',
          }}
        >
          Car$ync
        </div>
      )}
    </>
  );
}
