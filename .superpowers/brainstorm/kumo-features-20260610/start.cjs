const { spawn } = require('child_process')
const path = require('path')

const session = __dirname
const server = 'C:\\Users\\StefanoSolidoro\\.codex\\plugins\\cache\\claude-plugins-official\\superpowers\\5.1.0\\skills\\brainstorming\\scripts\\server.cjs'
const env = {}
for (const [key, value] of Object.entries(process.env)) {
  if (key.toLowerCase() !== 'path') env[key] = value
}
env.PATH = process.env.Path || process.env.PATH
env.BRAINSTORM_DIR = session
env.BRAINSTORM_HOST = '127.0.0.1'
env.BRAINSTORM_URL_HOST = 'localhost'

const child = spawn(process.execPath, [server], {
  detached: true,
  stdio: 'ignore',
  windowsHide: true,
  env
})
child.unref()
