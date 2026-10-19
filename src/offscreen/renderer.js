import { component } from '@/offscreen/dispatcher';
import { camera, scene } from '@/offscreen/main';
import { store } from '@/offscreen/store';
import dispatcher from '@/shared/dispatcher';
import * as THREE from 'three/webgpu';

import {
	float,
	mix,
	pass,
	rand,
	renderOutput,
	screenCoordinate,
	screenUV,
	smoothstep,
	uniform,
	vec4,
} from 'three/tsl';

import { dof } from 'three/addons/tsl/display/DepthOfFieldNode.js';
const DOF_FOCAL_LENGTH = 60;
const DOF_BOKEH_SCALE = 2.5;
const RENDER_INFO_INTERVAL_MS = 500;
const VIGNETTE_STRENGTH = 0.25;

class RendererImpl extends component( THREE.WebGPURenderer, {
	raf: {
		renderPriority: Infinity,
	},
} ) {

	constructor( { canvas, isWebGPU } ) {

		super( {
			canvas,
			antialias: true,
			alpha: true,
			// pixelRatio: 1,
			powerPreference: 'high-performance',
			forceWebGL: ! isWebGPU,
		} );

		this.countRenderBeforeStart = 0;
		this._compiled = false;
		this._lastRenderInfoTime = 0;

		this.shadowMap.enabled = true;
		this.shadowMap.type = THREE.BasicShadowMap;
		this.pass = pass( scene, camera );

		this._sceneColor = this.pass.getTextureNode( 'output' );
		this._viewZ = this.pass.getViewZNode();
		this._focusDistance = uniform( 400 );
		this._focalLength = uniform( DOF_FOCAL_LENGTH );
		this._bokehScale = uniform( DOF_BOKEH_SCALE );

		this._dofActive = false;
		this._dofTarget = null;
		this._postEffectsEnabled = true;
		this._focusWorld = new THREE.Vector3();
		this._cameraWorld = new THREE.Vector3();
		this._cameraForward = new THREE.Vector3();
		this._toFocus = new THREE.Vector3();

		this.postProcessing = new THREE.PostProcessing( this );
		this.postProcessing.outputColorTransform = false;
		this._setOutputNoDof();

		dispatcher.on( 'atomsIntroReveal', () => {

			this._dofTarget = 'atoms';
			this._setOutputDof();
			if ( camera ) this._updateFocusDistance( camera );

		} );

		dispatcher.on( 'subSurfIntroReveal', () => {

			this._dofTarget = 'subsurf';
			this._setOutputDof();
			if ( camera ) this._updateFocusDistance( camera );

		} );

		dispatcher.on( 'atomsIntroHide', () => {

			this._disableDof();

		} );

		dispatcher.on( 'subSurfIntroHide', () => {

			this._disableDof();

		} );

		dispatcher.on( 'setPostEffects', ( { enabled } ) => {

			this._postEffectsEnabled = enabled;
			if ( this._dofActive ) this._setOutputDof();
			else this._setDisplayOutput( this._sceneColor );

		} );

	}

	_setOutputNoDof() {

		this._dofActive = false;
		this._dofTarget = null;
		this._setDisplayOutput( this._sceneColor );

	}

	_setOutputDof() {

		this._dofActive = true;
		const dofColor = dof(
			this._sceneColor,
			this._viewZ,
			this._focusDistance,
			this._focalLength,
			this._bokehScale
		);
		this._setDisplayOutput( dofColor );

	}

	_setDisplayOutput( linearColor ) {

		const displayColor = renderOutput( linearColor, THREE.ACESFilmicToneMapping, THREE.SRGBColorSpace );

		if ( ! this._postEffectsEnabled ) {

			this.postProcessing.outputNode = displayColor;
			this.postProcessing.needsUpdate = true;
			return;

		}

		const distanceFromCenter = screenUV.sub( 0.5 ).length();
		const vignette = mix( float( 1 ), float( 1 ).sub( smoothstep( 0.3, 0.8, distanceFromCenter ) ), VIGNETTE_STRENGTH );

		const triangularNoise = rand( screenCoordinate.xy ).add( rand( screenCoordinate.yx.add( 17 ) ) ).sub( 1 );
		const ditherOneStep = triangularNoise.div( 255 );

		this.postProcessing.outputNode = vec4( displayColor.rgb.mul( vignette ).add( ditherOneStep ), displayColor.a );
		this.postProcessing.needsUpdate = true;

	}

	_disableDof() {

		this._setOutputNoDof();

	}

	_updateFocusDistance( cam ) {

		const hotZone =
			this._dofTarget === 'atoms'
				? store.atomsHotZone
				: this._dofTarget === 'subsurf'
					? store.subSurfHotZone
					: null;

		if ( ! hotZone ) return;

		hotZone.getWorldPosition( this._focusWorld );

		cam.getWorldPosition( this._cameraWorld );
		cam.getWorldDirection( this._cameraForward );
		this._toFocus.subVectors( this._focusWorld, this._cameraWorld );
		this._focusDistance.value = Math.max(
			0.1,
			this._toFocus.dot( this._cameraForward )
		);

	}

	onResize( { width, height, dpr } ) {

		this.setDrawingBufferSize( width, height, dpr );

	}
	onLoadEnd() {

		this.assetsLoaded = true;

	}
	onCompileEnd() {

		this.sceneCompiled = true;

	}

	onDebug() {}

	onThrottle() {}
	onRaf( { camera: cam } ) {

		if ( ! this.sceneCompiled ) {

			return;

		}

		if ( this._dofActive && cam ) {

			this._updateFocusDistance( cam );

		}

		this.postProcessing.render();
		this._sendRenderInfo();

	}

	_sendRenderInfo() {

		const debugEnabled = store.statsProfiler || store.stats;
		if ( ! debugEnabled ) return;

		const now = performance.now();
		if ( now - this._lastRenderInfoTime < RENDER_INFO_INTERVAL_MS ) return;
		this._lastRenderInfoTime = now;

		const { drawCalls, triangles } = this.info.render;
		dispatcher.trigger( { name: 'renderInfo' }, { drawCalls, triangles } );

	}

}

export default RendererImpl;
