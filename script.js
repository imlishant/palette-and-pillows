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

  if (tourBackdrop && nextImage && tourBackdrop.getAttribute("src") !== nextImage) {
    tourBackdrop.src = nextImage;
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
  const keepTop = window.innerHeight * 0.44;
  const keepBottom = window.innerHeight * 0.82;

  if (activeStep) {
    const activeRect = activeStep.getBoundingClientRect();
    if (activeRect.top < keepBottom && activeRect.bottom > keepTop) {
      ticking = false;
      playVideo();
      return;
    }
  }

  let bestStep = activeStep || tourSteps[0];
  let bestOverlap = 0;

  for (const step of tourSteps) {
    const rect = step.getBoundingClientRect();
    const overlapTop = Math.max(rect.top, keepTop);
    const overlapBottom = Math.min(rect.bottom, keepBottom);
    const overlap = Math.max(0, overlapBottom - overlapTop);

    if (overlap > bestOverlap) {
      bestOverlap = overlap;
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

const galleries = Array.from(document.querySelectorAll("[data-gallery]"));

for (const gallery of galleries) {
  const slides = Array.from(gallery.querySelectorAll(".gallery-slide"));
  const track = gallery.querySelector(".gallery-track");
  const dotsHost = gallery.querySelector(".gallery-dots");
  let currentIndex = 0;
  let autoTimer = 0;
  let pointerStartX = 0;
  let pointerStartY = 0;
  let pointerMoved = false;

  if (!slides.length || !dotsHost) {
    continue;
  }

  const dots = slides.map((_, index) => {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = "gallery-dot";
    dot.setAttribute("aria-label", `Show photo ${index + 1}`);
    dot.addEventListener("click", () => {
      showSlide(index);
      restartAuto();
    });
    dotsHost.appendChild(dot);
    return dot;
  });

  function showSlide(index) {
    currentIndex = (index + slides.length) % slides.length;

    slides.forEach((slide, slideIndex) => {
      const isCurrent = slideIndex === currentIndex;
      slide.classList.toggle("is-current", isCurrent);
      slide.setAttribute("aria-hidden", isCurrent ? "false" : "true");
    });

    dots.forEach((dot, dotIndex) => {
      const isCurrent = dotIndex === currentIndex;
      dot.classList.toggle("is-current", isCurrent);
      dot.setAttribute("aria-current", isCurrent ? "true" : "false");
    });
  }

  function restartAuto() {
    window.clearInterval(autoTimer);
    if (reducedMotion.matches) {
      return;
    }

    autoTimer = window.setInterval(() => {
      showSlide(currentIndex + 1);
    }, 4200);
  }

  track?.addEventListener("pointerdown", (event) => {
    pointerStartX = event.clientX;
    pointerStartY = event.clientY;
    pointerMoved = false;
    track.setPointerCapture?.(event.pointerId);
  });

  track?.addEventListener("pointermove", (event) => {
    if (Math.abs(event.clientX - pointerStartX) > 8 || Math.abs(event.clientY - pointerStartY) > 8) {
      pointerMoved = true;
    }
  });

  track?.addEventListener("pointerup", (event) => {
    const deltaX = event.clientX - pointerStartX;
    const deltaY = event.clientY - pointerStartY;

    if (Math.abs(deltaX) > 42 && Math.abs(deltaX) > Math.abs(deltaY)) {
      showSlide(currentIndex + (deltaX < 0 ? 1 : -1));
      restartAuto();
      return;
    }

    if (!pointerMoved) {
      showSlide(currentIndex + 1);
      restartAuto();
    }
  });

  showSlide(0);
  restartAuto();
}

const reviewCarousels = Array.from(document.querySelectorAll("[data-review-carousel]"));

for (const carousel of reviewCarousels) {
  const slides = Array.from(carousel.querySelectorAll(".review-card"));
  const track = carousel.querySelector(".review-track");
  const dotsHost = carousel.querySelector(".review-dots");
  let currentIndex = 0;
  let autoTimer = 0;
  let pointerStartX = 0;
  let pointerStartY = 0;
  let pointerMoved = false;

  if (!slides.length || !dotsHost) {
    continue;
  }

  const dots = slides.map((_, index) => {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = "review-dot";
    dot.setAttribute("aria-label", `Show guest review ${index + 1}`);
    dot.addEventListener("click", () => {
      showReview(index);
      restartReviewAuto();
    });
    dotsHost.appendChild(dot);
    return dot;
  });

  function showReview(index) {
    currentIndex = (index + slides.length) % slides.length;

    slides.forEach((slide, slideIndex) => {
      const isCurrent = slideIndex === currentIndex;
      slide.classList.toggle("is-current", isCurrent);
      slide.setAttribute("aria-hidden", isCurrent ? "false" : "true");
    });

    dots.forEach((dot, dotIndex) => {
      const isCurrent = dotIndex === currentIndex;
      dot.classList.toggle("is-current", isCurrent);
      dot.setAttribute("aria-current", isCurrent ? "true" : "false");
    });
  }

  function restartReviewAuto() {
    window.clearInterval(autoTimer);
    if (reducedMotion.matches) {
      return;
    }

    autoTimer = window.setInterval(() => {
      showReview(currentIndex + 1);
    }, 5600);
  }

  track?.addEventListener("pointerdown", (event) => {
    pointerStartX = event.clientX;
    pointerStartY = event.clientY;
    pointerMoved = false;
    track.setPointerCapture?.(event.pointerId);
  });

  track?.addEventListener("pointermove", (event) => {
    if (Math.abs(event.clientX - pointerStartX) > 8 || Math.abs(event.clientY - pointerStartY) > 8) {
      pointerMoved = true;
    }
  });

  track?.addEventListener("pointerup", (event) => {
    const deltaX = event.clientX - pointerStartX;
    const deltaY = event.clientY - pointerStartY;

    if (Math.abs(deltaX) > 42 && Math.abs(deltaX) > Math.abs(deltaY)) {
      showReview(currentIndex + (deltaX < 0 ? 1 : -1));
      restartReviewAuto();
      return;
    }

    if (!pointerMoved) {
      showReview(currentIndex + 1);
      restartReviewAuto();
    }
  });

  showReview(0);
  restartReviewAuto();
}
