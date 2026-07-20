import { store } from '@/offscreen/store';
import dispatcher from '@/shared/dispatcher';
import { engine } from 'animejs';
import { TimestampQuery } from 'three/webgpu';

let flushCaptures = null;
const createdPanels = new Set();

// Dynamically import flushCaptures when stats is enabled
export async function initStatsCaptures() {

	const { flushCaptures: fc } = await import( 'stats-gl/addons/StatsGLNode.js' );
	flushCaptures = fc;

}

class Raf {

	constructor() {

		this.time = self.performance.now();

		/**
		 * A reference to the context from `requestAnimationFrame()` can
		 * be called (usually `window`).
		 *
		 * @type {?(Window|XRSession)}
		 */
		this._context = typeof self !== 'undefined' ? self : null;

		// Handle pause/resume from main thread visibility changes
		dispatcher.on( 'pause', () => {

			this.isPaused = true;

		} );

		dispatcher.on( 'resume', () => {

			this.isPaused = false;
			this.oldTime = self.performance.now(); // Reset time to prevent huge delta

		} );

	}

	start( gl ) {

		this.startTime = self.performance.now();
		this.oldTime = this.startTime;
		this.isPaused = false;

		gl.setAnimationLoop( async ( now, xrFrame ) => {

			// Stats profiler begin (worker mode)
			store.statsProfiler?.begin();
			// Stats begin (main-thread mode)
			store.stats?.begin();

			const { recording } = store;

			// Recording branch: drive deterministic time and capture frames without spawning a second RAF
			if ( recording ) {

				if ( this._isRecordingProcessing ) return;
				this._isRecordingProcessing = true;

				try {

					const frameRate = store.recordFrameRate || 60;
					// Deterministic timebase for anime.js and the scene
					this._recordTime = ( this._recordTime ?? 0 ) + 1 / frameRate;

					try {

						engine.tick( this._recordTime * 1000 );

					} catch ( e ) {

						// noop
						console.warn( e );

					}

					// Render the frame with deterministic delta
					await dispatcher.triggerOnRaf( {
						now: this._recordTime * 1000,
						delta: 1 / frameRate,
						xrFrame,
					} );

					if ( store.recorder && typeof store.recorder.step === 'function' ) {

						await store.recorder.step();

					}

					store.recordFrameCount = ( store.recordFrameCount || 0 ) + 1;

					if ( store.recordTotalFrames && store.recordFrameCount >= store.recordTotalFrames ) {

						let buffer;
						if ( store.recorder && typeof store.recorder.stop === 'function' ) {

							buffer = await store.recorder.stop();

						}

						store.recording = false;
						this._recordTime = 0;
						// Notify main thread/UI with the recorded buffer for download handling
						dispatcher.trigger( { name: 'recordingStopped' }, { buffer } );

					}

				} finally {

					this._isRecordingProcessing = false;

				}

				// Do not run the non-recording branch when recording
				return;

			}

			if ( ! this.isPaused ) {

				dispatcher.triggerOnRaf( {
					now,
					xrFrame,
				} );

			}

			if (store.statsProfiler) {

				gl.resolveTimestampsAsync( TimestampQuery.RENDER )
				gl.resolveTimestampsAsync( TimestampQuery.COMPUTE );

			}

			// Stats profiler end/update (worker mode)
			store.statsProfiler?.end();
			store.statsProfiler?.update();
			// Stats end/update (main-thread mode)
			store.stats?.end();
			store.stats?.update();

			// StatsGLNode texture captures
			if ( flushCaptures ) {

				const captures = await flushCaptures( gl );
				for ( const { name, bitmap, width, height } of captures ) {

					// Worker mode: post to main thread
					if ( store.statsProfiler ) {

						self.postMessage(
							{
								type: 'texture',
								name,
								bitmap,
								width: width || gl.domElement.width,
								height: height || gl.domElement.height,
							},
							[ bitmap ]
						);

					// Main-thread mode: pass directly to stats
					} else if ( store.stats ) {

						if ( ! createdPanels.has( name ) ) {

							store.stats.addTexturePanel( name );
							createdPanels.add( name );

						}

						store.stats.setTextureBitmap( name, bitmap, width || gl.domElement.width, height || gl.domElement.height );

					}

				}

			}

		} );

	}

	pause() {

		this.isPaused = true;

	}

}

export const raf = new Raf();
