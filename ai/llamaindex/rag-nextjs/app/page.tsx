'use client'

import Markdown from '@/components/markdown'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useToast } from '@/components/ui/use-toast'
import { useChat } from 'ai/react'
import { CornerDownLeft, SquareTerminal } from 'lucide-react'
import { useEffect, useState } from 'react'

const computingToasts: any[] = []

export default function Page() {
  const { toast } = useToast()
  const [message, setMessage] = useState('')
  const { messages, handleSubmit, input, handleInputChange } = useChat()
  useEffect(() => {
    if (messages[messages.length - 1]?.role === 'user') {
      computingToasts.push(
        toast({
          duration: 100000,
          description: 'Thinking...',
        }),
      )
    } else {
      computingToasts.forEach((i) => {
        i.dismiss()
      })
    }
  }, [messages, toast])
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
                <Button variant="ghost" size="icon" className="rounded-lg bg-muted" aria-label="RAG Playground">
                  <SquareTerminal className="size-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={5}>
                RAG Playground
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </nav>
      </aside>
      <div className="flex flex-col">
        <header className="sticky top-0 z-10 flex h-[57px] items-center gap-1 border-b bg-background px-4">
          <h1 className="text-xl font-semibold">RAG Playground</h1>
        </header>
        <main className="grid flex-1 gap-4 overflow-auto p-4 md:grid-cols-2 lg:grid-cols-3">
          <div className="relative flex-col items-start gap-8">
            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (message) {
                  const loadingToast = toast({
                    duration: 10000,
                    description: "Adding your message to AI's knowledge...",
                  })
                  fetch('/api/learn', {
                    method: 'POST',
                    body: JSON.stringify({ message }),
                    headers: { 'Content-Type': 'application/json' },
                  }).then((res) => {
                    loadingToast.dismiss()
                    if (res.ok) {
                      toast({
                        duration: 2000,
                        description: "Added the message to AI's knowledge succesfully.",
                      })
                    } else {
                      toast({
                        duration: 2000,
                        variant: 'destructive',
                        description: "Failed to add the message to AI's knowledge.",
                      })
                    }
                  })
                }
              }}
              className="grid w-full items-start gap-6"
            >
              <fieldset className="grid gap-6 rounded-lg border p-4">
                <legend className="-ml-1 px-1 text-sm font-medium">Messages</legend>
                <div className="grid gap-3">
                  <Label>Role</Label>
                  <Select defaultValue="system">
                    <SelectTrigger>
                      <SelectValue placeholder="Select a role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="system">System</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-3">
                  <Label htmlFor="content">Content</Label>
                  <Textarea id="content" value={message} placeholder="You are a..." className="min-h-[9.5rem]" onChange={(e) => setMessage(e.target.value)} />
                </div>
                <Button className="max-w-max" type="submit">
                  Learn &rarr;
                </Button>
              </fieldset>
            </form>
          </div>
          <div className="relative flex h-full min-h-[50vh] flex-col rounded-xl bg-muted/50 p-4 lg:col-span-2">
            <Badge variant="outline" className="absolute right-3 top-3">
              Output
            </Badge>
            <div className="flex-1 max-h-[calc(100vh-210px)] overflow-y-scroll">
              {messages.map((message, i) => (
                <div className={[i !== 0 && 'mt-4 pt-4 border-t border-gray-100', i === messages.length - 1 && 'pb-4'].join(' ')} key={i}>
                  <Markdown message={message.content} />
                </div>
              ))}
            </div>
            <form onSubmit={handleSubmit} className="relative overflow-hidden rounded-lg border bg-background focus-within:ring-1 focus-within:ring-ring">
              <Label htmlFor="message" className="sr-only">
                Message
              </Label>
              <Textarea
                id="message"
                name="prompt"
                value={input}
                onChange={handleInputChange}
                placeholder="Type your message here..."
                className="min-h-12 resize-none border-0 p-3 shadow-none focus-visible:ring-0"
              />
              <div className="flex items-center p-3 pt-0">
                <Button type="submit" size="sm" className="ml-auto gap-1.5">
                  Send Message
                  <CornerDownLeft className="size-3.5" />
                </Button>
              </div>
            </form>
          </div>
        </main>
      </div>
    </div>
  )
}
