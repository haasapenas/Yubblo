import type { Innertube } from 'youtubei.js'

export class InnertubeSession {
  yt: Innertube | null = null
  cookie: string | null = null

  clear(): void {
    this.yt = null
    this.cookie = null
  }
}
