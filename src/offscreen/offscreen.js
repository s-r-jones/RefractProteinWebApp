// Global error handlers for debugging - must be first
self.onerror = function ( ev ) {

	console.error( '[worker] ❌ Global error:', {
		message: ev.message,
		filename: ev.filename,
		lineno: ev.lineno,
		colno: ev.colno,
		error: ev.error,
		event: ev
	} );
	// Forward to main thread since Worker error event may have limited info
	self.postMessage( {
		type: 'worker-error',
		error: ev.error ? String( ev.error ) : String( ev ),
		source: ev.filename,
		lineno: ev.lineno,
		colno: ev.colno,
	} );

};

self.onunhandledrejection = ( event ) => {

	console.error( '[worker] ❌ Unhandled rejection:', event.reason );
	// Forward to main thread
	self.postMessage( {
		type: 'worker-error',
		error: String( event.reason ),
		source: 'unhandled-rejection',
	} );

};

import '@/offscreen/polyfills.js';
import Renderer from '@/offscreen/renderer';

import virtualElement from '@/offscreen/dispatcher/helpers/virtualElement';
import Site from '@/offscreen/site.js';
import { store } from '@/offscreen/store.js';
import dispatcher from '@/shared/dispatcher.js';
import * as Comlink from 'comlink';
import { StatsProfiler } from 'stats-gl';
async function initOffscreen( canvas, isWebGPU ) {

	let success = false;
	try {

		const gl = new Renderer( { canvas, isWebGPU } );
		await gl.init();

		new Site( {
			gl,
		} );
		success = true;

	} catch ( error ) {

		console.error( error );

	}

	return success;

}

function trigger( event, data ) {

	// event.log = true;
	dispatcher.trigger( event, data );

	if ( event.name === 'resize' ) {

		virtualElement.setSize( data.width, data.height );

	}

	if ( event.name === 'scroll' ) {

		store.scroll = data.progress;

	}

	if ( event.fireVirtualEvents ) {

		virtualElement.dispatchEvent( {
			...data,
			target: virtualElement,
		} );

	}

}

function subscribeToAllEvents( cb ) {

	const registeredHandlers = {}; // Store references to handlers

	const eventHandler = ( eventName ) => {

		if ( ! registeredHandlers[ eventName ] ) {

			registeredHandlers[ eventName ] = ( eventData ) => {

				// If eventData is a Proxy then ignore because it comes from the mainthread
				if ( eventData && eventData[ Comlink.proxyMarker ] ) {

					return;

				}

				if ( eventName ) {

					try {

						cb( {
							name: eventName,
							data: Comlink.proxy( eventData ),
						} );

					} catch ( e ) {

						console.error( `[Worker] Failed to forward event "${eventName}":`, e );

					}

				}

			};

		}

		return registeredHandlers[ eventName ];

	};

	const registerEventHandler = ( eventName ) => {

		const handler = eventHandler( eventName );
		if ( ! dispatcher.isHandlerRegistered( eventName, handler ) ) {

			dispatcher.on( eventName, handler );

		}

	};

	const handleNewEvent = ( data ) => {

		const { newEvent } = data;
		if ( newEvent !== 'newEventRegistered' ) {

			registerEventHandler( newEvent );

		}

	};

	// Pre-register critical events that must be forwarded to main thread
	const criticalEvents = [
		'loadStart',
		'loadProgress',
		'loadEnd',
		'compileEnd',
		'debugInfos',
		'sectionChange',
		'dampedScroll',
		'loadStart',
		'loadProgress',
		'loadEnd',
		'compileEnd',
		'debugInfos',
		'sectionChange',
		'dampedScroll',
		'atomsIntroReveal',
		'atomsIntroHide',
		'subSurfIntroReveal',
		'subSurfIntroHide',
		'atomsExplainerAnchor',
		'subSurfExplainerAnchor',
		'renderInfo',
	];

	for ( const eventName of criticalEvents ) {

		registerEventHandler( eventName );

	}

	// Subscribe to the special event for new event registrations
	dispatcher.on( 'newEventRegistered', handleNewEvent );

	// Subscribe to all existing events
	for ( const eventName in dispatcher.listeners ) {

		registerEventHandler( eventName );

	}

}

async function initStats( options ) {

	store.statsProfiler = new StatsProfiler( options );
	await store.statsProfiler.init( store.gl );

	// Initialize texture captures for StatsGLNode
	const { initStatsCaptures } = await import( '@/offscreen/dispatcher/helpers/raf.js' );
	await initStatsCaptures();

}

function getStats() {

	return store.statsProfiler?.getData() ?? null;

}

// Usage

const workerApi = {
	initOffscreen,
	trigger,
	subscribeToAllEvents,
	initStats,
	getStats,
};

Comlink.expose( workerApi );
