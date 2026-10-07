/**
 * Engine lifecycle: owns the constructed stylesheet, adopts it into the
 * document and every shadow root, watches the DOM and schedules boundary
 * detection before paint.
 */

import { cssFamily } from '../lib/fonts';
import { SHADOW_EVENT } from '../lib/hook-events';
import type { Profile } from '../lib/settings';
import { Detector, type DetectorHost, inheritsTypography } from './boundary';
import { type FamilyKind, classifyFamily } from './classify';
import { ALL_ATTRS, type FamilyInfo, type FontMetrics, buildFontFaces, buildSheet, familyRule } from './css';
import { type Plan, createPlan } from './plan';
import { type ProbeRequest, probeFonts } from './probe';
import { collect, isInSkippedSubtree, isSkipped, markHost } from './tree';

const TAG_SELECTOR = ALL_ATTRS.map((name) => `[${name}]`).join(',');
const STATE_ATTRIBUTES = ['class', 'style', 'lang', 'dir', 'id', 'open', 'hidden'];
const WATCHED_ATTRIBUTES = [...STATE_ATTRIBUTES, ...ALL_ATTRS];
/** Subtrees up to this size are re-checked whole when an attribute changes; larger ones only at the element. */
const SMALL_SUBTREE = 64;
const TYPOGRAPHY_STYLE = /font|line-height/i;

const FIRST_BUDGET_MS = 50;
const FRAME_BUDGET_MS = 8;
/** Smallest slice, so slow devices still make progress every frame. */
const MIN_SLICE = 200;
/** Delay that coalesces bursts of stylesheet changes into one verification. */
const VERIFY_DELAY_MS = 150;
const VERIFY_INTERVAL_MS = 500;
const RESIZE_DEBOUNCE_MS = 300;
const IDLE_VERIFY_DELAY_MS = 2000;
const IDLE_CHECK_TIMEOUT_MS = 2000;

function isSmallSubtree(element: Element): boolean {
  return element.getElementsByTagName('*').length <= SMALL_SUBTREE;
}

/** The attributes that can change an element's own typography, as one string. */
function stateKey(element: Element): string {
  return STATE_ATTRIBUTES.map((name) => element.getAttribute(name) ?? '').join('\n');
}

function isTagged(element: Element): boolean {
  return ALL_ATTRS.some((name) => element.hasAttribute(name));
}

function isStylesheetNode(node: Node): boolean {
  return (
    node instanceof HTMLStyleElement ||
    (node instanceof HTMLLinkElement && /\bstylesheet\b/i.test(node.rel))
  );
}

/** Applies a profile to the current document and keeps it applied as the page changes. */
export class Engine implements DetectorHost {
  plan!: Plan;
  private readonly sheet = new CSSStyleSheet();
  /** Language `@font-face` rules; document only, replaced only when they change. */
  private readonly faceSheet = new CSSStyleSheet();
  private faceText = '';
  private readonly detector = new Detector(this);
  private readonly families = new Map<string, FamilyInfo>();
  private readonly familyList: FamilyInfo[] = [];
  private readonly unflushed = new Set<FamilyInfo>();
  private readonly metricCache = new Map<string, number | null>();
  private metrics: FontMetrics = {};
  private observer: MutationObserver | undefined;
  private readonly shadowRoots = new Set<WeakRef<ShadowRoot>>();
  private knownShadowRoots = new WeakSet<ShadowRoot>();
  private readonly slotListeners = new WeakSet<ShadowRoot>();
  /** Inserted elements to process; checked against skipped regions before use. */
  private roots: Element[] = [];
  /** Unvisited subtrees left over from a time-sliced pass; their parents are processed. */
  private continuation: Element[] = [];
  /** True until the first pass over the document has drained, which runs with a larger budget. */
  private initialPass = true;
  /** Elements to re-process, with whether their whole subtree is included. */
  private readonly refreshRoots = new Map<Element, boolean>();
  /** Elements whose state attributes changed, checked before deciding to re-process. */
  private readonly checks = new Set<Element>();
  /** Tagged elements to verify when the page is idle. */
  private readonly idleChecks = new Set<Element>();
  private idleScheduled = false;
  /** Attribute states already verified per tagged element (pages often toggle between two). */
  private verifiedStates = new WeakMap<Element, Set<string>>();
  /**
   * Pending verification: 1 checks that untagged elements still inherit (cheap, no
   * writes); 2 also re-reads tagged elements' own values with the rules disabled.
   */
  private verifyLevel: 0 | 1 | 2 = 0;
  private pendingVerify: 0 | 1 | 2 = 0;
  private scheduled = false;
  private costPerElement = 0.02;
  private lastVerify = 0;
  private verifyTimer: ReturnType<typeof setTimeout> | undefined;
  private resizeTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly abort = new AbortController();
  private running = false;
  private listening = false;
  private stopped = false;

  constructor() {
    // Listens from document start, before settings load, so hosts that attach closed
    // shadow roots while the page parses are known when the engine starts.
    document.addEventListener(
      SHADOW_EVENT,
      (event) => {
        if (!(event.target instanceof Element)) return;
        markHost(event.target);
        if (this.running) this.queueRefresh(event.target);
      },
      { capture: true, signal: this.abort.signal },
    );
  }

  /** Applies a profile, or removes every change when `profile` is `null`. */
  update(profile: Profile | null): void {
    if (this.stopped) return;
    if (!profile) {
      this.stop();
      return;
    }
    const plan = createPlan(profile);
    const rescan = this.running && this.plan.key !== plan.key;
    const detectChanged = this.running && this.plan.detectLang !== plan.detectLang;
    this.plan = plan;
    this.measureFontMetrics();
    this.measureFamilies([...this.families.values()]);
    this.rebuild();

    if (!this.running) {
      this.start();
    } else if (rescan) {
      if (detectChanged) this.observeAll();
      this.detector.reset();
      this.processFull();
    }
  }

  /** Removes the stylesheet, every tag and every listener. Final. */
  destroy(): void {
    this.stop();
    this.stopped = true;
    this.abort.abort();
  }

  // DetectorHost

  family(list: string, kind: FamilyKind): FamilyInfo {
    // Private-use icons inside an ordinary family get their own entry.
    const key = kind === classifyFamily(list) ? list : `${kind}|${list}`;
    let info = this.families.get(key);
    if (!info) {
      info = { id: this.familyList.length, list, kind };
      this.families.set(key, info);
      this.familyList.push(info);
      this.unflushed.add(info);
    }
    return info;
  }

  flushRules(): void {
    if (!this.unflushed.size) return;
    const fresh = [...this.unflushed];
    this.unflushed.clear();
    this.measureFamilies(fresh);
    const layer = this.layerRule();
    if (!layer) {
      this.rebuild();
      return;
    }
    for (const family of fresh) layer.insertRule(familyRule(this.plan, family, this.metrics), layer.cssRules.length);
  }

  familyById(id: number): FamilyInfo | undefined {
    return this.familyList[id];
  }

  setSizeFix(family: FamilyInfo, fix: number): void {
    family.sizeFix = Math.abs(fix - 1) < 0.01 ? 1 : fix;
    if (family.sizeFix !== 1) this.rebuild();
  }

  // Stylesheet

  private layerRule(): CSSLayerBlockRule | undefined {
    for (const rule of this.sheet.cssRules) if (rule instanceof CSSLayerBlockRule) return rule;
    return undefined;
  }

  private rebuild(): void {
    this.unflushed.clear();
    this.sheet.replaceSync(buildSheet(this.plan, this.families.values(), this.metrics));
    const faces = buildFontFaces(this.plan);
    if (faces !== this.faceText) {
      this.faceText = faces;
      this.faceSheet.replaceSync(faces);
    }
  }

  private sheetsFor(root: Document | ShadowRoot): CSSStyleSheet[] {
    // `@font-face` rules only work at document level.
    return root === document ? [this.faceSheet, this.sheet] : [this.sheet];
  }

  private adopt(root: Document | ShadowRoot): void {
    try {
      const missing = this.sheetsFor(root).filter((sheet) => !root.adoptedStyleSheets.includes(sheet));
      if (missing.length) root.adoptedStyleSheets = [...root.adoptedStyleSheets, ...missing];
    } catch (error) {
      console.warn('[gfg Typeface] Could not adopt stylesheet', error);
    }
  }

  private release(root: Document | ShadowRoot): void {
    const ours = this.sheetsFor(root);
    if (root.adoptedStyleSheets.some((sheet) => ours.includes(sheet))) {
      root.adoptedStyleSheets = root.adoptedStyleSheets.filter((sheet) => !ours.includes(sheet));
    }
  }

  /** Re-adopts the sheet where frameworks replaced `adoptedStyleSheets`. */
  private verifyAdoption(): void {
    this.adopt(document);
    for (const ref of this.shadowRoots) {
      const root = ref.deref();
      if (root) this.adopt(root);
      else this.shadowRoots.delete(ref);
    }
  }

  // Metrics

  private measure(requests: (ProbeRequest & { key: string })[]): void {
    const missing = requests.filter((request) => !this.metricCache.has(request.key));
    const results = probeFonts(missing);
    missing.forEach((request, index) => {
      const result = results[index]!;
      this.metricCache.set(request.key, (request.aspect ? result.aspect : result.normal) ?? null);
    });
  }

  private cached(key: string): number | undefined {
    return this.metricCache.get(key) ?? undefined;
  }

  private measureFontMetrics(): void {
    const { font, codeFont, matchSize } = this.plan.profile;
    const requests: (ProbeRequest & { key: string })[] = [];
    if (matchSize && font) requests.push({ key: `a|${cssFamily(font)}`, family: cssFamily(font), aspect: true });
    if (matchSize && codeFont) requests.push({ key: `a|${cssFamily(codeFont)}`, family: cssFamily(codeFont), aspect: true });
    this.measure(requests);
    this.metrics = {
      mainAspect: font ? this.cached(`a|${cssFamily(font)}`) : undefined,
      codeAspect: codeFont ? this.cached(`a|${cssFamily(codeFont)}`) : undefined,
    };
  }

  private renderedList(family: FamilyInfo): string {
    const { font, codeFont } = this.plan.profile;
    const replacement = family.kind === 'text' ? font : family.kind.startsWith('mono') ? codeFont : null;
    return replacement ? `${cssFamily(replacement)}, ${family.list}` : family.list;
  }

  private needsAspects(): boolean {
    const { matchSize, font, codeFont } = this.plan.profile;
    return matchSize && (font !== null || codeFont !== null);
  }

  /** True when rules depend on measured font metrics, which change as web fonts load. */
  private usesMetrics(): boolean {
    return this.needsAspects() || this.plan.spacing !== 1;
  }

  private metricSignature(): string {
    const families = [...this.families.values()].map((family) => `${family.exAspect}/${family.normalRatio}`);
    return `${this.metrics.mainAspect}/${this.metrics.codeAspect}|${families.join(',')}`;
  }

  private measureFamilies(families: FamilyInfo[]): void {
    if (!families.length) return;
    const needAspect = this.needsAspects();
    const needNormal = this.plan.spacing !== 1;
    if (!needAspect && !needNormal) return;
    const requests: (ProbeRequest & { key: string })[] = [];
    for (const family of families) {
      if (needAspect) requests.push({ key: `a|${family.list}`, family: family.list, aspect: true });
      if (needNormal) {
        const list = this.renderedList(family);
        requests.push({ key: `n|${list}`, family: list, normal: true });
      }
    }
    this.measure(requests);
    for (const family of families) {
      if (needAspect) family.exAspect = this.cached(`a|${family.list}`);
      if (needNormal) family.normalRatio = this.cached(`n|${this.renderedList(family)}`);
    }
  }

  // Lifecycle

  private start(): void {
    if (document.contentType && !/html/i.test(document.contentType)) return;
    this.running = true;
    this.initialPass = true;
    this.adopt(document);
    this.observer = new MutationObserver((records) => this.handleRecords(records));
    this.observeAll();
    if (!this.listening) {
      this.listening = true;
      this.listen();
    }
    if (document.documentElement) this.roots.push(document.documentElement);
    this.schedule();
  }

  private stop(): void {
    if (!this.running) return;
    this.running = false;
    this.observer?.disconnect();
    this.observer = undefined;
    clearTimeout(this.verifyTimer);
    this.verifyTimer = undefined;
    this.verifyLevel = 0;
    this.pendingVerify = 0;
    clearTimeout(this.resizeTimer);
    this.roots = [];
    this.continuation = [];
    this.refreshRoots.clear();
    this.checks.clear();
    this.idleChecks.clear();
    this.release(document);
    this.untagAll();
    for (const ref of this.shadowRoots) {
      const root = ref.deref();
      if (root) this.release(root);
    }
    this.shadowRoots.clear();
    this.knownShadowRoots = new WeakSet();
    this.detector.reset();
  }

  private observerOptions(): MutationObserverInit {
    return {
      childList: true,
      subtree: true,
      attributes: true,
      attributeOldValue: true,
      attributeFilter: WATCHED_ATTRIBUTES,
      characterData: this.plan.detectLang,
    };
  }

  private observeAll(): void {
    if (!this.observer) return;
    this.observer.disconnect();
    const options = this.observerOptions();
    this.observer.observe(document, options);
    for (const ref of this.shadowRoots) {
      const root = ref.deref();
      if (root) this.observer.observe(root, options);
    }
  }

  private onShadowRoot = (root: ShadowRoot): void => {
    if (this.knownShadowRoots.has(root)) return;
    this.knownShadowRoots.add(root);
    this.shadowRoots.add(new WeakRef(root));
    this.adopt(root);
    // Lit and similar libraries assign `adoptedStyleSheets` right after `attachShadow`.
    queueMicrotask(() => this.adopt(root));
    this.observer?.observe(root, this.observerOptions());
    if (this.slotListeners.has(root)) return;
    this.slotListeners.add(root);
    root.addEventListener(
      'slotchange',
      (event) => {
        const slot = event.target;
        if (!this.running || !(slot instanceof HTMLSlotElement)) return;
        for (const element of slot.assignedElements()) this.queueRefresh(element);
      },
      { signal: this.abort.signal },
    );
  };

  private listen(): void {
    const { signal } = this.abort;
    document.addEventListener(
      'load',
      (event) => {
        if (this.running && event.target instanceof Element && isStylesheetNode(event.target)) this.requestVerify(1);
      },
      { capture: true, signal },
    );
    window.addEventListener(
      'resize',
      () => {
        if (!this.running) return;
        clearTimeout(this.resizeTimer);
        // Media queries can change any element's own typography.
        this.resizeTimer = setTimeout(() => this.requestVerify(2), RESIZE_DEBOUNCE_MS);
      },
      { signal },
    );
    window.addEventListener(
      'load',
      () => {
        if (!this.running) return;
        this.requestVerify(1);
        // Late styles (including CSS-in-JS rules inserted without DOM mutations) can change
        // tagged elements too; check them thoroughly once the page settles.
        setTimeout(() => requestIdleCallback(() => this.requestVerify(2)), IDLE_VERIFY_DELAY_MS);
      },
      { once: true, signal },
    );
    document.fonts.addEventListener(
      'loadingdone',
      () => {
        if (!this.running || !this.usesMetrics()) return;
        const before = this.metricSignature();
        this.metricCache.clear();
        this.measureFontMetrics();
        this.measureFamilies([...this.families.values()]);
        // Rebuilding restyles the page, so only do it when a loaded font changed a metric.
        if (this.metricSignature() !== before) this.rebuild();
      },
      { signal },
    );
  }

  // Mutation handling

  private handleRecords(records: MutationRecord[]): void {
    if (!this.running) return;
    for (const record of records) {
      const target = record.target;
      if (record.type === 'childList') {
        if (target instanceof HTMLStyleElement) {
          this.requestVerify(1);
          continue;
        }
        for (const node of record.addedNodes) {
          if (node instanceof Element) {
            if (isStylesheetNode(node)) this.requestVerify(1);
            else this.queueRoot(node);
          } else if (node.nodeType === Node.TEXT_NODE && this.plan.detectLang && target instanceof Element) {
            // New text can change the detected language of its element only.
            this.queueRefresh(target, false);
          }
        }
        for (const node of record.removedNodes) if (isStylesheetNode(node)) this.requestVerify(1);
      } else if (record.type === 'attributes' && target instanceof Element) {
        const name = record.attributeName ?? '';
        if (ALL_ATTRS.includes(name)) {
          // A page script (morphdom, Turbo) stripped or changed one of our tags.
          this.queueRefresh(target, false);
        } else if (name === 'style') {
          const after = target.getAttribute('style') ?? '';
          if (TYPOGRAPHY_STYLE.test(after) || TYPOGRAPHY_STYLE.test(record.oldValue ?? '')) this.checks.add(target);
        } else {
          this.checks.add(target);
        }
      } else if (record.type === 'characterData' && target.parentElement) {
        this.queueRefresh(target.parentElement, false);
      }
    }
    if (this.roots.length || this.refreshRoots.size || this.checks.size) this.schedule();
  }

  /**
   * Sorts attribute changes into work: untagged elements that still inherit everything need
   * nothing; tagged ones are verified when idle, because their own values are hidden behind
   * our rules and re-reading them restyles their subtree. Pages often toggle classes on
   * `<html>` or `<body>` while scrolling, so this must stay cheap.
   */
  private runChecks(): void {
    for (const element of this.checks) {
      if (!element.isConnected || isInSkippedSubtree(element)) continue;
      if (isTagged(element)) {
        if (!this.verifiedStates.get(element)?.has(stateKey(element))) this.idleChecks.add(element);
      } else if (!inheritsTypography(element, this.plan)) {
        this.refreshRoots.set(element, isSmallSubtree(element));
      }
    }
    this.checks.clear();
    if (this.idleChecks.size && !this.idleScheduled) {
      this.idleScheduled = true;
      requestIdleCallback(() => this.runIdleChecks(), { timeout: IDLE_CHECK_TIMEOUT_MS });
    }
  }

  private runIdleChecks(): void {
    this.idleScheduled = false;
    if (!this.running) return;
    for (const element of this.idleChecks) {
      if (!element.isConnected) continue;
      let states = this.verifiedStates.get(element);
      if (!states) this.verifiedStates.set(element, (states = new Set()));
      states.add(stateKey(element));
      this.refreshRoots.set(element, this.refreshRoots.get(element) || isSmallSubtree(element));
    }
    this.idleChecks.clear();
    this.schedule();
  }

  private queueRoot(element: Element): void {
    if (isSkipped(element) || !element.isConnected) return;
    // A processed element inserted again was moved; its new context needs a fresh look.
    if (this.detector.has(element)) this.refreshRoots.set(element, this.refreshRoots.get(element) || isSmallSubtree(element));
    else this.roots.push(element);
  }

  private queueRefresh(element: Element, deep = true): void {
    if (isSkipped(element) || !element.isConnected) return;
    this.refreshRoots.set(element, this.refreshRoots.get(element) || deep);
    this.schedule();
  }

  /** Schedules a verification, coalescing bursts and spacing them out. */
  private requestVerify(level: 1 | 2): void {
    if (!this.running) return;
    this.pendingVerify = Math.max(this.pendingVerify, level) as 1 | 2;
    // New styles can change any element, so earlier verifications no longer hold.
    this.verifiedStates = new WeakMap();
    if (this.verifyTimer !== undefined) return;
    const wait = Math.max(VERIFY_DELAY_MS, this.lastVerify + VERIFY_INTERVAL_MS - performance.now());
    this.verifyTimer = setTimeout(() => {
      this.verifyTimer = undefined;
      this.verifyLevel = Math.max(this.verifyLevel, this.pendingVerify) as 0 | 1 | 2;
      this.pendingVerify = 0;
      this.schedule();
    }, wait);
  }

  // Scheduling

  private schedule(): void {
    if (this.scheduled || !this.running) return;
    this.scheduled = true;
    // rAF runs before paint; hidden documents never paint, so a timer keeps work moving.
    if (document.hidden) setTimeout(() => this.run(), 0);
    else requestAnimationFrame(() => this.run());
  }

  private run(): void {
    this.scheduled = false;
    if (!this.running || !this.observer) return;
    this.handleRecords(this.observer.takeRecords());
    this.verifyAdoption();
    this.runChecks();
    if (this.verifyLevel) this.verify();

    if (this.refreshRoots.size) {
      // Unprocessed elements are already queued as new roots, behind their parents.
      const refresh = [...this.refreshRoots].filter(
        ([root]) => root.isConnected && this.detector.has(root) && !isInSkippedSubtree(root),
      );
      this.refreshRoots.clear();
      this.processAll(refresh.filter(([, deep]) => deep).map(([root]) => root));
      const single = refresh.filter(([, deep]) => !deep).map(([root]) => root);
      this.strip(single);
      this.detector.process(single);
    }

    if (this.roots.length || this.continuation.length) {
      const budget = this.initialPass || document.hidden ? FIRST_BUDGET_MS : FRAME_BUDGET_MS;
      const fresh = this.roots.filter((root) => root.isConnected && !isInSkippedSubtree(root));
      const roots = [...this.continuation.filter((root) => root.isConnected), ...fresh];
      this.roots = [];
      const started = performance.now();
      const limit = Math.max(MIN_SLICE, Math.floor(budget / this.costPerElement));
      const { elements, rest } = collect(roots, limit, this.onShadowRoot, (element) => this.detector.has(element));
      this.strip(elements);
      this.detector.process(elements);
      if (elements.length) {
        const cost = (performance.now() - started) / elements.length;
        this.costPerElement = this.costPerElement * 0.7 + cost * 0.3;
      }
      this.continuation = rest;
      if (!rest.length) this.initialPass = false;
    }

    // Drop the records our own attribute writes produced.
    this.observer.takeRecords();
    if (this.roots.length || this.continuation.length || this.refreshRoots.size || this.checks.size || this.verifyLevel) {
      this.schedule();
    }
  }

  /** Re-processes the whole document in one task, so no half-processed state is painted. */
  private processFull(): void {
    this.refreshRoots.clear();
    this.roots = [];
    this.continuation = [];
    if (document.documentElement) this.processAll([document.documentElement]);
    this.observer?.takeRecords();
  }

  /**
   * Finds processed elements whose typography changed since they were processed and
   * re-processes only those, so a stylesheet that changes nothing costs only reads.
   */
  private verify(): void {
    const level = this.verifyLevel;
    this.verifyLevel = 0;
    this.lastVerify = performance.now();
    if (!document.documentElement) return;
    const { elements } = collect([document.documentElement], Number.POSITIVE_INFINITY, this.onShadowRoot);
    const processed = elements.filter((element) => this.detector.has(element));
    const stale: Element[] = [];
    if (level === 2) {
      // With our rules off, tagged elements show the site's own values again.
      this.sheet.disabled = true;
      try {
        for (const element of processed) if (isTagged(element) && !this.detector.originalsHold(element)) stale.push(element);
      } finally {
        this.sheet.disabled = false;
      }
    }
    for (const element of processed) {
      if (!isTagged(element) && !inheritsTypography(element, this.plan)) stale.push(element);
    }
    for (const element of stale) this.refreshRoots.set(element, isSmallSubtree(element));
  }

  private processAll(roots: Element[]): void {
    const { elements } = collect(roots, Number.POSITIVE_INFINITY, this.onShadowRoot);
    this.strip(elements);
    this.detector.process(elements);
  }

  /** Removes existing tags so the detector reads the site's own values. */
  private strip(elements: Element[]): void {
    for (const element of elements) {
      this.detector.forget(element);
      for (const name of ALL_ATTRS) if (element.hasAttribute(name)) element.removeAttribute(name);
    }
  }

  private untagAll(): void {
    const roots: (Document | ShadowRoot)[] = [document];
    for (const ref of this.shadowRoots) {
      const root = ref.deref();
      if (root) roots.push(root);
    }
    for (const root of roots) {
      for (const element of root.querySelectorAll(TAG_SELECTOR)) {
        for (const name of ALL_ATTRS) element.removeAttribute(name);
      }
    }
  }
}
