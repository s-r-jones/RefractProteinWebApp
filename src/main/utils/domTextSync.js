import { store } from '@/offscreen/store';

/**
 * Synchronizes DOM elements marked with `data-canvas-text` attribute to WebGPU Text
 * instances in the offscreen worker. Handles position, style extraction, and visibility.
 */
class DOMTextSync {

	constructor( api, options = {} ) {

		this.api = api;
		this.attribute = options.attribute || 'data-canvas-text';
		this.throttleMs = options.throttle || 16;
		this.fontResolver = options.fontResolver || null;
		this.disabled = options.disabled || false;

		this._elements = new Map(); // element -> { id, lastRect, visible, styles }
		this._idCounter = 0;
		this._pendingUpdates = [];
		this._rafId = null;
		this._scrollThrottled = false;
		this._canvasRect = { width: 1, height: 1 };

		this._mutationObserver = null;
		this._intersectionObserver = null;
		this._resizeObserver = null;

		this._onScroll = this._onScroll.bind( this );
		this._onResize = this._onResize.bind( this );

	}

	init() {

		if ( this.disabled ) return;

		this._setupMutationObserver();
		this._setupIntersectionObserver();
		this._setupResizeObserver();
		this._scanExisting();
		this._updateCanvasRect();

		window.addEventListener( 'scroll', this._onScroll, { passive: true } );
		window.addEventListener( 'resize', this._onResize, { passive: true } );

	}

	dispose() {

		if ( this._mutationObserver ) {

			this._mutationObserver.disconnect();
			this._mutationObserver = null;

		}

		if ( this._intersectionObserver ) {

			this._intersectionObserver.disconnect();
			this._intersectionObserver = null;

		}

		if ( this._resizeObserver ) {

			this._resizeObserver.disconnect();
			this._resizeObserver = null;

		}

		window.removeEventListener( 'scroll', this._onScroll );
		window.removeEventListener( 'resize', this._onResize );

		if ( this._rafId ) {

			cancelAnimationFrame( this._rafId );
			this._rafId = null;

		}

		// Remove all tracked elements
		for ( const [ element, data ] of this._elements ) {

			this._queueUpdate( data.id, 'remove', {} );

		}

		this._flush();
		this._elements.clear();

	}

	add( element ) {

		if ( ! this._elements.has( element ) ) {

			this._registerElement( element );

		}

	}

	remove( element ) {

		this._unregisterElement( element );

	}

	refresh( element ) {

		const data = this._elements.get( element );
		if ( data ) {

			const styles = this._extractStyles( element );
			const rect = this._getRect( element );
			this._queueUpdate( data.id, 'update', { styles, rect } );

		}

	}

	pause() {

		this.disabled = true;

	}

	resume() {

		this.disabled = false;

	}

	_setupMutationObserver() {

		this._mutationObserver = new MutationObserver( ( mutations ) => {

			for ( const mutation of mutations ) {

				// Handle added nodes
				if ( mutation.type === 'childList' ) {

					for ( const node of mutation.addedNodes ) {

						if ( node.nodeType === Node.ELEMENT_NODE ) {

							if ( node.hasAttribute( this.attribute ) ) {

								this._registerElement( node );

							}

							// Check descendants
							const descendants = node.querySelectorAll?.( `[${ this.attribute }]` );
							if ( descendants ) {

								descendants.forEach( ( el ) => this._registerElement( el ) );

							}

						}

					}

					// Handle removed nodes
					for ( const node of mutation.removedNodes ) {

						if ( node.nodeType === Node.ELEMENT_NODE ) {

							if ( this._elements.has( node ) ) {

								this._unregisterElement( node );

							}

							// Check descendants
							const descendants = node.querySelectorAll?.( `[${ this.attribute }]` );
							if ( descendants ) {

								descendants.forEach( ( el ) => this._unregisterElement( el ) );

							}

						}

					}

				}

				// Handle text content changes
				if ( mutation.type === 'characterData' ) {

					const parent = mutation.target.parentElement;
					if ( parent && this._elements.has( parent ) ) {

						const data = this._elements.get( parent );
						const styles = this._extractStyles( parent );
						this._queueUpdate( data.id, 'update', { styles } );

					}

				}

				// Handle attribute changes (style, class)
				if ( mutation.type === 'attributes' ) {

					const element = mutation.target;
					if ( mutation.attributeName === this.attribute
						&& element.hasAttribute( this.attribute )
						&& ! this._elements.has( element ) ) {

						this._registerElement( element );

					} else if (
						mutation.attributeName === this.attribute
						&& ! element.hasAttribute( this.attribute )
						&& this._elements.has( element )
					) {

						this._unregisterElement( element );

					} else if ( this._elements.has( element ) ) {

						const data = this._elements.get( element );
						const styles = this._extractStyles( element );
						this._queueUpdate( data.id, 'update', { styles } );

					}

				}

			}

		} );

		this._mutationObserver.observe( document.body, {
			childList: true,
			subtree: true,
			characterData: true,
			attributes: true,
			attributeFilter: [ this.attribute, 'style', 'class' ],
		} );

	}

	_setupIntersectionObserver() {

		this._intersectionObserver = new IntersectionObserver(
			( entries ) => {

				for ( const entry of entries ) {

					const data = this._elements.get( entry.target );
					if ( data ) {

						data.visible = entry.isIntersecting;
						this._queueUpdate( data.id, 'visibility', { visible: data.visible } );

					}

				}

			},
			{ threshold: 0 }
		);

	}

	_setupResizeObserver() {

		this._resizeObserver = new ResizeObserver( ( entries ) => {

			for ( const entry of entries ) {

				const data = this._elements.get( entry.target );
				if ( data ) {

					const rect = this._getRect( entry.target );
					this._queueUpdate( data.id, 'rect', { rect } );

				}

			}

		} );

	}

	_scanExisting() {

		const elements = document.querySelectorAll( `[${ this.attribute }]` );
		elements.forEach( ( el ) => this._registerElement( el ) );

	}

	_registerElement( element ) {

		if ( this._elements.has( element ) ) return;

		const id = `dom-text-${ this._idCounter ++ }`;
		const styles = this._extractStyles( element );
		const rect = this._getRect( element );
		const zIndex = this._getZIndex( element );

		const data = { id, lastRect: rect, visible: true, styles };
		this._elements.set( element, data );

		this._intersectionObserver.observe( element );
		this._resizeObserver.observe( element );

		this._queueUpdate( id, 'create', { styles, rect, zIndex } );

	}

	_unregisterElement( element ) {

		const data = this._elements.get( element );
		if ( ! data ) return;

		this._intersectionObserver.unobserve( element );
		this._resizeObserver.unobserve( element );
		this._elements.delete( element );

		this._queueUpdate( data.id, 'remove', {} );

	}

	_extractStyles( element ) {

		const computed = getComputedStyle( element );
		return {
			whitespace: computed.whiteSpace,
			text: element.textContent,
			fontSize: parseFloat( computed.fontSize ),
			fontFamily: computed.fontFamily.split( ',' )[ 0 ].replace( /['"]/g, '' ).trim(),
			fontWeight: computed.fontWeight,
			fontStyle: computed.fontStyle,
			// Pass element to get parent color if transparent
			color: this._parseColor( computed.color, element ),
			letterSpacing: parseFloat( computed.letterSpacing ) || 0,
			lineHeight: computed.lineHeight,
			textAlign: computed.textAlign,
			// Canvas text should always be visible
			opacity: 1,
		};

	}

	_parseColor( cssColor, element ) {

		// Parse rgb/rgba to hex integer
		const match = cssColor.match( /rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:,\s*([\d.]+))?\s*\)/ );
		if ( match ) {

			const r = parseInt( match[ 1 ], 10 );
			const g = parseInt( match[ 2 ], 10 );
			const b = parseInt( match[ 3 ], 10 );
			const a = match[ 4 ] !== undefined ? parseFloat( match[ 4 ] ) : 1;

			// If transparent (alpha = 0), try parent's color or default to white
			if ( a === 0 ) {

				if ( element && element.parentElement ) {

					const parentColor = getComputedStyle( element.parentElement ).color;
					return this._parseColor( parentColor, null );

				}

				return 0xffffff;

			}

			return ( r << 16 ) | ( g << 8 ) | b;

		}

		return 0xffffff;

	}

	_getRect( element ) {

		const rect = element.getBoundingClientRect();
		return {
			x: rect.left,
			y: rect.top,
			width: rect.width,
			height: rect.height,
		};

	}

	_getZIndex( element ) {

		const attr = element.getAttribute( 'data-canvas-z' );
		if ( attr !== null ) {

			return parseInt( attr, 10 ) || 0;

		}

		return 0;

	}

	_updateCanvasRect() {

		const canvasSize = store.canvasSize;
		if ( canvasSize ) {

			this._canvasRect = {
				width: canvasSize.width,
				height: canvasSize.height,
			};

		}

	}

	_queueUpdate( id, type, data ) {

		this._pendingUpdates.push( { id, type, ...data } );
		this._scheduleFlush();

	}

	_scheduleFlush() {

		if ( this._rafId || this.disabled ) return;
		this._rafId = requestAnimationFrame( () => {

			this._flush();
			this._rafId = null;

		} );

	}

	_flush() {

		if ( this._pendingUpdates.length === 0 ) return;

		const batch = this._pendingUpdates;
		this._pendingUpdates = [];

		this._updateCanvasRect();

		this.api.trigger(
			{ name: 'domTextSync', fireAtStart: true },
			{ updates: batch, canvasRect: this._canvasRect }
		);

	}

	_onScroll() {

		if ( this._scrollThrottled || this.disabled ) return;
		this._scrollThrottled = true;

		requestAnimationFrame( () => {

			for ( const [ element, data ] of this._elements ) {

				if ( data.visible ) {

					const rect = this._getRect( element );
					this._queueUpdate( data.id, 'rect', { rect } );

				}

			}

			this._scrollThrottled = false;

		} );

	}

	_onResize() {

		this._updateCanvasRect();

		// Update all element styles and rects on resize (styles may change due to responsive CSS)
		for ( const [ element, data ] of this._elements ) {

			const styles = this._extractStyles( element );
			const rect = this._getRect( element );
			this._queueUpdate( data.id, 'update', { styles, rect } );

		}

	}

}

function initDomTextSync( api, options = {} ) {

	const sync = new DOMTextSync( api, options );
	sync.init();
	return sync;

}

export { DOMTextSync, initDomTextSync };
