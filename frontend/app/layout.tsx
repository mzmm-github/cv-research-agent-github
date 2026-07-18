import { Toaster } from '@/components/ui/toaster';
import { GeistSans } from 'geist/font/sans';
import type { Metadata } from 'next';
import type React from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'CV Research Workflow Agent',
  description:
    'LangGraph and RAG agent for computer vision papers, training logs, experiment metrics, and ablation planning.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className={GeistSans.className}>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
