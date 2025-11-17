import { ParticleSystem } from './ParticleSystem';

/**
 * ParticleTrailOverlay - Google Maps OverlayView for particle trail effect
 * Renders particles on a canvas overlay that follows the animated marker
 */
export function ParticleTrailOverlay() {
  // Call parent constructor
  if (window.google?.maps?.OverlayView) {
    window.google.maps.OverlayView.call(this);
  }

  this.div_ = null;
  this.canvas_ = null;
  this.ctx_ = null;
  this.particleSystem = new ParticleSystem();
  this.animationFrameId = null;
  this.isAnimating = false;
}

/**
 * Initialize the prototype chain
 * This must be called after Google Maps API is loaded
 */
export function initParticleTrailOverlay() {
  if (typeof window !== 'undefined' && window.google?.maps?.OverlayView) {
    ParticleTrailOverlay.prototype = Object.create(window.google.maps.OverlayView.prototype);
    ParticleTrailOverlay.prototype.constructor = ParticleTrailOverlay;

    /**
     * Called when overlay is added to map
     * Create canvas element and append to overlay layer
     */
    ParticleTrailOverlay.prototype.onAdd = function() {
      // Create container div
      const div = document.createElement('div');
      div.style.position = 'absolute';
      div.style.left = '0';
      div.style.top = '0';
      div.style.width = '100%';
      div.style.height = '100%';
      div.style.pointerEvents = 'none'; // Don't block map interactions
      div.style.overflow = 'visible'; // Ensure particles aren't clipped

      // Create canvas
      const canvas = document.createElement('canvas');
      canvas.style.position = 'absolute';
      canvas.style.left = '0';
      canvas.style.top = '0';
      canvas.style.overflow = 'visible'; // Ensure particles aren't clipped
      // Don't set CSS width/height - let bitmap size control it

      div.appendChild(canvas);
      this.div_ = div;
      this.canvas_ = canvas;
      this.ctx_ = canvas.getContext('2d');

      // Add to overlay layer (above map, below controls)
      const panes = this.getPanes();
      panes.overlayLayer.appendChild(div);

      // Start animation loop
      this.startAnimation();
    };

    /**
     * Called when map pans/zooms
     * Update canvas size and redraw
     */
    ParticleTrailOverlay.prototype.draw = function() {
      if (!this.div_ || !this.canvas_) return;

      // Get map reference from parent OverlayView
      const map = this.getMap();
      if (!map) return;

      // Update canvas size to match map
      const mapDiv = map.getDiv();
      const width = mapDiv.offsetWidth;
      const height = mapDiv.offsetHeight;

      // Set both bitmap size AND CSS size to match exactly (no scaling)
      if (this.canvas_.width !== width || this.canvas_.height !== height) {
        this.canvas_.width = width;
        this.canvas_.height = height;
        this.canvas_.style.width = width + 'px';
        this.canvas_.style.height = height + 'px';
        console.log('Canvas resized:', { width, height });
      }

      // Position overlay to cover entire map
      this.div_.style.left = '0px';
      this.div_.style.top = '0px';
      this.div_.style.width = width + 'px';
      this.div_.style.height = height + 'px';
    };

    /**
     * Called when overlay is removed from map
     * Cleanup resources
     */
    ParticleTrailOverlay.prototype.onRemove = function() {
      this.stopAnimation();

      if (this.div_) {
        this.div_.parentNode.removeChild(this.div_);
        this.div_ = null;
      }

      this.canvas_ = null;
      this.ctx_ = null;
      this.particleSystem.clear();
    };

    /**
     * Start animation loop
     */
    ParticleTrailOverlay.prototype.startAnimation = function() {
      if (this.isAnimating) return;

      this.isAnimating = true;
      this.animate();
    };

    /**
     * Stop animation loop
     */
    ParticleTrailOverlay.prototype.stopAnimation = function() {
      this.isAnimating = false;

      if (this.animationFrameId) {
        cancelAnimationFrame(this.animationFrameId);
        this.animationFrameId = null;
      }
    };

    /**
     * Animation loop - update and render particles
     */
    ParticleTrailOverlay.prototype.animate = function() {
      if (!this.isAnimating) return;

      // Clear canvas
      if (this.ctx_ && this.canvas_) {
        this.ctx_.clearRect(0, 0, this.canvas_.width, this.canvas_.height);

        // Update particles
        this.particleSystem.update();

        // Draw particles
        this.particleSystem.draw(this.ctx_);
      }

      // Continue animation - use arrow function to preserve 'this'
      this.animationFrameId = requestAnimationFrame(() => this.animate());
    };

    /**
     * Spawn particles at a lat/lng position
     * @param {google.maps.LatLng} latLng - Position to spawn particles
     * @param {number} count - Number of particles to spawn
     */
    ParticleTrailOverlay.prototype.spawnParticlesAtPosition = function(latLng, count = 3) {
      if (!this.ctx_ || !latLng) return;

      // Convert lat/lng to pixel coordinates
      const projection = this.getProjection();
      if (!projection) return;

      const point = projection.fromLatLngToDivPixel(latLng);
      if (!point) return;

      // Debug logging (occasionally)
      if (Math.random() < 0.02) { // Log ~2% of spawns
        console.log('Spawning at pixel:', {
          x: point.x.toFixed(1),
          y: point.y.toFixed(1),
          canvasSize: { w: this.canvas_.width, h: this.canvas_.height }
        });
      }

      // Spawn particles at pixel position
      this.particleSystem.spawn(point.x, point.y, count);
    };

    /**
     * Clear all particles
     */
    ParticleTrailOverlay.prototype.clearParticles = function() {
      this.particleSystem.clear();

      // Clear canvas
      if (this.ctx_ && this.canvas_) {
        this.ctx_.clearRect(0, 0, this.canvas_.width, this.canvas_.height);
      }
    };

    /**
     * Get particle count
     */
    ParticleTrailOverlay.prototype.getParticleCount = function() {
      return this.particleSystem.count;
    };

    return true;
  }
  return false;
}
