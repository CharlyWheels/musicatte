import { Link } from 'react-router-dom'

export default function Home() {
  return (
    <section className="space-y-6">
      <h1 className="text-3xl font-bold">Musicatte v2</h1>
      <p className="max-w-3xl text-slate-600">
        Digitaliza partituras desde una foto, edítalas fácilmente y compártelas en un
        repositorio comunitario abierto.
      </p>
      <div className="grid gap-3 md:grid-cols-3">
        <Link className="rounded-lg border bg-white p-4 shadow-sm" to="/scanner">
          <h2 className="font-semibold">1. Scanner OCR</h2>
          <p className="text-sm text-slate-600">Sube una imagen y conviértela a partitura editable.</p>
        </Link>
        <Link className="rounded-lg border bg-white p-4 shadow-sm" to="/editor">
          <h2 className="font-semibold">2. Editor</h2>
          <p className="text-sm text-slate-600">
            Selecciona notas, cambia duración, alteraciones, clave y armadura.
          </p>
        </Link>
        <Link className="rounded-lg border bg-white p-4 shadow-sm" to="/repository">
          <h2 className="font-semibold">3. Repositorio</h2>
          <p className="text-sm text-slate-600">Publica versiones y valora partituras de la comunidad.</p>
        </Link>
      </div>
    </section>
  )
}
