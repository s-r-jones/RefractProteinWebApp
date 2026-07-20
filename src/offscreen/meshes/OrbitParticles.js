import * as THREE from 'three/webgpu';
import { component, updateComponentRegistry } from '@/offscreen/dispatcher';
import { store } from '@/offscreen/store';

const PARTICLE_COUNT = 8;
const ORBIT_RADIUS = 500;
const ORBIT_SPEED = 0.075;
const BALL_TEXTURE_URL = '/assets/ball.png';
const POINT_BASE_SIZE = 4;
const POINT_SCALE = 0.5;
const POINT_SIZE_MULTIPLIER = 25;

const pointDisplaySize = () =>
	POINT_BASE_SIZE * POINT_SCALE * POINT_SIZE_MULTIPLIER;

export class OrbitParticles extends component( THREE.Object3D, {
	raf: {
		renderPriority: 0,
		fps: Number.Infinity,
	},
} ) {

	init() {

		this._particles = [];
		this._dummy = new THREE.Object3D();
		this._cameraWorldPos = new THREE.Vector3();

		const geometry = new THREE.PlaneGeometry( 1, 1 );
		const material = new THREE.MeshBasicMaterial( {
			color: 0xffffff,
			transparent: true,
			opacity: 1,
			alphaTest: 0.05,
			depthWrite: false,
			side: THREE.DoubleSide,
		} );

		const ballLoader = new THREE.ImageBitmapLoader();
		ballLoader.load( BALL_TEXTURE_URL, ( bitmap ) => {

			const map = new THREE.Texture( bitmap );
			map.colorSpace = THREE.SRGBColorSpace;
			map.needsUpdate = true;
			material.map = map;
			material.needsUpdate = true;

		} );

		this._instancedMesh = new THREE.InstancedMesh(
			geometry,
			material,
			PARTICLE_COUNT
		);
		this.add( this._instancedMesh );

		for ( let i = 0; i < PARTICLE_COUNT; i++ ) {

			this._particles.push( {
				phase: Math.random() * Math.PI * 2,
				inclination: THREE.MathUtils.lerp( 0.35, 1.35, Math.random() ),
				planeRotation: Math.random() * Math.PI * 2,
			} );

		}

		this._orbitTime = 0;

	}

	onRaf( { delta } ) {

		const dt = typeof delta === 'number' ? delta : 1 / 60;
		this._orbitTime += dt;

		const camera = store.camera;
		if ( camera ) {

			camera.getWorldPosition( this._cameraWorldPos );

		}

		const size = pointDisplaySize();
		const mesh = this._instancedMesh;
		const dummy = this._dummy;

		for ( let i = 0; i < PARTICLE_COUNT; i++ ) {

			const p = this._particles[ i ];
			const a = p.phase + this._orbitTime * ORBIT_SPEED;
			const cx = Math.cos( a );
			const sx = Math.sin( a );

			let x = ORBIT_RADIUS * cx;
			let z = ORBIT_RADIUS * sx;
			let y = 0;

			const cosInc = Math.cos( p.inclination );
			const sinInc = Math.sin( p.inclination );
			const yTilt = y * cosInc - z * sinInc;
			const zTilt = y * sinInc + z * cosInc;
			y = yTilt;
			z = zTilt;

			const cosPr = Math.cos( p.planeRotation );
			const sinPr = Math.sin( p.planeRotation );
			const xFinal = x * cosPr + z * sinPr;
			const zFinal = - x * sinPr + z * cosPr;

			dummy.position.set( xFinal, y, zFinal );
			dummy.scale.setScalar( size );

			if ( camera ) {

				dummy.lookAt( this._cameraWorldPos );

			}

			dummy.updateMatrix();
			mesh.setMatrixAt( i, dummy.matrix );

		}

		mesh.instanceMatrix.needsUpdate = true;

	}

	onResize() {}

	dispose() {

		super.dispose();

	}

}

if ( import.meta.hot ) {

	import.meta.hot.accept( ( newModule ) => {

		updateComponentRegistry( 'OrbitParticles', newModule );

	} );

}
