export interface HighlightSoundData {
  path: string
  mimeType: 'audio/mpeg' | 'audio/wav'
  bytes: Uint8Array
}
