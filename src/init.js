import { initLoader } from '@/main/loader';
import { setupRecording } from '@/main/recording';
import createCanvasContext from '@/main/utils/createCanvasElement';
import { initDomEvents } from '@/main/utils/domEvents';
import { initDomTextSync } from '@/main/utils/domTextSync';
import { store } from '@/offscreen/store';
import { isIOS, isSafari } from '@/shared/devices';
import dispatcher from '@/shared/dispatcher';
import * as Comlink from 'comlink';

function init( { record = false, debug = false, offscreen = false } = {} ) {

	dispatcher.trigger( { name: 'loadProgress' }, { progress: 0 } );

	initLoader( dispatcher );

	const _isIOS = isIOS();
	const _isSafari = isSafari();

	let supportOffScreenWebGL =
    typeof HTMLCanvasElement !== 'undefined' &&
    'transferControlToOffscreen' in HTMLCanvasElement.prototype;

	// If it's Safari, then check the version because Safari < 17 doesn't support OffscreenCanvas with a WebGL context.
	if ( _isSafari || _isIOS ) {

		const versionMatch = navigator.userAgent.match( /version\/(\d+)/i );
		const safariVersion = versionMatch ? parseInt( versionMatch[ 1 ] ) : 0;
		supportOffScreenWebGL = safariVersion >= 17 && supportOffScreenWebGL;

	}

	if ( ! supportOffScreenWebGL ) {

		offscreen = false;

	}

	const { context, canvas } = createCanvasContext( 'webgpu', {
		width: window.innerWidth,
		height: window.innerHeight,
		// Avoid creating a rendering context on the main thread when using OffscreenCanvas
		autoCreateContext: ! offscreen,
	} );
	canvas.style.cssText = 'display: block; width: 100%; height: 100%;';
	const container = document.getElementById( 'app' ) || document.body;
	container.appendChild( canvas );


	const initApp = async () => {

		let isWebGPU = navigator.gpu !== undefined;

		// if (isWebGPU) {
		//   isWebGPU = await navigator.gpu.requestAdapter(adapterOptions);
		// }
		// isWebGPU = false;

		let api = dispatcher;
		let offscreenCanvas = canvas;
		let gui;

		if ( offscreen && 'transferControlToOffscreen' in canvas ) {

			const worker = new Worker(
				new URL( './offscreen/offscreen.js', import.meta.url ),
				{
					type: 'module',
				}
			);

			// Listen for worker errors forwarded via postMessage
			worker.addEventListener( 'message', ( event ) => {

				if ( event.data?.type === 'worker-error' ) {

					console.error( '[main] ❌ Worker error:', event.data );

				}

			} );

			// Also catch worker-level errors (syntax errors, import failures, etc.)
			worker.addEventListener( 'error', ( event ) => {

				console.error( '[main] ❌ Worker failed:', {
					message: event.message,
					filename: event.filename,
					lineno: event.lineno,
					colno: event.colno,
				} );

			} );

			self._workerOffscreen = worker;

			offscreenCanvas = canvas.transferControlToOffscreen();

			async function initWorker() {

				const workerApi = Comlink.wrap( worker );

				await workerApi.initOffscreen(
					Comlink.transfer( offscreenCanvas, [ offscreenCanvas ] ),
					Boolean( isWebGPU )
				);

				api = workerApi;

				workerApi.subscribeToAllEvents(
					Comlink.proxy( ( { name, data } ) => {

						dispatcher.trigger(
							{
								name: name,
								fireAtStart: true,
							},
							data
						);

					} )
				);
				// Add other necessary events like touchstart, touchmove, touchend, etc.

			}

			await initWorker();

			// stats-gl is only created and polled while the debug panel is visible
			let statsSetup = null;
			let statsVisible = false;

			const setupStats = async () => {

				const { default: Stats } = await import( 'stats-gl' );
				await api.initStats( { trackGPU: true, trackCPT: isWebGPU } );

				const stats = new Stats( { trackGPU: true, trackCPT: isWebGPU } );
				container.appendChild( stats.dom );
				return stats;

			};

			const pollStats = async ( stats ) => {

				if ( ! statsVisible ) return;

				const data = await api.getStats();
				stats.begin();
				if ( data ) stats.setData( data );
				stats.update();
				requestAnimationFrame( () => pollStats( stats ) );

			};

			dispatcher.on( 'debugPanelVisible', async ( { visible } ) => {

				statsSetup ??= setupStats();
				const stats = await statsSetup;

				const wasVisible = statsVisible;
				statsVisible = visible;
				stats.dom.style.display = visible ? '' : 'none';
				await api.setStatsRunning( visible );
				if ( visible && ! wasVisible ) pollStats( stats );

			} );

		} else {

			const initRendererAndSite = async () => {

				try {

					const { default: Renderer } = await import( '@/offscreen/renderer' );
					const { default: Site } = await import( '@/offscreen/site' );
					const gl = new Renderer( {
						canvas,
						isWebGPU: Boolean( isWebGPU ),
					} );

					if ( debug ) {

						const { Inspector } = await import( 'three/addons/inspector/Inspector.js' );
						gl.inspector = new Inspector();

						gui = gl?.inspector.createParameters( 'Threejs Blocks Starter' );

					}

					await gl.init();

					// Initialize stats-gl for main-thread mode
					if ( debug ) {

						const { default: Stats } = await import( 'stats-gl' );
						const stats = new Stats( { trackGPU: true, trackCPT: isWebGPU } );
						await stats.init( gl );
						container.appendChild( stats.dom );
						store.stats = stats;

						// Initialize texture captures for StatsGLNode
						const { initStatsCaptures } = await import( '@/offscreen/dispatcher/helpers/raf.js' );
						await initStatsCaptures();

					}

					store.isWebGPU = Boolean( isWebGPU );
					store.gl = gl;

					new Site( {
						gl,
					} );

				} catch ( error ) {

					console.error( 'Error initializing Renderer and Site:', error );

				}

			};

			await initRendererAndSite();

		}

		store.api = api;
		initDomEvents( api, canvas );
		initDomTextSync( api );

		// Pause/resume rendering when tab visibility changes to prevent freeze on return
		document.addEventListener( 'visibilitychange', () => {

			api.trigger( { name: document.hidden ? 'pause' : 'resume' }, {} );

		} );

		// Handle cursor changes from worker (e.g., pointer lock)
		dispatcher.on( 'setCursor', ( { cursor } ) => {

			document.body.style.cursor = cursor;

		} );

		if ( record && ! offscreen ) {

			await setupRecording( { context, api } );

		} else if ( record && offscreen ) {

			console.warn(
				'Recording is not supported when running offscreen. Disable offscreen or implement worker-side recording.'
			);

		}

		if ( debug && ! offscreen ) {

			// Pass inspector's gui for main thread debug controls
			api.trigger(
				{ name: 'initDebug', fireAtStart: true },
				{
					gui,
				}
			);

		}

		api.trigger( { name: 'workerReady', fireAtStart: true }, {} );

		return api;

	};

	return initApp();

}

export { init };
