import { subSurfSphereVector, atomsSphereVector } from '@/offscreen/constants.js';
import * as THREE from 'three/webgpu';
import { GridPristine } from '@three-blocks/core';
import { component, updateComponentRegistry } from '@/offscreen/dispatcher';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { scene } from '@/offscreen/main';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { store } from '@/offscreen/store';
import virtualElement from '@/offscreen/dispatcher/helpers/virtualElement';
import { add, clamp, dot, float, mix, mul, normalWorld, pow, texture, uniform, uv, vec3, vertexColor, normalize, positionWorld, sub } from 'three/tsl';
import dispatcher from '@/shared/dispatcher';
import { OrbitParticles } from '@/offscreen/meshes/OrbitParticles.js';

const MOBILE_LAYOUT_MAX_WIDTH = 480;
const HOTZONE_FADE_DURATION = 1;
const DEMO_MESH_LOAD_COUNT = 4;

export class Demo extends component( THREE.Object3D, {
    raf: {
        renderPriority: 1,
        fps: Number.Infinity,
    },
} ) {
	

    init () {
		const lightPivot = new THREE.Object3D();
		lightPivot.position.set( 0, 0, 0 );
		// lightPivot.rotation.set( 0, 15, 0);
		scene.add( lightPivot );

		const keyDirectionalLight = new THREE.DirectionalLight( 0xcbe6f9, .75 );
		keyDirectionalLight.position.set( 0.0, .5, 0.5 ).normalize(); 
		scene.add( keyDirectionalLight );

		const pointLight1 = new THREE.Mesh( new THREE.SphereGeometry( 0, 0, 0 ), new THREE.MeshBasicMaterial( { color: 0xcbe6f9 } ) );
		pointLight1.add( new THREE.PointLight( 0xcbe6f9, 75, 150, 0 ) );
		this._pointLight1 = pointLight1;
		lightPivot.add( pointLight1 );
		pointLight1.position.set( 0, -50, 350 );

		const pointLight2 = new THREE.Mesh( new THREE.SphereGeometry( 0,0,0), new THREE.MeshBasicMaterial( { color: 0xffc964 } ) );
		pointLight2.add( new THREE.PointLight( 0xffc964, 75, 165, 0  ) );
		this._pointLight2 = pointLight2;
		lightPivot.add( pointLight2 );
		pointLight2.position.set( 0, -50, -170 );

		this._lightPivot = lightPivot;

		this._clock = new THREE.Clock();

		this._keyDirectionalLight = keyDirectionalLight;
		this._keyLightWorldPos = new THREE.Vector3();
		this._keyTargetWorldPos = new THREE.Vector3();

		this._sssLightWorldPosition = uniform( new THREE.Vector3( 4, 4, 4 ) );
		this._sssKeyLightToward = uniform( new THREE.Vector3( 0, 1, 0 ) );

		this._demoMeshesLoaded = 0;
		this._demoMeshesReady = false;


	//GLB + SSS-style transmissive material
	const thicknessLoader = new THREE.ImageBitmapLoader();
	thicknessLoader.load( '/assets/ThickMap.png', ( bitmap ) => {

    const thicknessTex = new THREE.Texture( bitmap );
    thicknessTex.flipY = false;
    thicknessTex.colorSpace = THREE.NoColorSpace;
    thicknessTex.needsUpdate = true;

	const thicknessNode = texture( thicknessTex, uv() ).r;

	const pointToLightRay = normalize( this._sssLightWorldPosition.sub( positionWorld ) );
	const pointBackLightNode = pow(
		clamp( dot( normalWorld, pointToLightRay ), float( 0 ), float( 1 ) ),
		float( 5 )
	);

	const keyBackLightNode = pow(
		clamp( dot( normalWorld, this._sssKeyLightToward ), float( 0 ), float( 1 ) ),
		float( 5 )
	);

	const sssStrengthNode = float( .25 );
	const keyFakeSssBoost = float( 2.5 );

	const baseVertexColorNode = vertexColor().rgb;
	const vertexColorLumaNode = dot( baseVertexColorNode, vec3( 0.2126, 0.7152, 0.0722 ) );
	const saturatedVertexColorNode = mix(
		vec3( vertexColorLumaNode, vertexColorLumaNode, vertexColorLumaNode ),
		baseVertexColorNode,
		float( 1.5 )
	);
	const brightVertexColorNode = mul( saturatedVertexColorNode, float( 1.6 ) );
	const sssColorNode = clamp( brightVertexColorNode, float( 0 ), float( 1 ) );

	const fakeSssFromPoint = mul( mul( mul( sssColorNode, thicknessNode ), pointBackLightNode ), sssStrengthNode );
	const fakeSssFromKey = mul(
		mul( mul( sssColorNode, thicknessNode ), keyBackLightNode ),
		mul( sssStrengthNode, keyFakeSssBoost )
	);

    const sssMaterial = new THREE.MeshPhysicalNodeMaterial( {
		color: 0xffffff,
		vertexColors: true,
        transmission: 1,
        thickness: 0.15,
        thicknessMap: thicknessTex,
		attenuationColor: new THREE.Color( 0xffc964 ),
        attenuationDistance: 1,
        roughness: 0.75,
        metalness: 0.0,
        ior: 1.5,
    } );
	sssMaterial.emissiveNode = add(
		add( sssMaterial.emissiveNode ?? vec3( 0, 0, 0 ), fakeSssFromPoint ),
		fakeSssFromKey
	);

    const gltfLoader = new GLTFLoader();
    gltfLoader.load(
		'/assets/subsurfHD.glb',
		( result ) => {

        result.scene.scale.setScalar( 2.5 );
		
		result.scene.traverse( ( child ) => {

            if ( child.isMesh ) {

                child.material = sssMaterial;

            }

        } );

        this.add( result.scene );
		this._subSurfMeshRoot = result.scene;
		store.subSurfMeshRoot = result.scene;
		this._meshLoadDone();

    },
		undefined,
		() => this._meshLoadDone()
	);

	const atomsMaterial = new THREE.MeshPhysicalNodeMaterial( {
		color: 0xffffff,
		vertexColors: true,
        transmission: 1,
        roughness: 0.125,
        metalness: 0.0,
        ior: 1.25,
    } );

	const gltfLoaderAtom = new GLTFLoader();
    gltfLoaderAtom.load(
		'/assets/atoms.glb',
		( resultAtom ) => {

        resultAtom.scene.scale.setScalar( 2.5 );

		resultAtom.scene.traverse( ( child ) => {

            if ( child.isMesh ) {

                child.material = atomsMaterial;

            }

        } );
	

        this.add( resultAtom.scene );
		this._atomsMeshRoot = resultAtom.scene;
		store.atomsMeshRoot = resultAtom.scene;
		this._meshLoadDone();

    },
		undefined,
		() => this._meshLoadDone()
	);

	const gltfLoaderBands = new GLTFLoader();
    gltfLoaderBands.load(
		'/assets/bands.glb',
		( resultBands ) => {

        resultBands.scene.scale.setScalar( 2.5 );
	

        this.add( resultBands.scene );
		this._meshLoadDone();

    },
		undefined,
		() => this._meshLoadDone()
	);

} );
		//Background Sphere

		const bckTxtLoader = new THREE.ImageBitmapLoader();
		bckTxtLoader.setOptions( { imageOrientation: 'flipY' } );
		bckTxtLoader.load( '/assets/bckgrnd.png', ( bitmap ) => {
			const bckMap = new THREE.Texture( bitmap );
			bckMap.colorSpace = THREE.SRGBColorSpace;
			bckMap.needsUpdate = true;
			const bckMat = new THREE.MeshPhysicalNodeMaterial( {
				map: bckMap,
				color: 0xffffff,
				side: THREE.DoubleSide,
				metalness: 0,
				roughness: 1,
			} );
			const bckSphLoader = new GLTFLoader();
			bckSphLoader.load(
				'/assets/Background.glb',
				( gltf ) => {
				const root = gltf.scene;
				root.scale.setScalar( 10 );
				root.traverse( ( child ) => {
					if ( child.isMesh ) {
						child.material = bckMat;
					}
				} );
				this.add( root );
				this._meshLoadDone();
			},
				undefined,
				() => this._meshLoadDone()
			);
		} );

		//clickable Sphere(s)

		// const subSurfSphereVector = new THREE.Vector3( 82, -30, 60 );
		// const atomsSphereVector = new THREE.Vector3( -50, 120, 40 );

		const sphere = new THREE.Mesh( new THREE.SphereGeometry( 1, 32, 32 ), new THREE.MeshBasicMaterial( { color: 0xffffff } ) );
		sphere.position.copy( subSurfSphereVector );
		sphere.name = 'subSurfClick';
		this.add( sphere );

		const sphere2 = new THREE.Mesh( new THREE.SphereGeometry( 1, 32, 32 ), new THREE.MeshBasicMaterial( { color: 0xffffff } ) );
		sphere2.position.copy( atomsSphereVector );
		sphere2.name = 'atomsClick';
		this.add( sphere2 );

		this._subSurfHotZoneAnchor = sphere;
		this._atomsHotZoneAnchor = sphere2;
		store.subSurfHotZone = sphere;
		store.atomsHotZone = sphere2;

		this._pickSpheres = [ sphere, sphere2 ];
		this.pickRaycaster = new THREE.Raycaster();
		this._pickNdc = new THREE.Vector2();

		// clickable spheres outlines (billboard: torus plane follows view)
		this._subSurfOutline = new THREE.Mesh( new THREE.TorusGeometry( 5, 1, 32, 32 ), new THREE.MeshBasicMaterial( { color: 0xffffff } ) );
		this._subSurfOutline.position.copy( subSurfSphereVector);
		this.add( this._subSurfOutline );

		this._atomsOutline = new THREE.Mesh( new THREE.TorusGeometry( 5, 1, 32, 32 ), new THREE.MeshBasicMaterial( { color: 0xffffff } ) );
		this._atomsOutline.position.copy( atomsSphereVector );
		this.add( this._atomsOutline );

		for ( const hotzoneMesh of [ sphere, sphere2, this._subSurfOutline, this._atomsOutline ] ) {

			hotzoneMesh.material.transparent = true;
			hotzoneMesh.material.opacity = 1;
			hotzoneMesh.material.depthWrite = false;
		
		}

		this._outlineScreenProbe = new THREE.Vector3();
		this._subSurfOutlineHoverScale = 2;
		this._atomsOutlineHoverScale = 2;

		this._atomsIntroRevealed = false;
		this._subSurfIntroRevealed = false;

		this._calloutClipScratch = new THREE.Vector3();

		dispatcher.on( 'mobileIntroDismiss', () => {

			if ( this._atomsIntroRevealed ) {

				this._atomsIntroRevealed = false;
				dispatcher.trigger( { name: 'atomsIntroHide' }, {} );

			}

			if ( this._subSurfIntroRevealed ) {

				this._subSurfIntroRevealed = false;
				dispatcher.trigger( { name: 'subSurfIntroHide' }, {} );

			}

		} );


        // Lighting

		// scene.add( new THREE.AmbientLight( 0xffffff, 1 ) );





        // const result = await new GLTFLoader().loadAsync('model.glb');
        // console.log(result);
        //this.add(result.scene);

        scene.add( this );

        // Environment
        this.setupEnvironment();

		this.add( new OrbitParticles() );

    }

	_meshLoadDone() {

		if ( this._demoMeshesReady ) return;

		this._demoMeshesLoaded++;

		const meshProgress = Math.round(
			( this._demoMeshesLoaded / DEMO_MESH_LOAD_COUNT ) * 100
		);
		dispatcher.trigger( { name: 'loadProgress' }, { progress: meshProgress } );

		if ( this._demoMeshesLoaded >= DEMO_MESH_LOAD_COUNT ) {

			this._demoMeshesReady = true;
			dispatcher.trigger( { name: 'demoMeshesReady' }, {} );

		}

	}

	_dampHotZoneOpacity( mesh, targetOpacity, delta ) {

		if ( ! mesh?.material ) return;

		const dt = Math.max( delta, 1 / 120 );
		const step = Math.min( 1, dt / HOTZONE_FADE_DURATION );
		mesh.material.opacity += ( targetOpacity - mesh.material.opacity ) * step;

		mesh.visible = targetOpacity > 0.5 || mesh.material.opacity > 0.005;

	}

    setupEnvironment() {

        const environment = new RoomEnvironment();
        const pmremGenerator = new THREE.PMREMGenerator( store.gl );
        scene.environment = pmremGenerator.fromScene( environment ).texture;
        scene.environmentIntensity = 0.5;
        pmremGenerator.dispose();
        scene.background = new THREE.Color( 0x1a1a2e );

    }

	_syncBillboardOutlineHover( outline, hoverScaleKey, delta ) {

		if ( ! outline || ! this.pickRaycaster ) return;

		const camera = store.camera;
		const pointer = store.pointerLerp;

		outline.quaternion.copy( camera.quaternion );

		this.pickRaycaster.setFromCamera( pointer, camera );
		const over = this.pickRaycaster.intersectObject( outline, false ).length > 0;

		outline.getWorldPosition( this._outlineScreenProbe );
		this._outlineScreenProbe.project( camera );

		const distNdc = Math.hypot(
			this._outlineScreenProbe.x - pointer.x,
			this._outlineScreenProbe.y - pointer.y
		);

		const hoverMax = 1.15;
		const proximityNdc = 0.28;
		const nearFactor = 1 - THREE.MathUtils.clamp( distNdc / proximityNdc, 0, 1 );
		const targetFromNear = THREE.MathUtils.lerp( 1, hoverMax, nearFactor );
		const target = over ? hoverMax : targetFromNear;

		this[ hoverScaleKey ] = THREE.MathUtils.damp( this[ hoverScaleKey ], target, 14, delta );
		outline.scale.setScalar( this[ hoverScaleKey ] );

	}

	onClick( data ) {
		if ( data?.offsetX == null || data?.offsetY == null ) return;
		const w = ( data.canvasCssWidth > 0 ) ? data.canvasCssWidth : virtualElement.width;
		const h = ( data.canvasCssHeight > 0 ) ? data.canvasCssHeight : virtualElement.height;
		if ( ! w || ! h ) return;
		this._pickNdc.x = ( data.offsetX / w ) * 2 - 1;
		this._pickNdc.y = - ( data.offsetY / h ) * 2 + 1;
		store.camera.updateMatrixWorld();

		const atomsHotZoneRadiusNdc = 0.1;
		const subSurfHotZoneRadiusNdc = 0.1;

		let inSubSurf = false;
		let inAtoms = false;

		if ( this._subSurfHotZoneAnchor ) {

			this._subSurfHotZoneAnchor.getWorldPosition( this._outlineScreenProbe );
			this._outlineScreenProbe.project( store.camera );
			inSubSurf = Math.hypot(
				this._pickNdc.x - this._outlineScreenProbe.x,
				this._pickNdc.y - this._outlineScreenProbe.y
			) < subSurfHotZoneRadiusNdc;

		}

		if ( this._atomsHotZoneAnchor ) {

			this._atomsHotZoneAnchor.getWorldPosition( this._outlineScreenProbe );
			this._outlineScreenProbe.project( store.camera );
			inAtoms = Math.hypot(
				this._pickNdc.x - this._outlineScreenProbe.x,
				this._pickNdc.y - this._outlineScreenProbe.y
			) < atomsHotZoneRadiusNdc;

		}

		if ( inSubSurf && ! this._subSurfIntroRevealed ) {

			this._subSurfIntroRevealed = true;
			dispatcher.trigger( { name: 'subSurfIntroReveal'}, {} );

		}

		if ( ! inSubSurf && this._subSurfIntroRevealed ) {

			this._subSurfIntroRevealed = false;
			dispatcher.trigger( { name: 'subSurfIntroHide'}, {} );

		}
		
		if ( inAtoms && ! this._atomsIntroRevealed ) {

			this._atomsIntroRevealed = true;
			dispatcher.trigger( { name: 'atomsIntroReveal'}, {} );

		}

		if ( ! inAtoms && this._atomsIntroRevealed ) {

			this._atomsIntroRevealed = false;
			dispatcher.trigger( { name: 'atomsIntroHide'}, {} );

		}


		if ( ! this._pickRaycaster || ! this._pickSpheres ) return;

	}

	onRaf( { delta } = {} ) {

		const dt = typeof delta === 'number' ? Math.min( delta, 0.1 ) : 1 / 60;

		this._syncBillboardOutlineHover( this._subSurfOutline, '_subSurfOutlineHoverScale', dt );
		this._syncBillboardOutlineHover( this._atomsOutline, '_atomsOutlineHoverScale', dt );

		if ( this._pointLight1 && this._sssLightWorldPosition ) {

			this._pointLight1.getWorldPosition( this._sssLightWorldPosition.value );

		}

		if ( this._keyDirectionalLight && this._sssKeyLightToward && this._keyLightWorldPos && this._keyTargetWorldPos ) {

			this._keyDirectionalLight.getWorldPosition( this._keyLightWorldPos );
			this._keyDirectionalLight.target.getWorldPosition( this._keyTargetWorldPos );
			this._sssKeyLightToward.value.subVectors( this._keyLightWorldPos, this._keyTargetWorldPos ).normalize();

		}

		if ( this._lightPivot && this._clock ) {

			const speed = .25;

			this._lightPivot.rotation.y += speed * this._clock.getDelta();
			this._lightPivot.rotation.x = THREE.MathUtils.degToRad( 15 );

		}
		const mobile = virtualElement.width <= MOBILE_LAYOUT_MAX_WIDTH;
		const atomsOpacityTarget = mobile && this._atomsIntroRevealed ? 0 : 1;
		const subSurfOpacityTarget = mobile && this._subSurfIntroRevealed ? 0 : 1;

		this._dampHotZoneOpacity(this._atomsHotZoneAnchor, atomsOpacityTarget, dt);
		this._dampHotZoneOpacity(this._atomsOutline, atomsOpacityTarget, dt);
		this._dampHotZoneOpacity(this._subSurfHotZoneAnchor, subSurfOpacityTarget, dt);
		this._dampHotZoneOpacity(this._subSurfOutline, subSurfOpacityTarget, dt);

		this._forwardExplainerCalloutAnchors();

	}

	_forwardExplainerCalloutAnchors() {

		const cssW = virtualElement.width;
		const cssH = virtualElement.height;
		const camera = store.camera;
		if ( ! cssW || ! cssH || ! camera ) return;

		camera.updateMatrixWorld();

		const clipVisible = ( v ) =>
			v.x >= - 1 &&
			v.x <= 1 &&
			v.y >= - 1 &&
			v.y <= 1 &&
			v.z >= - 1 &&
			v.z <= 1;

		const toCssPx = ( v, out ) => {

			out.sx = ( v.x * 0.5 + 0.5 ) * cssW;
			out.sy = ( 1 - ( v.y * 0.5 + 0.5 ) ) * cssH;
			out.visible = clipVisible( v );

		};

		const out = { sx: 0, sy: 0, visible: false };

		if ( this._atomsIntroRevealed && this._atomsHotZoneAnchor ) {

			this._atomsHotZoneAnchor.getWorldPosition( this._outlineScreenProbe );
			this._outlineScreenProbe.project( camera );
			toCssPx( this._outlineScreenProbe, out );
			dispatcher.trigger( { name: 'atomsExplainerAnchor' }, { ...out } );

		}

		if ( this._subSurfIntroRevealed && this._subSurfHotZoneAnchor ) {

			this._subSurfHotZoneAnchor.getWorldPosition( this._calloutClipScratch );
			this._calloutClipScratch.project( camera );
			toCssPx( this._calloutClipScratch, out );
			dispatcher.trigger( { name: 'subSurfExplainerAnchor' }, { ...out } );

		}

	}

    onResize() {}

    dispose() {

        super.dispose();

    }

}

// HMR support
if ( import.meta.hot ) {

    import.meta.hot.accept( ( newModule ) => {

        updateComponentRegistry( 'Demo', newModule );

    } );

}