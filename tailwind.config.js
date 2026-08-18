/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    // Spacing scale is replaced wholesale: every value is a multiple of 4px.
    spacing: {
      0: '0',
      1: '4px',
      2: '8px',
      3: '12px',
      4: '16px',
      5: '20px',
      6: '24px',
      8: '32px',
      10: '40px',
      12: '48px',
      16: '64px',
      24: '96px'
    },
    borderRadius: {
      none: '0',
      DEFAULT: '4px',
      sheet: '8px',
      full: '999px'
    },
    fontSize: {
      12: ['12px', '16px'],
      14: ['14px', '20px'],
      16: ['16px', '24px'],
      20: ['20px', '28px'],
      24: ['24px', '32px'],
      32: ['32px', '40px'],
      48: ['48px', '56px']
    },
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      glass: {
        '000': 'var(--glass-000)',
        100: 'var(--glass-100)',
        200: 'var(--glass-200)',
        400: 'var(--glass-400)',
        600: 'var(--glass-600)',
        900: 'var(--glass-900)'
      },
      stage: {
        '000': 'var(--stage-000)',
        600: 'var(--stage-600)',
        900: 'var(--stage-900)'
      },
      bulb: {
        100: 'var(--bulb-100)',
        500: 'var(--bulb-500)',
        700: 'var(--bulb-700)'
      },
      alarm: {
        500: 'var(--alarm-500)',
        700: 'var(--alarm-700)'
      }
    },
    fontFamily: {
      display: 'var(--font-display)',
      body: 'var(--font-body)',
      mono: 'var(--font-mono)'
    },
    fontWeight: { light: '300', normal: '400', medium: '500' },
    extend: {
      transitionTimingFunction: { wipe: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      boxShadow: { sheet: 'var(--shadow-sheet)', hud: 'var(--shadow-hud)' },
      width: { tray: '64px' },
      height: { bar: '56px', tray: '96px', sheet: '320px' }
    }
  },
  plugins: []
}
