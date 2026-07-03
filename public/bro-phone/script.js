const LOADER_MIN_MS = 650;
const LOADER_MAX_MS = 1400;

const loader = document.getElementById("loader");
const canvas = document.getElementById("particles-js");
const ctx = canvas ? canvas.getContext("2d", { alpha: false }) : null;
const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
const smallScreenQuery = window.matchMedia("(max-width: 768px)");

let loaderDismissed = false;
let particlesArray = [];
let animationFrameId = null;
let particlesStarted = false;
let resizeTimer = null;
let tiltInitialized = false;
const loaderStartedAt = performance.now();

function reveal() {
    const reveals = document.querySelectorAll(".reveal");
    const windowHeight = window.innerHeight;

    for (const element of reveals) {
        const elementTop = element.getBoundingClientRect().top;
        if (elementTop < windowHeight - 100) {
            element.classList.add("active");
        }
    }
}

function initTilt() {
    if (tiltInitialized || !window.VanillaTilt) {
        return;
    }

    const tiltTargets = document.querySelectorAll("[data-tilt]");
    if (!tiltTargets.length) {
        return;
    }

    window.VanillaTilt.init(tiltTargets);
    tiltInitialized = true;
}

window.initTilt = initTilt;

function hideLoader() {
    if (loaderDismissed || !loader) {
        return;
    }

    loaderDismissed = true;
    loader.classList.add("is-hidden");
    reveal();
    initTilt();
    startParticles();
}

function scheduleLoaderHide() {
    const elapsed = performance.now() - loaderStartedAt;
    const delay = Math.max(0, LOADER_MIN_MS - elapsed);
    window.setTimeout(hideLoader, delay);
}

function syncCanvasSize() {
    if (!canvas) {
        return;
    }

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

class Particle {
    constructor(x, y, dx, dy, size, opacity) {
        this.x = x;
        this.y = y;
        this.dx = dx;
        this.dy = dy;
        this.size = size;
        this.opacity = opacity;
    }

    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2, false);
        ctx.fillStyle = `rgba(255, 255, 255, ${this.opacity})`;
        ctx.fill();
    }

    update() {
        if (this.x > canvas.width || this.x < 0) {
            this.dx = -this.dx;
        }
        if (this.y > canvas.height || this.y < 0) {
            this.dy = -this.dy;
        }

        this.x += this.dx;
        this.y += this.dy;
        this.draw();
    }
}

function initParticles() {
    if (!canvas || !ctx) {
        return;
    }

    particlesArray = [];

    const area = canvas.width * canvas.height;
    const targetCount = smallScreenQuery.matches ? area / 32000 : area / 22000;
    const maxCount = smallScreenQuery.matches ? 42 : 90;
    const numberOfParticles = Math.max(18, Math.min(Math.floor(targetCount), maxCount));

    for (let i = 0; i < numberOfParticles; i += 1) {
        const size = Math.random() * 1.5 + 0.4;
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const dx = Math.random() * 1 - 0.5;
        const dy = Math.random() * 1 - 0.5;
        const opacity = Math.random() * 0.35 + 0.08;
        particlesArray.push(new Particle(x, y, dx, dy, size, opacity));
    }
}

function animateParticles() {
    if (!canvas || !ctx || reducedMotionQuery.matches) {
        return;
    }

    animationFrameId = window.requestAnimationFrame(animateParticles);
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (const particle of particlesArray) {
        particle.update();
    }
}

function startParticles() {
    if (particlesStarted || !canvas || !ctx || reducedMotionQuery.matches) {
        return;
    }

    particlesStarted = true;
    syncCanvasSize();
    initParticles();
    animateParticles();
}

function stopParticles() {
    if (animationFrameId) {
        window.cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }

    particlesStarted = false;

    if (canvas && ctx) {
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
}

function onReady() {
    reveal();
    window.addEventListener("scroll", reveal, { passive: true });
    scheduleLoaderHide();
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", onReady, { once: true });
} else {
    onReady();
}

window.addEventListener("load", scheduleLoaderHide, { once: true });
window.setTimeout(hideLoader, LOADER_MAX_MS);

window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
        syncCanvasSize();
        if (particlesStarted) {
            initParticles();
        }
        reveal();
    }, 150);
});

if (typeof reducedMotionQuery.addEventListener === "function") {
    reducedMotionQuery.addEventListener("change", (event) => {
        if (event.matches) {
            stopParticles();
            return;
        }

        if (loaderDismissed) {
            startParticles();
        }
    });
}
