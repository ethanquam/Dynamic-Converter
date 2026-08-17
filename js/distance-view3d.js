import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import {
  getMetersPerPixel,
  installView3dChrome,
  POINT_MARKER_RADIUS_SCALE,
  zoomToContent,
} from "./view3d-ui.js";

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
    if (!(child instanceof CSS2DObject)) disposeObject(child);
  }
}

export function createDistanceView3d(container, placeholderEl, chrome = {}) {
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

  scene.add(new THREE.AmbientLight(0xffffff, 0.65));
  const keyLight = new THREE.DirectionalLight(0xffffff, 0.9);
  keyLight.position.set(1, 1.5, 0.75);
  scene.add(keyLight);

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

  function addMeasurementLabel(position, text, className, offsetY = 0) {
    const label = createLabel(text, className);
    label.position.set(position.x, position.y + offsetY, position.z);
    contentGroup.add(label);
  }

  function addDimensionBreakdown(vA, vB, measurements, options = {}) {
    if (!showMeasurements || !measurements) return;

    const {
      runColor = 0x7a8a72,
      riseColor = 0x7a8a72,
      runOpacity = 0.65,
      riseOpacity = 0.65,
      labelClass = "view3d-label view3d-label--measure",
      labelOffset = 0,
    } = options;

    const minY = Math.min(vA.y, vB.y);
    const footA = new THREE.Vector3(vA.x, minY, vA.z);
    const footB = new THREE.Vector3(vB.x, minY, vB.z);
    const markerOffset = Math.max(lastExtent * 0.015, 0.35) + labelOffset;

    addLine(footA, footB, runColor, false, runOpacity);
    if (vB.y >= vA.y) {
      addLine(footB, vB, riseColor, false, riseOpacity);
    } else {
      addLine(footA, vA, riseColor, false, riseOpacity);
    }

    const midH = footA.clone().lerp(footB, 0.5);
    const midS = vA.clone().lerp(vB, 0.5);
    const midV =
      vB.y >= vA.y ? footB.clone().lerp(vB, 0.5) : footA.clone().lerp(vA, 0.5);

    if (measurements.horizontal) {
      addMeasurementLabel(midH, `H ${measurements.horizontal}`, labelClass, markerOffset);
    }
    if (measurements.vertical) {
      addMeasurementLabel(midV, `V ${measurements.vertical}`, labelClass, markerOffset);
    }
    if (measurements.slope) {
      addMeasurementLabel(midS, `S ${measurements.slope}`, labelClass, markerOffset);
    }
  }

  function createSphere(color, radius) {
    return new THREE.Mesh(
      new THREE.SphereGeometry(radius * POINT_MARKER_RADIUS_SCALE, 20, 20),
      new THREE.MeshStandardMaterial({ color, roughness: 0.45 })
    );
  }

  function setPlaceholder(message, visible) {
    if (!placeholderEl) return;
    placeholderEl.hidden = !visible;
    if (visible && message) placeholderEl.textContent = message;
  }

  function addPoint(pos, color, radius, label, labelClass) {
    const sphere = createSphere(color, radius);
    sphere.position.copy(pos);
    contentGroup.add(sphere);

    if (label) {
      const labelObj = createLabel(label, labelClass);
      labelObj.position.set(pos.x, pos.y + radius * POINT_MARKER_RADIUS_SCALE * 2.2, pos.z);
      contentGroup.add(labelObj);
    }
  }

  function addLine(a, b, color, dashed = false, opacity = 1) {
    const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
    let mat;
    if (dashed) {
      mat = new THREE.LineDashedMaterial({
        color,
        dashSize: lastExtent * 0.02,
        gapSize: lastExtent * 0.01,
      });
    } else {
      mat = new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity });
    }
    const line = new THREE.Line(geo, mat);
    if (dashed) line.computeLineDistances();
    contentGroup.add(line);
  }

  function buildScene(data) {
    clearContent();

    const { measurePoints, planeEnabled, refPoints, projectedPoints, measurements } = data;

    if (!measurePoints || measurePoints.length < 2) {
      setPlaceholder("Import points and select Pt 1 & Pt 2 to preview", true);
      return;
    }

    setPlaceholder("", false);

    const p1 = measurePoints[0];
    const p2 = measurePoints[1];

    const all = [p1, p2];
    if (planeEnabled && refPoints) all.push(refPoints[0], refPoints[1]);
    if (projectedPoints) all.push(...projectedPoints);

    const origin = {
      n: all.reduce((s, p) => s + p.n, 0) / all.length,
      e: all.reduce((s, p) => s + p.e, 0) / all.length,
      z: all.reduce((s, p) => s + p.z, 0) / all.length,
    };

    const spanN = Math.max(...all.map((p) => Math.abs(p.n - origin.n)));
    const spanE = Math.max(...all.map((p) => Math.abs(p.e - origin.e)));
    const spanZ = Math.max(...all.map((p) => Math.abs(p.z - origin.z)));
    lastExtent = Math.max(spanN, spanE, spanZ, 1) * 2.8;
    controls.minDistance = lastExtent * 0.05;
    controls.maxDistance = lastExtent * 20;

    const markerR = Math.max(lastExtent * 0.025, 0.5);
    const v1 = surveyToVec(p1.n, p1.e, p1.z, origin);
    const v2 = surveyToVec(p2.n, p2.e, p2.z, origin);

    if (planeEnabled && refPoints && refPoints.length === 2) {
      const r1 = refPoints[0];
      const r2 = refPoints[1];
      const dN = r2.n - r1.n;
      const dE = r2.e - r1.e;
      const len = Math.sqrt(dN * dN + dE * dE) || 1;
      const extend = len * 0.12;

      const zPad = lastExtent * 0.04;
      const zMin = Math.min(...all.map((p) => p.z), r1.z, r2.z) - zPad;
      const zMax = Math.max(...all.map((p) => p.z), r1.z, r2.z) + zPad;

      const n1 = r1.n - (dN / len) * extend;
      const e1 = r1.e - (dE / len) * extend;
      const n2 = r2.n + (dN / len) * extend;
      const e2 = r2.e + (dE / len) * extend;

      const bl = surveyToVec(n1, e1, zMin, origin);
      const br = surveyToVec(n2, e2, zMin, origin);
      const tr = surveyToVec(n2, e2, zMax, origin);
      const tl = surveyToVec(n1, e1, zMax, origin);

      const planeGeo = new THREE.BufferGeometry();
      planeGeo.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(
          [bl.x, bl.y, bl.z, br.x, br.y, br.z, tr.x, tr.y, tr.z, tl.x, tl.y, tl.z],
          3
        )
      );
      planeGeo.setIndex([0, 1, 2, 0, 2, 3]);
      planeGeo.computeVertexNormals();

      contentGroup.add(
        new THREE.Mesh(
          planeGeo,
          new THREE.MeshStandardMaterial({
            color: 0x527a42,
            transparent: true,
            opacity: 0.28,
            side: THREE.DoubleSide,
            roughness: 0.95,
          })
        )
      );

      const borderGeo = new THREE.BufferGeometry().setFromPoints([bl, br, tr, tl, bl]);
      contentGroup.add(
        new THREE.Line(
          borderGeo,
          new THREE.LineBasicMaterial({ color: 0x527a42, transparent: true, opacity: 0.85 })
        )
      );

      const rv1 = surveyToVec(r1.n, r1.e, r1.z, origin);
      const rv2 = surveyToVec(r2.n, r2.e, r2.z, origin);
      addLine(rv1, rv2, 0x527a42, false, 0.9);
      addPoint(rv1, 0x527a42, markerR * 0.85, r1.name || "Ref 1", "view3d-label view3d-label--plane");
      addPoint(rv2, 0x527a42, markerR * 0.85, r2.name || "Ref 2", "view3d-label view3d-label--plane");
    }

    if (projectedPoints && projectedPoints.length === 2) {
      const pr1 = projectedPoints[0];
      const pr2 = projectedPoints[1];
      const pv1 = surveyToVec(pr1.n, pr1.e, pr1.z, origin);
      const pv2 = surveyToVec(pr2.n, pr2.e, pr2.z, origin);

      addLine(v1, v2, 0x9aa393, false, 0.45);
      addDimensionBreakdown(v1, v2, measurements?.direct, {
        runColor: 0x9aa393,
        riseColor: 0x9aa393,
        labelClass: "view3d-label view3d-label--measure",
      });

      addLine(pv1, pv2, 0x6b8f58, false, 1);
      addDimensionBreakdown(pv1, pv2, measurements?.onPlane, {
        runColor: 0x6b8f58,
        riseColor: 0x6b8f58,
        labelClass: "view3d-label view3d-label--measure view3d-label--measure-corrected",
        labelOffset: markerR * 0.5,
      });

      addPoint(v1, 0xc44d4d, markerR, p1.name || "Point 1", "view3d-label view3d-label--field");
      addPoint(v2, 0xc44d4d, markerR, p2.name || "Point 2", "view3d-label view3d-label--field");

      addLine(v1, pv1, 0xc44d4d, true);
      addLine(v2, pv2, 0xc44d4d, true);

      addPoint(pv1, 0x4a8f4a, markerR * 0.8, `${p1.name || "P1"}′`, "view3d-label view3d-label--plane");
      addPoint(pv2, 0x4a8f4a, markerR * 0.8, `${p2.name || "P2"}′`, "view3d-label view3d-label--plane");
    } else {
      addLine(v1, v2, 0x6b8f58, false, 1);
      addDimensionBreakdown(v1, v2, measurements?.direct, {
        runColor: 0x6b8f58,
        riseColor: 0x6b8f58,
        labelClass: "view3d-label view3d-label--measure",
      });
      addPoint(v1, 0x6b8f58, markerR, p1.name || "Point 1", "view3d-label view3d-label--plane");
      addPoint(v2, 0x6b8f58, markerR, p2.name || "Point 2", "view3d-label view3d-label--plane");
    }

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
