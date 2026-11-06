import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/* ------------------------------------------------------------------ */
/* Signature canvas: intelligent network field                          */
/* ------------------------------------------------------------------ */

export function IntelligenceField({ className = '', density = 1, labels = true }: { className?: string; density?: number; labels?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduced = prefersReducedMotion();
    let width = 0;
    let height = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let raf = 0;
    let t = 0;

    type Node = { x: number; y: number; vx: number; vy: number; r: number; depth: number };
    let nodes: Node[] = [];

    const pointer = { x: -9999, y: -9999, active: false };
    const phrases = [
      'AI AUTOMATION', 'INTELLIGENT INFRASTRUCTURE', 'DIGITAL TRANSFORMATION',
      'STRATEGIC PARTNERSHIPS', 'ENTERPRISE INTELLIGENCE',
    ];

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      width = Math.max(320, rect.width);
      height = Math.max(260, rect.height);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const base = width < 640 ? 26 : width < 1100 ? 44 : 64;
      const count = Math.round(base * density);
      nodes = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.12,
        vy: (Math.random() - 0.5) * 0.12,
        r: 0.7 + Math.random() * 1.6,
        depth: 0.35 + Math.random() * 0.65,
      }));
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      t += reduced ? 0 : 0.0035;

      // orbital rings
      const cx = width * 0.62;
      const cy = height * 0.46;
      const maxR = Math.min(width, height) * 0.62;
      for (let i = 1; i <= 3; i += 1) {
        ctx.beginPath();
        ctx.strokeStyle = `rgba(123,91,255,${0.1 - i * 0.02})`;
        ctx.lineWidth = 1;
        ctx.ellipse(cx, cy, maxR * (0.34 * i), maxR * (0.22 * i), Math.sin(t + i) * 0.12, 0, Math.PI * 2);
        ctx.stroke();
      }

      // links
      for (let i = 0; i < nodes.length; i += 1) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j += 1) {
          const b = nodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.hypot(dx, dy);
          const limit = 132;
          if (dist < limit) {
            const alpha = (1 - dist / limit) * 0.2 * Math.min(a.depth, b.depth);
            ctx.beginPath();
            ctx.strokeStyle = `rgba(140,120,255,${alpha})`;
            ctx.lineWidth = 0.6;
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      // travelling light path
      const pathT = (t * 1.6) % 1;
      const grad = ctx.createLinearGradient(0, 0, width, height);
      grad.addColorStop(0, 'rgba(123,91,255,0)');
      grad.addColorStop(0.5, 'rgba(168,146,255,0.55)');
      grad.addColorStop(1, 'rgba(216,198,163,0)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, height * (0.78 - pathT * 0.4));
      ctx.bezierCurveTo(width * 0.35, height * (0.5 - pathT * 0.3), width * 0.62, height * (0.86 - pathT * 0.5), width, height * (0.34 - pathT * 0.2));
      ctx.stroke();

      // nodes
      for (const n of nodes) {
        if (!reduced) {
          n.x += n.vx;
          n.y += n.vy;
          if (n.x < 0 || n.x > width) n.vx *= -1;
          if (n.y < 0 || n.y > height) n.vy *= -1;
        }
        const dxp = n.x - pointer.x;
        const dyp = n.y - pointer.y;
        const dp = Math.hypot(dxp, dyp);
        const near = pointer.active && dp < 150 ? 1 - dp / 150 : 0;
        const radius = n.r * (1 + near * 1.4);
        const glow = 0.35 + near * 0.5 + Math.sin(t * 6 + n.x * 0.02) * 0.05;
        ctx.beginPath();
        ctx.fillStyle = near > 0.15 ? `rgba(216,198,163,${glow})` : `rgba(186,172,255,${glow * n.depth})`;
        ctx.arc(n.x, n.y, radius, 0, Math.PI * 2);
        ctx.fill();

        if (near > 0.05) {
          ctx.beginPath();
          ctx.strokeStyle = `rgba(168,146,255,${near * 0.35})`;
          ctx.lineWidth = 0.7;
          ctx.moveTo(n.x, n.y);
          ctx.lineTo(pointer.x, pointer.y);
          ctx.stroke();
        }
      }

      // floating technical labels
      if (labels && width > 720) {
        ctx.font = '500 9px ui-sans-serif, system-ui';
        phrases.forEach((phrase, i) => {
          const phase = (t * 0.55 + i * 0.21) % 1;
          const x = 24 + phase * (width - 160);
          const y = height * (0.14 + i * 0.17) + Math.sin(t * 3 + i) * 4;
          ctx.fillStyle = `rgba(200,208,220,${0.2 + Math.sin(phase * Math.PI) * 0.16})`;
          ctx.fillText(phrase, x, y);
        });
      }

      if (!reduced) raf = requestAnimationFrame(draw);
    };

    const onPointer = (e: PointerEvent) => {
      const rect = wrap.getBoundingClientRect();
      pointer.x = e.clientX - rect.left;
      pointer.y = e.clientY - rect.top;
      pointer.active = true;
    };
    const onLeave = () => { pointer.active = false; };
    const onScroll = () => {
      if (!reduced) t += 0.004;
    };

    resize();
    draw();
    window.addEventListener('resize', resize);
    wrap.addEventListener('pointermove', onPointer);
    wrap.addEventListener('pointerleave', onLeave);
    window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      wrap.removeEventListener('pointermove', onPointer);
      wrap.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('scroll', onScroll);
    };
  }, [density, labels]);

  return (
    <div ref={wrapRef} className={`relative ${className}`} aria-hidden>
      <canvas ref={canvasRef} className="block h-full w-full" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_60%_45%,rgba(123,91,255,0.14),transparent_62%)]" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Moving information line                                             */
/* ------------------------------------------------------------------ */

export function InfoLine({ text, reverse = false, className = '' }: { text: string; reverse?: boolean; className?: string }) {
  return (
    <div className={`relative h-px w-full overflow-visible bg-gradient-to-r from-transparent via-white/12 to-transparent ${className}`} aria-hidden>
      <span
        className="absolute -top-[3px] h-[7px] w-[7px] rounded-full bg-violet-soft shadow-[0_0_14px_2px_rgba(123,91,255,0.7)]"
        style={{ animation: `mv-travel ${reverse ? 26 : 22}s linear infinite${reverse ? ' reverse' : ''}` }}
      />
      <span
        className="absolute -top-2 whitespace-nowrap text-[0.6rem] uppercase tracking-[0.32em] text-[#8a93a6]/60"
        style={{ animation: `mv-travel ${reverse ? 30 : 26}s linear infinite${reverse ? ' reverse' : ''}` }}
      >
        {text}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Intelligence strip (marquee)                                        */
/* ------------------------------------------------------------------ */

export function IntelligenceStrip({ items, speed = 46 }: { items: string[]; speed?: number }) {
  const doubled = useMemo(() => [...items, ...items], [items]);
  return (
    <div className="relative overflow-hidden border-y border-white/[0.06] bg-[#070910]/60 py-4">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-[#05060a] to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-[#05060a] to-transparent" />
      <div className="flex w-max items-center gap-10 mv-marquee" style={{ animationDuration: `${speed}s` }}>
        {doubled.map((item, i) => (
          <span key={`${item}-${i}`} className="flex items-center gap-10">
            <span className="text-[0.66rem] uppercase tracking-[0.34em] text-[#8a93a6]">{item}</span>
            <span className="h-1 w-1 rounded-full bg-violet/70" />
          </span>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pathway: Discover → Architect → Integrate → Automate → Scale         */
/* ------------------------------------------------------------------ */

export function Pathway({ steps }: { steps: { title: string; body: string }[] }) {
  return (
    <div className="relative">
      <div className="absolute left-[15px] top-2 bottom-2 w-px bg-gradient-to-b from-violet/50 via-violet/20 to-transparent md:left-0 md:right-0 md:top-[15px] md:h-px md:w-auto md:bg-gradient-to-r" />
      <ol className="relative grid gap-8 md:grid-cols-5 md:gap-4">
        {steps.map((step, i) => (
          <li key={step.title} className="relative flex gap-4 md:block">
            <span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-violet/40 bg-[#0a0d16] font-display text-[0.7rem] text-violet-soft">
              {String(i + 1).padStart(2, '0')}
            </span>
            <div className="md:mt-6 md:pr-3">
              <p className="font-display text-[0.98rem] text-[#eef1f7]">{step.title}</p>
              <p className="mt-1.5 text-[0.78rem] leading-relaxed text-[#8a93a6]">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Partnership ecosystem orbit                                         */
/* ------------------------------------------------------------------ */

export function EcosystemOrbit({ centre, orbiters }: { centre: string; orbiters: string[] }) {
  const [hover, setHover] = useState<string | null>(null);
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[520px]">
      <div className="absolute inset-[8%] rounded-full border border-white/[0.07]" />
      <div className="absolute inset-[22%] rounded-full border border-white/[0.06]" />
      <div className="absolute inset-[36%] rounded-full border border-violet/20" />
      <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_50%_50%,rgba(123,91,255,0.16),transparent_58%)]" />

      <div className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
        <div className="flex h-24 w-24 flex-col items-center justify-center rounded-full border border-white/12 bg-[#0a0d16]/90 text-center backdrop-blur">
          <span className="font-display text-[0.7rem] tracking-[0.22em] text-[#eef1f7]">{centre}</span>
          <span className="mt-1 text-[0.55rem] uppercase tracking-[0.2em] text-[#6f7889]">Core</span>
        </div>
      </div>

      {orbiters.map((name, i) => {
        const angle = (360 / orbiters.length) * i - 90;
        const radius = i % 2 === 0 ? 40 : 30;
        const rad = (angle * Math.PI) / 180;
        const x = 50 + Math.cos(rad) * radius;
        const y = 50 + Math.sin(rad) * radius;
        const active = hover === name;
        return (
          <button
            key={name}
            type="button"
            onMouseEnter={() => setHover(name)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(name)}
            onBlur={() => setHover(null)}
            className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border px-3 py-1.5 text-[0.64rem] uppercase tracking-[0.14em] transition-all duration-300 ${
              active
                ? 'border-violet/60 bg-violet/15 text-white shadow-[0_0_30px_-8px_rgba(123,91,255,0.9)]'
                : 'border-white/10 bg-[#0a0d16]/80 text-[#9aa3b5] hover:border-violet/40'
            }`}
            style={{ left: `${x}%`, top: `${y}%` }}
          >
            {name}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Product preview frame (dashboard mock — labelled as product UI)      */
/* ------------------------------------------------------------------ */

export function ProductFrame({ children, label = 'MAVYRON OS', className = '' }: { children: ReactNode; label?: string; className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-white/10 bg-[#080b12]/90 shadow-[0_50px_140px_-60px_rgba(75,47,214,0.85)] ${className}`}>
      <div className="flex items-center gap-2 border-b border-white/[0.07] bg-white/[0.02] px-4 py-2.5">
        <span className="h-2 w-2 rounded-full bg-white/15" />
        <span className="h-2 w-2 rounded-full bg-white/15" />
        <span className="h-2 w-2 rounded-full bg-white/15" />
        <span className="ml-3 text-[0.6rem] uppercase tracking-[0.26em] text-[#6f7889]">{label}</span>
      </div>
      {children}
    </div>
  );
}

export function GridBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.028)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.028)_1px,transparent_1px)] bg-[size:72px_72px] [mask-image:radial-gradient(ellipse_at_50%_0%,black,transparent_72%)]" />
      <div className="absolute -top-40 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(123,91,255,0.16),transparent_65%)] blur-2xl" />
      <div className="absolute right-[-10%] top-40 h-[380px] w-[380px] rounded-full bg-[radial-gradient(circle,rgba(216,198,163,0.08),transparent_65%)] blur-2xl" />
    </div>
  );
}
