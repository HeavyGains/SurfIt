# SurfIt

An original low-poly mobile surfing game, played in portrait in the browser.
Built with TypeScript, Three.js and Vite.

## Run it

```bash
npm install
npm run dev      # dev server; open the printed Network URL on your phone (same Wi-Fi)
npm run build    # type-check and build to dist/
npm run smoke    # after a build: loads the game headless and fails on errors
```

The smoke test needs Playwright's Chromium (`npx playwright install chromium`).

## Play it

Every merge to `main` publishes the game to GitHub Pages: https://heavygains.github.io/SurfIt/
(workflow in `.github/workflows/pages.yml`; repo Settings > Pages > Source must be "GitHub Actions").

## Layout

| File | What it holds |
| --- | --- |
| `index.html` | Canvas and HUD markup |
| `src/style.css` | HUD styles |
| `src/main.ts` | Entry point |
| `src/game.ts` | Scene, wave, player, obstacles, barrel, HUD and main loop |
| `src/models.ts` | Low-poly models (surfer, board, sea life, buoy, fin, boat) |
| `src/audio.ts` | Generated Web Audio sound effects |
| `src/util.ts` | Math and DOM helpers |

`game.ts` is still one large module ported from the mockup. It gets split further as each milestone touches it.
