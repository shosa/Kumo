export const MESSAGE_EXIT_MS = 180

export function animateMessageRemoval(dispatch, messages) {
  const targets = (messages || [])
    .filter(message => message?.folder && message?.uid != null)
    .map(message => ({ folder: message.folder, uid: message.uid }))

  if (!targets.length) return

  dispatch({ type: 'MARK_MESSAGES_EXITING', payload: targets })
  setTimeout(() => {
    for (const target of targets) {
      dispatch({ type: 'REMOVE_MESSAGE', payload: target })
    }
  }, MESSAGE_EXIT_MS)
}
