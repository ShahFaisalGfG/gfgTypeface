/**
 * Boundary detection. An element needs a tag only where its own typography
 * differs from what it inherits; everything else inherits the override.
 *
 * Elements are compared with their flat-tree parent's *current* values. When a
 * parent gets tagged, children that looked inherited are read again: a child
 * that explicitly repeats its parent's original value (`p { font-family: X }`
 * inside an `X` div) now differs from the overridden parent and gets its own
 * tag. Rounds repeat until nothing changes, batching all reads before all
 * writes so each round costs one style recalc.
 */

import { detectLanguage, matchLanguageTag } from '../lib/languages';
import { type FamilyKind, bolder, classifyFamily, isPrivateUseText, readSentinel } from './classify';
import { ATTR, type FamilyInfo, familyAttrValue } from './css';
import type { Plan } from './plan';
import { flatParent } from './tree';

export type LineHeight = { type: 'normal' } | { type: 'number'; value: number } | { type: 'length'; value: number };

interface Original {
  family?: number;
  lineHeight?: LineHeight;
  weight?: number;
  lang?: string;
}

interface Snapshot {
  family: string;
  weight: number;
  lineHeightText: string;
  fontSize: string;
  /** Typed line height, read on demand (Typed OM reads cost more than strings). */
  lineHeight?: LineHeight;
}

type Prop = 'family' | 'lineHeight' | 'weight';

interface Tags {
  [ATTR.family]?: string | null;
  [ATTR.lhNumber]?: string | null;
  [ATTR.lhLength]?: string | null;
  [ATTR.lhNormal]?: string | null;
  [ATTR.weight]?: string | null;
  [ATTR.lang]?: string | null;
}

/** Services the detector needs from the engine. */
export interface DetectorHost {
  readonly plan: Plan;
  /** Returns the registered family for a computed list, registering it when new. */
  family(list: string, kind: FamilyKind): FamilyInfo;
  /** Makes sure every registered family has its rule in the stylesheet. */
  flushRules(): void;
  /** Records a size correction for a family whose replacement changed the computed size. */
  setSizeFix(family: FamilyInfo, fix: number): void;
  /** Returns a registered family by id. */
  familyById(id: number): FamilyInfo | undefined;
}

const MAX_ROUNDS = 6;
/** Properties whose inherited values change below an element carrying each tag. */
const OVERRIDES: Partial<Record<string, readonly Prop[]>> = {
  [ATTR.family]: ['family'],
  [ATTR.lang]: ['family'],
  [ATTR.lhNumber]: ['lineHeight'],
  [ATTR.lhLength]: ['lineHeight'],
  [ATTR.lhNormal]: ['lineHeight'],
  [ATTR.weight]: ['weight'],
};

/** Elements whose browser default weight is the relative keyword `bolder`. */
const RELATIVE_WEIGHT_TAGS = new Set(['B', 'STRONG']);
const SAMPLE_LENGTH = 64;

function directText(element: Element, limit: number): string {
  let text = '';
  for (let node = element.firstChild; node && text.length < limit; node = node.nextSibling) {
    if (node.nodeType === Node.TEXT_NODE) text += (node as Text).data;
  }
  return text.slice(0, limit);
}

function readLineHeight(element: Element, text: string): LineHeight {
  try {
    const value = element.computedStyleMap().get('line-height');
    if (value instanceof CSSKeywordValue) return { type: 'normal' };
    if (value instanceof CSSUnitValue) {
      return value.unit === 'number' ? { type: 'number', value: value.value } : { type: 'length', value: value.value };
    }
  } catch {
    // Typed OM can throw for elements in documents without a browsing context.
  }
  const pixels = Number.parseFloat(text);
  return Number.isFinite(pixels) ? { type: 'length', value: pixels } : { type: 'normal' };
}

function sameLineHeight(a: LineHeight, b: LineHeight): boolean {
  if (a.type !== b.type) return false;
  return a.type === 'normal' || Math.abs(a.value - (b as { value: number }).value) < 1e-3;
}

function lineHeightTags(lineHeight: LineHeight): Tags {
  return {
    [ATTR.lhNumber]: lineHeight.type === 'number' ? String(Math.round(lineHeight.value * 10000) / 10000) : null,
    [ATTR.lhLength]: lineHeight.type === 'length' ? `${Math.round(lineHeight.value * 1000) / 1000}px` : null,
    [ATTR.lhNormal]: lineHeight.type === 'normal' ? '' : null,
  };
}

/** True when an untagged element still inherits every tracked property from its flat-tree parent. */
export function inheritsTypography(element: Element, plan: Plan): boolean {
  const parent = flatParent(element);
  if (!parent || (plan.trackLang && element.hasAttribute('lang'))) return false;
  const own = getComputedStyle(element);
  const inherited = getComputedStyle(parent);
  if (plan.trackFamily && own.fontFamily !== inherited.fontFamily) return false;
  if (plan.trackWeight && own.fontWeight !== inherited.fontWeight) return false;
  return (
    !plan.trackLh ||
    own.lineHeight === inherited.lineHeight ||
    sameLineHeight(readLineHeight(element, own.lineHeight), readLineHeight(parent, inherited.lineHeight))
  );
}

/** Detects and tags boundaries for batches of elements. */
export class Detector {
  private originals = new WeakMap<Element, Original>();

  constructor(private readonly host: DetectorHost) {}

  /** Forgets everything, e.g. after the tracked properties changed. */
  reset(): void {
    this.originals = new WeakMap();
  }

  /** Forgets one element before it is processed again. */
  forget(element: Element): void {
    this.originals.delete(element);
  }

  /** True when the element has been processed. */
  has(element: Element): boolean {
    return this.originals.has(element);
  }

  /**
   * Checks a processed element's recorded originals against its values while the
   * engine's rules are disabled, i.e. against the site's own current styles.
   */
  originalsHold(element: Element): boolean {
    const original = this.originals.get(element);
    if (!original) return true;
    const plan = this.host.plan;
    const style = getComputedStyle(element);
    if (plan.trackFamily && original.family !== undefined && this.host.familyById(original.family)?.list !== style.fontFamily) {
      return false;
    }
    if (plan.trackWeight && original.weight !== undefined && original.weight !== (Number.parseFloat(style.fontWeight) || 400)) {
      return false;
    }
    return !plan.trackLh || !original.lineHeight || sameLineHeight(original.lineHeight, readLineHeight(element, style.lineHeight));
  }

  private originalOf(element: Element | null): Original | undefined {
    for (let node = element; node; node = flatParent(node)) {
      const original = this.originals.get(node);
      if (original) return original;
    }
    return undefined;
  }

  /** Processes elements given parent-first. Elements must carry no tags yet. */
  process(elements: Element[]): void {
    const plan = this.host.plan;
    const props: Prop[] = [];
    if (plan.trackFamily) props.push('family');
    if (plan.trackLh) props.push('lineHeight');
    if (plan.trackWeight) props.push('weight');
    if (!props.length && !plan.trackLang) return;

    let pending = new Map<Element, Set<Prop>>(elements.map((element) => [element, new Set(props)]));
    for (let round = 0; pending.size && round < MAX_ROUNDS; round++) {
      pending = this.round(pending, round === 0);
    }
  }

  private round(pending: Map<Element, Set<Prop>>, first: boolean): Map<Element, Set<Prop>> {
    const plan = this.host.plan;
    const snapshots = new Map<Element, Snapshot>();
    const snapshot = (element: Element): Snapshot => {
      let value = snapshots.get(element);
      if (!value) {
        const style = getComputedStyle(element);
        value = {
          family: style.fontFamily,
          weight: Number.parseFloat(style.fontWeight) || 400,
          lineHeightText: style.lineHeight,
          fontSize: style.fontSize,
        };
        snapshots.set(element, value);
      }
      return value;
    };
    const typedLineHeight = (element: Element, value: Snapshot): LineHeight =>
      (value.lineHeight ??= readLineHeight(element, value.lineHeightText));

    const writes: [Element, Tags][] = [];
    const inherited = new Map<Element, Set<Prop>>();
    const sizeChecks: [Element, FamilyInfo, string][] = [];
    const configured = plan.languages.map((language) => language.id);

    for (const [element, open] of pending) {
      const parent = flatParent(element);
      const parentOriginal = parent ? this.originalOf(parent) : undefined;
      const original: Original = this.originals.get(element) ?? {};
      const tags: Tags = {};
      const self = snapshot(element);
      const parentSnapshot = parent ? snapshot(parent) : undefined;
      const stillInherited = new Set<Prop>();
      let familyInfo: FamilyInfo | undefined;

      if (first && plan.trackLang) {
        const inheritedLang = parentOriginal?.lang ?? '';
        let own: string | undefined;
        const attribute = element.getAttribute('lang');
        if (attribute !== null) own = matchLanguageTag(attribute) ?? '';
        else if (plan.detectLang) own = detectLanguage(directText(element, SAMPLE_LENGTH), configured);
        if (own !== undefined && own !== inheritedLang) tags[ATTR.lang] = own;
        original.lang = own ?? inheritedLang;
      }

      if (open.has('family')) {
        const sentinel = readSentinel(self.family);
        if (sentinel !== undefined) {
          original.family = sentinel;
          stillInherited.add('family');
        } else if (parentSnapshot && parentSnapshot.family === self.family && parentOriginal?.family !== undefined) {
          original.family = parentOriginal.family;
          stillInherited.add('family');
        } else {
          let kind = classifyFamily(self.family);
          if (kind === 'text' && isPrivateUseText(directText(element, SAMPLE_LENGTH))) kind = 'icon';
          familyInfo = this.host.family(self.family, kind);
          original.family = familyInfo.id;
          tags[ATTR.family] = familyAttrValue(plan, familyInfo);
          if (familyInfo.kind === 'monoGeneric' && plan.profile.codeFont !== null && familyInfo.sizeFix === undefined) {
            sizeChecks.push([element, familyInfo, self.fontSize]);
          }
        }
      }

      const scaleBoundary = ATTR.family in tags || ATTR.lang in tags;

      if (open.has('lineHeight')) {
        // Resolved pixel strings settle most comparisons; typed values only when they differ.
        const own = () => typedLineHeight(element, self);
        const equal =
          !!parent &&
          !!parentSnapshot &&
          (parentSnapshot.lineHeightText === self.lineHeightText || sameLineHeight(own(), typedLineHeight(parent, parentSnapshot)));
        if (equal && parentOriginal?.lineHeight && !scaleBoundary) {
          original.lineHeight = parentOriginal.lineHeight;
          stillInherited.add('lineHeight');
        } else {
          // A new scale context needs its own line height even when the value is inherited.
          original.lineHeight = equal && parentOriginal?.lineHeight ? parentOriginal.lineHeight : own();
          Object.assign(tags, lineHeightTags(original.lineHeight));
        }
      }

      if (open.has('weight')) {
        const parentWeight = parentSnapshot?.weight;
        const parentOriginalWeight = parentOriginal?.weight;
        const keepsWeight = familyInfo?.kind === 'icon' || familyInfo?.kind === 'emoji';
        if (parentWeight !== undefined && self.weight === parentWeight && parentOriginalWeight !== undefined && !keepsWeight) {
          original.weight = parentOriginalWeight;
          stillInherited.add('weight');
        } else {
          let weight = self.weight;
          if (parentWeight !== undefined && parentOriginalWeight !== undefined) {
            if (self.weight === parentWeight) weight = parentOriginalWeight;
            // `<b>` and `<strong>` use `bolder`, which resolved against the already changed parent weight.
            else if (RELATIVE_WEIGHT_TAGS.has(element.tagName) && parentWeight !== parentOriginalWeight && self.weight === bolder(parentWeight)) {
              weight = bolder(parentOriginalWeight);
            }
          }
          original.weight = weight;
          tags[ATTR.weight] = String(weight);
        }
      }

      this.originals.set(element, original);
      if (Object.keys(tags).length) writes.push([element, tags]);
      if (stillInherited.size) inherited.set(element, stillInherited);
    }

    // Which properties each write overrides, so only those are re-checked below it.
    const overridden = new Map<Element, Set<Prop>>();
    for (const [element, tags] of writes) {
      const props = new Set<Prop>();
      for (const [name, value] of Object.entries(tags) as [string, string | null][]) {
        if (value === null) {
          if (element.hasAttribute(name)) element.removeAttribute(name);
          continue;
        }
        if (element.getAttribute(name) === value) continue;
        element.setAttribute(name, value);
        // `line-height: normal` has no rule at 100% spacing, so it changes nothing below.
        if (name === ATTR.lhNormal && plan.spacing === 1) continue;
        for (const prop of OVERRIDES[name] ?? []) props.add(prop);
      }
      if (props.size) overridden.set(element, props);
    }
    this.host.flushRules();

    for (const [element, family, before] of sizeChecks) {
      const after = Number.parseFloat(getComputedStyle(element).fontSize);
      const original = Number.parseFloat(before);
      if (after > 0 && original > 0) this.host.setSizeFix(family, original / after);
    }

    // Re-check inherited props only below elements whose override of that prop landed this round.
    const next = new Map<Element, Set<Prop>>();
    const affected = new Map<Element, Set<Prop>>();
    for (const element of pending.keys()) {
      const parent = flatParent(element);
      if (!parent) continue;
      const own = overridden.get(parent);
      const above = affected.get(parent);
      if (!own && !above) continue;
      const both = own && above ? new Set([...own, ...above]) : (own ?? above)!;
      affected.set(element, both);
      const open = inherited.get(element);
      if (!open) continue;
      const reopen = new Set([...open].filter((prop) => both.has(prop)));
      if (reopen.size) next.set(element, reopen);
    }
    return next;
  }
}
