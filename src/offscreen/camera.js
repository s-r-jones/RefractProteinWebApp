import { atomsCamPos, atomsSphereVector, subSurfSphereVector, subSurfCamPos /* … */ } from '@/offscreen/constants.js';
import { PerspectiveCamera, Vector3 } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import dispatcher from '@/shared/dispatcher.js';
import { component } from '@/offscreen/dispatcher';

// Camera component allowing automatic orbit control override and such
class Camera extends component( PerspectiveCamera ) {

	constructor() {

		super( 40, 0, 0.1, 10000 );

	}

	init() {

		this.target = new Vector3(0, 0, 0);
		this.position.set(0, 200, 400);

		this.lookAt(this.target);
		this.offset = new Vector3(0, 0, 0);

		this._atomsIntroRevealed = false;
		this._subSurfIntroRevealed = false;

		this.lerping = false;
		this._lerpToAtoms = false;
		this._lerpToSubSurf = false;
		this._defaultPos = new Vector3(0, 200, 400);
		this._defaultTarget = new Vector3(0, 0, 0);

		dispatcher.on( 'atomsIntroReveal', () => {
			this._atomsIntroRevealed = true;
			this._lerpToAtoms = true;
			this.lerping = true;
			if ( this.controls ) {

				this.controls.autoRotate = false;
				this.controls.enabled = false;

			}

		} );
		dispatcher.on( 'atomsIntroHide', () => {
			this._atomsIntroRevealed = false;
			this._lerpToAtoms = false;
			this.lerping = true;
			if ( this.controls ) {

				this.controls.autoRotate = false;
				this.controls.enabled = false;

			}

		} );

		dispatcher.on( 'subSurfIntroReveal', () => {
			this._subSurfIntroRevealed = true;
			this._lerpToSubSurf = true;
			this.lerping = true;
			if ( this.controls ) {

				this.controls.autoRotate = false;
				this.controls.enabled = false;

			}

		} );
		dispatcher.on( 'subSurfIntroHide', () => {
			this._subSurfIntroRevealed = false;
			this._lerpToSubSurf = false;
			this.lerping = true;
			if ( this.controls ) {

				this.controls.autoRotate = false;
				this.controls.enabled = false;

			}

		} );
	}

	onRaf( { delta } ) {

		const controls = this.controls;
		if ( ! controls ) return;

		if ( ! this.lerping ) {

			controls.update();
			return;

		}

		const dt = typeof delta === 'number' && delta > 0 ? Math.min( delta, 0.1 ) : 1 / 60;
		const k = 1 - Math.exp( -8 * dt );
		const doneEps = 0.5;

		if ( this._lerpToAtoms && this._atomsIntroRevealed ) {
	
			this.position.lerp( atomsCamPos, k );
			controls.target.lerp( atomsSphereVector, k );

		} else if ( this._lerpToSubSurf && this._subSurfIntroRevealed ) {

			this.position.lerp( subSurfCamPos, k );
			controls.target.lerp( subSurfSphereVector, k );

		} else {

			this.position.lerp( this._defaultPos, k );
			controls.target.lerp( this._defaultTarget, k );

			const homeDone =
				this.position.distanceToSquared( this._defaultPos ) < doneEps * doneEps &&
				controls.target.distanceToSquared( this._defaultTarget ) < doneEps * doneEps;

			if ( homeDone ) {

				this.position.copy( this._defaultPos );
				controls.target.copy( this._defaultTarget );
				this.lookAt( controls.target );

				this.lerping = false;
				controls.enabled = true;
				controls.autoRotate = false;
				controls.update();

			} else {

				controls.update();

			}

			return;

		}

		const atomsDone =
			this.position.distanceToSquared( atomsCamPos ) < doneEps * doneEps &&
			controls.target.distanceToSquared( atomsSphereVector ) < doneEps * doneEps;

		const subSurfDone =
			this.position.distanceToSquared( subSurfCamPos ) < doneEps * doneEps &&
			controls.target.distanceToSquared( subSurfSphereVector ) < doneEps * doneEps;

		if ( this._lerpToAtoms && this._atomsIntroRevealed ) {

			if ( atomsDone ) {

				this.position.copy( atomsCamPos );
				controls.target.copy( atomsSphereVector );
				this.lookAt( controls.target );

				this.lerping = false;
				controls.enabled = true;
				controls.autoRotate = true;
				controls.autoRotateSpeed = 0.5;
				controls.update();

			} else {

				controls.update();

			}

		} else if ( this._lerpToSubSurf && this._subSurfIntroRevealed ) {

			if ( subSurfDone ) {

				this.position.copy( subSurfCamPos );
				controls.target.copy( subSurfSphereVector );

				this.lookAt( controls.target );

				this.lerping = false;
				controls.enabled = true;
				controls.autoRotate = true;
				controls.autoRotateSpeed = 0.5;
				controls.update();

			} else {

				controls.update();

			}

		}

	}

	initOrbitControls( domElement ) {

		this.controls = new OrbitControls( this, domElement );
		this.controls.enabled = true;
		this.controls.enableDamping = true;
		this.controls.dampingFactor = 0.08;
		this.controls.autoRotate = false;
		this.controls.autoRotateSpeed = 0.5;
		this.controls.maxDistance = 1200;
		this.controls.minDistance = 0;
		this.controls.target.copy( this.target );
		this.controls.update();

	}

	calculateUnitSize( distance = this.position.z ) {

		const vFov = ( this.fov * Math.PI ) / 180;
		const height = 2 * Math.tan( vFov / 2 ) * distance;
		const width = height * this.aspect;

		return {
			width,
			height,
		};

	}

	onResize( { ratio } ) {

		this.aspect = ratio;
		this.unit = this.calculateUnitSize();
		this.updateProjectionMatrix();

	}

}

export default Camera;
