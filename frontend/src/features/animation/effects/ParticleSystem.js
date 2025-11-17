/**
 * Particle - Individual particle with physics
 */
export class Particle {
  constructor(x, y, color) {
    this.x = x;
    this.y = y;
    this.vx = (Math.random() - 0.5) * 2; // Random horizontal velocity
    this.vy = (Math.random() - 0.5) * 2; // Random vertical velocity
    this.life = 1.0; // 1.0 = fully alive, 0.0 = dead
    this.decay = 0.015 + Math.random() * 0.015; // How fast it fades (0.015-0.03 per frame)
    this.size = 3 + Math.random() * 3; // 3-6px
    this.color = color;
  }

  update() {
    // Update position
    this.x += this.vx;
    this.y += this.vy;

    // Apply slight gravity
    this.vy += 0.05;

    // Air resistance
    this.vx *= 0.98;
    this.vy *= 0.98;

    // Fade out
    this.life -= this.decay;

    return this.life > 0;
  }

  draw(ctx) {
    if (this.life <= 0) return;

    ctx.save();
    ctx.globalAlpha = this.life;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size * this.life, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/**
 * ParticleSystem - Manages collection of particles
 */
export class ParticleSystem {
  constructor() {
    this.particles = [];
  }

  spawn(x, y, color, count = 1) {
    for (let i = 0; i < count; i++) {
      this.particles.push(new Particle(x, y, color));
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
