const API_BASE = '/api/v1';

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('clubroom_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers = {
    'Content-Type': 'application/json',
    ...getAuthHeader(),
    ...options.headers,
  };

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    let errorMsg = `Request failed: ${res.statusText}`;
    try {
      const errorData = await res.json();
      errorMsg = errorData.error || errorMsg;
    } catch {
      // ignore
    }
    throw new Error(errorMsg);
  }

  return res.json();
}

// Meetings
export const api = {
  // Auth
  login: (credentials: { email: string; password: string }) =>
    request<{ user: any; token: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    }),
  getMe: () => request<{ user: any }>('/auth/me'),

  // Meetings
  getMeetings: (filter: 'all' | 'today' | 'upcoming' | 'active' | 'past' = 'all') =>
    request<{ meetings: any[] }>(`/meetings?filter=${filter}`),
  getMeeting: (idOrCode: string) =>
    request<{ meeting: any; agenda: any[]; timerState: any }>(`/meetings/${idOrCode}`),
  createMeeting: (data: any) =>
    request<{ meeting: any }>('/meetings', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  startMeeting: (id: string) =>
    request<{ message: string; timerState: any }>(`/meetings/${id}/start`, {
      method: 'POST',
    }),
  extendMeeting: (id: string, minutes: number) =>
    request<{ success: boolean; addedMinutes: number; newEndTime: string; timerState: any }>(
      `/meetings/${id}/extend`,
      {
        method: 'POST',
        body: JSON.stringify({ minutes }),
      }
    ),
  endMeeting: (id: string) =>
    request<{ message: string; timerState: any }>(`/meetings/${id}/end`, {
      method: 'POST',
    }),
  getTimer: (id: string) => request<any>(`/meetings/${id}/timer`),
  getExtensions: (id: string) => request<{ extensions: any[] }>(`/meetings/${id}/extensions`),

  // Attendance
  getAttendance: (id: string) => request<any>(`/attendance/${id}`),
  getAttendanceCsvUrl: (id: string) => `/api/v1/attendance/${id}/export`,

  // Agenda & Action Items
  getAgenda: (id: string) => request<{ agenda: any[]; tasks: any[] }>(`/agenda/${id}`),
  addAgendaItem: (id: string, data: { title: string; durationMinutes?: number }) =>
    request<any>(`/agenda/${id}/agenda`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  toggleAgendaItem: (id: string, agendaId: string, completed: boolean) =>
    request<any>(`/agenda/${id}/agenda/${agendaId}`, {
      method: 'PATCH',
      body: JSON.stringify({ completed }),
    }),
  addTask: (id: string, data: { task: string; assigneeName?: string; dueDate?: string }) =>
    request<any>(`/agenda/${id}/tasks`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  toggleTask: (id: string, taskId: string, completed: boolean) =>
    request<any>(`/agenda/${id}/tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify({ completed }),
    }),

  // Polls
  getPolls: (id: string) => request<{ polls: any[] }>(`/polls/${id}`),
  createPoll: (id: string, data: { question: string; options: string[] }) =>
    request<any>(`/polls/${id}`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  votePoll: (id: string, pollId: string, optionId: string, voterIdentifier: string) =>
    request<any>(`/polls/${id}/${pollId}/vote`, {
      method: 'POST',
      body: JSON.stringify({ optionId, voterIdentifier }),
    }),

  // Announcements
  getAnnouncements: () => request<{ announcements: any[] }>('/announcements'),
  createAnnouncement: (data: { title: string; content: string; category?: string }) =>
    request<any>('/announcements', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // LiveKit Token
  getLiveKitToken: (data: { roomName: string; participantName: string; isHost?: boolean }) =>
    request<{ token: string; serverUrl: string; isLiveKitCloud: boolean }>('/livekit/token', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

