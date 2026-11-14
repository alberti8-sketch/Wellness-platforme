import type { Metadata } from "next"
import "./globals.css"
import "leaflet/dist/leaflet.css"

export const metadata: Metadata = {
  title: "Wellness & Population Health Platform",
  description: "B2B/B2G health analytics and monitoring platform",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50">
        <nav className="bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16">
              <div className="flex items-center">
                <h1 className="text-xl font-bold text-primary">🏥 Wellness Platform</h1>
              </div>
              <div className="flex items-center space-x-4">
                <a href="/collect" className="text-gray-600 hover:text-primary">Data Collection</a>
                <a href="/processing" className="text-gray-600 hover:text-primary">Processing</a>
                <a href="/dashboard" className="text-gray-600 hover:text-primary">Dashboard</a>
              </div>
            </div>
          </div>
        </nav>
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>
      </body>
    </html>
  )
}
