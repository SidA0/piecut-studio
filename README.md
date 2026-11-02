# Piecut Studio

Hosted STEP tube pie-cut planner for GitHub Pages. The website is static; STEP analysis, part generation, weld reports, and experimental jig generation run on your own computer through the downloadable CAD companion.

## Use

1. Download `PieCut_Companion_Source.zip` from this repository or the website.
2. Extract it on a Windows computer with Python 3.10 or newer.
3. Run `Start_PieCut_Website.bat` and leave its window open.
4. Open [Piecut Studio](https://sida0.github.io/piecut-studio/) and select a `.step` or `.stp` file. If the browser blocks a connection to `127.0.0.1:8765`, use **Open local workspace** on the site.

The website sends STEP data to the companion at `127.0.0.1:8765` on the same computer; GitHub Pages does not run the CAD engine or receive your STEP files. The companion only accepts browser requests from this GitHub Pages origin and the original ChatGPT Site origin.

`PieCut_Studio_Website.zip` contains a copy of the static website and the companion ZIP for offline distribution. Opening `index.html` directly from disk may be blocked by browser origin rules; run a local static server or use GitHub Pages.

Review generated geometry and the laser shop's specifications before ordering cuts. Try printed jigs on scrap before welding production parts.
