import * as THREE from './vendor/build/three.module.js';
import { GLTFLoader } from './vendor/addons/loaders/GLTFLoader.js';

document.documentElement.dataset.helmetModule = 'loaded';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const preloader = document.querySelector('.preloader');
const menu = document.querySelector('.nav-panel');
const menuButton = document.querySelector('.menu-button');
const closeButton = document.querySelector('.menu-close');

const finishLoading = () => preloader?.classList.add('loaded');
window.addEventListener('load', () => window.setTimeout(finishLoading, reducedMotion ? 0 : 750), { once: true });
window.setTimeout(finishLoading, 3200);

const setMenu = (open) => {
  menu?.classList.toggle('open', open);
  menu?.setAttribute('aria-hidden', String(!open));
  menuButton?.setAttribute('aria-expanded', String(open));
  document.body.classList.toggle('menu-open', open);
};

menuButton?.addEventListener('click', () => setMenu(true));
closeButton?.addEventListener('click', () => setMenu(false));
menu?.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => setMenu(false)));
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') setMenu(false);
});

class HelmetHero {
  constructor(stage) {
    this.stage = stage;
    this.canvas = stage.querySelector('.helmet-canvas');
    this.toggle = document.querySelector('[data-helmet-toggle]');
    this.status = stage.querySelector('.helmet-status');
    this.pointer = new THREE.Vector2();
    this.pointerTarget = new THREE.Vector2();
    this.pointerVelocity = new THREE.Vector2();
    this.locked = false;
    this.hoverReveal = 0;
    this.targetReveal = 0;
    this.scrollProgress = 0;
    this.lastTime = performance.now();
    this.visible = true;
    this.frameId = 0;
    this.cursorCanvas = document.createElement('canvas');
    this.cursorCanvas.width = 512;
    this.cursorCanvas.height = 512;
    this.cursorContext = this.cursorCanvas.getContext('2d', { alpha: true });
    this.cursorTexture = new THREE.CanvasTexture(this.cursorCanvas);
    this.cursorTexture.colorSpace = THREE.SRGBColorSpace;
    this.init();
  }

  async init() {
    try {
      this.stage.dataset.initPhase = 'renderer';
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.LinearToneMapping;
      this.renderer.toneMappingExposure = 1.05;
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(15, 1, 0.1, 100);
      this.camera.position.z = 3;
      this.root = new THREE.Group();
      this.scene.add(this.root);
      this.addLights();
      this.stage.dataset.initPhase = 'assets';
      await this.createHead();
      this.stage.dataset.initPhase = 'head-ready';
      await this.createHelmet();
      this.stage.dataset.initPhase = 'helmet-ready';
      this.bindEvents();
      this.visibilityObserver = new IntersectionObserver(([entry]) => {
        this.visible = entry.isIntersecting;
        if (this.visible && !this.frameId) this.render(performance.now());
      }, { threshold: 0.01 });
      this.visibilityObserver.observe(this.stage);
      this.resize();
      this.stage.classList.add('is-webgl');
      this.render(performance.now());
    } catch (error) {
      this.stage.dataset.initPhase = 'fallback';
      console.warn('Interactive helmet fallback enabled.', error);
    }
  }

  addLights() {
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x222222, 2.4));
    const key = new THREE.PointLight(0xffffff, 18, 8);
    key.position.set(-1.4, 1.5, 2.4);
    this.scene.add(key);
    const lime = new THREE.PointLight(0xc7ff00, 7, 6);
    lime.position.set(1.4, -0.4, 1.8);
    this.scene.add(lime);
  }

  loadTexture(url) {
    return new Promise((resolve, reject) => {
      new THREE.TextureLoader().load(url, (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
        resolve(texture);
      }, undefined, reject);
    });
  }

  async createHead() {
    const portrait = await this.loadTexture('./assets/homie-cutout-clean-v4.png');
    const geometry = new THREE.PlaneGeometry(1, 1.236, 96, 96);
    const positions = geometry.attributes.position;
    const uvs = geometry.attributes.uv;
    for (let index = 0; index < positions.count; index += 1) {
      const u = uvs.getX(index);
      const v = uvs.getY(index);
      const x = (u - 0.5) / 0.47;
      const y = (v - 0.54) / 0.56;
      const radius = Math.max(0, 1 - x * x - y * y);
      positions.setZ(index, Math.sqrt(radius) * 0.105);
    }
    geometry.computeVertexNormals();
    this.headMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: true,
      uniforms: {
        tPortrait: { value: portrait },
        tCursor: { value: this.cursorTexture },
        uHelmetReveal: { value: 0 },
        uFilter: { value: 0 },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormalW;
        void main() {
          vUv = uv;
          vNormalW = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tPortrait;
        uniform sampler2D tCursor;
        uniform float uHelmetReveal;
        uniform float uFilter;
        varying vec2 vUv;
        varying vec3 vNormalW;

        float ellipse(vec2 uv, vec2 center, vec2 size) {
          vec2 point = (uv - center) / size;
          return 1.0 - smoothstep(0.82, 1.0, dot(point, point));
        }

        void main() {
          vec4 portrait = texture2D(tPortrait, vUv);
          float face = ellipse(vUv, vec2(0.5, 0.70), vec2(0.33, 0.31));
          float shoulderWidth = mix(0.48, 0.31, vUv.y);
          float shoulders = 1.0 - smoothstep(shoulderWidth - 0.035, shoulderWidth, abs(vUv.x - 0.5));
          shoulders *= 1.0 - smoothstep(0.61, 0.70, vUv.y);
          float alpha = max(face, shoulders);
          vec4 cursor = texture2D(tCursor, vUv);
          float helmetShadow = max(cursor.r, smoothstep(1.0, 0.25, vUv.y + sin(vUv.x * 3.14159) * 0.13) * uHelmetReveal);
          vec3 shadowColor = portrait.rgb * vec3(0.24, 0.29, 0.19);
          vec3 color = mix(portrait.rgb, shadowColor, clamp(helmetShadow * 0.82, 0.0, 0.82));
          float light = 0.82 + max(dot(vNormalW, normalize(vec3(-0.3, 0.35, 1.0))), 0.0) * 0.28;
          color *= light;
          float gray = dot(color, vec3(0.299, 0.587, 0.114));
          color = mix(vec3(gray), color, 0.76);
          color *= vec3(0.91, 1.0, 1.06);
          color = mix(color, vec3(gray) * vec3(0.82, 0.88, 0.74), uFilter);
          gl_FragColor = vec4(color, alpha * portrait.a);
        }
      `,
    });
    this.head = new THREE.Mesh(geometry, this.headMaterial);
    this.head.position.set(0, -0.02, 0);
    this.head.scale.setScalar(0.72);
    this.root.add(this.head);
  }

  async createHelmet() {
    const [gltf, helmetMap, helmetNormal, helmetRoughness, glassMap, glassNormal, glassRoughness, glassMetallic] = await Promise.all([
      this.loadHelmetModel(),
      this.loadTexture('./assets/Norris_Helmet_mat_BaseColor.webp'),
      this.loadTexture('./assets/Norris_Helmet_mat_Normal.webp'),
      this.loadTexture('./assets/Norris_Helmet_mat_Roughness.webp'),
      this.loadTexture('./assets/Norris_Glass_mat_BaseColor.webp'),
      this.loadTexture('./assets/Norris_Glass_mat_Normal.webp'),
      this.loadTexture('./assets/Norris_Glass_mat_Roughness.webp'),
      this.loadTexture('./assets/Norris_Glass_mat_Metallic.webp'),
    ]);
    [helmetMap, helmetNormal, helmetRoughness, glassMap, glassNormal, glassRoughness, glassMetallic].forEach((texture) => {
      texture.flipY = false;
      texture.needsUpdate = true;
    });
    [helmetNormal, helmetRoughness, glassNormal, glassRoughness, glassMetallic].forEach((texture) => {
      texture.colorSpace = THREE.NoColorSpace;
    });

    this.helmet = gltf.scene;
    this.helmet.scale.setScalar(4.97);
    this.helmet.position.y = 0.21;
    this.helmet.traverse((child) => {
      if (!child.isMesh) return;
      if (child.name === 'helmet') {
        child.material = new THREE.MeshStandardMaterial({ map: helmetMap, normalMap: helmetNormal, roughnessMap: helmetRoughness, metalness: 0.28, roughness: 0.42, transparent: true });
        child.userData.opacityScale = 1;
      } else if (child.name === 'glass') {
        child.material = new THREE.MeshPhysicalMaterial({ map: glassMap, normalMap: glassNormal, roughnessMap: glassRoughness, metalnessMap: glassMetallic, metalness: 0.8, roughness: 0.12, transmission: 0.04, transparent: true, opacity: 0.96 });
        child.userData.opacityScale = 0.96;
      } else {
        child.material = new THREE.MeshPhysicalMaterial({ color: 0xdde4d1, transparent: true, opacity: 0.18, roughness: 0.32, side: THREE.DoubleSide });
        child.userData.opacityScale = 0.18;
      }
      child.renderOrder = 3;
    });
    this.helmet.visible = false;
    this.root.add(this.helmet);

    this.wireframe = this.helmet.clone();
    this.wireframe.traverse((child) => {
      if (!child.isMesh) return;
      child.material = new THREE.MeshBasicMaterial({ color: 0x4a5143, wireframe: true, transparent: true, opacity: 0.14, depthWrite: false });
    });
    this.wireframe.visible = true;
    this.root.add(this.wireframe);
  }

  loadHelmetModel() {
    return new GLTFLoader().loadAsync('./assets/helmet-21-uncompressed.glb');
  }

  bindEvents() {
    const move = (clientX, clientY) => {
      const rect = this.stage.getBoundingClientRect();
      const x = THREE.MathUtils.clamp((clientX - rect.left) / rect.width, 0, 1);
      const y = THREE.MathUtils.clamp((clientY - rect.top) / rect.height, 0, 1);
      this.pointerTarget.set(x * 2 - 1, (1 - y) * 2 - 1);
      if (!this.locked) this.targetReveal = THREE.MathUtils.clamp(0.13 + Math.hypot(this.pointerTarget.x, this.pointerTarget.y) * 0.38, 0.12, 0.62);
      this.paintCursor(x, 1 - y);
    };

    this.stage.addEventListener('pointermove', (event) => move(event.clientX, event.clientY), { passive: true });
    this.stage.addEventListener('pointerleave', () => {
      this.pointerTarget.set(0, 0);
      if (!this.locked) this.targetReveal = 0.1;
    });
    this.toggle?.addEventListener('click', () => this.setLocked(!this.locked));
    this.stage.addEventListener('dblclick', () => this.setLocked(!this.locked));
    window.addEventListener('resize', () => this.resize(), { passive: true });
    window.addEventListener('scroll', () => {
      const hero = document.querySelector('.hero');
      this.scrollProgress = THREE.MathUtils.clamp(window.scrollY / Math.max(hero.offsetHeight, 1), 0, 1);
    }, { passive: true });

    if ('DeviceOrientationEvent' in window) {
      window.addEventListener('deviceorientation', (event) => {
        if (this.locked || event.gamma == null || event.beta == null) return;
        this.pointerTarget.set(THREE.MathUtils.clamp(event.gamma / 35, -1, 1), THREE.MathUtils.clamp((event.beta - 45) / -45, -1, 1));
      }, { passive: true });
    }
  }

  setLocked(locked) {
    this.locked = locked;
    this.targetReveal = locked ? 1 : 0.14;
    if (locked) this.pointerTarget.set(0, 0);
    this.stage.classList.toggle('is-locked', locked);
    this.toggle?.setAttribute('aria-pressed', String(locked));
    const label = this.toggle?.querySelector('span');
    const state = this.status?.querySelector('b');
    if (label) label.textContent = locked ? 'CLICK TO RELEASE' : 'CLICK TO LOCK';
    if (state) state.textContent = locked ? 'HELMET LOCKED' : 'HELMET FREE';
  }

  paintCursor(x, y) {
    const context = this.cursorContext;
    const width = this.cursorCanvas.width;
    const height = this.cursorCanvas.height;
    context.globalCompositeOperation = 'source-over';
    context.fillStyle = 'rgba(0,0,0,0.055)';
    context.fillRect(0, 0, width, height);
    context.globalCompositeOperation = 'lighter';
    const radius = width * 0.17;
    const gradient = context.createRadialGradient(x * width, y * height, 0, x * width, y * height, radius);
    gradient.addColorStop(0, 'rgba(255,255,255,0.72)');
    gradient.addColorStop(0.35, 'rgba(255,255,255,0.38)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(x * width, y * height, radius, 0, Math.PI * 2);
    context.fill();
    this.cursorTexture.needsUpdate = true;
  }

  resize() {
    const width = this.stage.clientWidth;
    const height = this.stage.clientHeight;
    const pixelRatio = Math.min(window.devicePixelRatio, 1.5);
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.position.z = width < 768 ? 4.12 : 3;
    this.camera.updateProjectionMatrix();
  }

  render(time) {
    if (!this.visible) {
      this.frameId = 0;
      return;
    }
    const delta = Math.min((time - this.lastTime) / 1000, 0.05);
    this.lastTime = time;
    const ease = 1 - Math.pow(0.025, delta);
    const previousX = this.pointer.x;
    const previousY = this.pointer.y;
    this.pointer.lerp(this.pointerTarget, ease);
    this.pointerVelocity.set(this.pointer.x - previousX, this.pointer.y - previousY);
    this.hoverReveal = THREE.MathUtils.damp(this.hoverReveal, this.targetReveal, this.locked ? 3.5 : 2.1, delta);

    const revealMovement = 1 - this.hoverReveal * 0.72;
    const rotationY = this.pointer.x * 0.075 * revealMovement;
    const rotationX = this.pointer.y * -0.075 * revealMovement * (1 - this.scrollProgress);
    this.head.rotation.set(rotationX, rotationY, this.pointer.x * -0.012);
    this.headMaterial.uniforms.uHelmetReveal.value = this.hoverReveal;
    this.headMaterial.uniforms.uFilter.value = this.scrollProgress;

    if (this.helmet) {
      this.helmet.visible = this.hoverReveal > 0.025;
      this.helmet.rotation.set(rotationX / 1.5 + Math.PI * 0.06, rotationY / 1.5, this.pointer.x * -0.008);
      this.helmet.position.y = 0.21 + (1 - this.hoverReveal) * 0.22 + this.pointer.y * 0.12 * (1 - this.hoverReveal);
      this.helmet.position.x = this.pointer.x * 0.14 * (1 - this.hoverReveal);
      this.helmet.scale.setScalar(4.97 * (0.96 + this.hoverReveal * 0.04));
      this.helmet.traverse((child) => {
        if (!child.isMesh || !child.material) return;
        child.material.transparent = true;
        child.material.opacity = THREE.MathUtils.clamp(this.hoverReveal * 1.25, 0, 1) * (child.userData.opacityScale ?? 1);
      });
    }

    if (this.wireframe) {
      this.wireframe.rotation.copy(this.helmet.rotation);
      this.wireframe.position.copy(this.helmet.position);
      this.wireframe.scale.copy(this.helmet.scale);
      this.wireframe.traverse((child) => {
        if (child.isMesh) {
          const scanOpacity = 0.09 + Math.sin(time * 0.0018 - child.position.y * 9) * 0.035;
          child.material.opacity = scanOpacity * (1 - this.scrollProgress) * (1 - this.hoverReveal * 0.88);
        }
      });
    }

    this.root.position.z = -this.scrollProgress * 0.7;
    this.root.position.y = this.scrollProgress * 0.08;
    this.camera.position.x = this.pointer.x * 0.02 * revealMovement;
    this.camera.position.y = this.pointer.y * -0.02 * revealMovement * (1 - this.scrollProgress);
    this.renderer.render(this.scene, this.camera);
    this.frameId = requestAnimationFrame((nextTime) => this.render(nextTime));
  }
}

const helmetStage = document.querySelector('[data-helmet-stage]');
if (helmetStage) window.__helmetHero = new HelmetHero(helmetStage);
