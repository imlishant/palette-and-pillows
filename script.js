/**
 * Palette & Pillows
 *
 * Plain browser script, no dependencies. The pure helpers are exported for the
 * test suite; the DOM wiring only runs when this file is loaded as a script.
 */

const SLOW_CONNECTIONS = new Set(["slow-2g", "2g", "3g"]);

/* How many steps either side of the active one to fetch ahead of time. */
const PRELOAD_RADIUS = 1;

/* Mirrors the 620px breakpoint in styles.css. */
const MOBILE_QUERY = "(max-width: 620px)";
const DESKTOP_QUERY = "(min-width: 621px)";

const mediaCache = new Map();

/* ------------------------------------------------------------------ *
 * Pure helpers
 * ------------------------------------------------------------------ */

/** Wrap an index into range, so a carousel loops in both directions. */
function wrapIndex(index, length) {
  if (length <= 0) {
    return 0;
  }
  return ((index % length) + length) % length;
}

/**
 * Pick the tour step that best fills the reading band.
 *
 * Keeps the current step while it still overlaps the band at all, which stops
 * the copy flickering between two steps on a slow scroll.
 */
function pickActiveStep(steps, keepTop, keepBottom, activeStep) {
  if (!steps.length) {
    return activeStep || null;
  }

  if (activeStep) {
    const rect = activeStep.getBoundingClientRect();
    if (rect.top < keepBottom && rect.bottom > keepTop) {
      return activeStep;
    }
  }

  let bestStep = activeStep || steps[0];
  let bestOverlap = 0;

  for (const step of steps) {
    const rect = step.getBoundingClientRect();
    const overlap = Math.min(rect.bottom, keepBottom) - Math.max(rect.top, keepTop);

    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      bestStep = step;
    }
  }

  return bestStep;
}

/** True when the visitor has asked for less data, or is on a slow network. */
function isConstrained(connection) {
  if (!connection) {
    return false;
  }
  return Boolean(connection.saveData) || SLOW_CONNECTIONS.has(connection.effectiveType);
}

function preloadImage(src) {
  if (!src || mediaCache.has(src)) {
    return;
  }

  const img = new Image();
  img.src = src;
  mediaCache.set(src, img);
}

function preloadVideo(src, preload = "metadata") {
  if (!src || mediaCache.has(src)) {
    return;
  }

  const video = document.createElement("video");
  video.preload = preload;
  video.muted = true;
  video.playsInline = true;
  video.src = src;
  mediaCache.set(src, video);
}

/* ------------------------------------------------------------------ *
 * Carousel
 *
 * The gallery and the review strip are the same component with different
 * selectors and timings.
 * ------------------------------------------------------------------ */

function createCarousel(root, options) {
  const {
    slideSelector,
    trackSelector,
    dotsSelector,
    dotClass,
    dotLabel,
    interval,
    reducedMotion,
    adaptiveHeight = false,
  } = options;

  const slides = Array.from(root.querySelectorAll(slideSelector));
  const track = root.querySelector(trackSelector);
  const dotsHost = root.querySelector(dotsSelector);

  if (!slides.length || !dotsHost) {
    return null;
  }

  let currentIndex = 0;
  let autoTimer = 0;
  let pointerStartX = 0;
  let pointerStartY = 0;
  let pointerMoved = false;

  const dots = slides.map((_, index) => {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = dotClass;
    dot.setAttribute("aria-label", `${dotLabel} ${index + 1} of ${slides.length}`);
    dot.addEventListener("click", () => {
      show(index);
      restart();
    });
    dotsHost.appendChild(dot);
    return dot;
  });

  /** Start fetching a slide's image now rather than when it is shown. */
  function warmSlide(index) {
    const slide = slides[wrapIndex(index, slides.length)];
    const img = slide?.querySelector("img");
    if (img && img.loading === "lazy" && !img.complete) {
      img.loading = "eager";
    }
  }

  /**
   * Size the track once, to the tallest card.
   *
   * Sizing it per card looked tighter but changed the height of the document
   * every time the carousel advanced, which nudged everything below it - the
   * page appeared to scroll on its own. A single stable height is still far
   * shorter than the fixed value it replaced, and it never moves.
   */
  function syncHeight() {
    if (!adaptiveHeight || !track) {
      return;
    }

    /* Let the cards fall back to their content height to measure them. */
    track.style.height = "auto";
    let tallest = 0;
    slides.forEach((slide) => {
      tallest = Math.max(tallest, slide.getBoundingClientRect().height);
    });
    track.style.height = `${Math.ceil(tallest)}px`;
  }

  function show(index) {
    currentIndex = wrapIndex(index, slides.length);

    slides.forEach((slide, slideIndex) => {
      const isCurrent = slideIndex === currentIndex;
      slide.classList.toggle("is-current", isCurrent);
      slide.setAttribute("aria-hidden", isCurrent ? "false" : "true");
      /* Keep hidden slides out of the tab order. */
      slide.querySelectorAll("a, button").forEach((node) => {
        node.tabIndex = isCurrent ? 0 : -1;
      });
    });

    dots.forEach((dot, dotIndex) => {
      const isCurrent = dotIndex === currentIndex;
      dot.classList.toggle("is-current", isCurrent);
      dot.setAttribute("aria-current", isCurrent ? "true" : "false");
    });

    /* Fetch the neighbours so the next advance has an image ready. Without
       this a slow connection shows the empty track instead of a photo. */
    warmSlide(currentIndex);
    warmSlide(currentIndex + 1);
    warmSlide(currentIndex - 1);
  }

  /** True when a slide has a picture that has actually arrived. */
  function slideReady(index) {
    const img = slides[wrapIndex(index, slides.length)]?.querySelector("img");
    return !img || img.complete;
  }

  function restart() {
    window.clearInterval(autoTimer);
    if (reducedMotion.matches) {
      return;
    }
    autoTimer = window.setInterval(() => {
      /* Never auto-advance onto a photo that has not downloaded yet - that is
         what showed an empty slide on a slow connection. Wait a tick instead. */
      if (!slideReady(currentIndex + 1)) {
        warmSlide(currentIndex + 1);
        return;
      }
      show(currentIndex + 1);
    }, interval);
  }

  function stop() {
    window.clearInterval(autoTimer);
  }

  if (track) {
    track.addEventListener("pointerdown", (event) => {
      pointerStartX = event.clientX;
      pointerStartY = event.clientY;
      pointerMoved = false;
      track.setPointerCapture?.(event.pointerId);
    });

    track.addEventListener("pointermove", (event) => {
      if (
        Math.abs(event.clientX - pointerStartX) > 8 ||
        Math.abs(event.clientY - pointerStartY) > 8
      ) {
        pointerMoved = true;
      }
    });

    track.addEventListener("pointerup", (event) => {
      const deltaX = event.clientX - pointerStartX;
      const deltaY = event.clientY - pointerStartY;

      if (Math.abs(deltaX) > 42 && Math.abs(deltaX) > Math.abs(deltaY)) {
        show(currentIndex + (deltaX < 0 ? 1 : -1));
        restart();
        return;
      }

      /* Do not advance when the tap was really the end of a text selection. */
      const selection = window.getSelection?.();
      if (selection && String(selection).trim().length > 0) {
        return;
      }

      if (!pointerMoved) {
        show(currentIndex + 1);
        restart();
      }
    });

    /* Pause while a pointer is resting on the carousel, so it cannot slide out
       from under someone mid-sentence. */
    track.addEventListener("pointerenter", stop);
    track.addEventListener("pointerleave", restart);
    track.addEventListener("focusin", stop);
    track.addEventListener("focusout", restart);
  }

  /* Arrow keys work from the dots. The track itself is deliberately not
     focusable: focusing it on tap made the browser scroll it into view. */
  dotsHost.addEventListener("keydown", (event) => {
    if (event.key === "ArrowRight") {
      show(currentIndex + 1);
      dots[currentIndex]?.focus();
      restart();
      event.preventDefault();
    } else if (event.key === "ArrowLeft") {
      show(currentIndex - 1);
      dots[currentIndex]?.focus();
      restart();
      event.preventDefault();
    }
  });

  show(0);
  restart();

  if (adaptiveHeight) {
    /* Re-measure once webfonts and images have settled, and on resize. */
    window.addEventListener("load", syncHeight);
    window.addEventListener("resize", syncHeight);
    slides.forEach((slide) => {
      slide.querySelectorAll("img").forEach((img) => {
        if (!img.complete) {
          img.addEventListener("load", syncHeight, { once: true });
        }
      });
    });
    window.setTimeout(syncHeight, 250);
  }

  return { show, restart, stop, syncHeight, get index() { return currentIndex; } };
}

/* ------------------------------------------------------------------ *
 * DOM wiring
 * ------------------------------------------------------------------ */

function init() {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const wantsBackdrop = window.matchMedia(DESKTOP_QUERY);
  const isMobile = window.matchMedia(MOBILE_QUERY);

  /* ---- Hero video: only ever fetched on small screens, where it is shown ---- */

  const heroVideo = document.querySelector("[data-hero-video]");

  /* Fade in only once frames are actually arriving, so the poster underneath
     is never replaced by a black box on a slow connection. */
  heroVideo?.addEventListener("playing", () => {
    heroVideo.classList.add("is-playing");
  });

  function syncHeroVideo() {
    if (!heroVideo) {
      return;
    }

    if (isMobile.matches && !heroVideo.dataset.loaded) {
      const src = heroVideo.dataset.heroVideo;
      if (src && !isConstrained(navigator.connection)) {
        heroVideo.src = src;
        heroVideo.dataset.loaded = "true";
        heroVideo.load();
      }
    }

    if (!isMobile.matches || reducedMotion.matches) {
      heroVideo.pause();
    } else if (heroVideo.dataset.loaded) {
      heroVideo.play().catch(() => {});
    }
  }

  /* Hold the hero video back until the page has settled. The poster beneath it
     is the mobile LCP, and the tour requests the same clip, so starting late
     keeps the two off the critical path and lets the second one hit cache. */
  function startHeroVideo() {
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(syncHeroVideo, { timeout: 2000 });
    } else {
      window.setTimeout(syncHeroVideo, 600);
    }
  }

  if (document.readyState === "complete") {
    startHeroVideo();
  } else {
    window.addEventListener("load", startHeroVideo, { once: true });
  }

  isMobile.addEventListener("change", syncHeroVideo);

  /* ---- Scroll tour ---- */

  const tour = document.querySelector(".tour");
  const tourStage = document.querySelector(".tour-stage");
  const stageVideos = Array.from(document.querySelectorAll("[data-stage-video]"));
  const tourImage = document.querySelector("#tour-image");
  let activeBuffer = 0;
  const tourBackdrop = document.querySelector("#tour-backdrop");
  const tourCount = document.querySelector("#tour-count");
  const tourLabel = document.querySelector("#tour-label");
  const tourSteps = Array.from(document.querySelectorAll(".tour-step"));

  let activeStep = tourSteps[0] || null;
  let ticking = false;
  let currentVideo = "";
  let swapTimer = 0;
  let fadeToken = 0;
  /* Stays false until the tour nears the viewport, so the first clip is not
     fetched on first paint for someone who never scrolls that far. */
  let tourReady = false;

  /* Let the stylesheet size the tour from the real step count, so adding a room
     cannot leave a gap of dead scroll at the end. */
  if (tour && tourSteps.length) {
    tour.style.setProperty("--tour-steps", String(tourSteps.length));
  }

  /** Fetch the current step and its neighbours, and nothing else. */
  function preloadAround(index) {
    const constrained = isConstrained(navigator.connection);

    for (let offset = -PRELOAD_RADIUS; offset <= PRELOAD_RADIUS; offset += 1) {
      const step = tourSteps[index + offset];
      if (!step) {
        continue;
      }

      preloadImage(step.dataset.poster);

      /* The blurred backdrop is display:none below 621px - never fetch it there. */
      if (wantsBackdrop.matches) {
        preloadImage(step.dataset.image);
      }

      if (!constrained) {
        /* Neighbours are fetched in full, not just metadata - a crossfade needs
           decodable frames the moment the step changes. */
        preloadVideo(step.dataset.video, "auto");
      }
    }
  }

  function currentBuffer() {
    return stageVideos[activeBuffer];
  }

  function playVideo() {
    const video = currentBuffer();
    if (!video || reducedMotion.matches || !video.getAttribute("src")) {
      return;
    }
    video.play?.().catch?.(() => {});
  }

  function pauseAllVideos() {
    stageVideos.forEach((video) => video.pause?.());
  }

  /**
   * Load the next clip into the idle buffer, wait until it can actually play,
   * then crossfade. The outgoing clip keeps playing until the fade is done, so
   * a step change never drops to a black frame.
   */
  function crossfadeTo(src, poster, label) {
    const next = stageVideos[1 - activeBuffer];
    const current = currentBuffer();
    if (!next || !current) {
      return;
    }

    const token = ++fadeToken;
    if (poster) {
      next.poster = poster;
    }
    next.setAttribute("aria-label", label);

    const reveal = () => {
      if (token !== fadeToken) {
        return; /* a newer step won the race */
      }

      if (!reducedMotion.matches) {
        next.play?.().catch?.(() => {});
      }

      next.classList.add("is-active");
      next.removeAttribute("aria-hidden");
      current.classList.remove("is-active");
      current.setAttribute("aria-hidden", "true");
      activeBuffer = 1 - activeBuffer;

      /* Let the fade finish before stopping the outgoing clip. */
      window.setTimeout(() => {
        if (token === fadeToken) {
          current.pause?.();
        }
      }, 500);
    };

    if (next.getAttribute("src") === src && next.readyState >= 2) {
      reveal();
      return;
    }

    next.setAttribute("src", src);
    next.preload = "auto";
    next.load();

    let settled = false;
    const onReady = () => {
      if (settled) {
        return;
      }
      settled = true;
      next.removeEventListener("canplay", onReady);
      window.clearTimeout(swapTimer);
      reveal();
    };

    next.addEventListener("canplay", onReady);
    /* If the clip is slow, show it anyway rather than stalling the tour on the
       previous room; its own poster covers the gap. */
    window.clearTimeout(swapTimer);
    swapTimer = window.setTimeout(onReady, 1400);
  }

  function updateStageMedia(step) {
    const nextVideo = step.dataset.video || "";
    const nextPoster = step.dataset.poster || step.dataset.image || "";
    const nextImage = step.dataset.image || nextPoster;
    const label = step.dataset.alt || step.dataset.label || "Room tour video";

    if (
      tourBackdrop &&
      wantsBackdrop.matches &&
      nextImage &&
      tourBackdrop.getAttribute("src") !== nextImage
    ) {
      tourBackdrop.src = nextImage;
    }

    if (!tourReady) {
      /* Keep the first poster correct while the tour is still out of range. */
      const first = currentBuffer();
      if (first && nextPoster) {
        first.poster = nextPoster;
        first.setAttribute("aria-label", label);
      }
      return;
    }

    const constrained = isConstrained(navigator.connection);

    /* On a constrained connection the posters carry the tour and no clip is
       fetched at all. */
    if (constrained) {
      pauseAllVideos();
      const shown = currentBuffer();
      if (shown && nextPoster) {
        shown.poster = nextPoster;
        shown.setAttribute("aria-label", label);
      }
      return;
    }

    if (nextVideo && currentVideo !== nextVideo) {
      currentVideo = nextVideo;
      tourStage?.classList.add("is-changing");
      crossfadeTo(nextVideo, nextPoster, label);
      window.setTimeout(() => tourStage?.classList.remove("is-changing"), 460);
      return;
    }

    if (!nextVideo && tourImage && nextImage && tourImage.getAttribute("src") !== nextImage) {
      tourImage.src = nextImage;
      tourImage.alt = step.dataset.alt || "";
      tourImage.hidden = false;
      pauseAllVideos();
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

    if (tourCount) {
      tourCount.textContent = step.dataset.count || "";
    }
    if (tourLabel) {
      tourLabel.textContent = step.dataset.label || "";
    }
    if (tourImage) {
      tourImage.alt = step.dataset.alt || "";
    }

    preloadAround(tourSteps.indexOf(step));
    updateStageMedia(step);
  }

  function updateActiveStep() {
    ticking = false;
    const keepTop = window.innerHeight * 0.44;
    const keepBottom = window.innerHeight * 0.82;
    setActive(pickActiveStep(tourSteps, keepTop, keepBottom, activeStep));
  }

  function requestUpdate() {
    if (ticking) {
      return;
    }
    ticking = true;
    window.requestAnimationFrame(updateActiveStep);
  }

  if (activeStep) {
    activeStep.classList.add("is-active");
    updateStageMedia(activeStep);
  }

  /* Start fetching tour media only once the section is within a screen of the
     viewport. Everything above it paints first. */
  function armTour() {
    if (tourReady) {
      return;
    }
    tourReady = true;
    preloadAround(tourSteps.indexOf(activeStep));
    if (activeStep) {
      updateStageMedia(activeStep);
    }
    playVideo();
  }

  if (tour && "IntersectionObserver" in window) {
    const tourObserver = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          armTour();
          tourObserver.disconnect();
        }
      },
      { rootMargin: "100% 0px" }
    );
    tourObserver.observe(tour);
  } else {
    armTour();
  }

  window.addEventListener("scroll", requestUpdate, { passive: true });
  window.addEventListener("resize", requestUpdate);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      pauseAllVideos();
      heroVideo?.pause();
    } else {
      playVideo();
      syncHeroVideo();
    }
  });

  /* ---- Carousels ---- */

  const carousels = [];

  document.querySelectorAll("[data-gallery]").forEach((root) => {
    carousels.push(
      createCarousel(root, {
        slideSelector: ".gallery-slide",
        trackSelector: ".gallery-track",
        dotsSelector: ".gallery-dots",
        dotClass: "gallery-dot",
        dotLabel: "Show photo",
        interval: 4200,
        reducedMotion,
      })
    );
  });

  document.querySelectorAll("[data-review-carousel]").forEach((root) => {
    carousels.push(
      createCarousel(root, {
        slideSelector: ".review-card",
        trackSelector: ".review-track",
        dotsSelector: ".review-dots",
        dotClass: "review-dot",
        dotLabel: "Show guest review",
        interval: 5600,
        reducedMotion,
        adaptiveHeight: true,
      })
    );
  });

  /* A preference change mid-session should take effect without a reload. */
  reducedMotion.addEventListener("change", () => {
    carousels.forEach((carousel) => carousel?.restart());
    syncHeroVideo();
    if (reducedMotion.matches) {
      pauseAllVideos();
    } else {
      playVideo();
    }
  });

  /* ---- Sticky mobile booking bar ---- */

  const bookingBar = document.querySelector("[data-booking-bar]");
  const hero = document.querySelector(".hero");

  if (bookingBar && hero && "IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      ([entry]) => {
        bookingBar.classList.toggle("is-visible", !entry.isIntersecting);
      },
      { rootMargin: "-40% 0px 0px 0px" }
    );
    observer.observe(hero);
  }
}

/* ------------------------------------------------------------------ *
 * Export for tests, or wire up the page.
 * ------------------------------------------------------------------ */

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    wrapIndex,
    pickActiveStep,
    isConstrained,
    preloadImage,
    preloadVideo,
    createCarousel,
    mediaCache,
    init,
  };
} else {
  init();
}
