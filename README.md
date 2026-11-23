# FEC DLD Virtual Lab

<img src="assets/logo.png" width="96" alt="Faridpur Engineering College logo">

Digital Logic Design lab (CSE 1202 & CSE 1212), Faridpur Engineering College.

**Developed and maintained by Shahriar Hossen Sajid.**

A browser-based digital logic lab bench: a trainer board (+5 V supply, 12 input switches, 8 LEDs, logic probe), a full breadboard and real 74LS ICs. Students wire circuits like they would in the lab, and the app checks them against the truth table.

## Experiments

| Group | Experiments | ICs |
|---|---|---|
| Exp 1 · Fundamental logic gates | AND, OR, NOT, NAND, NOR, XOR, XNOR | 7408, 7432, 7404, 7400, 7402, 7486 |
| Exp 2 · Universality of NAND | NOT, AND, OR from NAND | 7400 |
| Exp 3 · Universality of NOR | NOT, OR, AND from NOR | 7402 |
| Exp 4 · Simplification | F = Σm(1,3,5,6,7) → C + AB | 7408, 7432 |
| Exp 5 · Half adder | Half adder | 7486, 7408 |
| Exp 6 · Full adder | Full adder | 7486, 7408, 7432 |
| Encoder | 4-to-2 (gates), 8-to-3 priority | 7432, 74148 |
| Decoder | 2-to-4 (gates), 3-to-8 | 7404, 7408, 74138 |
| Multiplexer | 2-to-1 (gates), 8-to-1 | 7404, 7408, 7432, 74151 |
| Demultiplexer | 1-to-2 (gates), 1-to-8 | 7404, 7408, 74138 |
| Comparator | 1-bit (gates), 4-bit | 7404, 7408, 7486, 7485 |

## Project structure

```
assets/logo.png     Faridpur Engineering College logo
index.html          Page layout (header, sidebar, bench, tool buttons)
css/style.css       All styles, light and dark theme
js/core.js          No-DOM logic: board geometry, IC library and pinouts,
                    logic simulator, experiments, solutions, guided-build steps
js/app.js           User interface: drawing the board, wiring, dragging ICs,
                    zoom/pan, experiment sheets, diagrams, checker, guide
tests/run-tests.js  Automated test for every experiment
```

No build step and no dependencies — it is plain HTML, CSS and JavaScript.

## Run it on your computer

Open `index.html` directly in a browser, or start a small local server:

```
npm start            # serves the folder at http://localhost:3000
```

## Run the tests

Requires Node.js.

```
npm test
```

It builds each experiment's reference solution and confirms that it passes every row of the truth table, that an empty breadboard fails, and that the guided-build steps match the solution.

## Publish on GitHub Pages

1. Push this folder to a public GitHub repository (for example `dld-lab`).
2. In the repository go to **Settings → Pages**, set Source to **Deploy from a branch**, choose **main** and **/(root)**, and save.
3. After a minute or two the lab is live at `https://<your-username>.github.io/dld-lab/`.

## How to change things

- **Add or edit an experiment:** add an entry to the `EXPS` array in `js/core.js`. Give it `ins`/`outs` (switch and LED mapping), a truth function `f`, the `steps` text and a `solve(api)` function that builds the reference circuit. The guide and the checker are generated from `solve` automatically. For a gate-level circuit, add a schematic to `SCH` in `js/app.js`; otherwise a block diagram is drawn.
- **Add an IC:** use `gateChip(...)` or `msiChip(...)` in `js/core.js` with its pin names and logic function, then add its number to `CHIP_ORDER`.
- **Colours and fonts:** CSS variables at the top of `css/style.css`.

## How the simulation works

Every breadboard column strip, rail and trainer socket is a node. Wires merge nodes into nets (union-find). Each net is driven by the supply, the switches or IC outputs; a net driven both HIGH and LOW is reported as a short. ICs only work when their VCC pin is at +5 V and their GND pin at 0 V, and unconnected TTL inputs read as HIGH, like real 74LS chips. ICs are evaluated repeatedly until the outputs settle.
