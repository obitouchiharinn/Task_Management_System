export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'blocked'

export interface Task {
  id: number
  title: string
  description: string
  status: TaskStatus
  created_at: string
  updated_at: string
  depends_on: number[]
  dependents: number[]
}

const API_BASE =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') || 'http://localhost:8000/api'

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
    },
    ...options,
  })

  if (!res.ok) {
    const contentType = res.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      throw new Error(data.error || `Request failed with status ${res.status}`)
    }
    const text = await res.text().catch(() => '')
    throw new Error(text || `Request failed with status ${res.status}`)
  }

  if (res.status === 204) return undefined as T

  const text = await res.text()
  if (!text) return undefined as T

  try {
    return JSON.parse(text) as T
  } catch {
    // If the backend returns non-JSON for a successful request
    return text as unknown as T
  }
}

export const api = {
  listTasks() {
    return request<Task[]>('/tasks/')
  },
  createTask(payload: { title: string; description?: string }) {
    return request<Task>('/tasks/', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
  updateTask(id: number, payload: Partial<Pick<Task, 'title' | 'description' | 'status'>>) {
    return request<Task>(`/tasks/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
  },
  deleteTask(id: number) {
    return request<void>(`/tasks/${id}/`, { method: 'DELETE' })
  },
  addDependency(taskId: number, dependsOnId: number) {
    return request(`/tasks/${taskId}/dependencies/`, {
      method: 'POST',
      body: JSON.stringify({ depends_on_id: dependsOnId }),
    })
  },
}

