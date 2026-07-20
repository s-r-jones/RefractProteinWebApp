import { Scene } from 'three';

import Camera from './camera';
import { store } from '@/offscreen/store';

const scene = /* @__PURE__ */ new Scene();
const overlayScene = /* @__PURE__ */ new Scene();

const camera = /* @__PURE__ */ new Camera();

export { camera, scene, overlayScene };

store.scene = scene;
store.camera = camera;
store.overlayScene = overlayScene;
