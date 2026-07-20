// Polyfill setImmediate/clearImmediate for anime.js in worker context
// Must be imported before any module that uses these APIs
if ( typeof setImmediate === 'undefined' ) {

	globalThis.setImmediate = ( fn, ...args ) => setTimeout( fn, 0, ...args );
	globalThis.clearImmediate = ( id ) => clearTimeout( id );

}
