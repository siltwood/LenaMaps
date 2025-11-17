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
    this.drag = 0.92 + Math.random() * 0.06; // 0.92-0.98
    this.topSpeed = 3;

    // Lifecycle
    this.startTime = Date.now();
    this.lifespan = 800 + Math.random() * 400; // 800-1200ms
    this.baseSize = 3 + Math.random() * 4; // 3-7px

    // Initial burst force - random direction
    const angle = Math.random() * Math.PI * 2;
    const force = 3 + Math.random() * 3;
    this.addForce(Math.cos(angle) * force, Math.sin(angle) * force);
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

    // Add slight upward drift
    this.addForce(0, -0.08);

    return !this.isDead();
  }

  draw(ctx) {
    const age = Date.now() - this.startTime;
    const lifeRatio = age / this.lifespan;

    // Scale animation: fade in first 10%, fade out last 50%
    let scale = 1;
    if (age < this.lifespan * 0.1) {
      scale = age / (this.lifespan * 0.1);
    } else if (age > this.lifespan * 0.5) {
      scale = 1 - (age - this.lifespan * 0.5) / (this.lifespan * 0.5);
    }

    // Size based on velocity (faster = slightly bigger)
    const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    const velocityScale = 0.5 + (speed / this.topSpeed) * 0.7; // 0.5-1.2

    const size = this.baseSize * scale * velocityScale;

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
