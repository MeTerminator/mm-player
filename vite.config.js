import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: '/player/',
  plugins: [
    react(),
    VitePWA({
      includeAssets: [
        '/images/icons/favicon-16x16.png',
        '/images/icons/favicon-32x32.png',
        '/images/icons/favicon-256x256.png',
        '/images/icons/favicon-512x512.png',
        '/images/icons/apple-touch-icon.png',
      ],
      registerType: "autoUpdate",
      workbox: {
        clientsClaim: true,
        skipWaiting: true,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: /(.*?)\.(woff2|woff|ttf)/,
            handler: "CacheFirst",
            options: {
              cacheName: "file-cache",
            },
          },
          {
            urlPattern: /(.*?)\.(webp|png|jpe?g|svg|gif|bmp|psd|tiff|tga|eps)/,
            handler: "CacheFirst",
            options: {
              cacheName: "image-cache",
            },
          },
        ],
      },
      manifest: {
        name: "MeT-Music Player",
        short_name: "MeT-Music Player",
        description: "MeT-Music Player",
        display: "standalone",
        start_url: "/player/",
        theme_color: "#000000",
        background_color: "#000000",
        icons: [
          {
            src: "/images/icons/favicon-32x32.png",
            sizes: "32x32",
            type: "image/png",
          },
          {
            src: "/images/icons/favicon-256x256.png",
            sizes: "256x256",
            type: "image/png",
          },
          {
            src: "/images/icons/favicon-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
        ],
      },
    }),
  ],
})
