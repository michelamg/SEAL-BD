import { login, signup } from './actions'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>
}) {
  const { error, next } = await searchParams

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[#C25700] text-white font-extrabold text-lg">
            S
          </div>
          <h1 className="mt-3 text-xl font-bold text-[#1F3A5F]">Seal Team BD</h1>
          <p className="text-sm text-neutral-500">Sign in to your workspace</p>
        </div>

        <form className="space-y-3 rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
          <input type="hidden" name="next" value={next ?? '/dashboard'} />

          {error ? (
            <p className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-neutral-700">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-[#1F3A5F] focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-neutral-700">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-[#1F3A5F] focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              formAction={login}
              className="flex-1 rounded-md bg-[#1F3A5F] px-4 py-2 text-sm font-semibold text-white hover:bg-[#2C4F7C]"
            >
              Sign in
            </button>
            <button
              formAction={signup}
              className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
            >
              Create account
            </button>
          </div>
        </form>

        <p className="mt-4 text-center text-xs text-neutral-400">
          Cushman &amp; Wakefield · Serswe LLC
        </p>
      </div>
    </div>
  )
}
