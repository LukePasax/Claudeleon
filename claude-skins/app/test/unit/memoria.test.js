// La memoria di Claude Code (i CLAUDE.md): quali file, lettura e scrittura solo di quelli
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const memory = require('../../src/memory')

test('memoria: i file di una cartella, leggere e scrivere solo quelli', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'skins-mem-'))
  const home = path.join(d, 'claude')
  const proj = path.join(d, 'lavori', 'mappa')
  fs.mkdirSync(home)
  fs.mkdirSync(proj, { recursive: true })
  process.env.CLAUDE_CONFIG_DIR = home
  try {
    fs.writeFileSync(path.join(d, 'lavori', 'CLAUDE.md'), '# Lavori\n')
    const norm = (p) => p.replace(/\\/g, '/')
    let l = memory.list(proj)
    assert.deepEqual(l.files.map((f) => [f.id, f.exists]), [['user', false], ['project', false], ['local', false], ['parent', true]])
    assert.equal(l.files[1].file, norm(path.join(proj, 'CLAUDE.md')))
    assert.equal(l.files[3].dir, 'lavori')

    // Scrivere crea il file (e la cartella delle impostazioni personali)
    assert.deepEqual(memory.write(proj, l.files[0].file, '- In italiano\n'), { ok: true })
    assert.equal(fs.readFileSync(path.join(home, 'CLAUDE.md'), 'utf8'), '- In italiano\n')
    assert.deepEqual(memory.read(proj, l.files[0].file), { ok: true, text: '- In italiano\n', exists: true })
    assert.deepEqual(memory.read(proj, l.files[2].file), { ok: true, text: '', exists: false })

    // Solo .claude/CLAUDE.md nel progetto: è quello
    fs.mkdirSync(path.join(proj, '.claude'))
    fs.writeFileSync(path.join(proj, '.claude', 'CLAUDE.md'), 'x')
    l = memory.list(proj)
    assert.equal(l.files[1].file, norm(path.join(proj, '.claude', 'CLAUDE.md')))

    // Altri file no
    assert.equal(memory.read(proj, path.join(d, 'segreto.txt')).ok, false)
    assert.equal(memory.write(proj, path.join(proj, 'altro.md'), 'x').ok, false)
    assert.equal(fs.existsSync(path.join(proj, 'altro.md')), false)
  } finally {
    delete process.env.CLAUDE_CONFIG_DIR
  }
})
