/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
    './client/index.html',
    './client/src/**/*.{js,ts,jsx,tsx}'
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'surface': '#f9f9f9',
        'surface-dim': '#dadada',
        'surface-bright': '#f9f9f9',
        'surface-container-lowest': '#ffffff',
        'surface-container-low': '#f3f3f3',
        'surface-container': '#eeeeee',
        'surface-container-high': '#e8e8e8',
        'surface-container-highest': '#e2e2e2',
        'surface-variant': '#e2e2e2',
        'surface-tint': '#5f5e5e',
        'on-surface': '#1a1c1c',
        'on-surface-variant': '#444748',
        'inverse-surface': '#2f3131',
        'inverse-on-surface': '#f1f1f1',
        'outline': '#747878',
        'outline-variant': '#c4c7c7',
        'primary': '#000000',
        'on-primary': '#ffffff',
        'primary-container': '#1c1b1b',
        'on-primary-container': '#858383',
        'primary-fixed': '#e5e2e1',
        'primary-fixed-dim': '#c8c6c5',
        'on-primary-fixed': '#1c1b1b',
        'on-primary-fixed-variant': '#474746',
        'inverse-primary': '#c8c6c5',
        'secondary': '#735c00',
        'on-secondary': '#ffffff',
        'secondary-container': '#fed65b',
        'on-secondary-container': '#745c00',
        'secondary-fixed': '#ffe088',
        'secondary-fixed-dim': '#e9c349',
        'on-secondary-fixed': '#241a00',
        'on-secondary-fixed-variant': '#574500',
        'tertiary': '#000000',
        'on-tertiary': '#ffffff',
        'tertiary-container': '#002204',
        'on-tertiary-container': '#469446',
        'tertiary-fixed': '#a3f69c',
        'tertiary-fixed-dim': '#88d982',
        'on-tertiary-fixed': '#002204',
        'on-tertiary-fixed-variant': '#005312',
        'error': '#ba1a1a',
        'on-error': '#ffffff',
        'error-container': '#ffdad6',
        'on-error-container': '#93000a',
        'background': '#f9f9f9',
        'on-background': '#1a1c1c'
      },
      borderRadius: {
        'sm': '0.125rem',
        'DEFAULT': '0.25rem',
        'md': '0.375rem',
        'lg': '0.5rem',
        'xl': '0.75rem',
        '2xl': '1rem',
        'full': '9999px'
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Inter', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
        serif: ['Playfair Display', 'Georgia', 'serif'],
        stylish: ['Playfair Display', 'Georgia', 'serif']
      },
      spacing: {
        'unit': '4px',
        'gutter': '16px',
        'margin-mobile': '16px',
        'margin-desktop': '40px'
      },
      boxShadow: {
        'card': '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        'card-hover': '0 10px 20px -3px rgba(0,0,0,0.08), 0 4px 6px -2px rgba(0,0,0,0.04)',
        'modal': '0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 10px 10px -5px rgba(0, 0, 0, 0.08)'
      }
    }
  },
  plugins: []
};
