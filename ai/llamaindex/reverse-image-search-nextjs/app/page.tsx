'use client'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useToast } from '@/components/ui/use-toast'
import { UploadIcon, SquareTerminal, SearchIcon } from 'lucide-react'
import { useState } from 'react'

export default function Page() {
  const { toast } = useToast()
  const [images, setImages] = useState([])
  const [findImage, setFindImage] = useState('')
  const [searchResult, setSearchResult] = useState(0)
  return (
    <div className="grid h-screen w-full pl-[56px]">
      <aside className="inset-y fixed  left-0 z-20 flex h-full flex-col border-r">
        <div className="border-b p-2">
          <Button variant="outline" size="icon" aria-label="Home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt="Logo" loading="lazy" className="size-5 fill-foreground" src="https://neon.tech/favicon/favicon.png" />
          </Button>
        </div>
        <nav className="grid gap-1 p-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-lg bg-muted" aria-label="Reverse Image Search Playground">
                  <SquareTerminal className="size-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={5}>
                Reverse Image Search Playground
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </nav>
      </aside>
      <div className="flex flex-col">
        <header className="sticky top-0 z-10 flex h-[57px] items-center gap-1 border-b bg-background px-4 justify-between">
          <h1 className="text-xl font-semibold">Reverse Image Search Playground</h1>
          <Button
            size="sm"
            variant="secondary"
            className="max-w-max gap-3"
            onClick={() => {
              const fileInput = document.getElementById('trainInput') as HTMLInputElement
              if (fileInput) fileInput.click()
            }}
          >
            <UploadIcon className="size-3.5" /> <span>Upload Image to {"AI's"} Knowledge</span>
          </Button>
        </header>
        <main className="gap-4 w-full flex flex-col p-4">
          <div className="flex flex-row flex-wrap items-center justify-between">
            <input
              type="file"
              id="fileInput"
              accept="image/*"
              className="sr-only"
              onChange={async (e) => {
                // create a new form data object that contains the uploaded file
                const formData = new FormData()
                const fileInput = document.getElementById('fileInput') as HTMLInputElement
                if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
                  toast({
                    duration: 2000,
                    variant: 'destructive',
                    description: 'No file attached.',
                  })
                  return
                }
                setSearchResult(1)
                const fileData = fileInput.files[0]
                const fileBuffer = await fileData.arrayBuffer()
                const buffer = Buffer.from(fileBuffer)
                const base64String = buffer.toString('base64')
                const mimeType = fileData.type
                const dataUrl = `data:${mimeType};base64,${base64String}`
                setFindImage(dataUrl)
                formData.append('file', fileData)
                const queryingToast = toast({
                  duration: 10000,
                  description: 'Reverse searching images in the database...',
                })
                const start_time = performance.now()
                // query for similar images
                fetch('/api/query', { method: 'POST', body: formData })
                  .then((res) => {
                    if (res.ok) {
                      queryingToast.dismiss()
                    }
                    return res.json()
                  })
                  .then((res) => {
                    setSearchResult(performance.now() - start_time)
                    setImages(res)
                  })
              }}
            />
            <input
              type="file"
              id="trainInput"
              accept="image/*"
              className="sr-only"
              onChange={(e) => {
                // create a new form data object that contains the uploaded file
                const formData = new FormData()
                const fileInput = document.getElementById('trainInput') as HTMLInputElement
                if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
                  toast({
                    duration: 2000,
                    variant: 'destructive',
                    description: 'No file attached.',
                  })
                  return
                }
                formData.append('file', fileInput.files[0])
                const queryingToast = toast({
                  duration: 10000,
                  description: 'Uploading image to the database...',
                })
                // query for similar images
                fetch('/api/upsert', { method: 'POST', body: formData }).then((res) => {
                  if (res.ok) {
                    queryingToast.dismiss()
                    toast({
                      duration: 2000,
                      description: 'Added to the database successfully.',
                    })
                  }
                })
              }}
            />
          </div>
          <div className="gap-4 grid grid-cols-1 md:grid-cols-2">
            <div className="flex flex-col">
              <div className="py-8 flex items-center justify-center rounded-lg border border-dashed shadow-sm">
                <div className="flex flex-col items-center text-center">
                  <span className="flex flex-row items-center font-light text-slate-600 gap-1.5 border max-w-max rounded-full px-4 py-1">
                    <SearchIcon className="size-4 text-slate-400" />
                    <span>Find image source</span>
                  </span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {findImage && <img className="w-full mt-8" src={findImage} alt="Find Image" loading="lazy" />}
                  <Button
                    variant="outline"
                    className="mt-8 gap-3"
                    onClick={() => {
                      const fileInput = document.getElementById('fileInput') as HTMLInputElement
                      if (fileInput) fileInput.click()
                    }}
                  >
                    <UploadIcon className="size-3.5" />
                    <span>Search image with any image</span>
                  </Button>
                </div>
              </div>
            </div>
            <div className="flex flex-col">
              {searchResult !== 0 && <span className="font-light text-slate-600">Search results in {searchResult === 1 ? '...' : searchResult.toFixed(2)} milliseconds</span>}
              {images && (
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {images.map((i) => (
                    //  eslint-disable-next-line @next/next/no-img-element
                    <img loading="lazy" className="border w-full h-auto max-w-[300px] max-h-[300px] object-contain" src={i} key={i} alt={i} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
