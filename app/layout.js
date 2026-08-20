import './globals.css';

export const metadata = {
  title: '巴士實時到站與轉乘助手',
  description: '九巴／龍運實時到站與轉車時間',
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
  themeColor: '#287d75',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover'
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
