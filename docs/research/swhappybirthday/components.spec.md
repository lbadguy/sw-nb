# Birthday Clone Component Specification

## Foundation

- Target files: `public/swhappybirthday/index.html`, `style.css`, and `script.js`.
- Interaction model: native scroll + IntersectionObserver reveals + click-driven navigation and celebration.
- Asset strategy: user portraits are local. The source site's Mona Sans and Brier font files are self-hosted locally. No original Lando portrait or commercial imagery is shipped.
- Global colors: `#c7ff00`, `#b4ce32`, `#24291e`, `#f1f0e9`, `#111112`.

## Hero And Navigation

- Desktop hero: 100svh, at least 680 px; central portrait up to 760 px wide; fixed 94 px navigation.
- Mobile hero: at least 720 px; portrait is 120% viewport width and 77% hero height; central wordmark moves below navigation controls.
- WebGL head: subdivided curved plane with the local homie portrait, elliptical alpha, cursor-shadow texture, pointer rotation, camera parallax and scroll filtering.
- WebGL helmet: locally hosted source GLB with distinct helmet, glass and plastic meshes; metallic PBR materials; cloned scanning wireframe; click/touch lock state.
- Menu: full viewport, upward hidden state, 700 ms cubic-bezier reveal.

## Editorial Sections

- Message: 150vh desktop and 135vh mobile; looping Brier headline behind a monochrome central photo.
- Manifesto: 235vh desktop and 190vh mobile; sticky 100vh canvas; mixed Mona/Brier type and clipped lime emphasis.
- Gallery: absolute scattered memories on a 2,350 px desktop / 1,800 px mobile field.
- Duel: full viewport composition with portraits anchored outside opposite edges and a centered split title.

## Archive And Closing

- Hall: near-black field; three columns desktop, two columns mobile; alternating card offset and 520/300 px card heights.
- Birthday: two-column poster composition desktop and stacked mobile; oversized champion type and tilted physical poster.
- Footer: full viewport, lime outer border, rounded upper corners, centered portrait, offset utility columns.

## Accessibility And Resilience

- Semantic section headings, image alternatives, button labels, navigation labels, live status for celebration.
- Escape closes the menu and all internal navigation closes it after selection.
- `prefers-reduced-motion` disables marquee, loader pulse, parallax, and reveal movement.
- A loader timeout prevents an indefinitely blocked page if the `load` event is delayed.
