import { BackSide, FrontSide, Color, DoubleSide } from 'three/webgpu';
import { Text } from 'three-blocks/experimental/runtime-sdf-text';
import { component } from '@/offscreen/dispatcher';
import { store } from '@/offscreen/store';

/**
 * Worker-side manager for DOM-synchronized Text instances.
 * Receives updates from main thread DOMTextSync and creates/updates/removes
 * Text meshes positioned in screen space to match DOM elements.
 */
class DOMTextManager extends component( null ) {

	init() {

		this._textInstances = new Map(); // id -> Text mesh
		// Canvas rect will be set by first domTextSync event from main thread
		this._canvasRect = { width: 1, height: 1 };
		this._fontMap = DOMTextManager.fontMap || {};

	}

	/**
	 * Handle resize events to update canvas rect and reposition text.
	 */
	onResize( { width, height } ) {

		this._canvasRect = { width, height };

		// Update bounds for all text instances
		for ( const text of this._textInstances.values() ) {

			if ( text.material && text.material._uWallBounds ) {

				text.material._uWallBounds.value.set( width, height );

			}

		}

	}

	/**
	 * Handle batch updates from main thread.
	 * @param {Object} payload - { updates: Array, canvasRect: Object }
	 */
	onDomTextSync( { updates, canvasRect } ) {

		if ( canvasRect ) {

			this._canvasRect = canvasRect;

		}

		for ( const update of updates ) {

			switch ( update.type ) {

			case 'create':
				this._createText( update.id, update.styles, update.rect, update.zIndex );
				break;
			case 'update':
				this._updateText( update.id, update );
				break;
			case 'rect':
				this._updateRect( update.id, update.rect );
				break;
			case 'visibility':
				this._updateVisibility( update.id, update.visible );
				break;
			case 'remove':
				this._removeText( update.id );
				break;

			}

		}

	}

	_createText( id, styles, rect, zIndex = 0 ) {

		const text = new Text();
		text.name = id;
		text.screenSpace = true;

		// Store zIndex for depth positioning (used in shader via position.z)
		text._zIndex = zIndex;

		// Center anchor for positioning
		text.anchorX = 'center';
		text.anchorY = 'middle';

		// Apply styles
		this._applyStyles( text, styles );

		// Store rect for applying after material is ready
		text._pendingRect = rect;

		const { scene, gl } = store;
		scene.add( text );
		this._textInstances.set( id, text );

		// Guard against store.gl not being initialized yet
		if ( ! gl ) {

			console.warn( 'DOMTextManager: store.gl not initialized, deferring text sync' );
			return;

		}

		// Trigger async glyph generation - apply rect after sync completes
		text._needsSync = true;
		text.sync( () => {

			if ( text._pendingRect ) {

				this._applyRect( text, text._pendingRect );
				delete text._pendingRect;

			}

		}, gl );

	}

	_updateText( id, { styles, rect } ) {

		const text = this._textInstances.get( id );
		if ( ! text ) return;

		const { gl } = store;

		if ( styles ) {

			this._applyStyles( text, styles );
			// Re-sync if text content changed
			text._needsSync = true;

			if ( rect ) {

				text._pendingRect = rect;

			}

			// Guard against store.gl not being initialized yet
			if ( ! gl ) {

				console.warn( 'DOMTextManager: store.gl not initialized, deferring text sync' );
				return;

			}

			text.sync( () => {

				if ( text._pendingRect ) {

					this._applyRect( text, text._pendingRect );
					delete text._pendingRect;

				}

			}, gl );

		} else if ( rect ) {

			this._applyRect( text, rect );

		}

	}

	_updateRect( id, rect ) {

		const text = this._textInstances.get( id );
		if ( ! text || ! rect ) return;

		// If material not ready yet, store for later
		if ( ! text.material || ! text.material._uScreenOffset ) {

			text._pendingRect = rect;
			return;

		}

		this._applyRect( text, rect );

	}

	_updateVisibility( id, visible ) {

		const text = this._textInstances.get( id );
		if ( text ) {

			text.visible = visible;

		}

	}

	_removeText( id ) {

		const text = this._textInstances.get( id );
		if ( ! text ) return;

		const { scene } = store;
		scene.remove( text );
		text.dispose();
		this._textInstances.delete( id );

	}

	_applyStyles( text, styles ) {

		if ( styles.text !== undefined ) {

			text.text = styles.text;

		}

		if ( styles.whitespace !== undefined ) {

			text.whiteSpace = styles.whitespace;

		}

		if ( styles.fontSize !== undefined ) {

			// For screen-space mode with bounds = screen size, fontSize maps 1:1 to pixels
			text.fontSize = styles.fontSize;

		}

		if ( styles.fontFamily !== undefined ) {

			// Use font map if available, otherwise let troika resolve
			text.font = this._fontMap[ styles.fontFamily ] || null;

		}

		if ( styles.fontWeight !== undefined ) {

			text.fontWeight = styles.fontWeight;

		}

		if ( styles.fontStyle !== undefined ) {

			text.fontStyle = styles.fontStyle;

		}

		if ( styles.lineHeight !== undefined && styles.fontSize > 0 ) {

			// CSS lineHeight in pixels → convert to relative multiplier for Text.js
			const lh = parseFloat( styles.lineHeight );
			if ( ! isNaN( lh ) ) {

				text.lineHeight = lh / styles.fontSize;

			}

		}

		if ( styles.color !== undefined ) {

			text.color = new Color( styles.color );

		}

		if ( styles.letterSpacing !== undefined ) {

			// Letter spacing in pixels (1:1 mapping in screen-space mode)
			text.letterSpacing = styles.letterSpacing;

		}

		if ( styles.textAlign !== undefined ) {

			// Map CSS text-align to Text values
			const alignMap = {
				'left': 'left',
				'center': 'center',
				'right': 'right',
				'justify': 'left', // Text doesn't support justify
				'start': 'left',
				'end': 'right',
			};
			text.textAlign = alignMap[ styles.textAlign ] || 'left';

		}

		if ( styles.opacity !== undefined ) {

			text.fillOpacity = styles.opacity;

		}

	}

	_applyRect( text, rect ) {

		const { width: cw, height: ch } = this._canvasRect;

		// Calculate the center position of the element in screen pixels
		// The shader expects offset in pixels from the viewport origin
		const centerX = rect.x + rect.width / 2;
		// Flip Y: DOM has Y=0 at top, shader expects Y=0 at bottom
		const centerY = ch - ( rect.y + rect.height / 2 );

		// Update screen offset uniform (in pixels)
		if ( text.material && text.material._uScreenOffset ) {

			text.material._uScreenOffset.value.set( centerX, centerY );

		}

		// Set bounds to screen dimensions for 1:1 pixel scaling
		// This ensures fontSize in layout units = fontSize in screen pixels
		if ( text.material && text.material._uWallBounds ) {

			text.material._uWallBounds.value.set( cw, ch );

		}

		// Set z-position for depth ordering (negative = further back)
		// This affects clip space z via the screen-space shader
		if ( text._zIndex !== undefined && text._zIndex !== 0 ) {

			text.position.z = text._zIndex;

		}

		// Set maxWidth to element width for text wrapping
		if ( rect.width > 0 ) {

			text.maxWidth = rect.width;

		}

	}

	dispose() {

		const { scene } = store;

		for ( const text of this._textInstances.values() ) {

			scene.remove( text );
			text.dispose();

		}

		this._textInstances.clear();
		super.dispose?.();

	}

}

// Static font map for custom fonts (can be configured by user)
DOMTextManager.fontMap = {};

export default DOMTextManager;
