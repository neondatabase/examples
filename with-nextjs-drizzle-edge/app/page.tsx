import Table from '@/components/table'
import Link from 'next/link'

export default function Home() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center">
      <h1 className="pt-4 pb-8 bg-gradient-to-br from-black via-[#171717] to-[#575757] bg-clip-text text-center text-4xl font-medium tracking-tight text-transparent md:text-7xl">
        Neon Postgres on Vercel Edge with Drizzle ORM
      </h1>
      <Table />
      <p className="font-light text-gray-600 w-full max-w-lg text-center mt-6">
        <Link href="https://neon.tech" className="font-medium underline underline-offset-4 hover:text-black transition-colors">
          Neon
        </Link>{' '}
        demo with{' '}
        <Link href="https://orm.drizzle.team" className="font-medium underline underline-offset-4 hover:text-black transition-colors">
          Drizzle
        </Link>{' '}
        as the ORM. <br /> Built with{' '}
        <Link href="https://nextjs.org/docs" className="font-medium underline underline-offset-4 hover:text-black transition-colors">
          Next.js App Router (on the edge)
        </Link>
        .
      </p>
    </main>
  )
}
