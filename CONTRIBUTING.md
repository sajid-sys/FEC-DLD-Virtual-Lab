# Contributing to FEC DLD Virtual Lab

Thanks for helping! This lab is used by students to practise digital logic at home, mostly on phones. Every contribution — a bug report, a fixed typo, a new chip or a whole new experiment — makes it better for the next batch of students.

## Ways to help

- **Report a bug.** Open an issue with the *Bug report* form. Tell us the experiment, what you did, what you expected and what happened. A screenshot or a circuit code helps a lot.
- **Ask for a chip or experiment.** Open an issue with the *New chip or experiment* form.
- **Fix something.** Look for issues labelled `good first issue` or `help wanted`, or fix something you found yourself.
- **Improve the text.** Theory, procedure steps and help text should be short and clear for first-year students.

If you plan a big change (a new feature, a redesign, a change to the simulator), please open an issue first so we can agree on the approach before you spend time on it.

## What stays the same

New features, chips, experiments and fixes are very welcome. The project's identity is not open for change, and pull requests that change it will not be merged:

- **The name** "FEC DLD Virtual Lab" and the Faridpur Engineering College branding.
- **The author credit** "Developed and maintained by Shahriar Hossen Sajid" and where it appears (side panel footer, welcome screen, About section). You are credited for your work in the commit history and the pull request.
- **The core look**: the colour theme, fonts, the trainer-board design and the overall layout. Small fixes (contrast, alignment, phone layout) are fine.
- **The core features**: the trainer board and breadboard, wiring, the experiments and their checker, the guided build, the logic probe, saving and sharing circuit codes, light/dark theme. You can improve them, but not remove them or replace them with something different.

Every pull request is reviewed by the maintainer before it is merged.

## Getting started

There is no build step and no dependencies — it is plain HTML, CSS and JavaScript.

1. Fork the repository and clone your fork.
2. Open `index.html` in a browser, or run `npm start` and open http://localhost:3000.
3. Make your change on a new branch.
4. Run the tests (needs [Node.js](https://nodejs.org/) 18 or newer):

   ```
   npm test
   ```

   Every experiment must pass, and so must the circuit-code validation checks.
5. Open a pull request. The tests also run automatically on GitHub.

## Where things live

| File | What it holds |
|---|---|
| `js/core.js` | Everything without a page: board geometry, the IC library (pinouts and logic), the simulator, the experiments and their reference solutions, the guided-build steps, circuit-code validation. It also runs in Node for the tests. |
| `js/app.js` | The user interface: drawing the board, wiring, dragging, the side panel, lab sheets, the checker, the guide and the animations. |
| `css/style.css` | All styles, light and dark theme. Colours and fonts are CSS variables at the top. |
| `tests/run-tests.js` | The automated tests. |

## Adding a chip

1. Find the **official datasheet** (Texas Instruments, onsemi/Fairchild, Nexperia…). Check the pin numbers against the DIP pin diagram — never from memory or a random website. Put the datasheet link in your pull request.
2. In `js/core.js`, add the chip with `gateChip(...)` (simple gate packages) or `msiChip(...)` (everything else) and give it a category `cat`.
   - Pin names are listed from pin 1 upwards. Power pins are named `VCC`/`GND` (TTL) or `VDD`/`VSS` (CMOS).
   - Flip-flops, registers and counters use `seq: {init, step, out}`: `step` handles clock edges and set/clear/load and changes the stored state; `out` returns the outputs from that state.
   - Add a short `note` with anything a student could get wrong (odd power pins, active-LOW inputs…).
3. The chip appears in the ICs tab automatically.

## Adding an experiment

Most experiments use one chip, and `chipExp({...})` in `js/core.js` does nearly all the work: list the inputs as `[name, pin]`, the outputs, pins tied to +5 V or GND, CLOCK pins and pin-to-pin links. The wiring, guided build and procedure text are generated from that.

- **Combinational:** give a truth function `f` that returns the expected outputs. Write it from the textbook or datasheet behaviour, **not** by calling the chip model — the test compares the two, so writing it independently is what catches mistakes.
- **Sequential:** give `seq` (each step: switch values and number of CLOCK pulses) and `model(state, inputs, pulses)`. Choose steps so that every input is tested at both 0 and 1 and every output is HIGH at least once — otherwise a missing wire can go unnoticed.
- Write `objective`, `expr` and `theory` for students: short sentences, plain words.
- For a circuit of several chips, write `solve(api)` by hand (see the adder-subtractor as an example).

## Project rules

- **No libraries, frameworks or build tools.** The lab must keep working as plain files on GitHub Pages and on a slow phone.
- **Phones first.** Test portrait and landscape phone sizes (Chrome device mode: 390 × 844 and 844 × 390). Nothing should scroll sideways.
- **Never put untrusted text into HTML unescaped.** Use `esc()` for anything that comes from a circuit code, localStorage or the user. Circuit codes must pass `validState()`.
- **Animations:** animate only `transform`, `opacity`, `stroke-dashoffset` and `filter`; keep them short; respect "Reduce animations". `renderDyn()` rebuilds the board on every change, so only animate things that are new or changed.
- **Accuracy matters.** Students learn from this. A wrong pin number is a serious bug.
- Keep the existing code style (compact, no semicolon debates) and add a short comment above anything non-obvious.

## Pull request checklist

- [ ] `npm test` passes.
- [ ] Tried in the browser, including a phone size.
- [ ] Pinouts checked against an official datasheet (link in the PR) — if you added or changed a chip.
- [ ] No new dependencies.
- [ ] Screenshots for visible changes.

## Code of conduct

Everyone taking part is expected to follow our [Code of Conduct](CODE_OF_CONDUCT.md). Be kind — many contributors are students making their first pull request.

## Licence

The project is licensed under the [GNU General Public License v3.0](LICENSE) with [additional terms](ADDITIONAL-TERMS.md) that keep the author credit visible and reserve the project name. By contributing you agree that your contribution is released under the same license and terms.
