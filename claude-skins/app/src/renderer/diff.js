// Le differenze riga per riga fra due testi, per mostrare le modifiche di Claude ai file. Funzioni pure: le usa la
// pagina (window.Diff) e si provano con node (module.exports).
;(function (root) {
  function splitLines(s) {
    if (!s) return []
    const lines = String(s).replace(/\r\n?/g, '\n').split('\n')
    // L'a capo finale non è una riga in più
    if (lines[lines.length - 1] === '') lines.pop()
    return lines
  }

  // Oltre questa misura (righe diverse × righe diverse) il confronto puntuale costerebbe troppo: si mostra il blocco
  // tolto e quello aggiunto per intero
  const MAX_CELLS = 4000000

  // ops: [{ t: ' ' | '-' | '+', text, a, b }] con a e b i numeri di riga (da 1) nel testo prima e in quello dopo
  function lines(before, after) {
    const A = splitLines(before)
    const B = splitLines(after)
    // Le righe uguali in testa e in coda non servono al confronto
    let pre = 0
    while (pre < A.length && pre < B.length && A[pre] === B[pre]) pre++
    let suf = 0
    while (suf < A.length - pre && suf < B.length - pre && A[A.length - 1 - suf] === B[B.length - 1 - suf]) suf++
    const a = A.slice(pre, A.length - suf)
    const b = B.slice(pre, B.length - suf)
    const ops = []
    for (let i = 0; i < pre; i++) ops.push({ t: ' ', text: A[i], a: i + 1, b: i + 1 })
    let mid
    if (a.length * b.length > MAX_CELLS) {
      mid = [...a.map((text) => ({ t: '-', text })), ...b.map((text) => ({ t: '+', text }))]
    } else {
      mid = lcsOps(a, b)
    }
    let ai = pre
    let bi = pre
    for (const op of mid) {
      if (op.t === ' ') ops.push({ t: ' ', text: op.text, a: ++ai, b: ++bi })
      else if (op.t === '-') ops.push({ t: '-', text: op.text, a: ++ai, b: null })
      else ops.push({ t: '+', text: op.text, a: null, b: ++bi })
    }
    for (let i = A.length - suf; i < A.length; i++) ops.push({ t: ' ', text: A[i], a: ++ai, b: ++bi })
    return ops
  }

  // La sottosequenza comune più lunga, con le righe tolte prima di quelle aggiunte in ogni tratto cambiato
  function lcsOps(a, b) {
    const n = a.length
    const m = b.length
    const w = m + 1
    const L = new Uint32Array((n + 1) * w)
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        L[i * w + j] = a[i] === b[j] ? L[(i + 1) * w + j + 1] + 1 : Math.max(L[(i + 1) * w + j], L[i * w + j + 1])
      }
    }
    const ops = []
    let i = 0
    let j = 0
    while (i < n || j < m) {
      if (i < n && j < m && a[i] === b[j]) { ops.push({ t: ' ', text: a[i] }); i++; j++ }
      else if (j >= m || (i < n && L[(i + 1) * w + j] >= L[i * w + j + 1])) { ops.push({ t: '-', text: a[i] }); i++ }
      else { ops.push({ t: '+', text: b[j] }); j++ }
    }
    return ops
  }

  // Le righe da mostrare: i cambiamenti con `context` righe uguali attorno; i tratti uguali più lunghi diventano un
  // salto { t: 'gap', count }
  function hunks(ops, context = 3) {
    const keep = new Array(ops.length).fill(false)
    ops.forEach((op, i) => {
      if (op.t === ' ') return
      for (let k = Math.max(0, i - context); k <= Math.min(ops.length - 1, i + context); k++) keep[k] = true
    })
    // Un salto di una riga sola occupa quanto la riga: meglio mostrarla
    for (let i = 0; i < keep.length; i++) {
      if (!keep[i] && (i === 0 || keep[i - 1]) && (i === keep.length - 1 || keep[i + 1]) && keep.some(Boolean)) keep[i] = true
    }
    const out = []
    let skipped = 0
    ops.forEach((op, i) => {
      if (keep[i]) {
        if (skipped) { out.push({ t: 'gap', count: skipped }); skipped = 0 }
        out.push(op)
      } else skipped++
    })
    if (skipped && out.length) out.push({ t: 'gap', count: skipped })
    return out
  }

  function stats(ops) {
    let added = 0
    let removed = 0
    for (const op of ops) {
      if (op.t === '+') added++
      else if (op.t === '-') removed++
    }
    return { added, removed }
  }

  const api = { splitLines, lines, hunks, stats }
  if (typeof module === 'object' && module.exports) module.exports = api
  else root.Diff = api
})(typeof window !== 'undefined' ? window : globalThis)
