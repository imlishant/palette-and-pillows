const tourStage = document.querySelector(".tour-stage");
const tourVideo = document.querySelector("#tour-video");
const tourVideoSource = tourVideo?.querySelector("source");
const tourImage = document.querySelector("#tour-image");
const tourBackdrop = document.querySelector("#tour-backdrop");
const tourCount = document.querySelector("#tour-count");
const tourLabel = document.querySelector("#tour-label");
const tourSteps = Array.from(document.querySelectorAll(".tour-step"));

let activeStep = tourSteps[0];
let ticking = false;
let currentVideo = tourVideoSource?.getAttribute("src") || "";
let swapTimer = 0;

const mediaCache = new Map();
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

function preloadImage(src) {
  if (!src || mediaCache.has(src)) {
    return;
  }

  const img = new Image();
  img.src = src;
  mediaCache.set(src, img);
}

function preloadVideo(src) {
  if (!src || mediaCache.has(src)) {
    return;
  }

  const video = document.createElement("video");
  video.preload = "metadata";
  video.muted = true;
  video.playsInline = true;
  video.src = src;
  mediaCache.set(src, video);
}

function playVideo() {
  if (!tourVideo || reducedMotion.matches) {
    return;
  }

  const playPromise = tourVideo.play();
  if (playPromise) {
    playPromise.catch(() => {});
  }
}

function updateStageMedia(step) {
  const nextVideo = step.dataset.video || "";
  const nextPoster = step.dataset.poster || step.dataset.image || "";
  const nextImage = step.dataset.image || nextPoster;

  if (tourBackdrop && nextPoster && tourBackdrop.getAttribute("src") !== nextPoster) {
    tourBackdrop.src = nextPoster;
  }

  if (tourVideo) {
    tourVideo.poster = nextPoster;
    tourVideo.setAttribute("aria-label", step.dataset.alt || step.dataset.label || "Room tour video");
  }

  if (nextVideo && tourVideoSource && currentVideo !== nextVideo) {
    window.clearTimeout(swapTimer);
    tourStage.classList.add("is-changing");

    swapTimer = window.setTimeout(() => {
      currentVideo = nextVideo;
      tourVideoSource.src = nextVideo;
      tourVideo.hidden = false;
      tourImage.hidden = true;
      tourVideo.load();
      playVideo();

      window.requestAnimationFrame(() => {
        tourStage.classList.remove("is-changing");
      });
    }, 120);

    return;
  }

  if (!nextVideo && tourImage && nextImage && tourImage.getAttribute("src") !== nextImage) {
    window.clearTimeout(swapTimer);
    tourStage.classList.add("is-changing");

    swapTimer = window.setTimeout(() => {
      tourImage.src = nextImage;
      tourImage.alt = step.dataset.alt || "";
      tourImage.hidden = false;
      if (tourVideo) {
        tourVideo.hidden = true;
        tourVideo.pause();
      }

      window.requestAnimationFrame(() => {
        tourStage.classList.remove("is-changing");
      });
    }, 120);
  }
}

function setActive(step) {
  if (!step || step === activeStep) {
    playVideo();
    return;
  }

  activeStep?.classList.remove("is-active");
  step.classList.add("is-active");
  activeStep = step;

  tourCount.textContent = step.dataset.count;
  tourLabel.textContent = step.dataset.label;
  if (tourImage) {
    tourImage.alt = step.dataset.alt || "";
  }

  updateStageMedia(step);
}

function updateActiveStep() {
  const viewportTarget = window.innerHeight * 0.56;
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
  preloadVideo(step.dataset.video);
  preloadImage(step.dataset.poster);
  preloadImage(step.dataset.image);
}

if (activeStep) {
  activeStep.classList.add("is-active");
  updateStageMedia(activeStep);
}

playVideo();
window.addEventListener("scroll", requestUpdate, { passive: true });
window.addEventListener("resize", requestUpdate);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    tourVideo?.pause();
  } else {
    playVideo();
  }
});
