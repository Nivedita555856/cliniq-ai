import './globals.css'

export const metadata = {
  title: 'ClinIQ AI — Multimodal Medical Report Intelligence',
  description:
    'AI-powered analysis for CBC, Thyroid, and Chest X-ray reports using Multimodal RAG, BioBERT, and Groq Llama 3.',
  keywords: 'medical AI, CBC analysis, thyroid report, chest x-ray, RAG, multimodal',
  icons: {
    icon: '/favicon.ico',
  },
  openGraph: {
    title: 'ClinIQ AI',
    description: 'Intelligent Medical Report Analysis',
    type: 'website',
  },
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  )
}
