// Main JS for the 3D Pac-Man game
import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// --- Scene setup ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
// Increase near plane to improve depth precision
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.5, 1000);
camera.position.y = 0.5; // Player height
// Add camera to scene for attached child objects (like player light)
scene.add(camera);

// Use logarithmic depth buffer to reduce z-fighting
const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
// Cap pixel ratio to limit GPU load on high-DPI screens
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// --- Proximity overlay ---
// Container for directional red overlays (ghost proximity)
const overlayContainer = document.createElement('div');
overlayContainer.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 10;
`;
// Top/bottom/left/right overlay elements
const overlayTop = document.createElement('div');
overlayTop.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 50%; background: linear-gradient(to bottom, rgba(255,0,0,0.6), transparent); opacity: 0; transition: opacity 0.2s;';
const overlayBottom = document.createElement('div');
overlayBottom.style.cssText = 'position: absolute; bottom: 0; left: 0; width: 100%; height: 50%; background: linear-gradient(to top, rgba(255,0,0,0.6), transparent); opacity: 0; transition: opacity 0.2s;';
const overlayLeft = document.createElement('div');
overlayLeft.style.cssText = 'position: absolute; top: 0; left: 0; width: 50%; height: 100%; background: linear-gradient(to right, rgba(255,0,0,0.6), transparent); opacity: 0; transition: opacity 0.2s;';
const overlayRight = document.createElement('div');
overlayRight.style.cssText = 'position: absolute; top: 0; right: 0; width: 50%; height: 100%; background: linear-gradient(to left, rgba(255,0,0,0.6), transparent); opacity: 0; transition: opacity 0.2s;';

overlayContainer.appendChild(overlayTop);
overlayContainer.appendChild(overlayBottom);
overlayContainer.appendChild(overlayLeft);
overlayContainer.appendChild(overlayRight);
document.body.appendChild(overlayContainer);


// Post-processing: bloom for emissive glow
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.9, 0.4, 0.1);
composer.addPass(bloomPass);

// --- SOUND SETUP (SoundJS) ---
const soundMap = {
    coin: 'https://actions.google.com/sounds/v1/cartoon/coin_drop.ogg',
    power: 'https://actions.google.com/sounds/v1/cartoon/clang_and_wobble.ogg',
    ghost_eaten: 'https://actions.google.com/sounds/v1/cartoon/boing.ogg',
    // If a local death sound exists (in public/assets) use it; otherwise use the remote fallback
    die: 'public/assets/scary-scream-3-81274.mp3' || 'https://actions.google.com/sounds/v1/alarms/beep_short.ogg',
    level_up: 'https://actions.google.com/sounds/v1/cartoon/fairy_chime.ogg'
};

function registerSounds() {
    try {
        if (window.createjs && createjs.Sound) {
            Object.entries(soundMap).forEach(([id, url]) => createjs.Sound.registerSound(url, id));
        }
    } catch (e) { /* ignore */ }
}
function playSound(id) {
    if (window.createjs && createjs.Sound && createjs.Sound.play) {
        try { createjs.Sound.play(id); return; } catch(e){}
    }
    // fallback to HTMLAudio
    try { new Audio(soundMap[id]).play(); } catch(e){}
}

// Play a small 'chomp' sound — uses WebAudio when available for a short pitch-drop.
function playChomp() {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = 900; // start frequency
        gain.gain.value = 0.0001;
        osc.connect(gain);
        gain.connect(ctx.destination);
        const now = ctx.currentTime;
        // amplitude envelope
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(0.08, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
        // quick downward pitch for 'chomp'
        osc.frequency.setValueAtTime(900, now);
        osc.frequency.exponentialRampToValueAtTime(350, now + 0.14);
        osc.start(now);
        osc.stop(now + 0.16);
    } catch (e) {
        // fallback to coin audio
        playSound('coin');
    }
}
registerSounds();

// --- PROXIMITY AUDIO (WebAudio) ---
let proximityAudio = null;

function initProximityAudio() {
    if (proximityAudio) return proximityAudio;
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        // gentle starting values
        osc.type = 'sine';
        osc.frequency.value = 1400; // high pitch
        gain.gain.value = 0.0;
        // set smoothing
        gain.gain.setTargetAtTime(0, ctx.currentTime, 0.01);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        proximityAudio = { ctx, osc, gain, maxDistance: 12 };
        return proximityAudio;
    } catch (e) {
        proximityAudio = null;
        return null;
    }
}

function updateProximityAudio(minDistance) {
    // initialize lazily on first user interaction
    const prox = proximityAudio || initProximityAudio();
    if (!prox) return;
    // volume scales with how close the nearest chasing ghost is
    const md = Math.max(0.001, Math.min(prox.maxDistance, minDistance));
    const normalized = Math.max(0, 1 - md / prox.maxDistance);
    // slightly non-linear
    const vol = Math.pow(normalized, 1.6) * 0.03; // even quieter
    prox.gain.gain.setTargetAtTime(vol, prox.ctx.currentTime, 0.04);
    // gently shift frequency range for a subtle effect
    prox.osc.frequency.setTargetAtTime(200 + normalized * 400, prox.ctx.currentTime, 0.05);
}

// --- LIGHTING ---
const AMBIENT_INTENSITY_DARK = 0.05; // The scene's default, dark ambient light level.
const AMBIENT_INTENSITY_BRIGHT = 0.5; // The scene's brightness when a power pellet is active.
let targetAmbientIntensity = AMBIENT_INTENSITY_DARK;

scene.fog = new THREE.FogExp2(0x000000, 0.06);
const ambientLight = new THREE.AmbientLight(0x404040, AMBIENT_INTENSITY_DARK);
scene.add(ambientLight);
renderer.shadowMap.enabled = false;

// --- GAME STATE & UI ---
let score = 0;
let lives = 3;
let gameState = 'start'; // 'start', 'playing', 'gameOver', 'won'
const scoreEl = document.getElementById('score');
const livesEl = document.getElementById('lives');
const messageBox = document.getElementById('message-box');
const messageTitle = messageBox.querySelector('h1');
const messageText = messageBox.querySelector('p');
const coinsEl = document.getElementById('coins');
const youDiedEl = document.getElementById('you-died');
const respawnCounterEl = document.getElementById('respawn-count');

// Tutorial overlay elements (shown before the Click-to-Start message)
const tutorialEl = document.getElementById('tutorial');
const tutorialContinueBtn = tutorialEl ? tutorialEl.querySelector('.tutorial-continue') : null;

// Show tutorial on initial load and hide the click-to-start message until user continues
if (tutorialEl) {
    tutorialEl.style.display = 'flex';
    if (messageBox) messageBox.style.display = 'none';
}

if (tutorialContinueBtn) {
    tutorialContinueBtn.addEventListener('click', (e) => {
        // Hide the tutorial and reveal the click-to-start prompt
        tutorialEl.style.display = 'none';
        if (messageBox) messageBox.style.display = 'flex';
        // focus canvas for pointer lock sequence is triggered by clicking the message box
    });
    // Allow keyboard continuation (Enter/Space)
    tutorialContinueBtn.addEventListener('keyup', (ev) => {
        if (ev.key === 'Enter' || ev.code === 'Space') tutorialContinueBtn.click();
    });
    // also allow skipping tutorial with Escape key
    document.addEventListener('keydown', (ev) => {
        if ((ev.key === 'Escape' || ev.key === 'Enter') && tutorialEl && tutorialEl.style.display !== 'none') {
            tutorialEl.style.display = 'none';
            if (messageBox) messageBox.style.display = 'flex';
        }
    });
}

// Powerups UI overlay (center)
const powerupsEl = document.createElement('div');
powerupsEl.id = 'powerup-status';
document.getElementById('ui-container').appendChild(powerupsEl);

// Level indicator
const levelEl = document.createElement('div');
levelEl.id = 'level-indicator';
levelEl.style.position = 'absolute';
levelEl.style.top = '20px';
levelEl.style.left = '50%';
levelEl.style.transform = 'translateX(-50%)';
levelEl.style.background = 'rgba(0,0,0,0.4)';
levelEl.style.padding = '8px 12px';
levelEl.style.borderRadius = '10px';
levelEl.textContent = 'Tutorial';
document.getElementById('ui-container').appendChild(levelEl);

// --- MAZE DEFINITION ---
// 1 = Wall, 0 = Path (Pellet), 2 = Empty, 3 = Power Pellet, 4 = Ghost Pen
const TILE_SIZE = 2;
const WALL_HEIGHT = 1.5;
const mazeLayout = [
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 3, 1],
    [1, 0, 1, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 1, 0, 1],
    [1, 3, 1, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 1, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1, 0, 1, 0, 1, 1, 0, 1],
    [1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    [1, 1, 1, 1, 0, 1, 1, 1, 2, 4, 2, 1, 1, 1, 0, 1, 1, 1, 1],
    [2, 2, 2, 1, 0, 1, 2, 2, 2, 4, 2, 2, 2, 1, 0, 1, 2, 2, 2],
    [1, 1, 1, 1, 0, 1, 2, 1, 1, 4, 1, 1, 2, 1, 0, 1, 1, 1, 1],
    [0, 0, 0, 0, 0, 0, 2, 1, 2, 2, 2, 1, 2, 0, 0, 0, 0, 0, 0],
    [1, 1, 1, 1, 0, 1, 2, 1, 1, 1, 1, 1, 2, 1, 0, 1, 1, 1, 1],
    [2, 2, 2, 1, 0, 1, 2, 2, 2, 2, 2, 2, 2, 1, 0, 1, 2, 2, 2],
    [1, 1, 1, 1, 0, 1, 2, 1, 1, 1, 1, 1, 2, 1, 0, 1, 1, 1, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 1, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 1, 0, 1],
    [1, 3, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 3, 1],
    [1, 1, 0, 1, 0, 1, 0, 1, 1, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1],
    [1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
];
const mazeWidth = mazeLayout[0].length;
const mazeHeight = mazeLayout.length;
const mazeObjects = [];
const pellets = [];
let totalPellets = 0;
let powerupObjects = [];
let consecutiveGhostEaten = 0;
let coinsCollected = 0;
let totalCoins = 0;
let levelGoalCount = 0;

// --- ASSETS & MATERIALS ---
// Replace wall texture with a simple blue matte material or a blue brick pattern.
// Set WALL_STYLE to 'matte' for a flat blue wall, or 'brick' for a simple tiled brick look.
const WALL_STYLE = 'brick'; // 'matte' or 'brick'

const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 });
const pelletMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });
const powerPelletMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });

// Blue matte material
const matteWallMaterial = new THREE.MeshStandardMaterial({ color: 0x2a66ff, roughness: 1.0, metalness: 0.0 });

// Procedural blue brick texture using a canvas
function createBlueBrickTexture() {
    const width = 512, height = 512;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    // mortar / background
    ctx.fillStyle = '#153060';
    ctx.fillRect(0, 0, width, height);

    const brickColor = '#2a66ff';
    const brickH = 64;
    const brickW = 128;
    const gap = 8;

    for (let row = 0; row * (brickH + gap) < height; row++) {
        const y = row * (brickH + gap);
        const offset = (row % 2) ? Math.floor(brickW / 2) : 0;
        for (let x = -offset; x < width; x += brickW + gap) {
            ctx.fillStyle = brickColor;
            ctx.fillRect(x + gap / 2 + offset, y + gap / 2, brickW, brickH);
            // subtle shading
            ctx.fillStyle = 'rgba(0,0,0,0.06)';
            ctx.fillRect(x + gap / 2, y + brickH - 10, brickW, 10);
        }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 1);
    // anisotropy helper (safe check)
    if (renderer.capabilities && renderer.capabilities.getMaxAnisotropy) {
        tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    }
    return tex;
}

let wallMaterial;
if (WALL_STYLE === 'matte') {
    wallMaterial = matteWallMaterial;
} else {
    const brickTex = createBlueBrickTexture();
    wallMaterial = new THREE.MeshStandardMaterial({ map: brickTex, roughness: 1.0, metalness: 0.0 });
}

// --- MAZE GENERATION ---
const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(mazeWidth * TILE_SIZE, mazeHeight * TILE_SIZE),
    floorMaterial
);
floor.rotation.x = -Math.PI / 2;
floor.position.set((mazeWidth / 2) * TILE_SIZE - TILE_SIZE / 2, 0, (mazeHeight / 2) * TILE_SIZE - TILE_SIZE/2);
scene.add(floor);

for (let i = 0; i < mazeHeight; i++) {
    for (let j = 0; j < mazeWidth; j++) {
        const x = j * TILE_SIZE;
        const z = i * TILE_SIZE;

                if (mazeLayout[i][j] === 1) {
                    // collision wall (short)
                    const collisionWall = new THREE.Mesh(
                        new THREE.BoxGeometry(TILE_SIZE, WALL_HEIGHT, TILE_SIZE),
                        wallMaterial
                    );
                    collisionWall.position.set(x, WALL_HEIGHT / 2, z);
                    scene.add(collisionWall);
                    mazeObjects.push(collisionWall);

                    // tall visual wall to give sense of walls stretching to infinity
                    const VISUAL_WALL_HEIGHT = 60;
                    const visualWall = new THREE.Mesh(
                        new THREE.BoxGeometry(TILE_SIZE, VISUAL_WALL_HEIGHT, TILE_SIZE),
                        wallMaterial
                    );
                    visualWall.position.set(x, VISUAL_WALL_HEIGHT / 2, z);
                    visualWall.material = wallMaterial.clone();
                    // darker for depth
                    if (visualWall.material.color) visualWall.material.color.multiplyScalar(0.6);
                    scene.add(visualWall);
                } else if (mazeLayout[i][j] === 0) {
                    const pellet = new THREE.Mesh(
                        new THREE.SphereGeometry(0.1, 6, 6),
                        // lower emissive intensity for pellets
                        new THREE.MeshStandardMaterial({ color: 0xffff88, emissive: 0xffff66, emissiveIntensity: 0.7, roughness: 1.0 })
                    );
                    pellet.position.set(x, 0.5, z);
                    // rely on emissive material + bloom for glow; no dynamic lights
                    scene.add(pellet);
                    pellets.push(pellet);
                    totalPellets++;
        } else if (mazeLayout[i][j] === 3) {
                    const powerPellet = new THREE.Mesh(
                        new THREE.SphereGeometry(0.25, 12, 12),
                        // lower emissive intensity for power pellets
                        new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.0, roughness: 1.0 })
                    );
                    powerPellet.position.set(x, 0.5, z);
                    powerPellet.isPowerPellet = true;
                    // power pellet uses emissive material + bloom
                    scene.add(powerPellet);
                    pellets.push(powerPellet);
        }
    }
}

// After initial pellet creation, compute total coins for UI & progression
coinsCollected = 0;
totalCoins = pellets.filter(p => !p.isPowerPellet).length;
// default initial level goals
levelGoalCount = totalCoins;
updateCoinsUI();
    
// --- PLAYER CONTROLS ---
    const controls = new PointerLockControls(camera, document.body);
    let playerSpeed = 2.5;
    const playerVelocity = new THREE.Vector3();
    const playerDirection = new THREE.Vector3();
    let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;
    const playerSpawn = { x: 1 * TILE_SIZE, z: 1 * TILE_SIZE };
    const BASE_CAMERA_HEIGHT = 0.5;
    camera.position.set(playerSpawn.x, BASE_CAMERA_HEIGHT, playerSpawn.z);

// Player-mounted dynamic light so player can see nearby geometry
const playerLight = new THREE.PointLight(0xfff8cc, 1.6, 12, 2);
// place light in front of the camera (negative Z is forward in camera space)
playerLight.position.set(0, 0, -0.6);
playerLight.castShadow = false;
camera.add(playerLight);

    // Camera bobbing while walking (reduced amplitude for less motion)
    let bobTimer = 0;
    const BOB_SPEED = 6; // how fast the bob cycles (slower)
    const BOB_AMPLITUDE = 0.015; // camera bob amplitude

messageBox.addEventListener('click', () => {
    controls.lock();
});

controls.addEventListener('lock', () => {
    if (gameState === 'start' || gameState === 'gameOver' || gameState === 'won') {
         if(gameState !== 'start') resetGame();
         gameState = 'playing';
    }
    messageBox.style.display = 'none';
    // Begin the tutorial level on first lock, otherwise level progression is handled when finishing.
    if (gameState === 'playing') startLevel(currentLevel);
    const prox = initProximityAudio();
    if (prox && prox.ctx && prox.ctx.state === 'suspended') prox.ctx.resume();
});

controls.addEventListener('unlock', () => {
    if (gameState === 'playing') {
         messageBox.style.display = 'flex';
         messageTitle.textContent = 'PAUSED';
         messageText.textContent = 'Click to Resume';
    }
    if (proximityAudio && proximityAudio.gain) proximityAudio.gain.gain.setTargetAtTime(0, proximityAudio.ctx.currentTime, 0.01);
});

document.addEventListener('keydown', (e) => {
    switch (e.code) {
        case 'KeyW': moveForward = true; break;
        case 'KeyS': moveBackward = true; break;
    // flipped intentionally: A -> moveRight, D -> moveLeft
    case 'KeyA': moveRight = true; break;
    case 'KeyD': moveLeft = true; break;
    }
});
document.addEventListener('keyup', (e) => {
    switch (e.code) {
        case 'KeyW': moveForward = false; break;
        case 'KeyS': moveBackward = false; break;
    case 'KeyA': moveRight = false; break;
    case 'KeyD': moveLeft = false; break;
    }
});

// --- GHOSTS ---
// Brutal difficulty flag: when true, all ghosts always pathfind to the player using A*
const BRUTAL_MODE = true;

class Ghost {
    constructor(color, startPos, type = 'generic') {
        this.startPos = startPos;
        const geometry = new THREE.CapsuleGeometry(0.4, 0.6, 4, 8);
        this.normalMaterial = new THREE.MeshBasicMaterial({ color });
        this.frightenedMaterial = new THREE.MeshBasicMaterial({ color: 0x0000ff });
        this.mesh = new THREE.Mesh(geometry, this.normalMaterial);
        this.mesh.position.set(startPos.x, 0.7, startPos.z);
        scene.add(this.mesh);

                this.speed = 1.5; // ghost base speed
                this.type = type; // blinky/pinky/inky/clyde/generic
                this.state = 'chasing'; // chasing, frightened, eaten, scatter
                this.frightenedTimer = 0;
                this.path = null;
                this.repath = 0;
    }

    reset() {
        this.mesh.position.set(this.startPos.x, 0.7, this.startPos.z);
        this.state = 'chasing';
        this.mesh.material = this.normalMaterial;
    }

    update(delta, playerPosition) {
        if (this.state === 'frightened') {
            this.frightenedTimer -= delta;
            if (this.frightenedTimer <= 0) {
                this.state = 'chasing';
                this.mesh.material = this.normalMaterial;
                // When frightened ends, revert ambient light
                if (!ghosts.some(g => g.state === 'frightened')) {
                    targetAmbientIntensity = AMBIENT_INTENSITY_DARK;
                }
            }
        }
        if (this.state === 'eaten') {
            const distanceToStart = this.mesh.position.distanceTo(this.startPos);
            if (distanceToStart < 0.5) {
                this.state = 'chasing';
                this.mesh.material = this.normalMaterial;
                if (this.eyeLeft) { scene.remove(this.eyeLeft); scene.remove(this.eyeRight); delete this.eyeLeft; delete this.eyeRight; }
            } else {
               this.moveTowards(this.startPos, delta * 2); // Move back to pen faster
            }
            // update eyes to follow
            if (this.eyeLeft) this.eyeLeft.position.set(this.mesh.position.x - 0.08, 0.8, this.mesh.position.z - 0.12);
            if (this.eyeRight) this.eyeRight.position.set(this.mesh.position.x + 0.08, 0.8, this.mesh.position.z - 0.12);
            return;
        }

        const target = (this.state === 'frightened') ? this.getFleeTarget(playerPosition) : playerPosition;

        if (this.state === 'frightened' || this.state === 'eaten') {
            this.moveTowards(target, delta);
        } else {
            // Decide chase offset based on ghost type. If BRUTAL_MODE is enabled, always chase the exact player tile.
            let chaseTarget = playerPosition.clone();
            if (!BRUTAL_MODE) {
            if (this.type === 'pinky') {
                const ahead = camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(4 * TILE_SIZE);
                chaseTarget = playerPosition.clone().add(ahead);
            } else if (this.type === 'inky') {
                const blinky = ghosts.find(g => g.type === 'blinky');
                if (blinky) {
                    const vec = new THREE.Vector3().subVectors(playerPosition, blinky.mesh.position).multiplyScalar(2);
                    chaseTarget = playerPosition.clone().add(vec);
                }
            } else if (this.type === 'clyde') {
                const dist = this.mesh.position.distanceTo(playerPosition);
                // Clyde: when distant, chase player; when too close, scatter to corner.
                if (dist > 6 * TILE_SIZE) {
                    chaseTarget = playerPosition.clone();
                } else {
                    chaseTarget = this.getScatterTarget();
                }
            }
            }
            // Support scatter mode switching
            if (ghostMode === 'scatter') chaseTarget = this.getScatterTarget();
            this.followPathTo(chaseTarget, delta);
        }
    }
    
    moveTowards(target, delta) {
        const ghostPos = this.mesh.position;
        const direction = new THREE.Vector3().subVectors(target, ghostPos).normalize();
        
        // Move toward target and avoid walls
        const move = direction.multiplyScalar(this.speed * delta);
        
        // Simple wall-slide per-axis
        const nextPos = ghostPos.clone().add(move);
        const currentTile = {
            x: Math.floor(ghostPos.x / TILE_SIZE),
            z: Math.floor(ghostPos.z / TILE_SIZE)
        };
         const nextTile = {
            x: Math.floor(nextPos.x / TILE_SIZE),
            z: Math.floor(nextPos.z / TILE_SIZE)
        };

        // Check X and Z movement independently to slide along walls
        const tempPosX = ghostPos.clone();
        tempPosX.x += move.x;
        if (!this.isWall(tempPosX)) {
           ghostPos.x = tempPosX.x;
        }

        const tempPosZ = ghostPos.clone();
        tempPosZ.z += move.z;
        if (!this.isWall(tempPosZ)) {
           ghostPos.z = tempPosZ.z;
        }
    }

    followPathTo(target, delta) {
        this.repath -= delta;
        const ghostPos = this.mesh.position;
        const start = { x: Math.round(ghostPos.x / TILE_SIZE), z: Math.round(ghostPos.z / TILE_SIZE)};
        const goal = { x: Math.round(target.x / TILE_SIZE), z: Math.round(target.z / TILE_SIZE)};
        if (!this.path || this.repath <= 0) {
            this.path = getPath(start, goal);
            // in brutal mode: recalc path more often so ghosts react faster
            this.repath = BRUTAL_MODE ? (0.12 + Math.random() * 0.06) : (0.35 + Math.random() * 0.2);
        }
        if (this.path && this.path.length > 1) {
            const next = this.path[1];
            const nextCenter = new THREE.Vector3(next.x * TILE_SIZE, ghostPos.y, next.z * TILE_SIZE);
            const dir = new THREE.Vector3().subVectors(nextCenter, ghostPos).normalize();
            const move = dir.multiplyScalar(this.speed * delta);
            const tempX = ghostPos.clone(); tempX.x += move.x; if (!this.isWall(tempX)) ghostPos.x = tempX.x;
            const tempZ = ghostPos.clone(); tempZ.z += move.z; if (!this.isWall(tempZ)) ghostPos.z = tempZ.z;
        } else {
            // fallback to straight movement
            this.moveTowards(target, delta);
        }
    }

    isWall(pos) {
        const margin = 0.5; // Collision margin
        const tileX = Math.round(pos.x / TILE_SIZE);
        const tileZ = Math.round(pos.z / TILE_SIZE);
        return mazeLayout[tileZ] && mazeLayout[tileZ][tileX] === 1;
    }

    getFleeTarget(playerPosition) {
        // Flee to a random corner
        const corners = [
            new THREE.Vector3(1*TILE_SIZE, 0, 1*TILE_SIZE),
            new THREE.Vector3(17*TILE_SIZE, 0, 1*TILE_SIZE),
            new THREE.Vector3(1*TILE_SIZE, 0, 18*TILE_SIZE),
            new THREE.Vector3(17*TILE_SIZE, 0, 18*TILE_SIZE),
        ];
        if(!this.fleeCorner) this.fleeCorner = corners[Math.floor(Math.random() * corners.length)];
        if(this.mesh.position.distanceTo(this.fleeCorner) < 2) {
            this.fleeCorner = corners[Math.floor(Math.random() * corners.length)];
        }
        return this.fleeCorner;
    }

    getScatterTarget() {
        // Use type-specific corners for scatter
        if (this.type === 'blinky') return new THREE.Vector3(17*TILE_SIZE,0,1*TILE_SIZE);
        if (this.type === 'pinky') return new THREE.Vector3(1*TILE_SIZE,0,1*TILE_SIZE);
        if (this.type === 'inky') return new THREE.Vector3(17*TILE_SIZE,0,18*TILE_SIZE);
        return new THREE.Vector3(1*TILE_SIZE,0,18*TILE_SIZE);
    }

    frighten() {
        this.state = 'frightened';
        this.frightenedTimer = (levels[currentLevel] && levels[currentLevel].frightenedDuration) || 8; // seconds from level config
        this.mesh.material = this.frightenedMaterial;
        this.path = null;
        // brighten the scene when ghosts are frightened
        targetAmbientIntensity = AMBIENT_INTENSITY_BRIGHT;
    }
    
    eat() {
        this.state = 'eaten';
        // add 'eyes' visual for eaten state
        // Use a bright material and small eyes to indicate eaten state
        this.mesh.material = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const eyeGeo = new THREE.SphereGeometry(0.06, 6, 6);
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
        this.eyeLeft = new THREE.Mesh(eyeGeo, eyeMat);
        this.eyeRight = new THREE.Mesh(eyeGeo, eyeMat);
        scene.add(this.eyeLeft); scene.add(this.eyeRight);
        // eyes follow visual position
        this.eyeLeft.position.set(this.mesh.position.x - 0.08, 0.8, this.mesh.position.z - 0.12);
        this.eyeRight.position.set(this.mesh.position.x + 0.08, 0.8, this.mesh.position.z - 0.12);
    }
}

const ghosts = [
    new Ghost(0xff0000, { x: 9 * TILE_SIZE, z: 8 * TILE_SIZE }, 'blinky'), // Blinky (Red)
    new Ghost(0xffb8ff, { x: 9 * TILE_SIZE, z: 9 * TILE_SIZE }, 'pinky'), // Pinky (Pink)
    new Ghost(0x00ffff, { x: 8 * TILE_SIZE, z: 9 * TILE_SIZE }, 'inky'), // Inky (Cyan)
    new Ghost(0xffb851, { x: 10 * TILE_SIZE, z: 9 * TILE_SIZE }, 'clyde'),// Clyde (Orange)
];

// --- GAME LOGIC & ANIMATION ---
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

    // Smoothly transition the ambient light towards its target intensity.
    const transitionSpeed = 2.0; // Controls how fast the light fades in and out.
    ambientLight.intensity += (targetAmbientIntensity - ambientLight.intensity) * transitionSpeed * delta;

    if (gameState === 'playing' && controls.isLocked) {
        updatePlayer(delta);
        checkCollisions();
        ghosts.forEach(ghost => ghost.update(delta, camera.position));
        updateProximityOverlay();
    }

    // Alternate ghost chase/scatter modes
    modeTimer += delta;
    if (modeTimer > 12) { ghostMode = (ghostMode === 'chase') ? 'scatter' : 'chase'; modeTimer = 0; }

    // Proximity audio: nearest chasing ghost modulates tone
    let nearest = Infinity;
    for (const g of ghosts) {
        if (g.state === 'chasing') {
            nearest = Math.min(nearest, camera.position.distanceTo(g.mesh.position));
        }
    }
    if (nearest < Infinity) updateProximityAudio(nearest);

    // Render through composer so emissive materials bloom without dynamic lights
    composer.render();
}

function updatePlayer(delta) {
    const speed = playerSpeed * delta;
    playerVelocity.x -= playerVelocity.x * 10.0 * delta;
    playerVelocity.z -= playerVelocity.z * 10.0 * delta;

    playerDirection.z = Number(moveForward) - Number(moveBackward);
    // left/right axes are flipped: left input reduces x (strafe left), but we intentionally map inputs flipped above
    playerDirection.x = Number(moveLeft) - Number(moveRight);
    playerDirection.normalize();

    if (moveForward || moveBackward) playerVelocity.z -= playerDirection.z * speed * 5.0;
    if (moveLeft || moveRight) playerVelocity.x -= playerDirection.x * speed * 5.0;

    const oldPosition = camera.position.clone();
    
    controls.moveRight(-playerVelocity.x * delta);
    controls.moveForward(-playerVelocity.z * delta);

    // Wall collision detection
    const playerBox = new THREE.Box3().setFromCenterAndSize(
        camera.position, new THREE.Vector3(0.5, 1, 0.5)
    );

    for (const wall of mazeObjects) {
        const wallBox = new THREE.Box3().setFromObject(wall);
        if (playerBox.intersectsBox(wallBox)) {
            camera.position.copy(oldPosition);
            break;
        }
    }

    // Camera bobbing (only when walking)
    const isMoving = moveForward || moveBackward || moveLeft || moveRight;
    if (isMoving) {
        bobTimer += delta * BOB_SPEED;
        camera.position.y = BASE_CAMERA_HEIGHT + Math.sin(bobTimer) * BOB_AMPLITUDE;
    } else {
        // relax back to base height
        bobTimer = 0;
        camera.position.y += (BASE_CAMERA_HEIGHT - camera.position.y) * Math.min(1, delta * 8);
    }
}

function checkCollisions() {
    // Pellets
    for (let i = pellets.length - 1; i >= 0; i--) {
        const pellet = pellets[i];
        if (camera.position.distanceTo(pellet.position) < 0.5) {
            if (pellet.isPowerPellet) {
                score += 50;
                // When a power pellet is eaten, brighten the lights and frighten the ghosts.
                targetAmbientIntensity = AMBIENT_INTENSITY_BRIGHT;
                ghosts.forEach(g => g.frighten());
                // reset consecutive eat multiplier
                consecutiveGhostEaten = 0;
                    playSound('power');
            } else {
                score += 10;
                // increment immediately for quick feedback
                coinsCollected += 1;
                // play a short 'chomp' sound like OG Pac-Man
                playChomp();
            }
            scoreEl.textContent = `Score: ${score}`;
            scene.remove(pellet);
            pellets.splice(i, 1);
            // Recompute coins from pellets to keep counters in sync
            coinsCollected = (totalCoins || 0) - pellets.filter(p => !p.isPowerPellet).length;
            updateCoinsUI();

            // Progression by coin goal
            if (coinsCollected >= levelGoalCount) {
                if (currentLevel < levels.length - 1) {
                    messageTitle.textContent = `Level ${currentLevel + 1} Complete!`;
                    messageText.textContent = `Proceeding to ${levels[currentLevel + 1].name}`;
                    messageBox.style.display = 'flex';
                    setTimeout(()=>{ messageBox.style.display = 'none'; resetGame(); currentLevel++; startLevel(currentLevel); playSound('level_up'); }, 1500);
                } else {
                    playerWins();
                }
            }

            // If all pellets were consumed, game win
            if (pellets.filter(p => !p.isPowerPellet).length === 0) {
                playerWins();
            }
        }
    }

    // Powerups (pickups)
    for (let i = powerupObjects.length - 1; i >= 0; i--) {
        const pu = powerupObjects[i];
        if (camera.position.distanceTo(pu.mesh.position) < 0.8) {
            activatePowerup(pu.type);
            playSound('power');
            scene.remove(pu.mesh);
            powerupObjects.splice(i, 1);
        }
    }

    // Ghosts
    for (const ghost of ghosts) {
        if (camera.position.distanceTo(ghost.mesh.position) < 0.5) {
            // If the player collides with a frightened ghost, the player eats it.
            if (ghost.state === 'frightened') {
                consecutiveGhostEaten = (consecutiveGhostEaten || 0) + 1;
                const reward = 200 * Math.pow(2, consecutiveGhostEaten - 1);
                // apply double score powerup
                const doubleActive = activePowerups && activePowerups.doubleScore && (Date.now() < activePowerups.doubleScore);
                score += (doubleActive ? reward * 2 : reward);
                scoreEl.textContent = `Score: ${score}`;
                ghost.eat();
                playSound('ghost_eaten');
                setTimeout(()=>{
                    if (ghost.eyeLeft) { scene.remove(ghost.eyeLeft); scene.remove(ghost.eyeRight); }
                }, 1400);
            } else if (ghost.state === 'chasing') {
                // Otherwise, if the ghost is chasing, the player loses a life.
                playerLosesLife();
                break;
            }
        }
    }
}

function updateProximityOverlay() {
    const DANGER_DISTANCE = 8.0; // How close a ghost must be to trigger the effect
    const MAX_OPACITY = 0.8; // Maximum opacity for the effect

    let totalInfluence = { top: 0, bottom: 0, left: 0, right: 0 };

    const cameraDirection = new THREE.Vector3();
    camera.getWorldDirection(cameraDirection);
    // Vector pointing to the camera's right
    const cameraRight = new THREE.Vector3().crossVectors(camera.up, cameraDirection).negate();

    for (const ghost of ghosts) {
        // The overlay only appears for chasing ghosts that are a threat.
        if (ghost.state !== 'chasing') continue;

        const dist = camera.position.distanceTo(ghost.mesh.position);

        if (dist < DANGER_DISTANCE) {
            // proximity is a value from 0 (at max distance) to 1 (at zero distance)
            const proximity = 1.0 - (dist / DANGER_DISTANCE);

            // Vector from camera to the ghost
            const toGhost = new THREE.Vector3().subVectors(ghost.mesh.position, camera.position).normalize();

            // Dot product gives us the alignment with camera's forward and right vectors
            const forwardComponent = toGhost.dot(cameraDirection); // Positive: in front, Negative: behind
            const rightComponent = toGhost.dot(cameraRight);     // Positive: right, Negative: left

            // Accumulate influence for each direction based on proximity and angle
            // Use Math.max to only consider positive contributions
            totalInfluence.top += proximity * Math.max(0, forwardComponent);
            totalInfluence.bottom += proximity * Math.max(0, -forwardComponent);
            totalInfluence.right += proximity * Math.max(0, rightComponent);
            totalInfluence.left += proximity * Math.max(0, -rightComponent);
        }
    }

    // Apply the calculated opacity to each overlay, capped at the max opacity.
    overlayTop.style.opacity = Math.min(MAX_OPACITY, totalInfluence.top);
    overlayBottom.style.opacity = Math.min(MAX_OPACITY, totalInfluence.bottom);
    overlayLeft.style.opacity = Math.min(MAX_OPACITY, totalInfluence.left);
    overlayRight.style.opacity = Math.min(MAX_OPACITY, totalInfluence.right);
}

function updateCoinsUI() {
    if (!coinsEl) return;
        // Recompute coins from remaining pellets (sync fallback)
        coinsCollected = (totalCoins || 0) - pellets.filter(p => !p.isPowerPellet).length;
        coinsEl.textContent = `Coins: ${coinsCollected}/${levelGoalCount || totalCoins}`;
}

// --- Pathfinding (A*) ---
function getNeighbors(tile) {
    const deltas = [ {x:1,z:0}, {x:-1,z:0}, {x:0,z:1}, {x:0,z:-1} ];
    const out = [];
    for (const d of deltas) {
        const nx = tile.x + d.x;
        const nz = tile.z + d.z;
        if (nx < 0 || nx >= mazeWidth || nz < 0 || nz >= mazeHeight) continue;
        if (mazeLayout[nz][nx] !== 1) out.push({x:nx, z:nz});
    }
    return out;
}

function getPath(start, goal) {
    // A* pathfinding for better ghost navigation
    const key = (t)=>t.x+','+t.z;
    if (!mazeLayout[goal.z] || mazeLayout[goal.z][goal.x] === 1) return null;

    function heuristic(a,b) { return Math.abs(a.x - b.x) + Math.abs(a.z - b.z); }

    const openSet = [start];
    const cameFrom = {};
    const gScore = {};
    const fScore = {};
    gScore[key(start)] = 0;
    fScore[key(start)] = heuristic(start, goal);
    cameFrom[key(start)] = null;

    while (openSet.length) {
        // pop node with lowest fScore
        openSet.sort((a,b) => (fScore[key(a)] || 1e9) - (fScore[key(b)] || 1e9));
        const current = openSet.shift();
        if (current.x === goal.x && current.z === goal.z) {
            // reconstruct path
            const path = [];
            let cur = current;
            while (cur) { path.push(cur); cur = cameFrom[key(cur)]; }
            return path.reverse();
        }

        for (const n of getNeighbors(current)) {
            const tentativeG = (gScore[key(current)] || 1e9) + 1;
            if (tentativeG < (gScore[key(n)] || 1e9)) {
                cameFrom[key(n)] = current;
                gScore[key(n)] = tentativeG;
                fScore[key(n)] = tentativeG + heuristic(n, goal);
                if (!openSet.some(o => o.x === n.x && o.z === n.z)) openSet.push(n);
            }
        }
    }
    return null;
}

// --- Powerups ---
const POWERUP_TYPES = ['speed', 'freeze', 'doubleScore'];
const activePowerups = {};

function spawnPowerupsFromLevel() {
    // spawn one special powerup randomly on an empty tile
    const freeTiles = [];
    for (let z=0; z<mazeHeight; z++) for (let x=0; x<mazeWidth; x++) if (mazeLayout[z][x] !== 1 && mazeLayout[z][x] !== 4) freeTiles.push({x,z});
    if (!freeTiles.length) return;
    const rnd = freeTiles[Math.floor(Math.random()*freeTiles.length)];
    const puType = POWERUP_TYPES[Math.floor(Math.random()*POWERUP_TYPES.length)];
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.06, 8, 12), new THREE.MeshBasicMaterial({ color: puType==='speed' ? 0x44ff44 : puType==='freeze' ? 0x4488ff : 0xffcc44 }));
    mesh.position.set(rnd.x * TILE_SIZE, 0.5, rnd.z * TILE_SIZE);
    scene.add(mesh);
    powerupObjects.push({type: puType, mesh});
}

function activatePowerup(type) {
    const duration = 8; // sec
    if (type === 'speed') {
        const previousSpeed = playerSpeed;
        playerSpeed = Math.max(3.0, playerSpeed + 1.6);
        setTimeout(()=>{ playerSpeed = previousSpeed; }, duration * 1000);
        showPowerupUI('Speed Boost', duration);
    } else if (type === 'freeze') {
        ghosts.forEach(g => { if (g.state === 'chasing' || g.state === 'scatter') { g.prevState = g.state; g.state = 'frightened'; g.frightenedTimer = duration; g.mesh.material = g.frightenedMaterial; }});
        showPowerupUI('Freeze Ghosts', duration);
    } else if (type === 'doubleScore') {
        activePowerups.doubleScore = Date.now() + duration*1000;
        showPowerupUI('Double Score', duration);
    }
}

function showPowerupUI(name, duration) {
    const el = document.createElement('div');
    el.className = 'powerup';
    el.innerHTML = `<div>${name} <span class='timer'>(${duration}s)</span></div>`;
    powerupsEl.appendChild(el);
    const start = Date.now();
    const interval = setInterval(()=>{ const left = Math.max(0, duration - Math.floor((Date.now()-start)/1000)); el.querySelector('.timer').textContent = `(${left}s)`; if (left===0) { clearInterval(interval); el.remove(); } }, 300);
}

// --- LEVELS & DIFFICULTY SETTINGS ---
const levels = [
    { name: 'Tutorial', ghostSpeed: 1.1, frightenedDuration: 12, ghostCount: 1, pelletGoal: 8 },
    // pelletGoal: absolute number; if <=1 it's treated as fraction of total
    { name: 'Level 1', ghostSpeed: 1.6, frightenedDuration: 10, ghostCount: 2, pelletGoal: 20 },
    { name: 'Level 2', ghostSpeed: 2.0, frightenedDuration: 8, ghostCount: 3, pelletGoal: 0.55 },
    { name: 'Level 3', ghostSpeed: 2.6, frightenedDuration: 6, ghostCount: 4, pelletGoal: 1.0 }
];

let currentLevel = 0;
let ghostMode = 'chase';
let modeTimer = 0;

function startLevel(index) {
    currentLevel = Math.min(index, levels.length-1);
    const cfg = levels[currentLevel];
    ghosts.forEach((g,i) => {
        // Make ghosts noticeably faster in brutal mode
        g.speed = BRUTAL_MODE ? cfg.ghostSpeed * 1.35 : cfg.ghostSpeed;
        g.reset();
        g.mesh.visible = i < cfg.ghostCount;
    });
    spawnPowerupsFromLevel();
    levelEl.textContent = `${cfg.name}`;
    // recalc coin goal based on pellets in the level
    totalCoins = pellets.filter(p => !p.isPowerPellet).length;
    if (cfg.pelletGoal === undefined) levelGoalCount = totalCoins;
    else if (cfg.pelletGoal <= 1) levelGoalCount = Math.ceil(totalCoins * cfg.pelletGoal);
    else levelGoalCount = Math.max(0, Math.min(totalCoins, cfg.pelletGoal));
    coinsCollected = 0;
    updateCoinsUI();
}
    
function playerLosesLife() {
    lives--;
    livesEl.textContent = `Lives: ${lives}`;
    if (lives <= 0) {
        gameOver();
    } else {
        // Show 'YOU DIED' overlay and respawn after short delay
        playSound('die');
        showYouDiedScreen(3);
    }
}
    
function gameOver() {
    gameState = 'gameOver';
    messageTitle.textContent = 'GAME OVER';
    messageText.textContent = `Final Score: ${score}\nClick to Restart`;
    messageBox.style.display = 'flex';
    controls.unlock();
    // fade out proximity audio
    if (proximityAudio && proximityAudio.gain) proximityAudio.gain.gain.setTargetAtTime(0, proximityAudio.ctx.currentTime, 0.02);
}

function showYouDiedScreen(seconds) {
    gameState = 'dying';
    youDiedEl.style.display = 'block';
    let left = seconds;
    respawnCounterEl.textContent = left;
    const interval = setInterval(()=>{
        left--;
        respawnCounterEl.textContent = Math.max(0,left);
        if (left <= 0) {
            clearInterval(interval);
            youDiedEl.style.display = 'none';
            // respawn player
            camera.position.set(playerSpawn.x, 0.5, playerSpawn.z);
            ghosts.forEach(g => g.reset());
            // fade out proximity audio briefly
            if (proximityAudio && proximityAudio.gain) proximityAudio.gain.gain.setTargetAtTime(0, proximityAudio.ctx.currentTime, 0.02);
            gameState = 'playing';
        }
    }, 1000);
}
    
function playerWins() {
    // Move to next level when current one completes
    if (currentLevel < levels.length - 1) {
        currentLevel++;
        // reset game for the next level
        resetGame();
        startLevel(currentLevel);
        // display a level-up notice but keep playing
        messageTitle.textContent = `LEVEL ${currentLevel}!`;
        messageText.textContent = `Get ready for ${levels[currentLevel].name}`;
        messageBox.style.display = 'flex';
        setTimeout(()=>{ messageBox.style.display = 'none'; controls.lock(); }, 2000);
    } else {
        gameState = 'won';
        messageTitle.textContent = 'YOU WIN!';
        messageText.textContent = `Final Score: ${score}\nClick to Restart`;
        messageBox.style.display = 'flex';
        controls.unlock();
    }
}
    
function resetGame() {
    score = 0;
    lives = 3;
    scoreEl.textContent = `Score: ${score}`;
    livesEl.textContent = `Lives: ${lives}`;
    
    // Re-populate pellets
    pellets.forEach(p => scene.remove(p));
    pellets.length = 0;
    // Remove powerups before respawning
    powerupObjects.forEach(p => scene.remove(p.mesh));
    powerupObjects.length = 0;
    
     for (let i = 0; i < mazeHeight; i++) {
        for (let j = 0; j < mazeWidth; j++) {
            const x = j * TILE_SIZE;
            const z = i * TILE_SIZE;
            if (mazeLayout[i][j] === 0) {
                const pellet = new THREE.Mesh(
                    new THREE.SphereGeometry(0.1, 6, 6),
                    new THREE.MeshStandardMaterial({ color: 0xffff88, emissive: 0xffff66, emissiveIntensity: 0.7, roughness: 1.0 })
                );
                pellet.position.set(x, 0.5, z);
                scene.add(pellet);
                pellets.push(pellet);
            } else if (mazeLayout[i][j] === 3) {
                 const powerPellet = new THREE.Mesh(
                    new THREE.SphereGeometry(0.25, 12, 12),
                    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.0, roughness: 1.0 })
                );
                powerPellet.position.set(x, 0.5, z);
                powerPellet.isPowerPellet = true;
                scene.add(powerPellet);
                pellets.push(powerPellet);
            }
        }
    }

    camera.position.set(playerSpawn.x, 0.5, playerSpawn.z);
    ghosts.forEach(g => g.reset());
    // compute total coins and reset counters
    coinsCollected = 0;
    totalCoins = pellets.filter(p => !p.isPowerPellet).length;
    // default goal is all coins if not specified
    const cfg = levels[currentLevel] || {};
    if (cfg.pelletGoal === undefined) levelGoalCount = totalCoins;
    else if (cfg.pelletGoal <= 1) levelGoalCount = Math.ceil(totalCoins * cfg.pelletGoal);
    else levelGoalCount = Math.max(0, Math.min(totalCoins, cfg.pelletGoal));
    updateCoinsUI();
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight);
    if (composer) {
        composer.setSize(window.innerWidth, window.innerHeight);
        if (bloomPass && bloomPass.setSize) bloomPass.setSize(window.innerWidth, window.innerHeight);
    }
});

animate();
