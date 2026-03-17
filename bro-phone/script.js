// 震撼弹式的开机逻辑
window.addEventListener('load', () => {
    // 设定总等待时间 2.5 秒
    setTimeout(() => {
        const loader = document.getElementById('loader');
        loader.style.opacity = '0';
        setTimeout(() => {
            loader.style.visibility = 'hidden';
            // 页面出现后触发进场特效
            reveal();
        }, 800);
    }, 2500);
});

// 视差滚动触发器 (Scroll Reveal)
function reveal() {
    var reveals = document.querySelectorAll(".reveal");
    var windowHeight = window.innerHeight;
    for (var i = 0; i < reveals.length; i++) {
        var elementTop = reveals[i].getBoundingClientRect().top;
        // 当元素进入视口一定比例时触发
        if (elementTop < windowHeight - 100) {
            reveals[i].classList.add("active");
        }
    }
}
// 使用 passive true 提升滚动性能
window.addEventListener("scroll", reveal, { passive: true });

// Vanilla Canvas Particles (背景极客星辰特效)
const canvas = document.getElementById('particles-js');
const ctx = canvas.getContext('2d', { alpha: false }); // alpha: false can improve performance on pure black backgrounds
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let particlesArray = [];

class Particle {
    constructor(x, y, dx, dy, size, baseColorAlpha) {
        this.x = x; this.y = y;
        this.dx = dx; this.dy = dy;
        this.size = size; 
        this.baseColorAlpha = baseColorAlpha;
    }
    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2, false);
        // [性能优化优化] 移除巨耗性能的 shadowBlur, 直接使用填色
        ctx.fillStyle = `rgba(255, 255, 255, ${this.baseColorAlpha})`;
        ctx.fill();
    }
    update() {
        if (this.x > canvas.width || this.x < 0) this.dx = -this.dx;
        if (this.y > canvas.height || this.y < 0) this.dy = -this.dy;
        this.x += this.dx; this.y += this.dy;
        this.draw();
    }
}

function initParticles() {
    particlesArray = [];
    // [性能优化] 减少粒子数量密度，配合大尺寸屏幕
    let numberOfParticles = (canvas.height * canvas.width) / 15000;
    
    // 限制最大粒子数目，防止移动端或超大屏卡顿
    if(numberOfParticles > 150) numberOfParticles = 150; 
    
    for (let i = 0; i < numberOfParticles; i++) {
        let size = (Math.random() * 2) + 0.5;
        let x = Math.random() * canvas.width;
        let y = Math.random() * canvas.height;
        let dx = (Math.random() * 1.5) - 0.75;
        let dy = (Math.random() * 1.5) - 0.75;
        let baseColorAlpha = Math.random() * 0.5 + 0.1;
        particlesArray.push(new Particle(x, y, dx, dy, size, baseColorAlpha));
    }
}

function animateParticles() {
    requestAnimationFrame(animateParticles);
    // Draw solid black background to clear instead of clearRect (better for some devices when alpha:false)
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    for (let i = 0; i < particlesArray.length; i++) {
        particlesArray[i].update();
    }
}

// 防抖 resize
let resizeTimer;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        initParticles();
    }, 200);
});

initParticles();
animateParticles();
