import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ScoreProphet',
    short_name: 'ScoreProphet',
    description: 'Football prediction game',
    start_url: '/',
    display: 'standalone',
    background_color: '#0A1628',
    theme_color: '#0A1628',
    icons: [
      {
        src: '/World_Cup_Trophy.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/World_Cup_Trophy.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  }
}
