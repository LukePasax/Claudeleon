// Il ponte fra la pagina e il processo principale: solo queste funzioni, niente accesso diretto a Node
const { contextBridge, ipcRenderer } = require('electron')

const listen = (channel) => (cb) => ipcRenderer.on(channel, (_e, payload) => cb(payload))

contextBridge.exposeInMainWorld('pergamena', {
  info: () => ipcRenderer.invoke('app:info'),
  setInteractive: (on) => ipcRenderer.send('mouse:interactive', on),
  gestureStart: (kind) => ipcRenderer.send('gesture:start', kind),
  gestureEnd: () => ipcRenderer.send('gesture:end'),
  hide: () => ipcRenderer.send('window:hide'),
  quit: () => ipcRenderer.send('app:quit'),
  setScene: (scene) => ipcRenderer.send('scene:set', scene),
  newChapter: () => ipcRenderer.invoke('chapter:new'),
  send: (text) => ipcRenderer.send('chat:send', text),
  stop: () => ipcRenderer.send('chat:stop'),
  setTrayIcon: (dataUrl) => ipcRenderer.send('tray:icon', dataUrl),
  answer: (id, allow, always) => ipcRenderer.send('perm:answer', { id, allow, always }),
  sessions: () => ipcRenderer.invoke('sessions:list'),
  openSession: (id) => ipcRenderer.invoke('session:open', id),
  onAsk: listen('perm:ask'),
  onAskClosed: listen('perm:closed'),

  onDelta: listen('claude:delta'),
  onTool: listen('claude:tool'),
  onToolDone: listen('claude:toolDone'),
  onDone: listen('claude:done'),
  onError: listen('claude:error'),
  onReset: listen('chat:reset'),
})
