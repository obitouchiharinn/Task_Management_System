import { FormEvent, useEffect, useMemo, useState } from 'react'
import './index.css'
import { api } from './api'
import type { Task, TaskStatus } from './api'

type BusyState = 'idle' | 'loading' | 'saving'
type Page = 'tasks' | 'dependencies'

function App() {
  // State Management
  const [tasks, setTasks] = useState<Task[]>([])
  const [busy, setBusy] = useState<BusyState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState<Page>('tasks')
  const [isCheckingCycle, setIsCheckingCycle] = useState(false)

  // Form State
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<number>(3)
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null)
  const [dependencyTargetId, setDependencyTargetId] = useState<number | null>(null)

  // UI State
  const [hoveredNodeId, setHoveredNodeId] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [draggedNodeId, setDraggedNodeId] = useState<number | null>(null)
  const [nodePositions, setNodePositions] = useState<Record<number, { x: number; y: number }>>({})

  // Load tasks on mount
  useEffect(() => {
    void loadTasks()
  }, [])

  // API Functions
  async function loadTasks() {
    try {
      setBusy('loading')
      setError(null)
      const data = await api.listTasks()
      setTasks(data)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy('idle')
    }
  }

  async function handleCreateTask(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) {
      setError('Title is required')
      setTimeout(() => setError(null), 5000)
      return
    }

    try {
      setBusy('saving')
      setError(null)
      setSuccessMessage(null)

      const created = await api.createTask({
        title: title.trim(),
        description
      })
      setTasks((prev) => [created, ...prev])
      setTitle('')
      setDescription('')
      setPriority(3)

      setSuccessMessage('Task created successfully!')
      setTimeout(() => setSuccessMessage(null), 3000)
    } catch (err) {
      setError((err as Error).message)
      setTimeout(() => setError(null), 5000)
    } finally {
      setBusy('idle')
    }
  }

  async function handleStatusChange(id: number, status: TaskStatus) {
    try {
      setBusy('saving')
      setError(null)
      const updated = await api.updateTask(id, { status })
      setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy('idle')
    }
  }

  async function handleDeleteTask(id: number) {
    const blockers = tasks.filter((t) => t.depends_on.includes(id)).map((t) => t.title)
    const message =
      blockers.length > 0
        ? `This task is required by:\n- ${blockers.join('\n- ')}\nDelete anyway?`
        : 'Delete this task?'

    if (!window.confirm(message)) return

    try {
      setBusy('saving')
      setError(null)
      setSuccessMessage(null)

      await api.deleteTask(id)
      setTasks((prev) => prev.filter((t) => t.id !== id))

      setSuccessMessage('Task deleted successfully!')
      setTimeout(() => setSuccessMessage(null), 3000)
    } catch (err) {
      setError((err as Error).message)
      setTimeout(() => setError(null), 5000)
    } finally {
      setBusy('idle')
    }
  }

  async function handleAddDependency() {
    if (!selectedTaskId || !dependencyTargetId) return

    // Validation: Cannot add a task as a dependency to itself
    if (selectedTaskId === dependencyTargetId) {
      setError('Cannot add a task as a dependency to itself')
      setTimeout(() => setError(null), 5000)
      return
    }

    // Check for cycles
    const wouldCreateCycle = (taskId: number, depId: number): boolean => {
      const visited = new Set<number>()
      const stack = [depId]

      while (stack.length > 0) {
        const current = stack.pop()!
        if (current === taskId) return true
        if (visited.has(current)) continue
        visited.add(current)

        const currentTask = tasks.find(t => t.id === current)
        if (currentTask) {
          stack.push(...currentTask.depends_on)
        }
      }
      return false
    }

    if (wouldCreateCycle(selectedTaskId, dependencyTargetId)) {
      setError('Adding this dependency would create a cycle in the task graph')
      setTimeout(() => setError(null), 5000)
      return
    }

    try {
      setIsCheckingCycle(true)
      setBusy('saving')
      setError(null)
      setSuccessMessage(null)

      await api.addDependency(selectedTaskId, dependencyTargetId)
      await loadTasks()

      setSuccessMessage('Dependency link created successfully!')
      setTimeout(() => setSuccessMessage(null), 3000)
      setDependencyTargetId(null)
    } catch (err) {
      setError((err as Error).message)
      setTimeout(() => setError(null), 5000)
    } finally {
      setBusy('idle')
      setIsCheckingCycle(false)
    }
  }

  // Export graph as PNG
  function handleExportGraph() {
    const svg = document.getElementById('dependency-graph-svg')
    if (!svg) return

    const svgData = new XMLSerializer().serializeToString(svg)
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const img = new Image()
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(svgBlob)

    img.onload = () => {
      canvas.width = 1000
      canvas.height = 600
      ctx.fillStyle = 'white'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0)
      URL.revokeObjectURL(url)

      canvas.toBlob((blob) => {
        if (!blob) return
        const pngUrl = URL.createObjectURL(blob)
        const downloadLink = document.createElement('a')
        downloadLink.href = pngUrl
        downloadLink.download = `inmuto-dependency-graph-${Date.now()}.png`
        document.body.appendChild(downloadLink)
        downloadLink.click()
        document.body.removeChild(downloadLink)
        URL.revokeObjectURL(pngUrl)
      })
    }

    img.src = url
  }

  // Calculate graph node positions
  const graphNodes = useMemo(() => {
    const positions: Record<number, { x: number; y: number }> = {}
    const ids = tasks.map((t) => t.id)
    const radius = 220
    const centerX = 500
    const centerY = 300
    const angleStep = (2 * Math.PI) / Math.max(ids.length, 1)

    ids.forEach((id, index) => {
      // Use custom position if available, otherwise use circular layout
      if (nodePositions[id]) {
        positions[id] = nodePositions[id]
      } else {
        const angle = index * angleStep - Math.PI / 2
        positions[id] = {
          x: centerX + radius * Math.cos(angle),
          y: centerY + radius * Math.sin(angle),
        }
      }
    })

    return positions
  }, [tasks, nodePositions])

  // Filter tasks based on search query
  const filteredTasks = useMemo(() => {
    if (!searchQuery.trim()) return tasks

    const query = searchQuery.toLowerCase()
    return tasks.filter(task =>
      task.title.toLowerCase().includes(query) ||
      task.description.toLowerCase().includes(query) ||
      task.status.toLowerCase().includes(query)
    )
  }, [tasks, searchQuery])

  // Utility Functions
  const getStatusColor = (status: TaskStatus) => {
    switch (status) {
      case 'completed': return 'success'
      case 'in_progress': return 'primary'
      case 'blocked': return 'error'
      default: return 'gray'
    }
  }

  const getStatusLabel = (status: TaskStatus) => {
    switch (status) {
      case 'in_progress': return 'In Progress'
      case 'completed': return 'Completed'
      case 'blocked': return 'Blocked'
      default: return 'Pending'
    }
  }

  const getNodeColor = (status: TaskStatus) => {
    switch (status) {
      case 'completed': return '#10B981'
      case 'in_progress': return '#6366F1'
      case 'blocked': return '#EF4444'
      default: return '#9CA3AF'
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo and Title */}
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-lg">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">InMuto</h1>
                <p className="text-xs text-gray-500">Task Management System</p>
              </div>
            </div>

            {/* Navigation */}
            <nav className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage('tasks')}
                className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${currentPage === 'tasks'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-100'
                  }`}
              >
                Tasks
              </button>
              <button
                onClick={() => setCurrentPage('dependencies')}
                className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${currentPage === 'dependencies'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-100'
                  }`}
              >
                Dependencies
              </button>
            </nav>

            {/* Task Counter */}
            <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-lg">
              <span className="text-sm font-medium text-gray-600">Total Tasks</span>
              <span className="flex items-center justify-center w-6 h-6 bg-indigo-600 text-white text-xs font-bold rounded-full">
                {tasks.length}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Error and Success Messages */}
        <div className="mb-6 space-y-3">
          {error && (
            <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-lg animate-slide-down">
              <svg className="w-5 h-5 text-red-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm font-medium text-red-800">{error}</p>
            </div>
          )}

          {successMessage && (
            <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-lg animate-slide-down">
              <svg className="w-5 h-5 text-emerald-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm font-medium text-emerald-800">{successMessage}</p>
            </div>
          )}
        </div>

        {/* Tasks Page */}
        {currentPage === 'tasks' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Create Task Form */}
            <div className="lg:col-span-1">
              <div className="card sticky top-24">
                <div className="p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="flex items-center justify-center w-10 h-10 bg-indigo-100 rounded-lg">
                      <svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                    </div>
                    <h2 className="text-lg font-semibold text-gray-900">Create New Task</h2>
                  </div>

                  <form onSubmit={handleCreateTask} className="space-y-4">
                    {/* Title Input */}
                    <div>
                      <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1.5">
                        Task Title *
                      </label>
                      <input
                        id="title"
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Enter task title..."
                        className="input"
                        required
                      />
                    </div>

                    {/* Description Input */}
                    <div>
                      <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1.5">
                        Description
                      </label>
                      <textarea
                        id="description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Add task description..."
                        rows={3}
                        className="input resize-none"
                      />
                    </div>

                    {/* Priority Selector */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Priority Level
                      </label>
                      <div className="flex items-center gap-2">
                        {[1, 2, 3, 4, 5].map((level) => (
                          <button
                            key={level}
                            type="button"
                            onClick={() => setPriority(level)}
                            className={`flex items-center justify-center w-10 h-10 rounded-lg border-2 transition-all ${priority >= level
                              ? 'border-amber-400 bg-amber-50 text-amber-600'
                              : 'border-gray-200 bg-white text-gray-400 hover:border-gray-300'
                              }`}
                          >
                            <svg className="w-5 h-5" fill={priority >= level ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                            </svg>
                          </button>
                        ))}
                      </div>
                      <p className="mt-1.5 text-xs text-gray-500">Select priority from 1 (lowest) to 5 (highest)</p>
                    </div>

                    {/* Submit Button */}
                    <button
                      type="submit"
                      disabled={busy === 'saving'}
                      className="btn btn-primary w-full btn-lg"
                    >
                      {busy === 'saving' ? (
                        <>
                          <div className="spinner" />
                          Creating...
                        </>
                      ) : (
                        <>
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                          </svg>
                          Create Task
                        </>
                      )}
                    </button>
                  </form>
                </div>
              </div>
            </div>

            {/* Task List */}
            <div className="lg:col-span-2">
              <div className="card">
                <div className="p-6">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-10 h-10 bg-purple-100 rounded-lg">
                        <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                      </div>
                      <h2 className="text-lg font-semibold text-gray-900">Active Tasks</h2>
                    </div>

                    {/* Search Bar */}
                    <div className="relative w-64">
                      <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search tasks..."
                        className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      />
                    </div>
                  </div>

                  {/* Loading State */}
                  {busy === 'loading' && (
                    <div className="flex flex-col items-center justify-center py-12">
                      <div className="spinner mb-3" style={{ width: '32px', height: '32px', borderWidth: '3px' }} />
                      <p className="text-sm text-gray-500">Loading tasks...</p>
                    </div>
                  )}

                  {/* Empty State */}
                  {busy !== 'loading' && filteredTasks.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-12">
                      <div className="flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
                        <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                      </div>
                      <p className="text-sm font-medium text-gray-900 mb-1">
                        {searchQuery ? 'No tasks found' : 'No tasks yet'}
                      </p>
                      <p className="text-sm text-gray-500">
                        {searchQuery ? 'Try adjusting your search' : 'Create your first task to get started'}
                      </p>
                    </div>
                  )}

                  {/* Task List */}
                  {busy !== 'loading' && filteredTasks.length > 0 && (
                    <div className="space-y-3">
                      {filteredTasks.map((task) => (
                        <div
                          key={task.id}
                          className="group p-4 bg-gray-50 border border-gray-200 rounded-lg hover:bg-white hover:shadow-md transition-all duration-200"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              {/* Task Header */}
                              <div className="flex items-center gap-2 mb-2">
                                <span className="inline-flex items-center justify-center px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs font-mono font-semibold rounded">
                                  #{task.id}
                                </span>
                                <h3 className="text-base font-semibold text-gray-900 truncate">
                                  {task.title}
                                </h3>
                                {/* Priority Stars - Disabled (not supported by backend) */}
                                {/* {task.priority && task.priority > 0 && (
                                  <div className="flex items-center gap-0.5">
                                    {Array.from({ length: task.priority }).map((_, i) => (
                                      <svg key={i} className="w-3.5 h-3.5 text-amber-400" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                                      </svg>
                                    ))}
                                  </div>
                                )} */}
                              </div>

                              {/* Description */}
                              {task.description && (
                                <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                                  {task.description}
                                </p>
                              )}

                              {/* Dependencies */}
                              {task.depends_on.length > 0 && (
                                <div className="flex items-center gap-2 mb-3">
                                  <span className="text-xs font-medium text-gray-500">Depends on:</span>
                                  <div className="flex flex-wrap gap-1.5">
                                    {task.depends_on.map((depId) => (
                                      <span key={depId} className="inline-flex items-center px-2 py-0.5 bg-white border border-gray-200 text-xs font-mono font-medium text-gray-700 rounded">
                                        #{depId}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Status Selector */}
                              <div className="flex items-center gap-3">
                                <select
                                  value={task.status}
                                  onChange={(e) => handleStatusChange(task.id, e.target.value as TaskStatus)}
                                  className={`px-3 py-1.5 text-sm font-medium rounded-lg border-2 transition-all focus:outline-none focus:ring-2 focus:ring-offset-1 ${task.status === 'completed'
                                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700 focus:ring-emerald-500'
                                    : task.status === 'in_progress'
                                      ? 'bg-blue-50 border-blue-200 text-blue-700 focus:ring-blue-500'
                                      : task.status === 'blocked'
                                        ? 'bg-red-50 border-red-200 text-red-700 focus:ring-red-500'
                                        : 'bg-gray-50 border-gray-200 text-gray-700 focus:ring-gray-500'
                                    }`}
                                >
                                  <option value="pending">Pending</option>
                                  <option value="in_progress">In Progress</option>
                                  <option value="completed">Completed</option>
                                  <option value="blocked">Blocked</option>
                                </select>
                              </div>
                            </div>

                            {/* Delete Button */}
                            <button
                              onClick={() => handleDeleteTask(task.id)}
                              className="flex-shrink-0 p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                              title="Delete task"
                            >
                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Dependencies Page */}
        {currentPage === 'dependencies' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Dependency Graph */}
            <div className="lg:col-span-2">
              <div className="card">
                <div className="p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="flex items-center justify-center w-10 h-10 bg-blue-100 rounded-lg">
                      <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                    </div>
                    <h2 className="text-lg font-semibold text-gray-900">Dependency Graph</h2>
                  </div>

                  {/* Graph Container */}
                  <div className="relative bg-gradient-to-br from-gray-50 to-white border border-gray-200 rounded-lg overflow-hidden">
                    <svg
                      id="dependency-graph-svg"
                      viewBox="0 0 1000 600"
                      className="w-full h-[600px]"
                      onMouseMove={(e) => {
                        const svg = e.currentTarget
                        const rect = svg.getBoundingClientRect()
                        const x = ((e.clientX - rect.left) / rect.width) * 1000
                        const y = ((e.clientY - rect.top) / rect.height) * 600

                        // Find the closest node to the cursor (better UX than first-match)
                        let foundNode = null
                        let minDistance = 35 // Detection threshold

                        for (const task of tasks) {
                          const pos = graphNodes[task.id]
                          if (pos) {
                            const distance = Math.sqrt((x - pos.x) ** 2 + (y - pos.y) ** 2)
                            // Find the closest node within threshold
                            if (distance < minDistance) {
                              minDistance = distance
                              foundNode = task.id
                            }
                          }
                        }
                        setHoveredNodeId(foundNode)
                      }}
                      onMouseLeave={() => setHoveredNodeId(null)}
                    >
                      <defs>
                        <marker
                          id="arrowhead"
                          markerWidth="10"
                          markerHeight="10"
                          refX="9"
                          refY="3"
                          orient="auto"
                        >
                          <polygon points="0 0, 10 3, 0 6" fill="#D1D5DB" />
                        </marker>
                      </defs>

                      {/* Draw edges */}
                      <g>
                        {tasks.flatMap((task) =>
                          task.depends_on.map((depId) => {
                            const from = graphNodes[task.id]
                            const to = graphNodes[depId]
                            if (!from || !to) return null
                            const isActive = selectedTaskId === task.id || selectedTaskId === depId
                            return (
                              <path
                                key={`${task.id}-${depId}`}
                                d={`M${from.x} ${from.y} L${to.x} ${to.y}`}
                                stroke={isActive ? '#6366F1' : '#E5E7EB'}
                                strokeWidth={isActive ? 3 : 2}
                                fill="none"
                                markerEnd="url(#arrowhead)"
                                className="transition-all duration-200"
                              />
                            )
                          })
                        )}
                      </g>

                      {/* Draw nodes */}
                      <g>
                        {tasks.map((task) => {
                          const pos = graphNodes[task.id]
                          if (!pos) return null
                          const isHovered = hoveredNodeId === task.id
                          const isSelected = selectedTaskId === task.id

                          return (
                            <g
                              key={task.id}
                              onClick={() => setSelectedTaskId(task.id)}
                              onMouseEnter={() => setHoveredNodeId(task.id)}
                              onMouseLeave={() => setHoveredNodeId(null)}
                              className="cursor-pointer"
                            >
                              {/* Node Circle */}
                              <circle
                                cx={pos.x}
                                cy={pos.y}
                                r={isHovered ? 28 : 24}
                                fill="white"
                                stroke={getNodeColor(task.status)}
                                strokeWidth={isSelected ? 4 : 3}
                                className="transition-all duration-200"
                                style={{
                                  filter: isHovered ? 'drop-shadow(0 4px 12px rgba(0, 0, 0, 0.15))' : 'none'
                                }}
                              />
                              {/* Node Label */}
                              <text
                                x={pos.x}
                                y={pos.y}
                                textAnchor="middle"
                                dominantBaseline="middle"
                                className="text-sm font-bold fill-gray-700 pointer-events-none select-none"
                              >
                                {task.id}
                              </text>
                            </g>
                          )
                        })}
                      </g>
                    </svg>

                    {/* Hover Tooltip */}
                    {hoveredNodeId !== null && (() => {
                      const task = tasks.find(t => t.id === hoveredNodeId)
                      const pos = graphNodes[hoveredNodeId]
                      if (!task || !pos) return null

                      return (
                        <div
                          className="absolute pointer-events-none z-10 animate-scale-in"
                          style={{
                            left: `${(pos.x / 1000) * 100}%`,
                            top: `${(pos.y / 600) * 100}%`,
                            transform: 'translate(20px, -50%)'
                          }}
                        >
                          <div className="bg-white border border-gray-200 rounded-lg shadow-xl p-4 w-64">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="inline-flex items-center px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs font-mono font-semibold rounded">
                                #{task.id}
                              </span>
                              <span className={`badge badge-${getStatusColor(task.status)}`}>
                                {getStatusLabel(task.status)}
                              </span>
                            </div>
                            <h4 className="font-semibold text-gray-900 mb-1">{task.title}</h4>
                            {task.description && (
                              <p className="text-sm text-gray-600 mb-3">{task.description}</p>
                            )}
                            <div className="pt-3 border-t border-gray-200">
                              <p className="text-xs font-medium text-gray-500 mb-1">Dependencies</p>
                              {task.depends_on.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {task.depends_on.map((depId) => (
                                    <span key={depId} className="inline-flex items-center px-2 py-0.5 bg-gray-100 text-gray-700 text-xs font-mono rounded">
                                      #{depId}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-xs text-gray-400">No dependencies</p>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })()}
                  </div>

                  {/* Legend and Export */}
                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200">
                    <div className="flex items-center gap-4 text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full border-2 border-gray-400 bg-white" />
                        <span className="text-gray-600">Pending</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full border-2 border-blue-500 bg-white" />
                        <span className="text-gray-600">In Progress</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full border-2 border-emerald-500 bg-white" />
                        <span className="text-gray-600">Completed</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full border-2 border-red-500 bg-white" />
                        <span className="text-gray-600">Blocked</span>
                      </div>
                    </div>

                    <button
                      onClick={handleExportGraph}
                      className="btn btn-secondary btn-sm"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Export PNG
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Link Dependencies Form */}
            <div className="lg:col-span-1">
              <div className="card sticky top-24">
                <div className="p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="flex items-center justify-center w-10 h-10 bg-purple-100 rounded-lg">
                      <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                      </svg>
                    </div>
                    <h2 className="text-lg font-semibold text-gray-900">Link Dependencies</h2>
                  </div>

                  <div className="space-y-4">
                    {/* Select Task */}
                    <div>
                      <label htmlFor="select-task" className="block text-sm font-medium text-gray-700 mb-1.5">
                        Select Task
                      </label>
                      <select
                        id="select-task"
                        value={selectedTaskId || ''}
                        onChange={(e) => setSelectedTaskId(Number(e.target.value) || null)}
                        className="input"
                      >
                        <option value="">Choose a task...</option>
                        {tasks.map((task) => (
                          <option key={task.id} value={task.id}>
                            #{task.id} - {task.title}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Depends On */}
                    <div>
                      <label htmlFor="depends-on" className="block text-sm font-medium text-gray-700 mb-1.5">
                        Depends On
                      </label>
                      <select
                        id="depends-on"
                        value={dependencyTargetId || ''}
                        onChange={(e) => setDependencyTargetId(Number(e.target.value) || null)}
                        className="input"
                      >
                        <option value="">Choose dependency...</option>
                        {tasks
                          .filter((t) => t.id !== selectedTaskId)
                          .map((task) => (
                            <option key={task.id} value={task.id}>
                              #{task.id} - {task.title}
                            </option>
                          ))}
                      </select>
                    </div>

                    {/* Create Link Button */}
                    <button
                      onClick={handleAddDependency}
                      disabled={!selectedTaskId || !dependencyTargetId || busy !== 'idle' || isCheckingCycle}
                      className="btn btn-primary w-full"
                    >
                      {isCheckingCycle || busy === 'saving' ? (
                        <>
                          <div className="spinner" />
                          Creating Link...
                        </>
                      ) : (
                        <>
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                          </svg>
                          Create Link
                        </>
                      )}
                    </button>

                    {/* Current Dependencies */}
                    {selectedTaskId && (() => {
                      const task = tasks.find(t => t.id === selectedTaskId)
                      if (!task) return null

                      return (
                        <div className="pt-4 border-t border-gray-200">
                          <p className="text-sm font-medium text-gray-700 mb-2">Current Dependencies</p>
                          {task.depends_on.length > 0 ? (
                            <div className="space-y-2">
                              {task.depends_on.map((depId) => {
                                const depTask = tasks.find(t => t.id === depId)
                                return (
                                  <div key={depId} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                                    <span className="inline-flex items-center px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs font-mono font-semibold rounded">
                                      #{depId}
                                    </span>
                                    <span className="text-sm text-gray-700 truncate">
                                      {depTask?.title || 'Unknown'}
                                    </span>
                                  </div>
                                )
                              })}
                            </div>
                          ) : (
                            <p className="text-sm text-gray-500">No dependencies yet</p>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default App
