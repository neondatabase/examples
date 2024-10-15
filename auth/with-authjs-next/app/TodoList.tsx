'use client'

import { useState } from 'react'

type Todo = {
  id: number
  content: string
  completed: boolean
}

export default function TodoList({ initialTodos }: { initialTodos: Todo[] }) {
  const [todos, setTodos] = useState<Todo[]>(initialTodos)
  const [newTodo, setNewTodo] = useState('')

  const addTodo = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTodo.trim()) return

    const response = await fetch('/api/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: newTodo }),
    })

    if (response.ok) {
      const todo = await response.json()
      setTodos([...todos, todo])
      setNewTodo('')
    }
  }

  const toggleTodo = async (id: number) => {
    const response = await fetch(`/api/todos/${id}`, { method: 'PATCH' })
    if (response.ok) {
      setTodos(todos.map((todo) => (todo.id === id ? { ...todo, completed: !todo.completed } : todo)))
    }
  }

  return (
    <div className="w-full max-w-md">
      <form onSubmit={addTodo} className="mb-4">
        <input type="text" value={newTodo} onChange={(e) => setNewTodo(e.target.value)} placeholder="Add a new todo" className="w-full p-2 mb-2 border rounded" />
        <button type="submit" className="w-full p-2 border rounded">
          Add
        </button>
      </form>
      <ul className="space-y-2">
        {todos.map((todo) => (
          <li key={todo.id} onClick={() => toggleTodo(todo.id)} className="flex items-center space-x-2 cursor-pointer">
            <input type="checkbox" checked={todo.completed} readOnly className="cursor-pointer" />
            <span className={todo.completed ? 'line-through' : ''}>{todo.content}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
