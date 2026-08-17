import * as THREE from "three";

const NICE_SCALES = [
  0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000,
];

/** Point sphere radius multiplier (0.6 = 40% smaller than base marker size). */
export const POINT_MARKER_RADIUS_SCALE = 0.6;

export function getMetersPerPixel(camera, controls, canvasHeight) {
  const distance = camera.position.distanceTo(controls.target);
  if (distance <= 0 || canvasHeight <= 0) return null;
  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const visibleHeight = 2 * Math.tan(vFov / 2) * distance;
  return visibleHeight / canvasHeight;
}

export function pickScaleBar(metersPerPixel, targetPx = 90) {
  if (!metersPerPixel || metersPerPixel <= 0) return null;

  let best = null;
  for (const meters of NICE_SCALES) {
    const px = meters / metersPerPixel;
    if (px >= 48 && px <= 140) {
      best = { meters, px };
    }
  }

  if (best) return best;

  const meters = targetPx * metersPerPixel;
  return { meters, px: targetPx };
}

export function zoomToContent(camera, controls, object, padding = 1.35) {
  const box = new THREE.Box3();
  object.updateWorldMatrix(true, true);
  box.setFromObject(object);
  if (box.isEmpty()) return false;

  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 0.001);

  const fov = THREE.MathUtils.degToRad(camera.fov);
  let distance = maxDim / 2 / Math.tan(fov / 2);
  distance *= padding;

  const offset = camera.position.clone().sub(controls.target);
  if (offset.lengthSq() < 1e-12) {
    offset.set(1, 0.75, 1);
  }
  offset.normalize().multiplyScalar(distance);

  camera.position.copy(center).add(offset);
  controls.target.copy(center);
  controls.update();
  return true;
}

export function installView3dChrome({
  panel,
  canvasWrap,
  showMeasurementsInput,
  zoomExtentsBtn,
  resetViewBtn,
  fullscreenBtn,
  onShowMeasurementsChange,
  onZoomExtents,
  onResetView,
  onResize,
}) {
  const scaleBar = document.createElement("div");
  scaleBar.className = "view3d-scale-bar";
  scaleBar.innerHTML =
    '<div class="view3d-scale-bar-track"><div class="view3d-scale-bar-line"></div></div>' +
    '<span class="view3d-scale-bar-label"></span>';
  canvasWrap.appendChild(scaleBar);

  const scaleLine = scaleBar.querySelector(".view3d-scale-bar-line");
  const scaleLabel = scaleBar.querySelector(".view3d-scale-bar-label");

  function updateScaleBar(metersPerPixel, formatMeters) {
    const picked = pickScaleBar(metersPerPixel);
    if (!picked || typeof formatMeters !== "function") {
      scaleBar.hidden = true;
      return;
    }

    scaleBar.hidden = false;
    scaleLine.style.width = `${picked.px}px`;
    scaleLabel.textContent = formatMeters(picked.meters);
  }

  if (showMeasurementsInput) {
    showMeasurementsInput.addEventListener("change", () => {
      onShowMeasurementsChange?.(showMeasurementsInput.checked);
    });
  }

  zoomExtentsBtn?.addEventListener("click", () => onZoomExtents?.());
  resetViewBtn?.addEventListener("click", () => onResetView?.());

  fullscreenBtn?.addEventListener("click", async () => {
    try {
      if (document.fullscreenElement === panel) {
        await document.exitFullscreen();
      } else if (panel.requestFullscreen) {
        await panel.requestFullscreen();
      }
    } catch (_) {
      /* ignore unsupported fullscreen */
    }
  });

  const onFullscreenChange = () => {
    panel.classList.toggle("is-fullscreen", document.fullscreenElement === panel);
    onResize?.();
  };
  document.addEventListener("fullscreenchange", onFullscreenChange);

  return {
    updateScaleBar,
    getShowMeasurements: () => showMeasurementsInput?.checked ?? true,
    dispose() {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      scaleBar.remove();
    },
  };
}
