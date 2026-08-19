import type { HighlightRule } from '../../../../../shared/types'
import { newLocalHighlightId } from '../highlights'

export function createHighlightRule(
  makeId: () => string = newLocalHighlightId
): HighlightRule {
  return {
    id: makeId(),
    pattern: '',
    color: '#f5a52480',
    enabled: true,
    caseSensitive: false,
    wholeWord: false,
    isRegex: false,
    playSound: false
  }
}

export function appendHighlightRule(
  rules: HighlightRule[],
  rule: HighlightRule
): HighlightRule[] {
  return [...rules, rule]
}

export function patchHighlightRule(
  rules: HighlightRule[],
  id: string,
  patch: Partial<HighlightRule>
): HighlightRule[] {
  return rules.map((rule) => rule.id === id ? { ...rule, ...patch, id: rule.id } : rule)
}

export function duplicateHighlightRule(
  rules: HighlightRule[],
  id: string,
  makeId: () => string = newLocalHighlightId
): HighlightRule[] {
  const index = rules.findIndex((rule) => rule.id === id)
  if (index < 0) return [...rules]
  const copy = { ...rules[index]!, id: makeId() }
  return [...rules.slice(0, index + 1), copy, ...rules.slice(index + 1)]
}

export function removeHighlightRule(
  rules: HighlightRule[],
  id: string
): HighlightRule[] {
  return rules.filter((rule) => rule.id !== id)
}

export function moveHighlightRule(
  rules: HighlightRule[],
  id: string,
  targetIndex: number
): HighlightRule[] {
  const sourceIndex = rules.findIndex((rule) => rule.id === id)
  if (sourceIndex < 0) return [...rules]
  const next = [...rules]
  const [moved] = next.splice(sourceIndex, 1)
  const boundedTarget = Math.max(0, Math.min(targetIndex, next.length))
  next.splice(boundedTarget, 0, moved!)
  return next
}
