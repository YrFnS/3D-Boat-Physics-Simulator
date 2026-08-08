# Runtime asset sourcing

Audit date: 2026-08-08  
Production checked: <https://3d-boat-physics-simulator.vercel.app/>  
Database: N/A (local-first, no database)

## Audit result

The runtime has no user-visible raster images, remote image URLs, avatars, hero images, catalog images, or image-backed control icons. It uses zero `<img>` elements and zero `next/image` references. No image host allowlist, CSP image-source change, Next `remotePatterns` entry, or canvas CORS configuration is needed.

## Intentional exceptions

- **`app/icon.svg`** is a local static SVG retained as the Next.js favicon/app identity. A remote favicon would add a startup dependency and can break PWA/browser installability and offline tab identity; it is not a content image. The production route responds `200` with `Content-Type: image/svg+xml` over HTTPS.
- **Lucide React controls** remain inline SVG semantic icons. They are used inside labelled buttons and status controls, so replacing them with network images would add avoidable requests, weaken accessible naming and focus behavior, and provide no visual benefit. The pinned `lucide-react` package is ISC-licensed.
- **`components/NavigationHUD.tsx`** draws the interactive marine chart as inline SVG (`role="img"`, `aria-label="Navigation plotter"`). Its route, waypoint, heading, and pointer geometry is dynamic and pointer-interactive, so a static URL cannot replace it without breaking the core interaction.
- **Three.js vessel/world geometry and GPU textures** are intentionally procedural (`mesh`/shader geometry, `DataTexture`, and `WebGLRenderTarget` in `components/`, including `Ocean.tsx` and `WakeField.tsx`). External textures would introduce CORS and context-loss risk and reduce deterministic/performance guarantees. These are simulation geometry, not image assets.
- **`scripts/**/*.png`** entries are generated screenshot output paths only; they are not shipped runtime assets.

No URL substitutions were required. Consequently, there are no third-party photo/icon license records or external image hosts to add to `next.config.ts`.
