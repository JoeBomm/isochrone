import React from 'react'

interface DocumentProps {
  children: React.ReactNode
  title?: string
  description?: string
}

// Custom Document component for HTML structure control
// This is a React Server Component that provides the HTML document structure
export function Document({
  children,
  title = 'Isochrone Center Point',
  description = 'Find optimal meeting locations based on travel time accessibility',
}: DocumentProps) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        <meta name="description" content={description} />

        {/* Favicon and app icons */}
        <link rel="icon" type="image/x-icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />

        {/* Open Graph meta tags */}
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:type" content="website" />

        {/* Twitter Card meta tags */}
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />

        {/* Preload critical resources */}
        <link
          rel="preconnect"
          href="https://api.openrouteservice.org"
          crossOrigin="anonymous"
        />
        <link
          rel="preconnect"
          href="https://tile.openstreetmap.org"
          crossOrigin="anonymous"
        />

        {/* CSS for Leaflet maps (loaded dynamically by Map component) */}
        <style
          dangerouslySetInnerHTML={{
            __html: `
            /* Critical CSS for initial render */
            body {
              margin: 0;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
                'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
                sans-serif;
              -webkit-font-smoothing: antialiased;
              -moz-osx-font-smoothing: grayscale;
            }

            /* Loading state styles */
            .loading {
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 200px;
            }

            /* Map container styles */
            .leaflet-container {
              height: 100%;
              width: 100%;
            }
          `,
          }}
        />
      </head>
      <body>
        <div id="root">{children}</div>

        {/* Client-side hydration script will be injected here by RedwoodSDK */}
      </body>
    </html>
  )
}

export default Document
