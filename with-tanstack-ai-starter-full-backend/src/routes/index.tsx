import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { getToken } from '@/lib/auth-token'
import { authClient } from '@/lib/neon'
import { faceSearch, listPeople, listPhotos, neighbors, personPhotos, searchPhotos, type Card, type Person } from '@/lib/server/library'

type Search = { q?: string; photo?: string; person?: string }

export const Route = createFileRoute('/')({
  component: Home,
  // `?q=` drives a text search, `?photo=` a find-similar, `?person=` a face group,
  // so every view is shareable, survives reload, and works with back/forward.
  validateSearch: (search: Record<string, unknown>): Search => ({
    q: typeof search.q === 'string' && search.q.trim() ? search.q : undefined,
    photo: typeof search.photo === 'string' && search.photo ? search.photo : undefined,
    person: typeof search.person === 'string' && search.person ? search.person : undefined,
  }),
})

type Mode = 'recent' | 'text' | 'image' | 'photo' | 'person' | 'face'

// The library grid loads this many photos per page (fast first paint after login).
const PAGE_SIZE = 30
// The People row loads this many face groups per page, same batch idea as the grid.
const PEOPLE_PAGE_SIZE = 33
// Fetch this many batches up front before the "More" button appears, so the row is
// well populated on open (3 × 33 = 99) and only long tails need a click.
const PEOPLE_INITIAL_BATCHES = 3

async function embed(body: { text: string } | FormData): Promise<number[]> {
  const token = await getToken()
  const isForm = body instanceof FormData
  const res = await fetch('/api/embed', {
    method: 'POST',
    headers: isForm ? { authorization: `Bearer ${token}` } : { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: isForm ? body : JSON.stringify(body),
  })
  if (!res.ok) throw new Error((await res.json()).error ?? 'embed failed')
  return (await res.json()).embedding as number[]
}

const iconProps = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

function ImageIcon() {
  return (
    <svg {...iconProps} aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-5-5L5 21" />
    </svg>
  )
}

function UploadIcon() {
  return (
    <svg {...iconProps} aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M17 8l-5-5-5 5" />
      <path d="M12 3v12" />
    </svg>
  )
}

function FaceIcon() {
  return (
    <svg {...iconProps} aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
    </svg>
  )
}

function NeonMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M63 0.0177909V63.5526L38.4178 42.2501V63.5526H0V0L63 0.0177909ZM7.72251 55.8389H30.6953V25.3238L55.2779 47.0476V7.72922L7.72251 7.71559V55.8389Z" fill="#00e599" />
    </svg>
  )
}

// A small line-art illustration for the landing: two stacked photo cards (one with
// the classic mountains-and-sun image mark), a face bubble, and a search glint,
// a compact picture of "photos searchable by meaning and by face".
function LandingArt() {
  return (
    <svg className="landing-art" width="90" height="90" viewBox="0 0 132 132" fill="none" aria-hidden="true">
      <rect x="20" y="34" width="70" height="58" rx="8" transform="rotate(-6 55 63)" stroke="var(--line)" strokeWidth="2" fill="var(--paper-2)" />
      <g transform="rotate(5 66 64)">
        <rect x="34" y="38" width="70" height="58" rx="8" stroke="var(--accent)" strokeWidth="2" fill="var(--paper-3)" />
        <circle cx="53" cy="57" r="6" fill="var(--accent)" />
        <path d="M40 88 60 68l12 11 10-8 12 12v5H40z" fill="var(--accent)" opacity="0.28" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" />
      </g>
      <g transform="translate(86 78)">
        <circle cx="16" cy="16" r="20" fill="var(--paper)" stroke="var(--neon)" strokeWidth="2" />
        <circle cx="16" cy="12" r="5" stroke="var(--neon)" strokeWidth="2" />
        <path d="M6 27a10 10 0 0 1 20 0" stroke="var(--neon)" strokeWidth="2" strokeLinecap="round" />
      </g>
      <g stroke="var(--accent)" strokeWidth="2.4" strokeLinecap="round">
        <path d="M96 30v10M91 35h10" />
      </g>
    </svg>
  )
}

function Home() {
  const { data } = authClient.useSession()
  // Signed-in visitors get their library. Everyone else, including the
  // prerendered/pending state, gets the static marketing landing, so the "Your
  // photos, searchable by meaning and by face." page is in the prerendered HTML.
  return <div className="app">{data ? <Library /> : <Landing />}</div>
}

function AccountMenu() {
  const { data } = authClient.useSession()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const email = data?.user?.email ?? ''
  const name = data?.user?.name || email
  const initials = name.slice(0, 2).toUpperCase()

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const signOut = async () => {
    await authClient.signOut()
    window.location.href = '/'
  }

  return (
    <div className="account" ref={ref}>
      <button className="avatar" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} title={email}>
        {initials}
      </button>
      {open && (
        <div className="account-menu" role="menu">
          <div className="account-id">
            <span className="account-name">{name}</span>
            <span className="account-email">{email}</span>
          </div>
          <button className="account-signout" role="menuitem" onClick={signOut}>
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}

function Landing() {
  return (
    <main className="landing">
      <div className="landing-inner">
        <div className="flex flex-row gap-x-3 items-center">
          <LandingArt />
          <div className="landing-logo">
            Atlas<span className="accent">.</span>
          </div>
        </div>
        <h1 className="display">
          Your photos, <span className="accent">searchable by meaning</span> and <span className="accent">by face</span>.
        </h1>
        <p className="lede">
          Describe what you remember, like “people laughing together”, drop in an image, or drop in a face to search for similar images in your private photo library.
        </p>
        <a className="btn btn-lg" href="/auth/sign-in">
          Sign in to your library &rarr;
        </a>
        <hr className="mt-8 text-gray-100/10 h-px" />
        <div className="landing-links">
          <a className="built-with" href="https://neon.com" target="_blank">
            <NeonMark /> Neon powering the backend: Postgres, Auth, and Object Storage
          </a>
        </div>
        <hr className="mt-8 text-gray-100/10 h-px" />
        <div className="landing-links">
          <a
            className="deploy-btn"
            href="https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fneondatabase%2Fexamples%2Ftree%2Fmain%2Fwith-tanstack-ai-starter-full-backend"
            target="_blank"
            rel="noreferrer"
          >
            <img src="https://vercel.com/button" alt="Deploy with Vercel" height={32} />
          </a>
          <a className="repo-link" href="https://github.com/neondatabase/examples/tree/main/with-tanstack-ai-starter-full-backend" target="_blank" rel="noreferrer">
            View source on GitHub
          </a>
        </div>
      </div>
    </main>
  )
}

function Library() {
  const [q, setQ] = useState('')
  const [cards, setCards] = useState<Card[]>([])
  const [mode, setMode] = useState<Mode>('recent')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [selected, setSelected] = useState<Card | null>(null)
  const [queryImage, setQueryImage] = useState<string | null>(null)
  const [total, setTotal] = useState(0)
  const [people, setPeople] = useState<Person[]>([])
  const [peopleTotal, setPeopleTotal] = useState(0)
  const [peopleBusy, setPeopleBusy] = useState(false)
  const fileIn = useRef<HTMLInputElement>(null)
  const faceIn = useRef<HTMLInputElement>(null)
  const uploadIn = useRef<HTMLInputElement>(null)

  const { q: urlQ, photo: urlPhoto, person: urlPerson } = Route.useSearch()
  const navigate = Route.useNavigate()
  // Lets an image search clear the URL params without the URL effect re-running.
  const skipUrlSync = useRef(false)

  // The image the user is searching *with*, shown as a thumbnail. Accepts an
  // uploaded File (an object URL is created) or an already-resolved URL string
  // (a stored photo, for find-similar). Object URLs are revoked as they're
  // replaced so we don't leak them.
  const setQueryPreview = useCallback((src: File | string | null) => {
    setQueryImage((prev) => {
      if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev)
      if (!src) return null
      return typeof src === 'string' ? src : URL.createObjectURL(src)
    })
  }, [])

  const show = useCallback((rows: Card[], m: Mode, label: string) => {
    setCards(rows)
    setMode(m)
    setNote(label)
  }, [])

  // The face groups shown as circles. The listPeople server function scopes them to
  // the owner (JWT), orders most recently photographed first (last_face_at, so a
  // just-uploaded face surfaces at the front, with id breaking ties for stable paging), and
  // returns each cover crop already presigned. This loads the first few batches up
  // front and the exact count, so the row opens well populated and knows when there
  // are more.
  const loadPeople = useCallback(async () => {
    try {
      const { people: rows, total } = await listPeople({ data: { offset: 0, limit: PEOPLE_PAGE_SIZE * PEOPLE_INITIAL_BATCHES } })
      setPeopleTotal(total)
      setPeople(rows)
    } catch {
      // Faces are a nice-to-have on top of search, never block the library on them.
      setPeople([])
      setPeopleTotal(0)
    }
  }, [])

  // Append the next page of circles (same ordering, so it dovetails with page one).
  const loadMorePeople = useCallback(async () => {
    setPeopleBusy(true)
    try {
      const { people: rows } = await listPeople({ data: { offset: people.length, limit: PEOPLE_PAGE_SIZE } })
      setPeople((prev) => [...prev, ...rows])
    } catch {
      /* leave the row as-is on a failed page fetch */
    } finally {
      setPeopleBusy(false)
    }
  }, [people.length])

  // Detect faces for freshly uploaded photos in the browser (no face model on the
  // server, see src/lib/faces-client), post the descriptors + crops to /api/faces,
  // which regroups people. Then refresh the circles. Runs in the background so it
  // never holds up the grid. Human loads lazily on the first upload.
  const detectAndStoreFaces = useCallback(
    async (uploaded: { id: string; file: File }[], token: string) => {
      try {
        const { detectFaces } = await import('@/lib/faces-client')
        let changed = false
        for (const { id, file } of uploaded) {
          try {
            const faces = await detectFaces(file)
            if (!faces.length) continue
            const fd = new FormData()
            fd.set('photo_id', id)
            fd.set('faces', JSON.stringify(faces.map((f) => ({ bbox: f.bbox, embedding: f.embedding, score: f.score }))))
            faces.forEach((f, i) => fd.append('crops', f.crop, `${i}.jpg`))
            const res = await fetch('/api/faces', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: fd })
            if (res.ok) changed = true
          } catch {
            /* skip a photo that fails to process, keep going */
          }
        }
        if (changed) await loadPeople()
      } catch {
        /* human failed to load, leave the existing circles as they are */
      }
    },
    [loadPeople],
  )

  const loadRecent = useCallback(async () => {
    setBusy(true)
    setQueryPreview(null)
    try {
      // Only the first page, with an exact count so the label shows the true
      // total while the grid stays fast to load. More pages load on demand.
      const { cards: rows, total: n } = await listPhotos({ data: { offset: 0, limit: PAGE_SIZE } })
      setTotal(n)
      show(rows, 'recent', n ? `${n} photos in your library` : 'Your library is empty. Upload a photo to begin.')
    } catch (e) {
      setNote(`Error: ${e instanceof Error ? e.message : e}`)
    } finally {
      setBusy(false)
    }
  }, [show])

  // Append the next page of the library grid (recent mode only).
  const loadMore = async () => {
    setBusy(true)
    try {
      const { cards: rows } = await listPhotos({ data: { offset: cards.length, limit: PAGE_SIZE } })
      setCards((prev) => [...prev, ...rows])
    } catch (e) {
      setNote(`Error: ${e instanceof Error ? e.message : e}`)
    } finally {
      setBusy(false)
    }
  }

  const rank = useCallback(
    async (vec: number[], m: Mode, label: string) => {
      const rows = await searchPhotos({ data: { embedding: vec, limit: 48 } })
      show(rows, m, label)
    },
    [show],
  )

  const runText = useCallback(
    async (text: string) => {
      setBusy(true)
      setQueryPreview(null)
      setNote(`Searching “${text}” …`)
      try {
        await rank(await embed({ text }), 'text', `Results for “${text}”`)
      } catch (e) {
        setNote(`Error: ${e instanceof Error ? e.message : e}`)
      } finally {
        setBusy(false)
      }
    },
    [rank, setQueryPreview],
  )

  const runNeighbors = useCallback(
    async (id: string) => {
      setBusy(true)
      setNote('Finding similar photos …')
      try {
        // The server function returns the source photo (excluded from the ranked
        // results) already presigned, so it can be the "searching with" thumbnail.
        const { source, cards: rows } = await neighbors({ data: { photoId: id, limit: 48 } })
        setQueryPreview(source?.url ?? null)
        show(rows, 'photo', 'Similar photos')
      } catch (e) {
        setNote(`Error: ${e instanceof Error ? e.message : e}`)
      } finally {
        setBusy(false)
      }
    },
    [show, setQueryPreview],
  )

  // Show every photo grouped under one person (the face circle you clicked).
  const runPerson = useCallback(
    async (personId: string) => {
      setBusy(true)
      setQueryPreview(null)
      setNote('Loading this person’s photos …')
      try {
        const rows = await personPhotos({ data: { personId, limit: 200 } })
        show(rows, 'person', rows.length ? `${rows.length} photo${rows.length > 1 ? 's' : ''} of this person` : 'No photos for this person')
      } catch (e) {
        setNote(`Error: ${e instanceof Error ? e.message : e}`)
      } finally {
        setBusy(false)
      }
    },
    [show, setQueryPreview],
  )

  // Keep the input box in sync with the URL query.
  useEffect(() => {
    setQ(urlQ ?? '')
  }, [urlQ])

  // The face circles load once when the library opens, and refresh after uploads.
  useEffect(() => {
    void loadPeople()
  }, [loadPeople])

  // The URL is the source of truth for text + find-similar searches: whenever it
  // changes (typing a query, following a link, back/forward), run what it
  // describes. Image-upload search is imperative and bypasses this, an image
  // can't live in a URL.
  useEffect(() => {
    if (skipUrlSync.current) {
      skipUrlSync.current = false
      return
    }
    if (urlPerson) runPerson(urlPerson)
    else if (urlPhoto) runNeighbors(urlPhoto)
    else if (urlQ) runText(urlQ)
    else loadRecent()
  }, [urlQ, urlPhoto, urlPerson, runNeighbors, runText, runPerson, loadRecent])

  // Text search + find-similar just update the URL. The effect above runs them.
  const onText = (e: React.FormEvent) => {
    e.preventDefault()
    navigate({ search: { q: q.trim() || undefined } })
  }

  const onSearchImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    // An image can't be encoded in the URL, so clear any q/photo params (without
    // re-triggering the URL effect) and run the search imperatively.
    if (urlQ || urlPhoto) {
      skipUrlSync.current = true
      navigate({ search: {} })
    }
    setBusy(true)
    setQ('')
    setQueryPreview(file)
    setNote('Searching by image …')
    try {
      const fd = new FormData()
      fd.set('image', file)
      await rank(await embed(fd), 'image', 'Results for your image')
    } catch (e) {
      setNote(`Error: ${e instanceof Error ? e.message : e}`)
    } finally {
      setBusy(false)
    }
  }

  // Search by face: detect the clearest face in the dropped photo (in the browser,
  // same human path as uploads), then rank the library by face-embedding distance
  // via the faceSearch server function. This is identity search over the faces
  // table, not the whole-image CLIP search above.
  const onFaceImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    if (urlQ || urlPhoto || urlPerson) {
      skipUrlSync.current = true
      navigate({ search: {} })
    }
    setBusy(true)
    setQ('')
    setQueryPreview(file)
    setNote('Searching by face …')
    try {
      const { detectFaces } = await import('@/lib/faces-client')
      const faces = await detectFaces(file)
      if (faces.length === 0) {
        setQueryPreview(null)
        setNote('No face found in that image. Try a clearer, front-on photo.')
        return
      }
      const best = faces.sort((a, b) => b.score - a.score)[0]!
      const results = await faceSearch({ data: { embedding: best.embedding } })
      show(results, 'face', 'Photos of this person')
    } catch (err) {
      setNote(`Error: ${err instanceof Error ? err.message : err}`)
    } finally {
      setBusy(false)
    }
  }

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    e.target.value = ''
    setBusy(true)
    setNote(`Uploading ${files.length} photo${files.length > 1 ? 's' : ''} …`)
    try {
      const token = await getToken()
      const uploaded: { id: string; file: File }[] = []
      for (const file of files) {
        const fd = new FormData()
        fd.set('image', file)
        const res = await fetch('/api/upload', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: fd })
        if (res.ok) {
          const card = (await res.json()) as { id?: string }
          if (card.id) uploaded.push({ id: card.id, file })
        }
      }
      // Show the new photos right away, then fill in the slower work in the
      // background: captions (a separate model/route) and faces (detected in the
      // browser, see below). Each refreshes its part as it lands.
      if (urlQ || urlPhoto || urlPerson) navigate({ search: {} })
      else await loadRecent()
      setNote(`Added ${files.length} photo${files.length > 1 ? 's' : ''}`)
      if (uploaded.length) {
        void Promise.all(
          uploaded.map(({ id }) =>
            fetch('/api/caption', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ id }) }).catch(
              () => {},
            ),
          ),
        ).then(() => loadRecent())
        void detectAndStoreFaces(uploaded, token)
      }
    } catch (e) {
      setNote(`Error: ${e instanceof Error ? e.message : e}`)
    } finally {
      setBusy(false)
    }
  }

  const findSimilar = (id: string) => {
    setSelected(null)
    navigate({ search: { photo: id } })
  }

  useEffect(() => {
    if (!selected) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSelected(null)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [selected])

  return (
    <div className="library">
      <header className="bar">
        <a
          className="wordmark"
          href="/"
          onClick={(e) => {
            e.preventDefault()
            navigate({ search: {} })
          }}
        >
          <LandingArt />
          <span>
            Atlas<span className="accent">.</span>
          </span>
        </a>
        <form className="search" onSubmit={onText}>
          <input className="search-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your photos by meaning…" aria-label="Search by description" />
          <button className="icon-btn" type="button" onClick={() => fileIn.current?.click()} disabled={busy} title="Search by image" aria-label="Search by image">
            <ImageIcon />
          </button>
          <input ref={fileIn} type="file" accept="image/*" hidden onChange={onSearchImage} />
          <button className="icon-btn" type="button" onClick={() => faceIn.current?.click()} disabled={busy} title="Search by face" aria-label="Search by face">
            <FaceIcon />
          </button>
          <input ref={faceIn} type="file" accept="image/*" hidden onChange={onFaceImage} />
        </form>
        <div className="bar-actions">
          <button className="icon-btn bordered" type="button" onClick={() => uploadIn.current?.click()} disabled={busy} title="Upload photos" aria-label="Upload photos">
            <UploadIcon />
          </button>
          <input ref={uploadIn} type="file" accept="image/*" multiple hidden onChange={onUpload} />
          <AccountMenu />
        </div>
      </header>
      <div className="note" aria-live="polite">
        {queryImage && <img className="query-thumb" src={queryImage} alt="Search image" />}
        {/* When the grid is empty we show a shimmer skeleton instead of a spinner,
            so keep the spinner only for searches that replace an already-full grid. */}
        {busy && cards.length > 0 ? <span className="spin" /> : null}
        {note}
      </div>
      {people.length > 0 && (
        <div className="people" role="list" aria-label="People in your library">
          {people.map((p, i) => (
            <button
              key={p.id}
              role="listitem"
              className={`person${urlPerson === p.id ? ' active' : ''}`}
              onClick={() => navigate({ search: urlPerson === p.id ? {} : { person: p.id } })}
              title={p.label || `Person ${i + 1}`}
            >
              <span className="person-face">{p.cover_url ? <img src={p.cover_url} alt={p.label || `Person ${i + 1}`} loading="lazy" /> : <span className="person-ph" />}</span>
              <span className="person-name">{p.label || `Person ${i + 1}`}</span>
              <span className="person-count">{p.face_count}</span>
            </button>
          ))}
          {people.length < peopleTotal && (
            <button className="person person-more" onClick={() => void loadMorePeople()} disabled={peopleBusy} title={`Show more people (${people.length} of ${peopleTotal})`}>
              <span className="person-face person-more-face">{peopleBusy ? '…' : `+${peopleTotal - people.length}`}</span>
              <span className="person-name">More</span>
            </button>
          )}
        </div>
      )}
      <section className="grid">
        {cards.map((c) => (
          <figure key={c.id + c.distance} className="tile" onClick={() => setSelected(c)} title="View photo">
            {c.url ? <img src={c.url} alt={c.caption} loading="lazy" /> : <div className="ph" />}
            <figcaption>
              <span className="cap">{c.caption || 'Untitled'}</span>
              {mode !== 'recent' && mode !== 'person' && <span className="score">{c.distance.toFixed(2)}</span>}
            </figcaption>
          </figure>
        ))}
        {/* Loading into an empty grid: shimmer placeholders that the real tiles
            replace as the page arrives, so the layout is there from the first frame. */}
        {busy &&
          cards.length === 0 &&
          Array.from({ length: PAGE_SIZE }, (_, i) => (
            <figure key={`skeleton-${i}`} className="tile skeleton" aria-hidden="true">
              <div className="skeleton-img" />
              <figcaption>
                <span className="skeleton-line" />
              </figcaption>
            </figure>
          ))}
      </section>
      {mode === 'recent' && cards.length > 0 && cards.length < total && (
        <div className="load-more">
          <button className="btn" onClick={loadMore} disabled={busy}>
            {busy ? 'Loading…' : `Load more (${cards.length} of ${total})`}
          </button>
        </div>
      )}
      {!busy && cards.length === 0 && (
        <div className="empty">
          <p>Nothing here yet.</p>
          <button className="btn btn-lg" onClick={() => uploadIn.current?.click()}>
            Upload your first photos
          </button>
        </div>
      )}
      {selected && (
        <div className="lightbox" onClick={() => setSelected(null)}>
          <div className="lightbox-frame" onClick={(e) => e.stopPropagation()}>
            <img src={selected.url} alt={selected.caption} />
            <div className="lightbox-info">
              <div className="lightbox-meta">
                <p className="lightbox-caption">{selected.caption || 'Untitled'}</p>
                {mode !== 'recent' && mode !== 'person' && <p className="lightbox-score">{selected.distance.toFixed(3)} cosine distance</p>}
              </div>
              <div className="lightbox-actions">
                <button className="btn" onClick={() => findSimilar(selected.id)}>
                  Find similar
                </button>
                <button className="btn btn-ghost" onClick={() => setSelected(null)}>
                  Close
                </button>
              </div>
            </div>
            <button className="lightbox-close" onClick={() => setSelected(null)} aria-label="Close">
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
