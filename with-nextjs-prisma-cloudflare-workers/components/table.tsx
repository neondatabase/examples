'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'

export default function Table() {
  const [users, setUsers] = useState<any[]>([])
  const [duration, setDuration] = useState<number>()
  const loadUsers = () => {
    fetch('/api/users')
      .then((res) => res.json())
      .then((res) => {
        const { users, duration } = res
        setUsers(users)
        setDuration(duration)
      })
  }
  useEffect(() => {
    loadUsers()
  }, [])
  return (
    <div className="bg-white/30 p-12 shadow-xl ring-1 ring-gray-900/5 rounded-lg backdrop-blur-lg max-w-xl mx-auto w-full">
      <div className="flex justify-between items-center mb-4">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">Recent Users</h2>
          <p className="text-sm text-gray-500">
            Fetched {users.length} users in {duration}ms
          </p>
        </div>
        <button
          onClick={() => {
            setUsers([])
            setDuration(0)
            loadUsers()
          }}
        >
          Refresh
        </button>
      </div>
      <div className="divide-y divide-gray-900/5">
        {users.map((user) => (
          <div key={user.name} className="flex items-center justify-between py-3">
            <div className="flex flex-row items-center space-x-4">
              <Image src={user.image} alt={user.name} width={48} height={48} className="rounded-full ring-1 ring-gray-900/5" />
              <div className="space-y-1">
                <p className="font-medium leading-none">{user.name}</p>
                <p className="text-sm text-gray-500">{user.email}</p>
              </div>
            </div>
            <span className="text-gray-600">{new Date(user.createdAt).toDateString()}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
