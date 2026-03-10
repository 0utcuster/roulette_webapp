(function () {
  const THREE = window.THREE;
  const loaderEl = document.getElementById("model3dLoader");
  const loaderTextEl = document.getElementById("model3dLoaderText");
  const card = document.querySelector(".showcase3d-card");
  const canvas = card?.querySelector(".card__canvas");

  function setLoaderText(text) {
    if (loaderTextEl) loaderTextEl.textContent = text;
    else if (loaderEl) loaderEl.textContent = text;
  }

  function emitModelEvent(type, detail = {}) {
    window.dispatchEvent(new CustomEvent(type, { detail }));
  }

  if (!THREE || !THREE.GLTFLoader || !card || !canvas) {
    setLoaderText("3D блок недоступен.");
    emitModelEvent("madesix:model-error", { reason: "3d_block_unavailable" });
    emitModelEvent("madesix:model-ready", { ok: false });
    return;
  }

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const src = String(card.dataset.modelSrc || "").trim();
  const fallbackSrc = String(card.dataset.fallbackImg || "/static/prizes/sneakers_1.svg");
  if (!src) {
    setLoaderText("Источник 3D модели не задан.");
    emitModelEvent("madesix:model-error", { reason: "empty_src" });
    emitModelEvent("madesix:model-ready", { ok: false });
    return;
  }
  const gltfLoader = new THREE.GLTFLoader();

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  camera.position.set(0, 0.2, 4.8);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: !prefersReducedMotion,
      powerPreference: "high-performance",
      preserveDrawingBuffer: false,
    });
  } catch (e) {
    setLoaderText("WebGL недоступен на этом устройстве.");
    emitModelEvent("madesix:model-error", { reason: "webgl_unavailable" });
    emitModelEvent("madesix:model-ready", { ok: false });
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.4));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.16;

  const hemi = new THREE.HemisphereLight(0xe7efff, 0x0a1022, 1.05);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, 1.2);
  key.position.set(2.8, 2.4, 3.8);
  scene.add(key);
  const fill = new THREE.PointLight(0x9fd9ff, 0.9, 20);
  fill.position.set(-2.2, 0.8, 2.8);
  scene.add(fill);
  const rim = new THREE.PointLight(0xd4b4ff, 0.95, 20);
  rim.position.set(2.1, -1.8, -2.8);
  scene.add(rim);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.92, 0.03, 10, 90),
    new THREE.MeshBasicMaterial({ color: 0xd5e8ff, transparent: true, opacity: 0 })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -1.4;
  scene.add(ring);

  const root = new THREE.Group();
  scene.add(root);
  const chromeMaterials = [];
  const holoColorA = new THREE.Color("#9fd8ff");
  const holoColorB = new THREE.Color("#d8b8ff");
  let modelReady = false;

  function showFallback(text) {
    setLoaderText(text);
    ring.material.opacity = 0;
    if (card.querySelector(".showcase3d-fallback")) return;
    const img = document.createElement("img");
    img.className = "showcase3d-fallback";
    img.src = fallbackSrc;
    img.alt = "Model preview";
    card.appendChild(img);
  }

  function clearFallback() {
    const img = card.querySelector(".showcase3d-fallback");
    if (img) img.remove();
  }

  function fitModelToView(model, targetSize) {
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxAxis = Math.max(size.x, size.y, size.z) || 1;
    const scale = targetSize / maxAxis;
    model.scale.multiplyScalar(scale);
    model.position.sub(center.multiplyScalar(scale));
    return model;
  }

  function applyChromeMaterial(node) {
    if (!node || !node.isMesh || !node.material) return;
    if (node.geometry && !node.geometry.attributes.normal) {
      node.geometry.computeVertexNormals();
    }
    const srcMat = node.material;
    const map = srcMat.map || null;
    if (map) map.encoding = THREE.sRGBEncoding;
    const mat = new THREE.MeshStandardMaterial({
      map,
      color: new THREE.Color("#d7e3f5"),
      metalness: 0.72,
      roughness: 0.2,
      emissive: new THREE.Color("#314267"),
      emissiveIntensity: 0.2,
      envMapIntensity: 1.05,
      transparent: srcMat.transparent === true,
      opacity: typeof srcMat.opacity === "number" ? srcMat.opacity : 1,
      side: THREE.DoubleSide,
    });
    node.material = mat;
    chromeMaterials.push(mat);
  }

  function resize() {
    const w = canvas.clientWidth || 300;
    const h = canvas.clientHeight || 260;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener("resize", resize, { passive: true });

  setLoaderText("Loading 3D…");
  emitModelEvent("madesix:model-progress", { ratio: 0 });
  gltfLoader.load(
    src,
    (gltf) => {
      const model = fitModelToView(gltf.scene, 3.1);
      model.position.y = 0.02;
      model.traverse(applyChromeMaterial);
      root.add(model);
      clearFallback();
      modelReady = true;
      setLoaderText("NUMERIS готов");
      if (loaderEl) {
        loaderEl.classList.add("is-ready");
        setTimeout(() => loaderEl.remove(), 360);
      }
      emitModelEvent("madesix:model-progress", { ratio: 1 });
      emitModelEvent("madesix:model-ready", { ok: true });
    },
    (progress) => {
      if (!progress || !Number.isFinite(progress.total) || progress.total <= 0) return;
      const ratio = Math.max(0, Math.min(1, progress.loaded / progress.total));
      emitModelEvent("madesix:model-progress", { ratio });
    },
    (err) => {
      console.error("3D model load error:", err);
      showFallback("Не удалось загрузить 3D модель.");
      emitModelEvent("madesix:model-error", { reason: "load_error" });
      emitModelEvent("madesix:model-ready", { ok: false });
    }
  );

  const clock = new THREE.Clock();
  let rot = 0;
  function animate() {
    const t = clock.getElapsedTime();
    if (modelReady) {
      rot += prefersReducedMotion ? 0.003 : 0.009;
      root.rotation.y = rot;
      root.rotation.x = Math.sin(t * 0.62) * 0.03;
      root.position.y = Math.sin(t * 1.1) * (prefersReducedMotion ? 0.02 : 0.06);

      const pulse = 0.5 + Math.sin(t * 1.8) * 0.5;
      ring.material.opacity = 0.18 + pulse * 0.14;
      fill.intensity = 0.72 + pulse * 0.25;
      rim.intensity = 0.75 + pulse * 0.22;

      for (let i = 0; i < chromeMaterials.length; i += 1) {
        const m = chromeMaterials[i];
        const c = holoColorA.clone().lerp(holoColorB, (Math.sin(t * 1.05 + i * 0.22) + 1) * 0.5);
        m.emissive.copy(c).multiplyScalar(0.2);
        m.emissiveIntensity = 0.13 + pulse * 0.08;
      }
    }

    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);
})();
