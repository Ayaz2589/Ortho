import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        text: {
          DEFAULT: 'var(--text)',
          2: 'var(--text-2)',
          3: 'var(--text-3)',
        },
        accent: 'var(--accent)',
        positive: 'var(--positive)',
        destructive: 'var(--destructive)',
        hairline: 'var(--hairline)',
        peach: {
          bg: 'var(--peach-bg)',
          fg: 'var(--peach-fg)',
        },
        slate: {
          bg: 'var(--slate-bg)',
          fg: 'var(--slate-fg)',
        },
        sage: {
          bg: 'var(--sage-bg)',
          fg: 'var(--sage-fg)',
        },
        terracotta: {
          bg: 'var(--terracotta-bg)',
          fg: 'var(--terracotta-fg)',
        },
        mauve: {
          bg: 'var(--mauve-bg)',
          fg: 'var(--mauve-fg)',
        },
        sand: {
          bg: 'var(--sand-bg)',
          fg: 'var(--sand-fg)',
        },
      },
      fontFamily: {
        lato: ['var(--font-lato)', 'Lato', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
