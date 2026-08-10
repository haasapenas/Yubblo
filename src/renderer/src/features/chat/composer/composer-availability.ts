export function canUseComposer(loggedIn: boolean, hasSession: boolean): boolean {
  return loggedIn && hasSession
}
