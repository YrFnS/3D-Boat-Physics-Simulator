import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '3D Boat Physics Simulator',
  description:
    'An interactive browser-based marine simulator with procedural oceans, dynamic weather, vessel damage, and adaptive rendering quality.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
