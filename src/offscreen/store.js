import * as THREE from 'three/webgpu';

// storeWorker.js
export const defaultFPS = 60;

const store = {
	compiled: false,
	dpr: 1,
	fbo: new THREE.RenderTarget( 1, 1, {} ),
	fboScene: new THREE.Scene(),
	// Initial state of your store
	scene: null,
	scroll: 0,
	gl: null,
	orthographicLayer: 1,
	perspectiveLayer: 2,
	isWebGPU: true,
	// pointers
	pointer: new THREE.Vector2(),
	pointerLerp: new THREE.Vector2(),
	pointerLerpPrev: new THREE.Vector2(),
	pointerLerpDelta: new THREE.Vector2(),
	mouseVelocityRef: new THREE.Vector3(),
	mouseDirectionRef: new THREE.Vector3(),
	// recording state
	recorder: null,
	recording: false,
	recordFrameRate: 60,
	recordTotalFrames: 0,
	recordFrameCount: 0,
	// stats profiler (worker-side)
	statsProfiler: null,
	// stats (main-thread mode)
	stats: null,
	atomsMeshRoot: null,
	subSurfMeshRoot: null,
	atomsHotZone: null,
	subSurfHotZone: null,
};

// Your worker logic here that uses updateStore and store as needed

export { store };
