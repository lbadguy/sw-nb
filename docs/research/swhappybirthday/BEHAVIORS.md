# SW Happy Birthday Behaviors

- Source baseline: 14,366 px desktop document, 10,083 px mobile document.
- Source typography: Mona Sans Variable for UI/display sans and Brier Bold for editorial serif display.
- Source palette: highlighter lime `#c7ff00`, warm paper `#f1f0e9`, deep olive `#24291e`, near-black `#111112`.
- Load state: lime full-viewport panel exits upward after fonts and images begin rendering, with a timeout fallback.
- Navigation: fixed; menu opens as a full-screen lime sheet and closes on link selection or Escape.
- Scroll: content uses native smooth anchors; reveal elements enter once with an eased 50 px rise. Reduced-motion users receive immediate content.
- Theme: section intersection changes navigation between light and dark foreground modes.
- Hero: portrait receives a low-amplitude vertical parallax transform on desktop and mobile unless reduced motion is active.
- Marquees: message and closing ticker loop horizontally; animation stops under reduced motion.
- Cards: archive images scale and rotate slightly on hover; mobile preserves a two-column staggered grid.
- Celebration: every lime CTA triggers a local-only confetti burst and an announced status toast. No network request or persistent state is involved.
- Responsive: at 800 px, navigation collapses, hero portrait becomes edge-to-edge, gallery memories tighten, duel portraits move to the lower edges, archive becomes two columns, and the birthday/footer compositions stack.

## Recovered Source WebGL Interaction

- The source hero renders in a full-viewport Three.js canvas, not an HTML image overlay.
- Head: 128 x 128 subdivided plane with depth displacement, alpha, normal and roughness maps. Normalized pointer movement rotates it at intensity `0.075` with easing `0.025`.
- Helmet: `/gl/models/helmet-21.glb`, split into meshes named `helmet`, `glass`, and `plastic`; base scale is approximately `6.9`, with the helmet inheriting two-thirds of the head rotation and an additional X rotation of `PI * 0.06`.
- Helmet materials: metalness `1`, roughness `0.05`, strong environment reflection; glass has separate base, normal, roughness and metallic maps.
- A cloned merged wireframe helmet sits above the solid meshes. Its opacity is modulated by a vertical scan effect and fades out partway through the sticky hero timeline.
- A fluid cursor is rendered to an offscreen texture. Both head and final composition shaders project this texture in screen space to mix the default face, helmet shadow, procedural background, and helmet render target.
- Pointer coordinates additionally shift the camera by about `0.02`; the source helmet rotates at roughly two-thirds of the head angle.
- Scroll timeline moves the camera back by `1`, filters the hero to a dark monochrome treatment, fades cursor and wireframe influence, and animates the full viewport render bounds into the sticky target.

## Local Reimplementation

- The homie portrait is mapped to a 96 x 96 subdivided curved head plane with an elliptical alpha shader and dynamic lighting.
- The original public GLB helmet and material textures are rendered locally with distinct helmet/glass/plastic materials and a cloned scanning wireframe layer.
- Pointer and device-orientation input rotate the face, camera, solid helmet and wireframe with the source ratios. An offscreen cursor canvas feeds the face shader and produces localized helmet-shadow scanning.
- Click, double-click, or the lock button transitions between free cursor scanning and a fully locked helmet. Scroll pushes the scene backward and applies a monochrome/olive filter before the next section.
- The free helmet follows the pointer vertically: moving the pointer downward lowers the helmet toward the head, while moving upward lifts it away.
- All sections below the WebGL hero are static. Scroll reveals, marquees, sticky scrolling, card hover transforms, and confetti are disabled; the WebGL render loop also pauses once the hero leaves the viewport.
