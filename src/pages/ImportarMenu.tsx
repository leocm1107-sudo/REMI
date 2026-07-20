import { useState, useRef } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import Papa from 'papaparse'

type FilaCSV = {
  categoria?: string
  nombre?: string
  descripcion?: string
  precio?: string
  tipo?: string
  disponible?: string
  foto_url?: string
  keywords?: string
  ingredientes?: string
}

type PlatoParseado = {
  categoria: string
  nombre: string
  descripcion: string
  precio: number
  tipo: string
  disponible: boolean
  foto_url: string
  keywords: string
  ingredientes: string[]
}

const COLUMNAS = ['categoria','nombre','descripcion','precio','tipo','disponible','foto_url','keywords','ingredientes']

const PLANTILLA_CSV =
`categoria,nombre,descripcion,precio,tipo,disponible,foto_url,keywords,ingredientes
Hamburguesas,Hamburguesa Clásica,Carne de res con queso y vegetales,18000,comida,si,,hamburguesa clasica res,"carne,queso,lechuga,tomate"
Hamburguesas,Hamburguesa Doble,Doble carne y doble queso,25000,comida,si,,hamburguesa doble,"carne,carne,queso,queso,lechuga"
Bebidas,Gaseosa Personal,Botella 400ml,4000,bebida,si,,gaseosa refresco,
Bebidas,Jugo Natural,Jugo de fruta natural,6000,bebida,si,,jugo natural fruta,"fruta,agua,azucar"
Adicionales,Papas Fritas,Porción de papas a la francesa,8000,acompanamiento,si,,papas fritas,"papa,sal"`

export default function ImportarMenu({ session: _s }: { session: Session }) {
  const [platos, setPlatos]       = useState<PlatoParseado[]>([])
  const [errores, setErrores]     = useState<string[]>([])
  const [nombreArchivo, setNombreArchivo] = useState('')
  const [importando, setImportando] = useState(false)
  const [resultado, setResultado] = useState<string | null>(null)
  const [confirmar, setConfirmar] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const [modo, setModo] = useState<'csv' | 'ia'>('csv')
  const [procesandoIA, setProcesandoIA] = useState(false)
  
  function descargarPlantilla() {
    const blob = new Blob([PLANTILLA_CSV], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'plantilla_menu_don_oso.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  function procesarArchivo(file: File) {
    setResultado(null)
    setConfirmar(false)
    setNombreArchivo(file.name)
    const errs: string[] = []

    Papa.parse<FilaCSV>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase(),
      complete: (res) => {
        const filas = res.data
        const parseados: PlatoParseado[] = []

        filas.forEach((fila, i) => {
          const linea = i + 2  // +2: fila 1 es encabezado
          const categoria = (fila.categoria ?? '').trim()
          const nombre = (fila.nombre ?? '').trim()

          // Validaciones mínimas
          if (!categoria && !nombre) return  // fila vacía, ignorar
          if (!categoria) { errs.push(`Fila ${linea}: falta la categoría.`); return }
          if (!nombre) { errs.push(`Fila ${linea}: falta el nombre del plato.`); return }

          const precioRaw = (fila.precio ?? '').replace(/[^\d]/g, '')
          const precio = precioRaw ? parseInt(precioRaw, 10) : 0
          if (!precio) { errs.push(`Fila ${linea} (${nombre}): precio inválido o en cero.`) }

          const dispRaw = (fila.disponible ?? 'si').trim().toLowerCase()
          const disponible = ['si','sí','true','1','x','yes'].includes(dispRaw)

          const ingredientes = (fila.ingredientes ?? '')
            .split(',')
            .map(s => s.trim())
            .filter(Boolean)

          parseados.push({
            categoria,
            nombre,
            descripcion: (fila.descripcion ?? '').trim(),
            precio,
            tipo: (fila.tipo ?? '').trim(),
            disponible,
            foto_url: (fila.foto_url ?? '').trim(),
            keywords: (fila.keywords ?? '').trim(),
            ingredientes
          })
        })

        setErrores(errs)
        setPlatos(parseados)
      },
      error: (err) => {
        setErrores([`No se pudo leer el archivo: ${err.message}`])
        setPlatos([])
      }
    })
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) procesarArchivo(file)
  }

  function archivoABase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve((r.result as string).split(',')[1])
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}

async function procesarConIA(file: File) {
  setResultado(null)
  setConfirmar(false)
  setErrores([])
  setNombreArchivo(file.name)
  setProcesandoIA(true)
  try {
    const file_base64 = await archivoABase64(file)
    const { data, error } = await supabase.functions.invoke('extraer-menu-ia', {
      body: { file_base64, mime_type: file.type }
    })
    if (error || data?.error) {
      setErrores([`No se pudo leer el menú con IA: ${data?.error ?? error?.message}`])
      setPlatos([])
      return
    }
    const parseados: PlatoParseado[] = (data.platos ?? []).map((p: any) => ({
      categoria: p.categoria ?? '',
      nombre: p.nombre ?? '',
      descripcion: p.descripcion ?? '',
      precio: Number(p.precio) || 0,
      tipo: p.tipo ?? '',
      disponible: p.disponible !== false,
      foto_url: '',
      keywords: p.keywords ?? '',
      ingredientes: Array.isArray(p.ingredientes) ? p.ingredientes : []
    }))
    setPlatos(parseados)
  } finally {
    setProcesandoIA(false)
  }
}

function onInputChangeIA(e: React.ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0]
  if (file) procesarConIA(file)
}

  async function importar() {
    setImportando(true)
    setResultado(null)
    try {
      const platosParaEnviar = platos.map(p => ({
        categoria: p.categoria,
        nombre: p.nombre,
        descripcion: p.descripcion,
        precio: p.precio,
        tipo: p.tipo,
        disponible: p.disponible,
        foto_url: p.foto_url || null,
        keywords: p.keywords,
        ingredientes: p.ingredientes
      }))

      const { error } = await supabase.rpc('importar_menu_completo', {
        platos: platosParaEnviar
      })

      if (error) {
        setResultado(`❌ No se pudo importar el menú: ${error.message}`)
        return
      }

      setResultado(`✅ Menú importado: ${platos.length} platos.`)
      setPlatos([])
      setErrores([])
      setConfirmar(false)
      setNombreArchivo('')
      if (inputRef.current) inputRef.current.value = ''
    } catch (err: any) {
      setResultado(`❌ No se pudo importar el menú: ${err?.message ?? 'error desconocido'}`)
    } finally {
      setImportando(false)
    }
  }

  // Agrupar para vista previa
  const porCategoria = platos.reduce((acc, p) => {
    (acc[p.categoria] ??= []).push(p)
    return acc
  }, {} as Record<string, PlatoParseado[]>)

  return (
    <div className="max-w-3xl">
      <div className="mb-7">
        <h1 className="font-display text-4xl font-semibold tracking-tight mb-1">Importar menú</h1>
        <p className="text-mute text-sm">
          Sube un archivo CSV con el menú completo. Reemplaza todo el menú actual.
        </p>
      </div>

      {/* Paso 1: plantilla */}
      <section className="bg-surface border border-line rounded-xl p-5 mb-4">
        <div className="flex items-center gap-3 mb-2">
          <span className="w-6 h-6 rounded-full bg-oso-100 text-oso-800 grid place-items-center text-xs font-semibold">1</span>
          <h2 className="font-display text-lg font-semibold tracking-tight">Descarga la plantilla</h2>
        </div>
        <p className="text-sm text-mute mb-3 ml-9">
          Ábrela en Excel o Google Sheets, llénala con tus platos y guárdala como CSV.
        </p>
        <div className="ml-9">
          <button
            onClick={descargarPlantilla}
            className="text-sm bg-canvas border border-line px-4 py-2 rounded-lg font-medium hover:border-oso-400 transition-colors"
          >
            ⬇ Descargar plantilla CSV
          </button>
        </div>
      </section>

      <section className="bg-surface border border-line rounded-xl p-5 mb-4">
  <div className="flex items-center gap-3 mb-2">
    <span className="w-6 h-6 rounded-full bg-oso-100 text-oso-800 grid place-items-center text-xs font-semibold">2</span>
    <h2 className="font-display text-lg font-semibold tracking-tight">Sube tu menú</h2>
  </div>
  <div className="ml-9 flex gap-2 mb-3">
    <button onClick={() => setModo('csv')} className={`text-xs px-3 py-1.5 rounded-lg border ${modo === 'csv' ? 'bg-oso-600 text-white border-oso-600' : 'border-line text-mute'}`}>Archivo CSV</button>
    <button onClick={() => setModo('ia')} className={`text-xs px-3 py-1.5 rounded-lg border ${modo === 'ia' ? 'bg-oso-600 text-white border-oso-600' : 'border-line text-mute'}`}>Foto o PDF (IA) ✨</button>
  </div>
  <div className="ml-9 mt-3">
    {modo === 'csv' ? (
      <input ref={inputRef} type="file" accept=".csv,text/csv" onChange={onInputChange}
        className="block w-full text-sm text-mute file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border file:border-line file:bg-canvas file:text-ink file:font-medium file:cursor-pointer hover:file:border-oso-400" />
    ) : (
      <>
        <input type="file" accept="image/*,application/pdf" onChange={onInputChangeIA} disabled={procesandoIA}
          className="block w-full text-sm text-mute file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border file:border-line file:bg-canvas file:text-ink file:font-medium file:cursor-pointer hover:file:border-oso-400 disabled:opacity-50" />
        {procesandoIA && <p className="text-xs text-mute mt-2">Leyendo el menú con IA, un momento…</p>}
      </>
    )}
    {nombreArchivo && !procesandoIA && (
      <p className="text-xs text-mute mt-2">Archivo: {nombreArchivo}</p>
    )}
  </div>
</section>

      {/* Columnas esperadas (ayuda) */}
      <details className="bg-surface border border-line rounded-xl p-4 mb-4 text-sm">
        <summary className="cursor-pointer font-medium text-mute">¿Qué columnas debe tener el CSV?</summary>
        <div className="mt-3 space-y-1.5 text-mute">
          <p><b className="text-ink">categoria</b> — grupo del plato (ej. Hamburguesas). Obligatorio.</p>
          <p><b className="text-ink">nombre</b> — nombre del plato. Obligatorio.</p>
          <p><b className="text-ink">descripcion</b> — texto descriptivo.</p>
          <p><b className="text-ink">precio</b> — solo números, en pesos (ej. 18000).</p>
          <p><b className="text-ink">tipo</b> — comida, bebida, acompañamiento, etc.</p>
          <p><b className="text-ink">disponible</b> — "si" o "no".</p>
          <p><b className="text-ink">foto_url</b> — enlace a la imagen (opcional).</p>
          <p><b className="text-ink">keywords</b> — palabras que el bot reconoce, separadas por coma.</p>
          <p><b className="text-ink">ingredientes</b> — separados por coma (ej. carne,queso,lechuga).</p>
        </div>
      </details>

      {/* Errores */}
      {errores.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
          <p className="text-sm font-medium text-amber-900 mb-2">
            ⚠ Se encontraron {errores.length} advertencias:
          </p>
          <ul className="text-xs text-amber-800 space-y-0.5 max-h-40 overflow-y-auto">
            {errores.map((e, i) => <li key={i}>• {e}</li>)}
          </ul>
        </div>
      )}

      {/* Vista previa */}
      {platos.length > 0 && (
        <section className="bg-surface border border-line rounded-xl p-5 mb-4">
          <div className="flex items-center gap-3 mb-3">
            <span className="w-6 h-6 rounded-full bg-oso-100 text-oso-800 grid place-items-center text-xs font-semibold">3</span>
            <h2 className="font-display text-lg font-semibold tracking-tight">Vista previa</h2>
          </div>
          <p className="text-sm text-mute mb-4 ml-9">
            {Object.keys(porCategoria).length} categorías · {platos.length} platos
          </p>
          <div className="ml-9 space-y-4 max-h-96 overflow-y-auto">
            {Object.entries(porCategoria).map(([cat, items]) => (
              <div key={cat}>
                <div className="font-medium text-sm mb-1.5 text-oso-800">{cat}</div>
                <div className="space-y-1">
                  {items.map((p, i) => (
                    <div key={i} className="flex items-center justify-between text-sm py-1 border-b border-line/40 last:border-0">
                      <div className="min-w-0">
                        <span className={p.disponible ? '' : 'text-mute line-through'}>{p.nombre}</span>
                        {!p.disponible && <span className="text-xs text-mute ml-2">(no disponible)</span>}
                      </div>
                      <span className="tnum text-mute shrink-0">${p.precio.toLocaleString('es-CO')}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Confirmación e importación */}
      {platos.length > 0 && (
        <section className="bg-surface border border-line rounded-xl p-5">
          {!confirmar ? (
            <button
              onClick={() => setConfirmar(true)}
              className="w-full bg-oso-600 text-white py-3 rounded-lg font-medium hover:bg-oso-700 transition-colors"
            >
              Importar {platos.length} platos
            </button>
          ) : (
            <div className="space-y-3">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm text-red-900 font-medium mb-1">⚠ Esto reemplazará todo el menú</p>
                <p className="text-xs text-red-800">
                  Se eliminará el menú actual del restaurante y se reemplazará por los {platos.length} platos del archivo. Esta acción no se puede deshacer.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={importar}
                  disabled={importando}
                  className="flex-1 bg-red-600 text-white py-2.5 rounded-lg font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  {importando ? 'Importando…' : 'Sí, reemplazar menú'}
                </button>
                <button
                  onClick={() => setConfirmar(false)}
                  disabled={importando}
                  className="px-4 py-2.5 border border-line rounded-lg text-sm text-mute hover:text-ink transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Resultado */}
      {resultado && (
        <div className={`mt-4 rounded-xl p-4 text-sm font-medium ${
          resultado.startsWith('✅') ? 'bg-green-50 text-green-800 border border-green-200'
                                     : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          {resultado}
        </div>
      )}
    </div>
  )
}
