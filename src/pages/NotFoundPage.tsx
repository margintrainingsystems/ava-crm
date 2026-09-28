import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <section className="stack-md">
      <h1 className="h-xl" tabIndex={-1} data-page-title>
        No encontramos esta página
      </h1>
      <p className="text-muted">Revisá la dirección o volvé al inicio.</p>
      <Link to="/" className="btn btn-outline">
        Ir al inicio
      </Link>
    </section>
  )
}
