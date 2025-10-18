// Main module extracted from index.html
import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// --- SCENE SETUP ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
// Increase near plane slightly to improve depth buffer precision (but not so large it clips the maze)
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.5, 1000);
camera.position.y = 0.5; // Player height
// Add camera to scene so camera children (like the player light) are part of the scene graph
scene.add(camera);

// Enable logarithmicDepthBuffer to reduce z-fighting on large depth ranges
const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
// Cap pixel ratio to avoid excessive GPU work on high-DPI displays
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// --- GHOST PROXIMITY OVERLAY ---
// Create a container for the directional red overlays that show ghost proximity.
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
// Create individual overlay elements for each direction.
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


// Post-processing: bloom for emissive glow (replaces per-pellet dynamic lights)
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.9, 0.4, 0.1);
composer.addPass(bloomPass);

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
                        // reduce emissive intensity so orbs produce less overall light
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
                        // reduce emissive intensity on power pellets as well
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
    
// --- PLAYER CONTROLS ---
    const controls = new PointerLockControls(camera, document.body);
    const playerSpeed = 2.5;
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
    const BOB_AMPLITUDE = 0.015; // reduced vertical bob amplitude

messageBox.addEventListener('click', () => {
    controls.lock();
});

controls.addEventListener('lock', () => {
    if (gameState === 'start' || gameState === 'gameOver' || gameState === 'won') {
         if(gameState !== 'start') resetGame();
         gameState = 'playing';
    }
    messageBox.style.display = 'none';
});

controls.addEventListener('unlock', () => {
    if (gameState === 'playing') {
         messageBox.style.display = 'flex';
         messageTitle.textContent = 'PAUSED';
         messageText.textContent = 'Click to Resume';
    }
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
class Ghost {
    constructor(color, startPos) {
        this.startPos = startPos;
        const geometry = new THREE.CapsuleGeometry(0.4, 0.6, 4, 8);
        this.normalMaterial = new THREE.MeshBasicMaterial({ color });
        this.frightenedMaterial = new THREE.MeshBasicMaterial({ color: 0x0000ff });
        this.mesh = new THREE.Mesh(geometry, this.normalMaterial);
        this.mesh.position.set(startPos.x, 0.7, startPos.z);
        scene.add(this.mesh);

                this.speed = 1.5; // Reduced from 1.8 to make ghosts slightly slower
                this.state = 'chasing'; // chasing, frightened, eaten
                this.frightenedTimer = 0;
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
                // Once the last frightened ghost reverts, dim the lights.
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
            } else {
               this.moveTowards(this.startPos, delta * 2); // Move back to pen faster
            }
            return;
        }

        const target = (this.state === 'frightened') ? this.getFleeTarget(playerPosition) : playerPosition;
        this.moveTowards(target, delta);
    }
    
    moveTowards(target, delta) {
        const ghostPos = this.mesh.position;
        const direction = new THREE.Vector3().subVectors(target, ghostPos).normalize();
        
        // Simplified AI: Move towards target, avoiding walls.
        const move = direction.multiplyScalar(this.speed * delta);
        
        // A very basic wall avoidance by picking the dominant axis of movement.
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

    isWall(pos) {
        const margin = 0.5; // Collision margin
        const tileX = Math.round(pos.x / TILE_SIZE);
        const tileZ = Math.round(pos.z / TILE_SIZE);
        return mazeLayout[tileZ] && mazeLayout[tileZ][tileX] === 1;
    }

    getFleeTarget(playerPosition) {
        // Run to a random corner
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

    frighten() {
        this.state = 'frightened';
        this.frightenedTimer = 8; // 8 seconds
        this.mesh.material = this.frightenedMaterial;
    }
    
    eat() {
        this.state = 'eaten';
        // You could add a simple "eyes" mesh that remains visible
    }
}

const ghosts = [
    new Ghost(0xff0000, { x: 9 * TILE_SIZE, z: 8 * TILE_SIZE }), // Blinky (Red)
    new Ghost(0xffb8ff, { x: 9 * TILE_SIZE, z: 9 * TILE_SIZE }), // Pinky (Pink)
    new Ghost(0x00ffff, { x: 8 * TILE_SIZE, z: 9 * TILE_SIZE }), // Inky (Cyan)
    new Ghost(0xffb851, { x: 10 * TILE_SIZE, z: 9 * TILE_SIZE }),// Clyde (Orange)
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
            } else {
                score += 10;
            }
            scoreEl.textContent = `Score: ${score}`;
            scene.remove(pellet);
            pellets.splice(i, 1);
            
            if (pellets.filter(p => !p.isPowerPellet).length === 0) {
                playerWins();
            }
        }
    }

    // Ghosts
    for (const ghost of ghosts) {
        if (camera.position.distanceTo(ghost.mesh.position) < 0.5) {
            // If the player collides with a frightened ghost, the player eats it.
            if (ghost.state === 'frightened') {
                score += 200;
                scoreEl.textContent = `Score: ${score}`;
                ghost.eat();
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
    
function playerLosesLife() {
    lives--;
    livesEl.textContent = `Lives: ${lives}`;
    if (lives <= 0) {
        gameOver();
    } else {
        // Reset positions
        camera.position.set(playerSpawn.x, 0.5, playerSpawn.z);
        ghosts.forEach(g => g.reset());
    }
}
    
function gameOver() {
    gameState = 'gameOver';
    messageTitle.textContent = 'GAME OVER';
    messageText.textContent = `Final Score: ${score}\nClick to Restart`;
    messageBox.style.display = 'flex';
    controls.unlock();
}
    
function playerWins() {
    gameState = 'won';
     messageTitle.textContent = 'YOU WIN!';
    messageText.textContent = `Final Score: ${score}\nClick to Restart`;
    messageBox.style.display = 'flex';
    controls.unlock();
}
    
function resetGame() {
    score = 0;
    lives = 3;
    scoreEl.textContent = `Score: ${score}`;
    livesEl.textContent = `Lives: ${lives}`;
    
    // Remove old pellets and create new ones
    pellets.forEach(p => scene.remove(p));
    pellets.length = 0;
    
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
