import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

export default defineConfig({
  preset: {
    ...minimal2023Preset,
    // Use the mark for maskable/apple, the full logo for the favicon
    maskable: {
      sizes: [512],
      padding: 0.3,
      resizeOptions: { background: '#ffffff' },
    },
    apple: {
      sizes: [180],
      padding: 0.3,
      resizeOptions: { background: '#ffffff' },
    },
  },
  images: ['public/kalcy-logo.svg'],
  // If you made kalcy-mark.svg, list both so maskable comes from the mark:
  // images: ['public/kalcy-logo.svg', 'public/kalcy-mark.svg'],
});