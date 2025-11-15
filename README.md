# 3D First-Person Pac-Man (I couldn't think of a better name so this is the placeholder lol)

## Installation & Running
1. Clone or download this repository.
2. Open a terminal in the project root directory.
3. Start a simple static server (the game uses ES modules so a server is required):

```powershell
# From repository root
python -m http.server 8000
# Requires you to have Python installed, but is typically the standard way for hosting static files, I'd recommend just using the hosted link though.
```

4. Open http://localhost:8000 in a modern browser (Chrome, Firefox). Click the center overlay to lock the pointer and begin.

Controls:
- W, A, S, D to move (A/D intentionally flipped to match original exercise controls)
- Mouse to look around
- Pointer lock must be enabled to play (click the message box to start)

Note: to toggle very-hard / BRUTAL ghost behavior edit `js/main.js` at the top and set `BRUTAL_MODE = true/false`.

---

## Hosted Link
https://amend09.github.io/scarypacman

---

## Reasoning behind this classic game (150 words)
The original Pac-Man design focuses on accessible, continuous navigation through a maze while balancing risk and reward. In this 3D first-person adaptation, the core dynamic, pellet collection versus evasion of predators, is preserved but experienced from the player’s point of view, delivering more tension and immediacy. Promoting dynamic AI, variable difficulty and powerups keeps the classic loop engaging while encouraging spatial awareness rather than pattern memorization. The ghosts’ different behaviors (direct chasers, predictive interceptors, and corner-bound scatterers) replicate the original’s emergent interactions but use grid pathfinding to provide more convincing pursuit and evasion. Visual bloom, emissive pellets, and sound feedback preserve the arcade atmosphere. The result aims to maintain the simple, elegant balance of risk and reward central to the classic while leveraging modern 3D and audio tools to make instincts and timing more visceral. It's also just a cool horror game!

---

## Additional notes (not on website) — up to 150 words
This build uses A* pathfinding so ghosts compute realistic shortest paths and avoid obstacles. The `BRUTAL_MODE` constant forces every ghost to path directly to the player and increases reaction frequency for a high-difficulty mode, enable it per level or tweak speed multipliers in `js/main.js`. The `public/assets/scary-scream-3-81274.mp3` file is the death sound; you can replace or remove it. Sound playback requires a user gesture to start (click message box) so the browser will allow audio.

---

## Sources & Credits (MLA format)
Cabello, Ricardo (Mr.doob). "three.module.js." three.js, version 0.160.0, 2024, https://unpkg.com/three@0.160.0/build/three.module.js. Accessed 14 Nov. 2025.

CreateJS Authors. "SoundJS." CreateJS, https://code.createjs.com/1.0.0/soundjs.min.js. Accessed 14 Nov. 2025.

Google. "coin_drop.ogg." Google Actions Sound Library, https://actions.google.com/sounds/v1/cartoon/coin_drop.ogg. Accessed 14 Nov. 2025.

Google. "clang_and_wobble.ogg." Google Actions Sound Library, https://actions.google.com/sounds/v1/cartoon/clang_and_wobble.ogg. Accessed 14 Nov. 2025.

Google. "boing.ogg." Google Actions Sound Library, https://actions.google.com/sounds/v1/cartoon/boing.ogg. Accessed 14 Nov. 2025.

Google. "fairy_chime.ogg." Google Actions Sound Library, https://actions.google.com/sounds/v1/cartoon/fairy_chime.ogg. Accessed 14 Nov. 2025.

Freesound_community. "Scary Scream 3" mp3 file. Pixabay, https://pixabay.com/sound-effects/scary-scream-3-81274/. Accessed 14 Nov. 2025.

PointerLockControls. "PointerLockControls.js." three.js examples, https://unpkg.com/three@0.160.0/examples/jsm/controls/PointerLockControls.js. Accessed 14 Nov. 2025.

UnrealBloomPass. "UnrealBloomPass.js." three.js examples, https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/UnrealBloomPass.js. Accessed 14 Nov. 2025.

Notes: The procedural brick textures in `js/main.js` were generated in code; credits for textures/gfx assets are noted above if externally sourced.

---
