export function flushBeforeChatMutation(
  flushPending: () => void,
  deliverMutation: () => void
): void {
  flushPending()
  deliverMutation()
}
