import type { Metadata, Viewport } from 'next';
import '../src/styles.css';

export const metadata: Metadata = {
  title: 'Chicken Blasters',
  description: 'A co-op space shooter against armoured chickens. Play solo or with friends.',
  manifest: '/manifest.webmanifest',
  icons: { icon: [{ url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }], apple: '/icons/apple-touch-icon.png' },
  appleWebApp: { capable: true, title: 'Chicken Blasters', statusBarStyle: 'black-translucent' },
  other: { 'mobile-web-app-capable': 'yes' },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#05081a' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body><div id="root">{children}</div></body>
    </html>
  );
}
