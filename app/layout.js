import './globals.css';

export const metadata = {
  title: '巴士／小巴實時到站與轉乘助手',
  description: '九巴／龍運／城巴／嶼巴／專線小巴實時到站，港鐵',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: '轉乘助手',
    statusBarStyle: 'default'
  },
  icons: {
    icon: '/icon.svg',
    apple: '/icon.svg'
  }
};

export const viewport = {
  themeColor: '#FFF8EF',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content'
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-Hant">
      <body className="app-page">{children}</body>
    </html>
  );
}
