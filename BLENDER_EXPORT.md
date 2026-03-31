# Exporting Your Blender Assets for Let's Lock In

## Why export?
Blender `.blend` files can't run in a browser. Export to **GLB** (binary GLTF) and the game will automatically load your real models instead of the procedural placeholders.

---

## Room Export (`room.blend` → `public/models/room.glb`)

1. Open `The room/room.blend` in Blender.
2. **File → Export → glTF 2.0 (.glb/.gltf)**
3. Settings:
   - Format: **GLB** (single file)
   - ✅ Include: Selected Objects → **unchecked** (export all)
   - ✅ Geometry: Apply Modifiers
   - ✅ Materials: Export
   - ✅ Compression: off (for compatibility)
4. Save to `letslockin/public/models/room.glb`

---

## Avatar Export (`Cool guy low poly.blend` → `public/models/avatar.glb`)

The avatar needs **baked animations**. Create these in Blender's NLA Editor:

| Animation name | Description |
|---|---|
| `idle_stand` | Standing idle, slight breathing |
| `idle_sit` | Sitting at desk idle |
| `typing` | Arms typing at keyboard |
| `stand_up` | Transition from sit → stand (1–2 sec) |
| `sit_down` | Transition from stand → sit (1–2 sec) |
| `walk` | Walking cycle (loopable) |
| `stretch` | Arms up, full body stretch |

Export:
1. **File → Export → glTF 2.0 (.glb/.gltf)**
2. Settings:
   - Format: **GLB**
   - ✅ Animation: Export
   - ✅ Animation: Always Export Action → checked for each action above
   - ✅ Skinning: Export

3. Save to `letslockin/public/models/avatar.glb`

---

## Activating in the game

Once exported, update `src/scene/Avatar.js` — replace the procedural mesh with:

```js
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// In constructor:
const loader = new GLTFLoader();
loader.load('/models/avatar.glb', (gltf) => {
  this.root.add(gltf.scene);
  this._mixer = new THREE.AnimationMixer(gltf.scene);
  // Map clip names to actions:
  gltf.animations.forEach(clip => {
    this._actions[clip.name] = this._mixer.clipAction(clip);
  });
  this._actions['idle_stand']?.play();
});

// In update():
this._mixer?.update(delta);
```

And in `src/scene/Room.js` replace `this._build()` with:

```js
const loader = new GLTFLoader();
loader.load('/models/room.glb', (gltf) => {
  gltf.scene.traverse(obj => {
    if (obj.isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });
  this.group.add(gltf.scene);
});
```
