export interface LivePollChoice {
  optionId: string
  text: string
  voteRatio?: number
  votePercent?: string
}

export interface LivePollState {
  pollId: string
  question: string
  choices: LivePollChoice[]
  totalVotes?: string
  closed?: boolean
  selectedOptionId?: string
  videoId?: string
}

export interface LivePinnedMessage {
  id: string
  messageId?: string
  actionId?: string
  authorName: string
  authorChannelId?: string
  text: string
  headerText?: string
  videoId?: string
}
