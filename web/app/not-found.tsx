import Link from 'next/link'

export default function NotFound() {
  return (
    <main>
      <h1 className="t-display">Not found</h1>
      <p className="t-ui">
        <Link href="/">Home</Link> · <Link href="/sim/">Simulator</Link>
      </p>
    </main>
  )
}
