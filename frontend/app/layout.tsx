import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Trade Signal | Nifty Option Chain",
  description: "Advanced algorithmic option chain signal platform for Nifty.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="antialiased font-sans">
        <main className="min-h-screen p-4 md:p-8">
            <div className="max-w-7xl mx-auto">
                <header className="mb-8 border-b border-gray-800 pb-4">
                    <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
                        <span className="text-blue-500">AI</span> Trade Signals 
                        <span className="text-xs bg-blue-900/40 text-blue-400 px-2 py-1 rounded-full border border-blue-800">PRO</span>
                    </h1>
                    <p className="text-gray-400 mt-2 text-sm">Institutional Grade Options Analysis Engine</p>
                </header>
                {children}
            </div>
        </main>
      </body>
    </html>
  );
}
