/**
 * Reads font metrics from the browser's own engine. A hidden host with a
 * closed shadow root is created, measured and removed in one task, so the
 * page never renders or keeps it.
 */

export interface ProbeRequest {
  /** CSS `font-family` list to measure. */
  family: string;
  /** Measure the `ex-height` aspect of the first available font. */
  aspect?: boolean;
  /** Measure `line-height: normal` as a ratio of the font size. */
  normal?: boolean;
}

export interface ProbeResult {
  aspect?: number;
  normal?: number;
}

const SIZE = 100;

/** Measures every request in one layout pass. */
export function probeFonts(requests: ProbeRequest[]): ProbeResult[] {
  if (!requests.length) return [];
  const host = document.createElement('gfc-probe');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText =
    'all: initial !important; position: fixed !important; left: -10000px !important; top: 0 !important; ' +
    'width: 4000px !important; height: 4000px !important; visibility: hidden !important; ' +
    'pointer-events: none !important; contain: strict !important;';
  const root = host.attachShadow({ mode: 'closed' });
  const nodes = requests.map((request) => {
    const node = document.createElement('div');
    node.textContent = 'x';
    node.style.cssText = `position: absolute; white-space: nowrap; font: ${SIZE}px/normal ${request.family}; font-size-adjust: from-font;`;
    root.append(node);
    return node;
  });

  (document.documentElement ?? document).append(host);
  try {
    return requests.map((request, index) => {
      const node = nodes[index]!;
      const result: ProbeResult = {};
      if (request.aspect) {
        const aspect = Number.parseFloat(getComputedStyle(node).fontSizeAdjust);
        if (Number.isFinite(aspect) && aspect > 0) result.aspect = aspect;
      }
      if (request.normal) {
        const height = node.getBoundingClientRect().height;
        if (height > 0) result.normal = height / SIZE;
      }
      return result;
    });
  } finally {
    host.remove();
  }
}
