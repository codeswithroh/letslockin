import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * Loads the real room.glb exported from room.blend.
 *
 * Key positions in Three.js world space (Blender Z-up → GLTF Y-up):
 *   Chair seat top : (-0.57, 0.65, -0.64)
 *   Desk surface   : (-1.10, 0.63, -0.62)
 *   Person faces   : -X direction (rotation.y = +Math.PI/2)
 */
export class Room {
  constructor(scene) {
    this.scene   = scene;
    this.group   = new THREE.Group();
    this._ready  = false;
    scene.add(this.group);
  }

  /** Returns a Promise that resolves when the model is loaded */
  load() {
    return new Promise((resolve, reject) => {
      const loader = new GLTFLoader();
      loader.load(
        '/models/room.glb',
        (gltf) => {
          const model = gltf.scene;

          model.traverse((obj) => {
            if (obj.isMesh) {
              obj.castShadow    = true;
              obj.receiveShadow = true;
              // Improve material rendering
              if (obj.material) {
                const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
                mats.forEach(mat => {
                  mat.needsUpdate = true;
                });
              }
            }
          });

          this.group.add(model);
          this._ready = true;
          resolve();
        },
        undefined,
        reject
      );
    });
  }

  /** Key world positions for avatar and camera placement */
  getPositions() {
    // Derived from Blender mesh inspection + coordinate conversion (Z-up → Y-up)
    return {
      // Where avatar sits (floor level, X/Z at chair)
      deskSeat: new THREE.Vector3(-0.57, 0, -0.64),

      // Pill face direction when seated (facing -X toward monitor)
      seatFacing: -Math.PI / 2,

      // Walk path points the avatar uses during break
      walkPath: [
        new THREE.Vector3(-0.57,  0, -0.30),  // stand up, step back
        new THREE.Vector3( 0.80,  0,  0.20),  // walk toward window/right
        new THREE.Vector3( 0.50,  0,  1.00),  // bed area
        new THREE.Vector3(-0.50,  0,  0.80),  // center of room
        new THREE.Vector3(-1.00,  0,  0.10),  // back toward plant/left
        new THREE.Vector3(-0.57,  0, -0.30),  // back near desk
      ],

      // Pill spawn & idle wander path (used in ROOM_UI state — avoids desk)
      roomStart: new THREE.Vector3(0.40, 0, 0.55),
      idleWalkPath: [
        new THREE.Vector3( 0.80, 0,  0.40),
        new THREE.Vector3( 0.55, 0,  0.95),
        new THREE.Vector3(-0.30, 0,  0.80),
        new THREE.Vector3(-0.80, 0,  0.25),
        new THREE.Vector3(-0.20, 0, -0.10),
        new THREE.Vector3( 0.55, 0,  0.30),
      ],
    };
  }
}
