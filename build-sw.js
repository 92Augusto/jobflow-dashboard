import { generateSW } from 'workbox-build';

async function buildSW() {
  console.log('Generating Service Worker...');
  try {
    const { count, size, warnings } = await generateSW({
      globDirectory: 'dist/client',
      globPatterns: [
        '**/*.{js,css,html,ico,png,svg,webmanifest}'
      ],
      swDest: 'dist/client/sw.js',
      clientsClaim: true,
      skipWaiting: true,
      runtimeCaching: [
        {
          urlPattern: ({ request }) => request.mode === 'navigate',
          handler: 'NetworkFirst',
          options: {
            cacheName: 'pages-cache',
            networkTimeoutSeconds: 3,
            expiration: {
              maxEntries: 50,
              maxAgeSeconds: 30 * 24 * 60 * 60, // 30 Days
            },
            cacheableResponse: {
              statuses: [0, 200],
            },
          },
        },
      ],
    });

    warnings.forEach(console.warn);
    console.log(`${count} files will be precached, totaling ${size} bytes.`);
    console.log('Service Worker generated successfully at dist/client/sw.js');
  } catch (error) {
    console.error('Service Worker generation failed:', error);
    process.exit(1);
  }
}

buildSW();
