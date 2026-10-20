function PortalSectionPage({ title, description }) {
  return (
    <main className="px-6 py-8">
      <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-400">Coming Soon</p>
      <h1 className="mt-2 text-3xl font-semibold text-sky-950">{title}</h1>
      <p className="mt-3 max-w-2xl text-slate-500">{description}</p>
      <div className="mt-8 rounded-[1.75rem] border border-dashed border-gray-200 bg-white px-6 py-10 text-sm text-slate-500 shadow-sm">
        This section will be expanded in a future update.
      </div>
    </main>
  )
}

export default PortalSectionPage
