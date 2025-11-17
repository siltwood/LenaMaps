// Vibrant color palette (same as CodePen)
const COLORS = [
  '#f44336', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5',
  '#2196f3', '#03a9f4', '#00bcd4', '#009688', '#4CAF50',
  '#8BC34A', '#CDDC39', '#FFEB3B', '#FFC107', '#FF9800',
  '#FF5722'
];

/**
 * Particle - Individual particle with physics
 */
export class Particle {
  constructor(x, y) {
    this.spawnX = x;
    this.spawnY = y;
    this.x = x;
    this.y = y;

    // Random color from palette
    this.color = COLORS[Math.floor(Math.random() * COLORS.length)];

    // Physics properties
    this.vx = 0;
    this.vy = 0;
    this.ax = 0;
    this.ay = 0;
    this.drag = 0.95 + Math.random() * 0.03; // 0.95-0.98 (less drag)
    this.topSpeed = 5;

    // Lifecycle
    this.startTime = Date.now();
    this.lifespan = 800 + Math.random() * 400; // 800-1200ms
    this.baseSize = 2 + Math.random() * 3; // 2-5px

    // Initial burst force - random direction in full 360 degrees
    const angle = Math.random() * Math.PI * 2;
    const force = 5 + Math.random() * 4; // Stronger burst: 5-9
    const fx = Math.cos(angle) * force;
    const fy = Math.sin(angle) * force;

    // Debug logging (first few particles only)
    if (Math.random() < 0.05) { // Log ~5% of particles
      console.log('Particle spawn:', {
        position: { x, y },
        angle: (angle * 180 / Math.PI).toFixed(1) + '°',
        force: { fx: fx.toFixed(2), fy: fy.toFixed(2) }
      });
    }

    this.addForce(fx, fy);
  }

  addForce(fx, fy) {
    this.ax += fx;
    this.ay += fy;
  }

  update() {
    // Apply acceleration to velocity
    this.vx += this.ax;
    this.vy += this.ay;

    // Limit speed
    const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    if (speed > this.topSpeed) {
      this.vx = (this.vx / speed) * this.topSpeed;
      this.vy = (this.vy / speed) * this.topSpeed;
    }

    // Apply drag
    this.vx *= this.drag;
    this.vy *= this.drag;

    // Update position
    this.x += this.vx;
    this.y += this.vy;

    // Reset acceleration
    this.ax = 0;
    this.ay = 0;

    // Add very slight upward drift (reduced to not override random burst)
    this.addForce(0, -0.03);

    return !this.isDead();
  }

  draw(ctx) {
    // Don't draw dead particles
    if (this.isDead()) return;

    const age = Date.now() - this.startTime;
    const lifeRatio = age / this.lifespan;

    // Scale animation: fade in first 10%, fade out last 50%
    let scale = 1;
    if (age < this.lifespan * 0.1) {
      scale = age / (this.lifespan * 0.1);
    } else if (age > this.lifespan * 0.5) {
      scale = 1 - (age - this.lifespan * 0.5) / (this.lifespan * 0.5);
    }

    // Clamp scale to prevent negative values
    scale = Math.max(0, scale);

    // Size based on velocity (faster = slightly bigger)
    const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    const velocityScale = 0.5 + (speed / this.topSpeed) * 0.7; // 0.5-1.2

    const size = this.baseSize * scale * velocityScale;

    // Don't draw if size is too small
    if (size <= 0) return;

    ctx.save();
    ctx.globalAlpha = scale;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  isDead() {
    return Date.now() - this.startTime > this.lifespan;
  }
}

/**
 * ParticleSystem - Manages collection of particles
 */
export class ParticleSystem {
  constructor() {
    this.particles = [];
  }

  spawn(x, y, count = 1) {
    for (let i = 0; i < count; i++) {
      this.particles.push(new Particle(x, y));
    }
  }

  update() {
    // Update all particles and remove dead ones
    this.particles = this.particles.filter(particle => particle.update());
  }

  draw(ctx) {
    this.particles.forEach(particle => particle.draw(ctx));
  }

  clear() {
    this.particles = [];
  }

  get count() {
    return this.particles.length;
  }
}
