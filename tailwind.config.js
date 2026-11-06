/** @type {import('tailwindcss').Config} */
export default {
  content: ['./client/index.html', './client/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        obsidian: '#05060A',
        ink: '#070910',
        midnight: '#0A0F1F',
        navy: '#0C1428',
        graphite: '#14171F',
        slate: '#8A93A6',
        silver: '#C9D0DC',
        violet: {
          DEFAULT: '#7B5BFF',
          deep: '#4B2FD6',
          soft: '#A78BFA',
        },
        gold: '#D8C6A3',
      },
      fontFamily: {
        display: ['"Sora"', 'system-ui', 'sans-serif'],
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        glass: '0 24px 80px -32px rgba(6, 8, 20, 0.9)',
        glow: '0 0 60px -12px rgba(123, 91, 255, 0.45)',
      },
      backgroundImage: {
        'grid-fade':
          'linear-gradient(to bottom, rgba(5,6,10,0) 0%, rgba(5,6,10,0.85) 70%, #05060A 100%)',
      },
      keyframes: {
        drift: {
          '0%': { transform: 'translate3d(0,0,0)' },
          '50%': { transform: 'translate3d(0,-10px,0)' },
          '100%': { transform: 'translate3d(0,0,0)' },
        },
        marquee: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '0% 50%' },
          '100%': { backgroundPosition: '200% 50%' },
        },
        orbit: {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
      },
      animation: {
        drift: 'drift 9s ease-in-out infinite',
        marquee: 'marquee 38s linear infinite',
        shimmer: 'shimmer 8s linear infinite',
        orbit: 'orbit 28s linear infinite',
      },
    },
  },
  plugins: [],
};
