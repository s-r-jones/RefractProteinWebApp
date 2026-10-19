import * as THREE from 'three/webgpu';

import { scene } from '@/offscreen/main';
import { store } from '@/offscreen/store';
import virtualElement from '@/offscreen/dispatcher/helpers/virtualElement';
import { component } from '@/offscreen/dispatcher';
import { raf } from '@/offscreen/dispatcher/helpers/raf';
import debugInfos from '@/offscreen/utils/debugInfos';
import { compileScene } from '@/offscreen/utils/compileScene';
import loader from '@/offscreen/loader';
import dispatcher from '@/shared/dispatcher';

// init events
import '@/offscreen/dispatcher';

// DOM Text synchronization
import DOMTextManager from '@/offscreen/domText/DOMTextManager';

// Configure font map: CSS font-family → TTF URL for Text.js 3D rendering
// Note: troika doesn't support woff2, must use TTF/OTF
DOMTextManager.fontMap = {
	'Geist Sans': '/fonts/Geist-Variable.ttf',
	'Geist Mono': '/fonts/GeistMono-Variable.ttf',
	'Times New Roman': '/fonts/Geist-Variable.ttf',
};

// SPH Demo
import { Demo } from '@/offscreen/meshes/Demo';


class Site extends component( null, {
	raf: {
		renderPriority: Number.Infinity, // always render in last the loop
		fps: Number.Infinity, // no throttle to the render RAF
	},
} ) {

	init( { gl } ) {

		this.gl = gl;
		this.progressDamp = 0;

		debugInfos();
		store.gl = gl;

		// Initialize DOM text synchronization
		this.domTextManager = new DOMTextManager();

		const { camera } = store;

		if ( typeof window !== 'undefined' ) {

			camera.initOrbitControls( gl.domElement );

		} else {

			camera.initOrbitControls( virtualElement );

		}

		raf.start( gl );

	}

	onWorkerReady() {

		loader.load();

	}

	onInitDebug( { gui } ) {

		console.log( '🏗️ Debug mode is enabled' );

		const isOffscreen = typeof window === 'undefined';

		if ( ! isOffscreen ) {

			dispatcher.trigger(
				{ name: 'debug', fireAtStart: true },
				{
					gui,
				}
			);

		}

	}
	onRaf() {}
	onDebug() {}

	onLoadEnd() {

		// basic scene setup
		// const px = loader.resources.px.asset;
		// const nx = loader.resources.nx.asset;
		// const py = loader.resources.py.asset;
		// const ny = loader.resources.ny.asset;
		// const pz = loader.resources.pz.asset;
		// const nz = loader.resources.nz.asset;

		// const texture = new THREE.CubeTexture([px, nx, py, ny, pz, nz]);

		// [texture].map((t) => {
		//   t.type = THREE.HalfFloatType;
		//   t.colorSpace = THREE.LinearSRGBColorSpace;
		//   t.minFilter = THREE.LinearFilter;
		//   t.magFilter = THREE.LinearFilter;
		//   t.generateMipmaps = false;
		//   t.needsUpdate = true;
		// });
		// scene.environment = texture;
		// scene.environmentIntensity = 2;

		const dirLight = new THREE.DirectionalLight( 0xffffff, 1 );
		dirLight.castShadow = false;
		dirLight.position.set( 5, 100, 10 );
		dirLight.shadow.camera.near = 1;
		dirLight.shadow.camera.far = 40;
		dirLight.shadow.camera.right = 30;
		dirLight.shadow.camera.left = - 30;
		dirLight.shadow.camera.top = 30;
		dirLight.shadow.camera.bottom = - 30;
		dirLight.shadow.mapSize.width = 2048 * 2;
		dirLight.shadow.mapSize.height = 2048 * 2;
		dirLight.shadow.bias = - 0.009;
		scene.add( dirLight );



		// SPH Demo (mesh GLTFs load async; compile runs in onDemoMeshesReady)
		new Demo();

	}

	onDemoMeshesReady() {

		const compileStartTime = performance.now();
		compileScene( this.gl, scene ).then( () => {

			const compileMs = Math.round( performance.now() - compileStartTime );
			dispatcher.trigger( { name: 'compileEnd', fireAtStart: true }, { compileMs } );

		} );

	}

}

export default Site;
