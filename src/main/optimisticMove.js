export function buildOptimisticMovePlan(messages, destination, firstProvisionalUid = -1) {
  let provisionalUid = Math.min(-1, firstProvisionalUid)

  return (messages || []).map(message => {
    const sourceUid = message.uid
    const optimisticMessage = {
      ...message,
      id: undefined,
      uid: provisionalUid,
      folder: destination,
      sync_status: 'pending'
    }
    const mapping = {
      sourceUid,
      provisionalUid,
      destination
    }
    provisionalUid -= 1
    return { optimisticMessage, mapping }
  })
}

export function normalizeUidMap(uidMap) {
  if (!uidMap) return new Map()
  if (uidMap instanceof Map) return uidMap
  if (Array.isArray(uidMap)) return new Map(uidMap)
  if (typeof uidMap === 'object') {
    return new Map(Object.entries(uidMap).map(([sourceUid, destinationUid]) => [
      Number(sourceUid),
      Number(destinationUid)
    ]))
  }
  return new Map()
}

export function getServerOrphanUids(localUids, serverUids, pendingUids = []) {
  const serverUidSet = new Set(serverUids || [])
  const pendingUidSet = new Set(pendingUids || [])
  return (localUids || []).filter(uid =>
    !serverUidSet.has(uid) && !pendingUidSet.has(uid)
  )
}
