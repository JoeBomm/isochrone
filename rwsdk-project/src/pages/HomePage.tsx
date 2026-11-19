import React from 'react'

import { IsochroneControls } from '../components/IsochroneControls'
import { LocationInput } from '../components/LocationInput'
import { Map } from '../components/Map'

// HomePage React Server Component
// This component is rendered on the server and can include client components as children
export default function HomePage() {
  // Server-side data fetching could happen here
  // const serverData = await fetchServerData()

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header - Server rendered */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto py-6 px-4">
          <h1 className="text-3xl font-bold text-gray-900">
            Isochrone Center Point
          </h1>
          <p className="mt-2 text-gray-600">
            Find optimal meeting locations based on travel time accessibility
          </p>
          <div className="mt-2 text-sm text-gray-500">
            Powered by RedwoodSDK on Cloudflare Workers
          </div>
        </div>
      </header>

      {/* Main content - Server rendered layout with client components */}
      <main className="max-w-7xl mx-auto py-6 px-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Sidebar - Client components for interactivity */}
          <div className="lg:col-span-1 space-y-6">
            <LocationInput />
            <IsochroneControls />
          </div>

          {/* Map area - Client component for Leaflet integration */}
          <div className="lg:col-span-2">
            <Map />
          </div>
        </div>
      </main>

      {/* Footer - Server rendered */}
      <footer className="bg-white border-t mt-12">
        <div className="max-w-7xl mx-auto py-6 px-4">
          <div className="text-center text-sm text-gray-500">
            <p>
              Optimal meeting point calculation using geospatial algorithms
            </p>
            <p className="mt-1">
              Built with RedwoodSDK • Deployed on Cloudflare Workers
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
