import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#10b981',
        secondary: '#6366f1',
        danger: '#ef4444',
        warning: '#f59e0b',
        success: '#22c55e',
      },
    },
  },
  plugins: [],
}
export default config
