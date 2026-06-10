import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const componentPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'ContextMenu.jsx'
)
const componentDir = path.dirname(componentPath)

test('renders the primary context menu through the app-level portal', () => {
  const source = fs.readFileSync(componentPath, 'utf8')

  assert.match(source, /return createPortal\(/)
  assert.match(source, /document\.querySelector\('\.app-root'\) \|\| document\.body/)
})

test('context menus close when the pointer leaves their visual bounds', () => {
  for (const filename of ['ContextMenu.jsx', 'ReadingPane.jsx', 'MessageViewerApp.jsx', 'ComposeWindow.jsx', 'ComposeViewerApp.jsx', 'Sidebar.jsx']) {
    const source = fs.readFileSync(path.join(componentDir, filename), 'utf8')
    assert.match(source, /onMouseLeave=/, `${filename} must close its context menu on mouse leave`)
  }
})

test('ReadingPane renders its email context menu through the app-level portal', () => {
  const source = fs.readFileSync(path.join(componentDir, 'ReadingPane.jsx'), 'utf8')

  assert.match(source, /import \{ createPortal \} from 'react-dom'/)
  assert.match(source, /return createPortal\(/)
  assert.match(source, /document\.querySelector\('\.app-root'\) \|\| document\.body/)
})
