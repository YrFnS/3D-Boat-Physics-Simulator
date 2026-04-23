'use client';

import dynamic from 'next/dynamic';

const Simulator = dynamic(() => import('@/components/Simulator'), { ssr: false });

export default function Page() {
  return (
    <main className="w-full h-screen bg-black">
      <Simulator />
    </main>
  );
}
