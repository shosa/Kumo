import {
  IconArchive,
  IconDrafts,
  IconFolder,
  IconInbox,
  IconJunk,
  IconSent,
  IconTrash
} from './Icons'

const FOLDER_ICON_MAP = {
  '\\Inbox': IconInbox,
  '\\Sent': IconSent,
  '\\Drafts': IconDrafts,
  '\\Trash': IconTrash,
  '\\Junk': IconJunk,
  '\\Archive': IconArchive
}

export function getFolderIcon(folder) {
  return FOLDER_ICON_MAP[folder?.special_use] || IconFolder
}
