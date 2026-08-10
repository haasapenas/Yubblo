import type { ChatPart } from '../../../../shared/types'

type EmojiPart = Extract<ChatPart, { type: 'emoji' }>
type TextPart = Extract<ChatPart, { type: 'text' }>

export type MessageVisualPart =
  | { kind: 'text'; part: TextPart; index: number }
  | { kind: 'emote'; part: EmojiPart; index: number }
  | {
      kind: 'stack'
      base: EmojiPart
      baseIndex: number
      overlays: Array<{ part: EmojiPart; index: number }>
    }

export function groupMessageParts(parts: ChatPart[]): MessageVisualPart[] {
  const output: MessageVisualPart[] = []

  parts.forEach((part, index) => {
    if (part.type === 'text') {
      output.push({ kind: 'text', part, index })
      return
    }

    if (!part.zeroWidth) {
      output.push({ kind: 'emote', part, index })
      return
    }

    let candidateIndex = output.length - 1
    while (
      candidateIndex >= 0 &&
      output[candidateIndex]?.kind === 'text' &&
      /^\s+$/.test((output[candidateIndex] as { part: TextPart }).part.text)
    ) {
      candidateIndex -= 1
    }

    const candidate = output[candidateIndex]
    if (candidate?.kind === 'emote') {
      output.splice(candidateIndex)
      output.push({
        kind: 'stack',
        base: candidate.part,
        baseIndex: candidate.index,
        overlays: [{ part, index }]
      })
      return
    }
    if (candidate?.kind === 'stack') {
      output.splice(candidateIndex + 1)
      candidate.overlays.push({ part, index })
      return
    }

    output.push({ kind: 'emote', part, index })
  })

  return output
}
