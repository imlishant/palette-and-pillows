const tourStage = document.querySelector(".tour-stage");
const tourImage = document.querySelector("#tour-image");
const tourCount = document.querySelector("#tour-count");
const tourLabel = document.querySelector("#tour-label");
const tourSteps = Array.from(document.querySelectorAll(".tour-step"));
const mobileMedia = window.matchMedia("(max-width: 720px) and (orientation: portrait)");

let activeStep = tourSteps[0];
let ticking = false;

const imageCache = new Map();

function sourceFor(step) {
  return mobileMedia.matches ? step.dataset.mobile || step.dataset.image : step.dataset.image;
}

function preload(src) {
  if (!src || imageCache.has(src)) {
    return imageCache.get(src);
  }

  const img = new Image();
  const promise = new Promise((resolve) => {
    img.onload = resolve;
    img.onerror = resolve;
  });

  img.src = src;
  imageCache.set(src, promise);
  return promise;
}

function setActive(step) {
  if (!step) {
    return;
  }

  const nextSrc = sourceFor(step);
  const shouldSwapImage = tourImage.getAttribute("src") !== nextSrc;

  activeStep?.classList.remove("is-active");
  step.classList.add("is-active");
  activeStep = step;

  tourCount.textContent = step.dataset.count;
  tourLabel.textContent = step.dataset.label;
  tourImage.alt = step.dataset.alt;

  if (!shouldSwapImage) {
    return;
  }

  tourStage.classList.add("is-changing");
  preload(nextSrc).then(() => {
    tourImage.src = nextSrc;
    window.requestAnimationFrame(() => {
      tourStage.classList.remove("is-changing");
    });
  });
}

function updateActiveStep() {
  const viewportTarget = window.innerHeight * 0.54;
  let bestStep = activeStep || tourSteps[0];
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const step of tourSteps) {
    const rect = step.getBoundingClientRect();
    const center = rect.top + rect.height * 0.5;
    const distance = Math.abs(center - viewportTarget);

    if (distance < bestDistance) {
      bestDistance = distance;
      bestStep = step;
    }
  }

  setActive(bestStep);
  ticking = false;
}

function requestUpdate() {
  if (ticking) {
    return;
  }

  ticking = true;
  window.requestAnimationFrame(updateActiveStep);
}

for (const step of tourSteps) {
  preload(step.dataset.image);
  preload(step.dataset.mobile);
}

setActive(activeStep);
window.addEventListener("scroll", requestUpdate, { passive: true });
window.addEventListener("resize", requestUpdate);
mobileMedia.addEventListener("change", () => setActive(activeStep));
