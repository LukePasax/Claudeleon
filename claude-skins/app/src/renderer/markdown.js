// Il markdown delle risposte di Claude, in HTML sicuro: tutto il testo viene sfuggito, e solo i link http, https e
// mailto diventano cliccabili (si aprono nel browser di sistema, non nella finestra). Funziona anche a metà
// risposta, mentre il testo arriva: un blocco di codice non ancora chiuso arriva fino in fondo.
// Blocchi: titoli, paragrafi, elenchi (annidati, numerati, con caselle), citazioni, tabelle, codice, linee.
// In linea: codice, link, indirizzi, grassetto, corsivo, barrato. Funzioni pure: le usa la pagina (window.Markdown)
// e si provano con node (module.exports).
;(function (root) {
  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  }

  // Solo questi indirizzi diventano link
  function safeHref(url) {
    return /^(https?:\/\/|mailto:)/i.test(url) ? url : null
  }

  // ------------------------------------------------------------------ in linea

  // Codice e link si mettono da parte come segnaposto (\u0001n\u0001), così il grassetto e il corsivo non li toccano
  function inline(src) {
    const keep = []
    const hold = (html) => `\u0001${keep.push(html) - 1}\u0001`
    let s = String(src)
    // Il codice: `x` o ``x con ` dentro``
    s = s.replace(/(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/g, (m, ticks, code) => hold(`<code>${esc(code.replace(/^ (.*) $/, '$1'))}</code>`))
    // Le immagini non si caricano (la pagina accetta solo file locali): resta un link al loro indirizzo
    // Gli indirizzi possono avere parentesi bilanciate, come quelli di Wikipedia
    const URL = '((?:[^()\\s<>]|\\([^()\\s]*\\))+)'
    s = s.replace(new RegExp(`!\\[([^\\]]*)\\]\\(\\s*<?${URL}>?(?:\\s+"[^"]*")?\\s*\\)`, 'g'), (m, alt, url) => hold(link(url, alt ? `immagine: ${alt}` : 'immagine', true)))
    s = s.replace(new RegExp(`\\[((?:[^\\[\\]]|\\[[^\\]]*\\])+)\\]\\(\\s*<?${URL}>?(?:\\s+"[^"]*")?\\s*\\)`, 'g'), (m, text, url) => hold(link(url, text)))
    s = s.replace(/<((?:https?:\/\/|mailto:)[^>\s]+)>/gi, (m, url) => hold(link(url, url, true)))
    s = s.replace(/(^|[\s(])((?:https?:\/\/)[^\s<]*[^\s<.,;:!?)\]'"])/gi, (m, pre, url) => pre + hold(link(url, url, true)))
    s = esc(s)
    s = s
      .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<b>$1</b>')
      // Con _ e __ si chiude solo prima di uno spazio, della fine o di una punteggiatura (il punto solo a fine frase):
      // __init__.py e my_var_name restano così
      .replace(/(^|[\s(])__(?=\S)((?:(?!__)[\s\S])*?\S)__(?=[\s,;:!?)]|\.(?:\s|$)|$)/g, '$1<b>$2</b>')
      .replace(/(^|[^*])\*(?=[^\s*])([^*]*?[^\s*])\*(?!\*)/g, '$1<i>$2</i>')
      .replace(/(^|[\s(])_(?=[^\s_])([^_]*?[^\s_])_(?=[\s,;:!?)]|\.(?:\s|$)|$)/g, '$1<i>$2</i>')
      .replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<s>$1</s>')
    return s.replace(/\u0001(\d+)\u0001/g, (m, n) => keep[Number(n)])
  }

  // text è markdown, tranne per gli indirizzi (plain), che si mostrano così come sono
  function link(url, text, plain) {
    const label = plain ? esc(text) : inline(text)
    const href = safeHref(url)
    if (!href) return `<span class="link-off" title="${esc(url)}">${label}</span>`
    return `<a href="#" data-href="${esc(href)}" title="${esc(href)}">${label}</a>`
  }

  // ------------------------------------------------------------------ blocchi

  const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([^`\s]*)[^`]*$/
  const HEADING = /^ {0,3}(#{1,6})(?:\s+(.*?))?\s*#*\s*$/
  const RULE = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/
  const QUOTE = /^ {0,3}> ?(.*)$/
  const ITEM = /^( *)([-*+]|\d{1,9}[.)])(?:\s+(.*)|\s*$)/
  const TABLE_SEP = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/

  function indentOf(line) {
    return line.match(/^ */)[0].length
  }

  // Le celle di una riga di tabella: si divide sulle | che non sono sfuggite e non stanno nel codice
  function cells(line) {
    let s = line.trim()
    if (s.startsWith('|')) s = s.slice(1)
    if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1)
    const out = []
    let cur = ''
    let inCode = false
    for (let i = 0; i < s.length; i++) {
      const c = s[i]
      if (c === '\\' && s[i + 1] === '|') { cur += '|'; i++; continue }
      if (c === '`') inCode = !inCode
      if (c === '|' && !inCode) { out.push(cur.trim()); cur = ''; continue }
      cur += c
    }
    out.push(cur.trim())
    return out
  }

  function startsBlock(line, next) {
    return FENCE.test(line) || HEADING.test(line) || RULE.test(line) || QUOTE.test(line) || ITEM.test(line) ||
      (line.includes('|') && next !== undefined && TABLE_SEP.test(next) && next.includes('-'))
  }

  function blocks(lines) {
    const out = []
    let i = 0
    while (i < lines.length) {
      const line = lines[i]
      if (!line.trim()) { i++; continue }
      let m

      // Il codice: fino alla recinzione di chiusura, o fino in fondo se non è ancora arrivata
      if ((m = FENCE.exec(line))) {
        const fence = m[1]
        const lang = m[2]
        const pad = indentOf(line)
        const body = []
        i++
        while (i < lines.length && !new RegExp(`^ {0,3}${fence[0] === '`' ? '`' : '~'}{${fence.length},}\\s*$`).test(lines[i])) {
          body.push(lines[i].replace(new RegExp(`^ {0,${pad}}`), ''))
          i++
        }
        // Recinzione non ancora arrivata (risposta a metà): via le righe vuote in fondo
        if (i >= lines.length) while (body.length && !body[body.length - 1].trim()) body.pop()
        i++
        out.push(`<pre${lang ? ` data-lang="${esc(lang)}"` : ''}><code>${esc(body.join('\n'))}</code></pre>`)
        continue
      }

      if ((m = HEADING.exec(line))) {
        // # e ## sono titoli grandi; ### e oltre più piccoli, nel carattere del testo
        const level = Math.min(m[1].length, 4) + 1
        out.push(`<h${level}>${inline(m[2] || '')}</h${level}>`)
        i++
        continue
      }

      if (RULE.test(line)) { out.push('<hr>'); i++; continue }

      if (QUOTE.test(line)) {
        const inner = []
        while (i < lines.length && lines[i].trim() && (m = QUOTE.exec(lines[i]) || (inner.length && !startsBlock(lines[i]) ? [null, lines[i]] : null))) {
          inner.push(m[1])
          i++
        }
        out.push(`<blockquote>${blocks(inner)}</blockquote>`)
        continue
      }

      if (line.includes('|') && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1]) && lines[i + 1].includes('-')) {
        const head = cells(line)
        const align = cells(lines[i + 1]).map((c) => (/^:-+:$/.test(c) ? 'center' : /-:$/.test(c) ? 'right' : /^:-/.test(c) ? 'left' : ''))
        const cell = (tag, text, k) => `<${tag}${align[k] ? ` style="text-align:${align[k]}"` : ''}>${inline(text)}</${tag}>`
        i += 2
        const rows = []
        while (i < lines.length && lines[i].trim() && lines[i].includes('|')) {
          const row = cells(lines[i])
          rows.push(`<tr>${head.map((_, k) => cell('td', row[k] || '', k)).join('')}</tr>`)
          i++
        }
        out.push(`<div class="table"><table><thead><tr>${head.map((h, k) => cell('th', h, k)).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`)
        continue
      }

      if ((m = ITEM.exec(line))) {
        const r = list(lines, i)
        out.push(r.html)
        i = r.next
        continue
      }

      // Un paragrafo: fino a una riga vuota o all'inizio di un altro blocco; gli a capo restano a capo
      const para = []
      while (i < lines.length && lines[i].trim() && (!para.length || !startsBlock(lines[i], lines[i + 1]))) {
        para.push(lines[i].trim())
        i++
      }
      out.push(`<p>${para.map(inline).join('<br>')}</p>`)
    }
    return out.join('')
  }

  // Un elenco: le voci allo stesso rientro della prima; le righe più rientrate (anche dopo una riga vuota) sono il
  // seguito della voce, con i suoi sottoelenchi, e si rendono come blocchi a loro volta
  function list(lines, start) {
    const first = ITEM.exec(lines[start])
    const base = first[1].length
    const ordered = /\d/.test(first[2])
    const items = []
    let i = start
    let loose = false
    while (i < lines.length) {
      const line = lines[i]
      const m = ITEM.exec(line)
      if (m && m[1].length >= base && m[1].length < base + 2 && /\d/.test(m[2]) === ordered) {
        items.push({ lines: [m[3] || ''], pad: m[1].length + m[2].length + 1 })
        i++
        continue
      }
      if (!line.trim()) {
        // Una riga vuota continua l'elenco solo se dopo c'è una voce o un seguito rientrato
        const next = lines[i + 1]
        if (next !== undefined && next.trim() && (indentOf(next) > base || (ITEM.test(next) && indentOf(next) === base))) {
          if (indentOf(next) === base) loose = true
          items[items.length - 1].lines.push('')
          i++
          continue
        }
        break
      }
      if (indentOf(line) > base) {
        const item = items[items.length - 1]
        item.lines.push(line.slice(Math.min(indentOf(line), item.pad)))
        i++
        continue
      }
      // Una riga non rientrata subito dopo una voce la continua (a capo pigro), se non comincia un altro blocco
      if (!startsBlock(line, lines[i + 1]) && items[items.length - 1].lines[items[items.length - 1].lines.length - 1].trim()) {
        items[items.length - 1].lines.push(line.trim())
        i++
        continue
      }
      break
    }
    const lis = items.map(({ lines: body }) => {
      let task = ''
      const t = /^\[([ xX])\]\s+/.exec(body[0])
      if (t) {
        task = `<span class="task${t[1] === ' ' ? '' : ' done'}"></span>`
        body[0] = body[0].slice(t[0].length)
      }
      let html = blocks(body)
      // Un elenco stretto non mette le voci in paragrafi
      if (!loose) html = html.replace(/^<p>([\s\S]*?)<\/p>/, '$1')
      return `<li${task ? ' class="has-task"' : ''}>${task}${html}</li>`
    })
    const num = ordered ? parseInt(first[2], 10) : 1
    const tag = ordered ? 'ol' : 'ul'
    return { html: `<${tag}${ordered && num !== 1 ? ` start="${num}"` : ''}>${lis.join('')}</${tag}>`, next: i }
  }

  function render(src) {
    return blocks(String(src || '').replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n'))
  }

  const api = { render, inline, esc }
  if (typeof module === 'object' && module.exports) module.exports = api
  else root.Markdown = api
})(typeof window !== 'undefined' ? window : globalThis)
