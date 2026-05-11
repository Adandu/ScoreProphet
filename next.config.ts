import type { NextConfig } from 'next'

const config: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['better-sqlite3', '@prisma/adapter-better-sqlite3'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'crests.football-data.org' },
    ],
  },
}

export default config
