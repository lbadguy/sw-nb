const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function icons(root = document) {
  if (window.lucide) window.lucide.createIcons({ root });
}

function hideLoader() {
  const loader = document.getElementById('loader');
  if (!loader || loader.classList.contains('is-hidden')) return;
  loader.classList.add('is-hidden');
  setTimeout(() => loader.remove(), 600);
}

function initReveals() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.13 });
  document.querySelectorAll('.reveal').forEach((element) => observer.observe(element));
}

function initParticles() {
  const canvas = document.getElementById('particles');
  const context = canvas.getContext('2d');
  let width = 0;
  let height = 0;
  let points = [];
  let frame = 0;

  const resize = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    points = Array.from({ length: width < 720 ? 24 : 54 }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      speed: 0.15 + Math.random() * 0.5,
      radius: 0.5 + Math.random() * 1.4,
    }));
  };

  const draw = () => {
    context.clearRect(0, 0, width, height);
    context.fillStyle = '#d9ff43';
    points.forEach((point) => {
      point.y -= point.speed;
      if (point.y < -4) {
        point.y = height + 4;
        point.x = Math.random() * width;
      }
      context.globalAlpha = 0.16 + point.radius * 0.12;
      context.beginPath();
      context.arc(point.x, point.y, point.radius, 0, Math.PI * 2);
      context.fill();
    });
    context.globalAlpha = 1;
    if (!reducedMotion.matches) frame = requestAnimationFrame(draw);
  };

  resize();
  draw();
  window.addEventListener('resize', resize, { passive: true });
  reducedMotion.addEventListener('change', () => {
    cancelAnimationFrame(frame);
    draw();
  });
}

function initTilt() {
  if (!window.matchMedia('(hover: hover)').matches || reducedMotion.matches) return;
  const orbit = document.querySelector('[data-tilt]');
  orbit.addEventListener('pointermove', (event) => {
    const rect = orbit.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    orbit.style.transform = `perspective(1000px) rotateX(${y * -8}deg) rotateY(${x * 8}deg)`;
  });
  orbit.addEventListener('pointerleave', () => { orbit.style.transform = ''; });
}

icons();
initReveals();
initParticles();
initTilt();
window.addEventListener('load', () => setTimeout(hideLoader, 520), { once: true });
setTimeout(hideLoader, 1600);
