import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import {
  getMetersPerPixel,
  installView3dChrome,
  POINT_MARKER_RADIUS_SCALE,
  zoomToContent,
} from "./view3d-ui.js";

function elevationOnPlane(n, e, p1, p2) {
  const dN = p2.n - p1.n;
  const dE = p2.e - p1.e;
  const lenSq = dN * dN + dE * dE;
  if (lenSq < 1e-12) return null;
  const t = ((n - p1.n) * dN + (e - p1.e) * dE) / lenSq;
  return p1.z + t * (p2.z - p1.z);
}

function surveyToVec(n, e, z, origin) {
  return new THREE.Vector3(e - origin.e, z - origin.z, n - origin.n);
}

function disposeObject(obj) {
  if (obj.geometry) obj.geometry.dispose();
  if (obj.material) {
    if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
    else obj.material.dispose();
  }
  for (const child of [...obj.children]) {
    if (!(child instanceof CSS2DObject)) {
      disposeObject(child);
    }
  }
}

export function createPlaneView3d(container, placeholderEl, chrome = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xeceeed);

  const camera = new THREE.PerspectiveCamera(52, 1, 0.01, 1e9);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.domElement.className = "view3d-canvas";
  container.appendChild(renderer.domElement);

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.domElement.className = "view3d-label-layer";
  container.appendChild(labelRenderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.screenSpacePanning = true;
  controls.minDistance = 1;
  controls.maxDistance = 1e8;

  scene.add(new THREE.AmbientLight(0xffffff, 0.65));
  const keyLight = new THREE.DirectionalLight(0xffffff, 0.9);
  keyLight.position.set(1, 1.5, 0.75);
  scene.add(keyLight);
  const fillLight = new THREE.DirectionalLight(0xa8c686, 0.35);
  fillLight.position.set(-1, 0.5, -1);
  scene.add(fillLight);

  const contentGroup = new THREE.Group();
  scene.add(contentGroup);

  let animationId = null;
  let hasInitialCamera = false;
  let lastExtent = 100;
  let lastData = null;
  let showMeasurements = chrome.showMeasurementsDefault ?? true;
  let scaleFormatter = (meters) => `${Number(meters.toFixed(2))} m`;

  const ui = chrome.panel
    ? installView3dChrome({
        panel: chrome.panel,
        canvasWrap: container,
        showMeasurementsInput: chrome.showMeasurementsInput,
        zoomExtentsBtn: chrome.zoomExtentsBtn,
        resetViewBtn: chrome.resetViewBtn,
        fullscreenBtn: chrome.fullscreenBtn,
        onShowMeasurementsChange: (checked) => {
          showMeasurements = checked;
          if (lastData) buildScene(lastData);
        },
        onZoomExtents: () => zoomExtents(),
        onResetView: () => resetCamera(),
        onResize: () => resize(),
      })
    : null;

  if (ui) {
    showMeasurements = ui.getShowMeasurements();
  }

  function animate() {
    animationId = requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);

    if (ui && contentGroup.children.length > 0) {
      const metersPerPixel = getMetersPerPixel(camera, controls, container.clientHeight);
      ui.updateScaleBar(metersPerPixel, scaleFormatter);
    }
  }

  function resize() {
    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    labelRenderer.setSize(width, height);
  }

  function clearContent() {
    while (contentGroup.children.length) {
      const child = contentGroup.children[0];
      contentGroup.remove(child);
      disposeObject(child);
    }
  }

  function createLabel(text, className) {
    const div = document.createElement("div");
    div.className = className;
    div.textContent = text;
    return new CSS2DObject(div);
  }

  function addMeasurementLabel(position, text, offsetY = 0) {
    const label = createLabel(text, "view3d-label view3d-label--measure");
    label.position.set(position.x, position.y + offsetY, position.z);
    contentGroup.add(label);
  }

  function createSphere(color, radius) {
    return new THREE.Mesh(
      new THREE.SphereGeometry(radius * POINT_MARKER_RADIUS_SCALE, 24, 24),
      new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.05 })
    );
  }

  function pointLabelOffsetY(radius) {
    return radius * POINT_MARKER_RADIUS_SCALE * 2.2;
  }

  function setPlaceholder(message, visible) {
    if (!placeholderEl) return;
    placeholderEl.hidden = !visible;
    if (visible && message) {
      placeholderEl.textContent = message;
    }
  }

  function horizontalRunMeters(p1, p2) {
    const dN = p2.n - p1.n;
    const dE = p2.e - p1.e;
    return Math.sqrt(dN * dN + dE * dE);
  }

  function buildScene({ planePoints, additionalPoints }) {
    clearContent();

    if (!planePoints || planePoints.length < 2) {
      setPlaceholder(
        planePoints && planePoints.length === 1
          ? "Complete the second plane point to preview"
          : "Import a CSV or enter plane points to preview",
        true
      );
      return;
    }

    setPlaceholder("", false);

    const p1 = planePoints[0];
    const p2 = planePoints[1];
    const origin = {
      n: (p1.n + p2.n) / 2,
      e: (p1.e + p2.e) / 2,
      z: (p1.z + p2.z) / 2,
    };

    const dN = p2.n - p1.n;
    const dE = p2.e - p1.e;
    const lineLen = Math.sqrt(dN * dN + dE * dE) || 1;
    const markerR = Math.max(lineLen * 0.018, 0.5);
    const perpN = (-dE / lineLen) * lineLen * 0.45;
    const perpE = (dN / lineLen) * lineLen * 0.45;
    const extend = 0.12;
    const zAt = (n, e) => elevationOnPlane(n, e, p1, p2) ?? p1.z;

    const corners = [
      { n: p1.n - dN * extend + perpN, e: p1.e - dE * extend + perpE },
      { n: p2.n + dN * extend + perpN, e: p2.e + dE * extend + perpE },
      { n: p2.n + dN * extend - perpN, e: p2.e + dE * extend - perpE },
      { n: p1.n - dN * extend - perpN, e: p1.e - dE * extend - perpE },
    ];

    const c0 = surveyToVec(corners[0].n, corners[0].e, zAt(corners[0].n, corners[0].e), origin);
    const c1 = surveyToVec(corners[1].n, corners[1].e, zAt(corners[1].n, corners[1].e), origin);
    const c2 = surveyToVec(corners[2].n, corners[2].e, zAt(corners[2].n, corners[2].e), origin);
    const c3 = surveyToVec(corners[3].n, corners[3].e, zAt(corners[3].n, corners[3].e), origin);

    const planeGeo = new THREE.BufferGeometry();
    planeGeo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        [
          c0.x, c0.y, c0.z, c1.x, c1.y, c1.z, c2.x, c2.y, c2.z,
          c0.x, c0.y, c0.z, c2.x, c2.y, c2.z, c3.x, c3.y, c3.z,
        ],
        3
      )
    );
    planeGeo.computeVertexNormals();

    contentGroup.add(
      new THREE.Mesh(
        planeGeo,
        new THREE.MeshStandardMaterial({
          color: 0x6b8f58,
          transparent: true,
          opacity: 0.38,
          side: THREE.DoubleSide,
          roughness: 0.9,
        })
      )
    );

    const edgeGeo = new THREE.BufferGeometry().setFromPoints([c0, c1, c2, c3, c0]);
    contentGroup.add(
      new THREE.Line(
        edgeGeo,
        new THREE.LineBasicMaterial({ color: 0xa8c686, transparent: true, opacity: 0.55 })
      )
    );

    const spineStart = surveyToVec(p1.n, p1.e, p1.z, origin);
    const spineEnd = surveyToVec(p2.n, p2.e, p2.z, origin);
    const spineGeo = new THREE.BufferGeometry().setFromPoints([spineStart, spineEnd]);
    contentGroup.add(
      new THREE.Line(spineGeo, new THREE.LineBasicMaterial({ color: 0xa8c686, linewidth: 2 }))
    );

    if (showMeasurements) {
      const spineMid = spineStart.clone().lerp(spineEnd, 0.5);
      addMeasurementLabel(spineMid, `H ${scaleFormatter(horizontalRunMeters(p1, p2))}`, markerR * 0.5);
    }

    [p1, p2].forEach((pt, i) => {
      const pos = surveyToVec(pt.n, pt.e, pt.z, origin);
      const sphere = createSphere(i === 0 ? 0xa8c686 : 0x8fbf7a, markerR);
      sphere.position.copy(pos);
      contentGroup.add(sphere);

      const label = createLabel(pt.name || `Plane Point ${i + 1}`, "view3d-label view3d-label--plane");
      label.position.set(pos.x, pos.y + pointLabelOffsetY(markerR), pos.z);
      contentGroup.add(label);
    });

    (additionalPoints || []).forEach((pt) => {
      const orig = surveyToVec(pt.n, pt.e, pt.zOrig, origin);
      const adj = surveyToVec(pt.n, pt.e, pt.zAdj, origin);

      const vertGeo = new THREE.BufferGeometry().setFromPoints([orig, adj]);
      const vertMat = new THREE.LineDashedMaterial({
        color: 0xe07070,
        dashSize: markerR * 1.5,
        gapSize: markerR * 0.75,
      });
      const vertLine = new THREE.Line(vertGeo, vertMat);
      vertLine.computeLineDistances();
      contentGroup.add(vertLine);

      const origSphere = createSphere(0xe07070, markerR * 0.72);
      origSphere.position.copy(orig);
      contentGroup.add(origSphere);

      const adjSphere = createSphere(0x7db87d, markerR * 0.72);
      adjSphere.position.copy(adj);
      contentGroup.add(adjSphere);

      const label = createLabel(pt.name, "view3d-label view3d-label--field");
      label.position.set(orig.x, orig.y + pointLabelOffsetY(markerR * 0.72), orig.z);
      contentGroup.add(label);

      if (showMeasurements) {
        const delta = pt.zAdj - pt.zOrig;
        const sign = delta >= 0 ? "+" : "−";
        const mid = orig.clone().lerp(adj, 0.5);
        addMeasurementLabel(
          mid,
          `Δ ${sign}${scaleFormatter(Math.abs(delta))}`,
          markerR * 0.35
        );
      }
    });

    lastExtent = lineLen * 1.4;
    controls.minDistance = lastExtent * 0.05;
    controls.maxDistance = lastExtent * 20;

    if (!hasInitialCamera) {
      camera.position.set(lastExtent * 0.85, lastExtent * 0.65, lastExtent * 0.85);
      controls.target.set(0, 0, 0);
      controls.update();
      hasInitialCamera = true;
    }
  }

  function update(data) {
    lastData = data;
    buildScene(data);
  }

  function resetCamera() {
    camera.position.set(lastExtent * 0.85, lastExtent * 0.65, lastExtent * 0.85);
    controls.target.set(0, 0, 0);
    controls.update();
  }

  function zoomExtents() {
    if (contentGroup.children.length === 0) return;
    zoomToContent(camera, controls, contentGroup);
  }

  function setScaleFormatter(formatter) {
    scaleFormatter = typeof formatter === "function" ? formatter : scaleFormatter;
    if (lastData && showMeasurements) buildScene(lastData);
  }

  function setShowMeasurements(value) {
    showMeasurements = Boolean(value);
    if (lastData) buildScene(lastData);
  }

  animate();
  resize();

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);

  return {
    update,
    resize,
    resetCamera,
    zoomExtents,
    setScaleFormatter,
    setShowMeasurements,
    dispose() {
      if (animationId) cancelAnimationFrame(animationId);
      resizeObserver.disconnect();
      ui?.dispose();
      clearContent();
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      labelRenderer.domElement.remove();
    },
  };
}
