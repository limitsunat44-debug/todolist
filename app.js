// Supabase Configuration
const SUPABASE_CONFIG = {
  url: 'https://mvjiqysmcclvceswfqwv.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12amlxeXNtY2NsdmNlc3dmcXd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE0MDUyOTYsImV4cCI6MjA3Njk4MTI5Nn0.FoRyIZ9E4M2ZwEE8Kh4hDdkBDLuhyqRut7VEKG4uQkk'
};

// Initialize Supabase Client
const supabase = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);

// App State
let appData = {
  tasks: [],
  ideas: [],
  pomodoroSettings: {
    workDuration: 25,
    breakDuration: 5,
    completedSessions: 0
  }
};

let syncTimeout = null;
let currentEditingIdeaId = null;

// Pomodoro State
let pomodoroState = {
  isRunning: false,
  isPaused: false,
  timeRemaining: 25 * 60,
  isWorkSession: true,
  intervalId: null
};

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
  initializeApp();
});

async function initializeApp() {
  showSyncStatus('Синхронизация...', true);
  await loadDataFromSupabase();
  setupEventListeners();
  setupRealtimeSubscription();
  setTodayDate();
  renderTasks();
  renderCompletedTasks();
  renderIdeas();
  updatePomodoroDisplay();
  hideSyncStatus();
}

// Supabase Functions
async function loadDataFromSupabase() {
  try {
    // Load tasks
    const { data: tasks, error: tasksError } = await supabase
      .from('tasks')
      .select('*')
      .order('created_at', { ascending: false });

    if (tasksError) {
      console.error('Tasks error:', tasksError);
      throw tasksError;
    }

    // Load ideas
    const { data: ideas, error: ideasError } = await supabase
      .from('ideas')
      .select('*')
      .order('created_at', { ascending: false });

    if (ideasError) {
      console.error('Ideas error:', ideasError);
      throw ideasError;
    }

    // Load pomodoro settings
    const { data: settings, error: settingsError } = await supabase
      .from('pomodoro_settings')
      .select('*')
      .single();

    if (settingsError && settingsError.code !== 'PGRST116') {
      console.error('Settings error:', settingsError);
    }

    appData.tasks = tasks || [];
    appData.ideas = ideas || [];

    if (settings) {
      appData.pomodoroSettings = {
        workDuration: settings.work_duration,
        breakDuration: settings.break_duration,
        completedSessions: settings.completed_sessions
      };
    }

    document.getElementById('completedSessions').textContent = appData.pomodoroSettings.completedSessions;
  } catch (error) {
    console.error('Error loading data:', error);
    showSyncStatus('Ошибка загрузки', false);
  }
}

// Setup Real-time subscription for live updates
function setupRealtimeSubscription() {
  // Subscribe to tasks changes
  supabase
    .channel('tasks-channel')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, (payload) => {
      handleTasksChange(payload);
    })
    .subscribe();

  // Subscribe to ideas changes
  supabase
    .channel('ideas-channel')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'ideas' }, (payload) => {
      handleIdeasChange(payload);
    })
    .subscribe();
}

function handleTasksChange(payload) {
  console.log('Task change:', payload);
  if (payload.eventType === 'INSERT') {
    const existingIndex = appData.tasks.findIndex(t => t.id === payload.new.id);
    if (existingIndex === -1) {
      appData.tasks.unshift(payload.new);
      renderTasks();
      renderCompletedTasks();
    }
  } else if (payload.eventType === 'UPDATE') {
    const index = appData.tasks.findIndex(t => t.id === payload.new.id);
    if (index !== -1) {
      appData.tasks[index] = payload.new;
      renderTasks();
      renderCompletedTasks();
    }
  } else if (payload.eventType === 'DELETE') {
    appData.tasks = appData.tasks.filter(t => t.id !== payload.old.id);
    renderTasks();
    renderCompletedTasks();
  }
}

function handleIdeasChange(payload) {
  console.log('Idea change:', payload);
  if (payload.eventType === 'INSERT') {
    const existingIndex = appData.ideas.findIndex(i => i.id === payload.new.id);
    if (existingIndex === -1) {
      appData.ideas.unshift(payload.new);
      renderIdeas();
    }
  } else if (payload.eventType === 'UPDATE') {
    const index = appData.ideas.findIndex(i => i.id === payload.new.id);
    if (index !== -1) {
      appData.ideas[index] = payload.new;
      renderIdeas();
    }
  } else if (payload.eventType === 'DELETE') {
    appData.ideas = appData.ideas.filter(i => i.id !== payload.old.id);
    renderIdeas();
  }
}

async function saveTaskToSupabase(task) {
  showSyncStatus('Синхронизация...', true);
  try {
    if (task.id) {
      // Update existing task
      const { error } = await supabase
        .from('tasks')
        .update({
          title: task.title,
          date: task.date,
          time: task.time || null,
          completed: task.completed,
          updated_at: new Date().toISOString()
        })
        .eq('id', task.id);

      if (error) {
        console.error('Update error:', error);
        throw error;
      }
    } else {
      // Insert new task
      const { data, error } = await supabase
        .from('tasks')
        .insert([{
          title: task.title,
          date: task.date,
          time: task.time || null,
          completed: task.completed || false
        }])
        .select()
        .single();

      if (error) {
        console.error('Insert error:', error);
        throw error;
      }

      showSyncStatus('Синхронизировано', false);
      setTimeout(hideSyncStatus, 2000);
      return data;
    }

    showSyncStatus('Синхронизировано', false);
    setTimeout(hideSyncStatus, 2000);
  } catch (error) {
    console.error('Error saving task:', error);
    showSyncStatus('Ошибка: ' + (error.message || 'Неизвестная ошибка'), false);
    setTimeout(hideSyncStatus, 3000);
    throw error;
  }
}

async function deleteTaskFromSupabase(taskId) {
  try {
    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', taskId);

    if (error) {
      console.error('Delete error:', error);
      throw error;
    }
  } catch (error) {
    console.error('Error deleting task:', error);
    throw error;
  }
}

async function saveIdeaToSupabase(idea) {
  showSyncStatus('Синхронизация...', true);
  try {
    if (idea.id) {
      // Update existing idea
      const { error } = await supabase
        .from('ideas')
        .update({
          title: idea.title,
          description: idea.description || null,
          implementation: idea.implementation || null,
          status: idea.status,
          updated_at: new Date().toISOString()
        })
        .eq('id', idea.id);

      if (error) {
        console.error('Update idea error:', error);
        throw error;
      }
    } else {
      // Insert new idea
      const { data, error } = await supabase
        .from('ideas')
        .insert([{
          title: idea.title,
          description: idea.description || null,
          implementation: idea.implementation || null,
          status: idea.status
        }])
        .select()
        .single();

      if (error) {
        console.error('Insert idea error:', error);
        throw error;
      }

      showSyncStatus('Синхронизировано', false);
      setTimeout(hideSyncStatus, 2000);
      return data;
    }

    showSyncStatus('Синхронизировано', false);
    setTimeout(hideSyncStatus, 2000);
  } catch (error) {
    console.error('Error saving idea:', error);
    showSyncStatus('Ошибка: ' + (error.message || 'Неизвестная ошибка'), false);
    setTimeout(hideSyncStatus, 3000);
    throw error;
  }
}

async function deleteIdeaFromSupabase(ideaId) {
  try {
    const { error } = await supabase
      .from('ideas')
      .delete()
      .eq('id', ideaId);

    if (error) {
      console.error('Delete idea error:', error);
      throw error;
    }
  } catch (error) {
    console.error('Error deleting idea:', error);
    throw error;
  }
}

async function savePomodoroSettings() {
  try {
    const { error } = await supabase
      .from('pomodoro_settings')
      .upsert({
        id: 1,
        work_duration: appData.pomodoroSettings.workDuration,
        break_duration: appData.pomodoroSettings.breakDuration,
        completed_sessions: appData.pomodoroSettings.completedSessions,
        updated_at: new Date().toISOString()
      });

    if (error) {
      console.error('Save pomodoro settings error:', error);
      throw error;
    }
  } catch (error) {
    console.error('Error saving pomodoro settings:', error);
  }
}

function showSyncStatus(text, isSyncing) {
  const syncStatus = document.getElementById('syncStatus');
  const syncText = document.getElementById('syncText');
  syncText.textContent = text;
  syncStatus.classList.toggle('syncing', isSyncing);
  syncStatus.classList.add('show');
}

function hideSyncStatus() {
  const syncStatus = document.getElementById('syncStatus');
  syncStatus.classList.remove('show');
}

// Event Listeners
function setupEventListeners() {
  // Navigation
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const view = item.dataset.view;
      switchView(view);
    });
  });

  // Date selector
  document.getElementById('dateSelector').addEventListener('change', (e) => {
    renderTasks(e.target.value);
  });

  // Add Task Button
  document.getElementById('addTaskBtn').addEventListener('click', openTaskModal);
  document.getElementById('closeTaskModal').addEventListener('click', closeTaskModal);
  document.getElementById('cancelTask').addEventListener('click', closeTaskModal);
  document.getElementById('saveTask').addEventListener('click', saveTask);

  // Add Idea Button
  document.getElementById('addIdeaBtn').addEventListener('click', () => openIdeaModal());
  document.getElementById('closeIdeaModal').addEventListener('click', closeIdeaModal);
  document.getElementById('cancelIdea').addEventListener('click', closeIdeaModal);
  document.getElementById('saveIdea').addEventListener('click', saveIdea);

  // Pomodoro Controls
  document.getElementById('pomodoroStart').addEventListener('click', togglePomodoro);
  document.getElementById('pomodoroReset').addEventListener('click', resetPomodoro);

  // Close modal on outside click
  document.getElementById('taskModal').addEventListener('click', (e) => {
    if (e.target.id === 'taskModal') closeTaskModal();
  });
  document.getElementById('ideaModal').addEventListener('click', (e) => {
    if (e.target.id === 'ideaModal') closeIdeaModal();
  });

  // Event delegation for task items
  document.getElementById('tasksContainer').addEventListener('click', handleTaskContainerClick);
  document.getElementById('completedTasksContainer').addEventListener('click', handleTaskContainerClick);
  document.getElementById('ideasContainer').addEventListener('click', handleIdeaContainerClick);
}

// Handle clicks on task containers (event delegation)
function handleTaskContainerClick(e) {
  const button = e.target.closest('button[data-action]');
  if (!button) return;

  const taskId = button.dataset.taskId;
  const action = button.dataset.action;

  if (action === 'toggle') {
    toggleTaskComplete(taskId);
  } else if (action === 'delete') {
    deleteTask(taskId);
  }
}

// Handle clicks on idea items (event delegation)
function handleIdeaContainerClick(e) {
  const ideaItem = e.target.closest('.idea-item[data-idea-id]');
  if (!ideaItem) return;

  const ideaId = ideaItem.dataset.ideaId;
  openIdeaModal(ideaId);
}


function switchView(viewName) {
  // Update navigation
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.view === viewName);
  });

  // Update views
  document.querySelectorAll('.view').forEach(view => {
    view.classList.remove('active');
  });
  document.getElementById(`${viewName}View`).classList.add('active');
}

function setTodayDate() {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('dateSelector').value = today;
  document.getElementById('taskDate').value = today;
}

// Task Functions
function renderTasks(filterDate = null) {
  const container = document.getElementById('tasksContainer');
  const selectedDate = filterDate || document.getElementById('dateSelector').value;

  const filteredTasks = appData.tasks
    .filter(task => !task.completed && task.date === selectedDate)
    .sort((a, b) => {
      if (a.time && b.time) return a.time.localeCompare(b.time);
      if (a.time) return -1;
      if (b.time) return 1;
      return 0;
    });

  if (filteredTasks.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>Нет задач на эту дату</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filteredTasks.map(task => `
    <div class="task-item">
      <button class="task-checkbox" data-task-id="${task.id}" data-action="toggle">
        <svg width="20" height="20" viewBox="0 0 20 20">
          <circle cx="10" cy="10" r="9" stroke="currentColor" stroke-width="2" fill="none"/>
        </svg>
      </button>
      <div class="task-content">
        <div class="task-title">${task.title}</div>
        ${task.time ? `<div class="task-time">${task.time}</div>` : ''}
      </div>
      <button class="task-delete" data-task-id="${task.id}" data-action="delete">×</button>
    </div>
  `).join('');
}

function renderCompletedTasks() {
  const container = document.getElementById('completedTasksContainer');
  const completedTasks = appData.tasks.filter(task => task.completed);

  if (completedTasks.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>Нет выполненных задач</p>
      </div>
    `;
    return;
  }

  container.innerHTML = completedTasks.map(task => `
    <div class="task-item completed">
      <button class="task-checkbox completed" data-task-id="${task.id}" data-action="toggle">
        <svg width="20" height="20" viewBox="0 0 20 20">
          <circle cx="10" cy="10" r="9" stroke="currentColor" stroke-width="2" fill="var(--color-primary)"/>
          <path d="M6 10 L9 13 L14 7" stroke="white" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <div class="task-content">
        <div class="task-title">${task.title}</div>
        ${task.time ? `<div class="task-time">${task.time}</div>` : ''}
      </div>
      <button class="task-delete" data-task-id="${task.id}" data-action="delete">×</button>
    </div>
  `).join('');
}

async function toggleTaskComplete(taskId) {
  const task = appData.tasks.find(t => t.id === taskId);
  if (task) {
    task.completed = !task.completed;
    await saveTaskToSupabase(task);
    renderTasks();
    renderCompletedTasks();
  }
}

async function deleteTask(taskId) {
  if (confirm('Удалить эту задачу?')) {
    await deleteTaskFromSupabase(taskId);
    appData.tasks = appData.tasks.filter(t => t.id !== taskId);
    renderTasks();
    renderCompletedTasks();
  }
}

function openTaskModal() {
  document.getElementById('taskModal').classList.add('show');
  document.getElementById('taskTitle').value = '';
  document.getElementById('taskTime').value = '';
  document.getElementById('taskTitle').focus();
}

function closeTaskModal() {
  document.getElementById('taskModal').classList.remove('show');
}

async function saveTask() {
  const title = document.getElementById('taskTitle').value.trim();
  const date = document.getElementById('taskDate').value;
  const time = document.getElementById('taskTime').value;

  if (!title) {
    alert('Пожалуйста, введите название задачи');
    return;
  }

  const newTask = {
    title,
    date,
    time: time || null,
    completed: false
  };

  try {
    const savedTask = await saveTaskToSupabase(newTask);
    if (savedTask) {
      appData.tasks.unshift(savedTask);
      renderTasks();
      closeTaskModal();
    }
  } catch (error) {
    console.error('Failed to save task:', error);
  }
}

// Idea Functions
function renderIdeas() {
  const container = document.getElementById('ideasContainer');

  if (appData.ideas.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>Нет идей</p>
      </div>
    `;
    return;
  }

  container.innerHTML = appData.ideas.map(idea => `
    <div class="idea-item" data-idea-id="${idea.id}">
      <div class="idea-header">
        <div class="idea-title">${idea.title}</div>
        <span class="idea-status ${idea.status}">${getStatusText(idea.status)}</span>
      </div>
      ${idea.description ? `<div class="idea-description">${idea.description}</div>` : ''}
      ${idea.implementation ? `<div class="idea-implementation">${idea.implementation}</div>` : ''}
    </div>
  `).join('');
}

function getStatusText(status) {
  const statusMap = {
    'new': 'Новая',
    'in-progress': 'В процессе',
    'implemented': 'Реализована'
  };
  return statusMap[status] || status;
}

function openIdeaModal(ideaId = null) {
  const modal = document.getElementById('ideaModal');
  modal.classList.add('show');

  if (ideaId) {
    currentEditingIdeaId = ideaId;
    const idea = appData.ideas.find(i => i.id === ideaId);
    if (idea) {
      document.getElementById('ideaTitle').value = idea.title;
      document.getElementById('ideaDescription').value = idea.description || '';
      document.getElementById('ideaImplementation').value = idea.implementation || '';
      document.getElementById('ideaStatus').value = idea.status;

      // Add delete button if editing
      const footer = modal.querySelector('.modal-footer');
      if (!document.getElementById('deleteIdeaBtn')) {
        const deleteBtn = document.createElement('button');
        deleteBtn.id = 'deleteIdeaBtn';
        deleteBtn.className = 'btn-secondary';
        deleteBtn.textContent = 'Удалить';
        deleteBtn.onclick = deleteCurrentIdea;
        footer.insertBefore(deleteBtn, footer.firstChild);
      }
    }
  } else {
    currentEditingIdeaId = null;
    document.getElementById('ideaTitle').value = '';
    document.getElementById('ideaDescription').value = '';
    document.getElementById('ideaImplementation').value = '';
    document.getElementById('ideaStatus').value = 'new';

    // Remove delete button if it exists
    const deleteBtn = document.getElementById('deleteIdeaBtn');
    if (deleteBtn) {
      deleteBtn.remove();
    }
  }

  document.getElementById('ideaTitle').focus();
}

function closeIdeaModal() {
  document.getElementById('ideaModal').classList.remove('show');
  currentEditingIdeaId = null;
}

async function saveIdea() {
  const title = document.getElementById('ideaTitle').value.trim();
  const description = document.getElementById('ideaDescription').value.trim();
  const implementation = document.getElementById('ideaImplementation').value.trim();
  const status = document.getElementById('ideaStatus').value;

  if (!title) {
    alert('Пожалуйста, введите название идеи');
    return;
  }

  const ideaData = {
    title,
    description: description || null,
    implementation: implementation || null,
    status
  };

  try {
    if (currentEditingIdeaId) {
      ideaData.id = currentEditingIdeaId;
      await saveIdeaToSupabase(ideaData);
      const index = appData.ideas.findIndex(i => i.id === currentEditingIdeaId);
      if (index !== -1) {
        appData.ideas[index] = { ...appData.ideas[index], ...ideaData };
      }
    } else {
      const savedIdea = await saveIdeaToSupabase(ideaData);
      if (savedIdea) {
        appData.ideas.unshift(savedIdea);
      }
    }

    renderIdeas();
    closeIdeaModal();
  } catch (error) {
    console.error('Failed to save idea:', error);
  }
}

async function deleteCurrentIdea() {
  if (currentEditingIdeaId && confirm('Удалить эту идею?')) {
    try {
      await deleteIdeaFromSupabase(currentEditingIdeaId);
      appData.ideas = appData.ideas.filter(i => i.id !== currentEditingIdeaId);
      renderIdeas();
      closeIdeaModal();
    } catch (error) {
      console.error('Failed to delete idea:', error);
    }
  }
}

// Pomodoro Functions
function updatePomodoroDisplay() {
  const minutes = Math.floor(pomodoroState.timeRemaining / 60);
  const seconds = pomodoroState.timeRemaining % 60;
  const timeString = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

  document.getElementById('pomodoroTime').textContent = timeString;
  document.getElementById('pomodoroLabel').textContent = pomodoroState.isWorkSession ? 'Работа' : 'Перерыв';

  const progress = pomodoroState.isWorkSession
    ? (pomodoroState.timeRemaining / (appData.pomodoroSettings.workDuration * 60))
    : (pomodoroState.timeRemaining / (appData.pomodoroSettings.breakDuration * 60));

  updateProgressRing(progress);
}

function updateProgressRing(progress) {
  const circle = document.querySelector('.progress-ring-progress');
  const radius = circle.r.baseVal.value;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference * (1 - progress);

  circle.style.strokeDasharray = `${circumference} ${circumference}`;
  circle.style.strokeDashoffset = offset;
}

function togglePomodoro() {
  if (pomodoroState.isRunning) {
    pausePomodoro();
  } else {
    startPomodoro();
  }
}

function startPomodoro() {
  pomodoroState.isRunning = true;
  document.getElementById('pomodoroStart').textContent = 'Пауза';

  pomodoroState.intervalId = setInterval(() => {
    pomodoroState.timeRemaining--;

    if (pomodoroState.timeRemaining <= 0) {
      completeSession();
    }

    updatePomodoroDisplay();
  }, 1000);
}

function pausePomodoro() {
  pomodoroState.isRunning = false;
  document.getElementById('pomodoroStart').textContent = 'Старт';
  clearInterval(pomodoroState.intervalId);
}

async function completeSession() {
  clearInterval(pomodoroState.intervalId);

  if (pomodoroState.isWorkSession) {
    appData.pomodoroSettings.completedSessions++;
    document.getElementById('completedSessions').textContent = appData.pomodoroSettings.completedSessions;
    await savePomodoroSettings();
  }

  pomodoroState.isWorkSession = !pomodoroState.isWorkSession;
  pomodoroState.timeRemaining = pomodoroState.isWorkSession
    ? appData.pomodoroSettings.workDuration * 60
    : appData.pomodoroSettings.breakDuration * 60;
  pomodoroState.isRunning = false;

  document.getElementById('pomodoroStart').textContent = 'Старт';
  updatePomodoroDisplay();

  // Notification
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(pomodoroState.isWorkSession ? 'Время работать!' : 'Время отдохнуть!');
  }
}

function resetPomodoro() {
  clearInterval(pomodoroState.intervalId);
  pomodoroState.isRunning = false;
  pomodoroState.isWorkSession = true;
  pomodoroState.timeRemaining = appData.pomodoroSettings.workDuration * 60;
  document.getElementById('pomodoroStart').textContent = 'Старт';
  updatePomodoroDisplay();
}

// Request notification permission
if ('Notification' in window && Notification.permission === 'default') {
  Notification.requestPermission();
}
