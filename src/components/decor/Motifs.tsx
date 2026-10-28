import { ReactNode } from "react";

/**
 * Decorative block-print motifs for filling quiet areas of pages. All are drawn in
 * currentColor with canvas-coloured cut lines, so set the colour with a text-* class.
 * Use them through BackgroundMotif, which keeps them faint and behind content
 * (fainter on phones; give phone and md: sizes in className).
 */

// Pointed petal or leaf shape from (0, 0) to (0, -length)
const petalPath = (length: number, width: number) =>
  `M0 0 C${width} ${-length * 0.3} ${width} ${-length * 0.72} 0 ${-length} C${-width} ${-length * 0.72} ${-width} ${-length * 0.3} 0 0Z`;

/**
 * Decorative block-print floral sprig: a curving stem with layered rosettes, buds and
 * veined leaves, drawn in currentColor with canvas-coloured cut lines.
 */
export function FloralSprig({ className = "" }: { className?: string }) {

  const rosette = (cx: number, cy: number, r: number, spin = 0) => (
    <g transform={`translate(${cx} ${cy}) rotate(${spin})`}>
      {/* Outer petals with a cut line down each */}
      {Array.from({ length: 10 }, (_, i) => (
        <g key={`o${i}`} transform={`rotate(${i * 36})`}>
          <path d={petalPath(r, r * 0.36)} />
          <path d={`M0 ${-r * 0.42} L0 ${-r * 0.82}`} className="stroke-canvas" strokeWidth={r * 0.05} strokeLinecap="round" />
        </g>
      ))}
      <circle r={r * 0.5} className="fill-canvas" />
      {/* Inner petals, offset between the outer ones */}
      {Array.from({ length: 8 }, (_, i) => (
        <path key={`i${i}`} d={petalPath(r * 0.47, r * 0.2)} transform={`rotate(${i * 45 + 22.5})`} />
      ))}
      <circle r={r * 0.2} className="fill-canvas" />
      <circle r={r * 0.13} />
      {/* Ring of dots around the outer petals */}
      {Array.from({ length: 10 }, (_, i) => (
        <circle key={`d${i}`} cx="0" cy={-r * 1.13} r={r * 0.045} transform={`rotate(${i * 36 + 18})`} />
      ))}
    </g>
  );

  const leaf = (x: number, y: number, angle: number, length = 30) => (
    <g transform={`translate(${x} ${y}) rotate(${angle})`}>
      <path d={petalPath(length, length * 0.34)} />
      <path d={`M0 -3 L0 ${-length * 0.85}`} className="stroke-canvas" strokeWidth="1.3" strokeLinecap="round" />
      {[0.35, 0.55].map((t) => (
        <path
          key={t}
          d={`M0 ${-length * t} l${length * 0.14} ${-length * 0.12} M0 ${-length * t} l${-length * 0.14} ${-length * 0.12}`}
          className="stroke-canvas"
          strokeWidth="1"
          strokeLinecap="round"
          fill="none"
        />
      ))}
    </g>
  );

  const bud = (x: number, y: number, angle: number) => (
    <g transform={`translate(${x} ${y}) rotate(${angle})`}>
      <path d={petalPath(22, 8)} />
      <path d="M0 -6 L0 -17" className="stroke-canvas" strokeWidth="1.2" strokeLinecap="round" />
      <path d={petalPath(11, 4)} transform="rotate(-38)" />
      <path d={petalPath(11, 4)} transform="rotate(38)" />
    </g>
  );

  return (
    <svg viewBox="0 0 170 440" className={className} fill="currentColor" aria-hidden="true">
      {/* Stems */}
      <path
        d="M4 440 C40 380 30 320 54 268 C76 222 62 168 66 104 M54 268 C86 258 112 236 126 206 M44 344 C70 350 94 340 108 320 M64 176 C52 172 42 164 32 150 M70 110 C88 92 102 74 114 54 M58 222 C40 226 26 238 18 254"
        fill="none"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
      />
      {/* Leaves */}
      {leaf(30, 392, -38, 48)}
      {leaf(34, 380, 40, 40)}
      {leaf(48, 300, 48, 46)}
      {leaf(50, 290, -50, 40)}
      {leaf(84, 252, 70, 36)}
      {leaf(60, 200, -58, 40)}
      {leaf(66, 158, 38, 40)}
      {leaf(80, 344, 120, 34)}
      {leaf(100, 230, -20, 30)}
      {/* Buds */}
      {bud(118, 46, 30)}
      {bud(16, 258, -150)}
      {/* Flowers */}
      {rosette(70, 80, 44, 9)}
      {rosette(126, 200, 36)}
      {rosette(114, 316, 28, 12)}
      {rosette(30, 146, 24)}
      {/* Seed dots */}
      {[
        [130, 112], [140, 126], [124, 130],
        [14, 196], [26, 208], [10, 214],
        [150, 266], [158, 280], [12, 300], [20, 312],
      ].map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="3.2" />
      ))}
    </svg>
  );
}

/** Round mandala: rings of pointed petals and dots around a solid centre. */
export function Mandala({ className = "" }: { className?: string }) {
  const ring = (count: number, length: number, width: number, offset: number, start = 0) =>
    Array.from({ length: count }, (_, i) => (
      <path key={`${length}-${i}`} d={petalPath(length, width)} transform={`rotate(${start + (i * 360) / count}) translate(0 ${-offset})`} />
    ));
  return (
    <svg viewBox="-100 -100 200 200" className={className} fill="currentColor" aria-hidden="true">
      {ring(16, 30, 9, 62)}
      {Array.from({ length: 32 }, (_, i) => (
        <circle key={`d${i}`} cx="0" cy="-58" r="2.2" transform={`rotate(${i * 11.25})`} />
      ))}
      <circle r="53" fill="none" stroke="currentColor" strokeWidth="2" />
      {ring(12, 24, 8, 26, 15)}
      <circle r="27" className="fill-canvas" />
      {ring(8, 20, 7, 0, 22.5)}
      <circle r="8" className="fill-canvas" />
      <circle r="5" />
    </svg>
  );
}

/** Paisley (mango) motif with an inner outline, a small flower and dotted edge. */
export function Paisley({ className = "" }: { className?: string }) {
  const outer = "M60 190 C10 190 0 130 20 95 C40 60 95 55 105 20 C120 45 125 75 115 110 C102 160 90 190 60 190Z";
  const inner = "M60 172 C25 172 20 130 34 104 C48 80 84 74 98 52 C104 74 104 94 98 116 C88 150 80 172 60 172Z";
  return (
    <svg viewBox="0 0 130 200" className={className} fill="currentColor" aria-hidden="true">
      <path d={outer} />
      <path d={inner} className="fill-canvas" />
      <path d={inner} fill="none" stroke="currentColor" strokeWidth="2" transform="translate(6 6) scale(0.86)" />
      <g transform="translate(58 132)">
        {Array.from({ length: 6 }, (_, i) => (
          <path key={i} d={petalPath(16, 6)} transform={`rotate(${i * 60})`} />
        ))}
        <circle r="4" className="fill-canvas" />
      </g>
      {[[40, 112], [80, 96], [86, 150], [34, 150]].map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="3" />
      ))}
    </svg>
  );
}

const MOTIFS = { mandala: Mandala, paisley: Paisley, sprig: FloralSprig };

/**
 * A faint decorative motif positioned in a section's empty space. The parent must be
 * `relative` (and usually `overflow-hidden`); pass position and size via className.
 */
export function BackgroundMotif({
  kind,
  className = "",
  children,
}: {
  kind: keyof typeof MOTIFS;
  className?: string;
  children?: ReactNode;
}) {
  const Motif = MOTIFS[kind];
  return (
    <div aria-hidden="true" className={`pointer-events-none select-none absolute -z-10 text-line-strong opacity-30 md:opacity-50 ${className}`}>
      <Motif className="w-full h-full" />
      {children}
    </div>
  );
}
