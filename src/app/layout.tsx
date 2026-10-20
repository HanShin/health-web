import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: '오늘의 건강 | Health Web',
  description: '수면, 회복, 러닝과 체성분을 한 곳에서 확인하는 나의 건강 기록',
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
