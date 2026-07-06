# Speaker Builder

Speaker Builder is a browser-based loudspeaker enclosure workbench for exploring
Thiele/Small driver data and comparing enclosure alignments.

Live app: https://cozycactus.github.io/SpeakerBuilder/

## What It Does

- Model sealed, vented, passive radiator, aperiodic, infinite baffle, and approximate bandpass alignments.
- Compare frequency response, SPL, cone excursion, group delay, step response, phase, impedance, and port / passive radiator behavior.
- Edit driver T/S parameters and enclosure parameters with live chart updates for active configurations.
- Compare multiple drivers and multiple configurations.
- Show a calculation passport with the selected design's inputs, tuning, limits, warnings, and SPL drive mode.
- Optimize candidate enclosures for balanced response, depth, flatness, compact size, transient behavior, or output.
- Import and export projects, export charts, and generate an HTML report.
- Use English or Russian UI text.

## Important Modeling Limits

This is an engineering design aid, not a replacement for measurement.

- T/S enclosure modeling is most useful in the low-frequency range.
- Above roughly 500 Hz, measured FRD/ZMA data is needed for breakup, directivity, cone behavior, baffle effects, and crossover work.
- SPL is calibrated from datasheet sensitivity when available, but real systems still depend on baffle, room, losses, driver variation, and measurement conditions.
- Bandpass support is currently approximate.
- Aperiodic modeling exposes physical inputs such as vent area, material, thickness, and flow resistance, but should still be verified experimentally.

## Local Development

Install dependencies:

```sh
npm install
```

Run the development server:

```sh
npm run dev
```

Run tests:

```sh
npm test
```

Run browser automation tests:

```sh
npm run test:e2e
```

Watch browser automation in Chrome:

```sh
npm run test:e2e:headed
```

Build the React app:

```sh
npm run build
```

Preview the production build:

```sh
npm run preview
```

## Experimental egui / WASM Prototype

The main application is the React app. The `egui_app/` directory is an
experimental Rust / eframe / WebAssembly prototype that proves an egui version
can also be hosted on GitHub Pages.

Live egui prototype: https://cozycactus.github.io/SpeakerBuilder/egui/

To build it locally:

```sh
rustup target add wasm32-unknown-unknown
cargo install trunk --locked
cd egui_app
trunk build --release
```

The GitHub Pages workflow builds the React app into `dist/` and then builds the
egui prototype into `dist/egui/`.

## Project Structure

```text
src/App.tsx                  Main React UI
src/lib/acoustics.ts         Acoustic model, presets, optimizer, and parsers
src/lib/acoustics.reference.test.ts
                             Reference and regression tests
src/lib/simulation.worker.ts Worker entry point for heavier simulations
egui_app/                    Experimental Rust / egui prototype
.github/workflows/pages.yml GitHub Pages deployment workflow
```

## Deployment

Pushes to `master` deploy the site to GitHub Pages through the
`Deploy GitHub Pages` workflow.

No pull request is required for direct project-owner changes.
