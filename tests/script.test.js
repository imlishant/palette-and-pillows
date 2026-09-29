/**
 * Tests for the real exports of script.js.
 *
 * script.js only calls init() when it is loaded as a browser script; under
 * CommonJS it exports its helpers instead, so these tests exercise the code
 * that actually ships rather than a copy of it.
 */

/* matchMedia does not exist in jsdom and script.js calls it at init time. */
let mediaMatches = {};

beforeAll(() => {
  window.matchMedia = jest.fn().mockImplementation((query) => ({
    get matches() {
      return Boolean(mediaMatches[query]);
    },
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  }));
});

const {
  wrapIndex,
  pickActiveStep,
  isConstrained,
  preloadImage,
  createCarousel,
  cubicBezier,
  setPresence,
  mediaCache,
} = require("../script.js");

/** Build a .tour-step whose geometry we control. */
function makeStep(top, height) {
  const el = document.createElement("article");
  el.className = "tour-step";
  el.getBoundingClientRect = () => ({
    top,
    bottom: top + height,
    height,
    left: 0,
    right: 0,
    width: 0,
  });
  return el;
}

// ---------------------------------------------------------------------------

describe("wrapIndex()", () => {
  test("passes through an in-range index", () => {
    expect(wrapIndex(2, 5)).toBe(2);
  });

  test("wraps past the end back to the start", () => {
    expect(wrapIndex(5, 5)).toBe(0);
    expect(wrapIndex(6, 5)).toBe(1);
  });

  test("wraps below zero to the end", () => {
    expect(wrapIndex(-1, 5)).toBe(4);
    expect(wrapIndex(-6, 5)).toBe(4);
  });

  test("returns 0 for an empty carousel instead of NaN", () => {
    expect(wrapIndex(3, 0)).toBe(0);
  });
});

// ---------------------------------------------------------------------------

describe("pickActiveStep()", () => {
  const keepTop = 440;
  const keepBottom = 820;

  test("picks the step that overlaps the reading band most", () => {
    const steps = [makeStep(-500, 400), makeStep(500, 400), makeStep(1200, 400)];
    expect(pickActiveStep(steps, keepTop, keepBottom, null)).toBe(steps[1]);
  });

  test("keeps the active step while it still touches the band (hysteresis)", () => {
    const steps = [makeStep(700, 400), makeStep(500, 400)];
    // steps[1] overlaps more, but steps[0] still touches the band, so it stays.
    expect(pickActiveStep(steps, keepTop, keepBottom, steps[0])).toBe(steps[0]);
  });

  test("moves on once the active step leaves the band entirely", () => {
    const steps = [makeStep(-900, 400), makeStep(500, 400)];
    expect(pickActiveStep(steps, keepTop, keepBottom, steps[0])).toBe(steps[1]);
  });

  test("returns the active step when there are no steps at all", () => {
    const fallback = makeStep(0, 10);
    expect(pickActiveStep([], keepTop, keepBottom, fallback)).toBe(fallback);
  });

  test("returns null rather than undefined when there is nothing to pick", () => {
    expect(pickActiveStep([], keepTop, keepBottom, null)).toBeNull();
  });

  test("holds the current step when nothing overlaps the band", () => {
    const steps = [makeStep(-900, 100), makeStep(2000, 100)];
    const active = steps[0];
    expect(pickActiveStep(steps, keepTop, keepBottom, active)).toBe(active);
  });
});

// ---------------------------------------------------------------------------

describe("isConstrained()", () => {
  test("false when the browser exposes no connection info", () => {
    expect(isConstrained(undefined)).toBe(false);
    expect(isConstrained(null)).toBe(false);
  });

  test("true when the visitor has asked to save data", () => {
    expect(isConstrained({ saveData: true, effectiveType: "4g" })).toBe(true);
  });

  test.each(["slow-2g", "2g", "3g"])("true on a %s connection", (effectiveType) => {
    expect(isConstrained({ saveData: false, effectiveType })).toBe(true);
  });

  test("false on 4g without save-data", () => {
    expect(isConstrained({ saveData: false, effectiveType: "4g" })).toBe(false);
  });
});

// ---------------------------------------------------------------------------

describe("preloadImage()", () => {
  beforeEach(() => mediaCache.clear());

  test("caches one Image per src", () => {
    preloadImage("assets/images/landscape/kitchen.jpg");
    expect(mediaCache.size).toBe(1);
  });

  test("does not fetch the same src twice", () => {
    preloadImage("assets/images/landscape/kitchen.jpg");
    const first = mediaCache.get("assets/images/landscape/kitchen.jpg");
    preloadImage("assets/images/landscape/kitchen.jpg");
    expect(mediaCache.get("assets/images/landscape/kitchen.jpg")).toBe(first);
    expect(mediaCache.size).toBe(1);
  });

  test.each([["", "empty"], [null, "null"], [undefined, "undefined"]])(
    "ignores a %s src",
    (src) => {
      preloadImage(src);
      expect(mediaCache.size).toBe(0);
    }
  );
});

// ---------------------------------------------------------------------------

describe("createCarousel()", () => {
  const reducedMotion = { matches: true }; // no timers during tests

  function mount(slideCount) {
    const root = document.createElement("div");
    root.innerHTML = `
      <div class="track"></div>
      <div class="dots"></div>
    `;
    const track = root.querySelector(".track");
    for (let i = 0; i < slideCount; i += 1) {
      const slide = document.createElement("figure");
      slide.className = "slide";
      track.appendChild(slide);
    }
    document.body.appendChild(root);
    return root;
  }

  afterEach(() => {
    document.body.innerHTML = "";
  });

  const options = {
    slideSelector: ".slide",
    trackSelector: ".track",
    dotsSelector: ".dots",
    dotClass: "dot",
    dotLabel: "Show photo",
    interval: 1000,
    reducedMotion,
  };

  test("builds one dot per slide", () => {
    const root = mount(4);
    createCarousel(root, options);
    expect(root.querySelectorAll(".dot")).toHaveLength(4);
  });

  test("marks the first slide current on mount", () => {
    const root = mount(3);
    createCarousel(root, options);
    const slides = root.querySelectorAll(".slide");
    expect(slides[0].classList.contains("is-current")).toBe(true);
    expect(slides[1].classList.contains("is-current")).toBe(false);
  });

  test("moves the current class when shown", () => {
    const root = mount(3);
    const carousel = createCarousel(root, options);
    carousel.show(2);
    const slides = root.querySelectorAll(".slide");
    expect(slides[2].classList.contains("is-current")).toBe(true);
    expect(slides[0].classList.contains("is-current")).toBe(false);
    expect(carousel.index).toBe(2);
  });

  test("wraps past the last slide", () => {
    const root = mount(3);
    const carousel = createCarousel(root, options);
    carousel.show(3);
    expect(carousel.index).toBe(0);
  });

  test("hides non-current slides from assistive tech", () => {
    const root = mount(3);
    createCarousel(root, options);
    const slides = root.querySelectorAll(".slide");
    expect(slides[0].getAttribute("aria-hidden")).toBe("false");
    expect(slides[1].getAttribute("aria-hidden")).toBe("true");
  });

  test("marks the matching dot as current", () => {
    const root = mount(3);
    const carousel = createCarousel(root, options);
    carousel.show(1);
    const dots = root.querySelectorAll(".dot");
    expect(dots[1].getAttribute("aria-current")).toBe("true");
    expect(dots[0].getAttribute("aria-current")).toBe("false");
  });

  test("a dot click jumps to its slide", () => {
    const root = mount(3);
    const carousel = createCarousel(root, options);
    root.querySelectorAll(".dot")[2].click();
    expect(carousel.index).toBe(2);
  });

  test("returns null when there is nothing to show", () => {
    const root = mount(0);
    expect(createCarousel(root, options)).toBeNull();
  });

  test("starts no timer when reduced motion is requested", () => {
    jest.spyOn(window, "setInterval");
    const root = mount(3);
    createCarousel(root, options);
    expect(window.setInterval).not.toHaveBeenCalled();
    window.setInterval.mockRestore();
  });

  test("starts a timer when motion is allowed", () => {
    jest.spyOn(window, "setInterval");
    const root = mount(3);
    createCarousel(root, { ...options, reducedMotion: { matches: false } });
    expect(window.setInterval).toHaveBeenCalledWith(expect.any(Function), 1000);
    window.setInterval.mockRestore();
  });
});

// ---------------------------------------------------------------------------

describe("cubicBezier()", () => {
  const easeOut = cubicBezier([0.32, 0.72, 0, 1]);

  test("is pinned at both ends", () => {
    expect(easeOut(0)).toBe(0);
    expect(easeOut(1)).toBe(1);
  });

  test("clamps out-of-range input", () => {
    expect(easeOut(-0.5)).toBe(0);
    expect(easeOut(1.5)).toBe(1);
  });

  test("never goes backwards", () => {
    let previous = 0;
    for (let t = 0; t <= 1; t += 0.05) {
      const value = easeOut(t);
      expect(value).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = value;
    }
  });

  test("front-loads the movement, which is what makes it feel quick", () => {
    // The iOS curve should be well past halfway by the time a third of the
    // duration has elapsed. A linear curve would be at 0.33.
    expect(easeOut(0.33)).toBeGreaterThan(0.6);
  });

  test("a linear control curve stays linear", () => {
    const linear = cubicBezier([0.33, 0.33, 0.67, 0.67]);
    expect(linear(0.5)).toBeCloseTo(0.5, 2);
  });
});

// ---------------------------------------------------------------------------

describe("setPresence()", () => {
  let el;

  beforeEach(() => {
    jest.useFakeTimers();
    el = document.createElement("div");
    document.body.appendChild(el);
  });

  afterEach(() => {
    jest.useRealTimers();
    document.body.innerHTML = "";
  });

  test("opening marks it visible and exposes it", () => {
    setPresence(el, true);
    expect(el.dataset.state).toBe("open");
    expect(el.classList.contains("is-visible")).toBe(true);
    expect(el.hasAttribute("aria-hidden")).toBe(false);
  });

  test("closing hides it immediately from assistive tech", () => {
    setPresence(el, true);
    setPresence(el, false);
    expect(el.dataset.state).toBe("closing");
    expect(el.getAttribute("aria-hidden")).toBe("true");
    expect(el.classList.contains("is-visible")).toBe(false);
  });

  test("stays mounted until the exit animation has run", () => {
    setPresence(el, true);
    setPresence(el, false, 190);
    jest.advanceTimersByTime(150);
    expect(el.dataset.state).toBe("closing");
    jest.advanceTimersByTime(60);
    expect(el.dataset.state).toBe("closed");
  });

  test("reopening cancels a pending close", () => {
    setPresence(el, true);
    setPresence(el, false, 190);
    setPresence(el, true);
    jest.advanceTimersByTime(500);
    expect(el.dataset.state).toBe("open");
  });

  test("does not throw on a missing element", () => {
    expect(() => setPresence(null, true)).not.toThrow();
  });
});
