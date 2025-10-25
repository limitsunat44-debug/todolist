// JSONBin Configuration
const JSONBIN_CONFIG = {
    binId: '68f1dcc7d0ea881f40a7691b',
    masterKey: '$2a$10$yPjteU2c8x7lEUMZP8ATfOl.tiI/urEhy.bluxcsANuBQR/J9tN8q',
    apiUrl: 'https://api.jsonbin.io/v3/b/68f1dcc7d0ea881f40a7691b'
};

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
    await loadDataFromJSONBin();
    setupEventListeners();
    setTodayDate();
    renderTasks();
    renderCompletedTasks();
    renderIdeas();
    updatePomodoroDisplay();
    hideSyncStatus();
}

// JSONBin Functions
async function loadDataFromJSONBin() {
    try {
        const response = await fetch(JSONBIN_CONFIG.apiUrl, {
            method: 'GET',
            headers: {
                'X-Master-Key': JSONBIN_CONFIG.masterKey
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.record) {
                appData = {
                    tasks: data.record.tasks || [],
                    ideas: data.record.ideas || [],
                    pomodoroSettings: data.record.pomodoroSettings || {
                        workDuration: 25,
                        breakDuration: 5,
                        completedSessions: 0
                    }
                };
                document.getElementById('completedSessions').textContent = appData.pomodoroSettings.completedSessions;
            }
        }
    } catch (error) {
        console.error('Error loading data:', error);
    }
}

async function saveDataToJSONBin() {
    showSyncStatus('Синхронизация...', true);
    try {
        const response = await fetch(JSONBIN_CONFIG.apiUrl, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-Master-Key': JSONBIN_CONFIG.masterKey
            },
            body: JSON.stringify(appData)
        });
        
        if (response.ok) {
            showSyncStatus('Синхронизировано', false);
            setTimeout(hideSyncStatus, 2000);
        } else {
            showSyncStatus('Ошибка синхронизации', false);
        }
    } catch (error) {
        console.error('Error saving data:', error);
        showSyncStatus('Ошибка синхронизации', false);
    }
}

function debounceSave() {
    clearTimeout(syncTimeout);
    syncTimeout = setTimeout(() => {
        saveDataToJSONBin();
    }, 2000);
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
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M9 11l3 3L22 4"></path>
                    <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"></path>
                </svg>
                <p>Нет задач на эту дату</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = filteredTasks.map(task => `
        <div class="task-item" data-id="${task.id}">
            <div class="task-checkbox" onclick="toggleTask('${task.id}')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
            </div>
            <div class="task-content">
                <div class="task-title">${task.title}</div>
                <div class="task-meta">${formatDate(task.date)}${task.time ? ' • ' + task.time : ''}</div>
            </div>
            <button class="task-delete" onclick="deleteTask('${task.id}')">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        </div>
    `).join('');
}

function renderCompletedTasks() {
    const container = document.getElementById('completedContainer');
    
    const completedTasks = appData.tasks
        .filter(task => task.completed)
        .sort((a, b) => new Date(b.completedDate) - new Date(a.completedDate));
    
    if (completedTasks.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                <p>Нет выполненных задач</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = completedTasks.map(task => `
        <div class="task-item">
            <div class="task-checkbox checked" onclick="toggleTask('${task.id}')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
            </div>
            <div class="task-content">
                <div class="task-title">${task.title}</div>
                <div class="task-meta">Выполнено: ${formatDate(task.completedDate)}</div>
            </div>
            <button class="task-delete" onclick="deleteTask('${task.id}')">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        </div>
    `).join('');
}

function toggleTask(taskId) {
    const task = appData.tasks.find(t => t.id === taskId);
    if (!task) return;
    
    task.completed = !task.completed;
    task.completedDate = task.completed ? new Date().toISOString().split('T')[0] : null;
    
    // Add animation
    const taskElement = document.querySelector(`[data-id="${taskId}"]`);
    if (taskElement) {
        taskElement.classList.add('completed-animation');
        setTimeout(() => {
            renderTasks();
            renderCompletedTasks();
        }, 300);
    } else {
        renderTasks();
        renderCompletedTasks();
    }
    
    debounceSave();
}

function deleteTask(taskId) {
    appData.tasks = appData.tasks.filter(t => t.id !== taskId);
    renderTasks();
    renderCompletedTasks();
    debounceSave();
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

function saveTask() {
    const title = document.getElementById('taskTitle').value.trim();
    const date = document.getElementById('taskDate').value;
    const time = document.getElementById('taskTime').value;
    
    if (!title || !date) {
        alert('Пожалуйста, заполните название и дату');
        return;
    }
    
    const newTask = {
        id: generateId(),
        title,
        date,
        time: time || null,
        completed: false,
        completedDate: null
    };
    
    appData.tasks.push(newTask);
    closeTaskModal();
    renderTasks();
    debounceSave();
}

// Ideas Functions
function renderIdeas() {
    const container = document.getElementById('ideasContainer');
    
    if (appData.ideas.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path>
                </svg>
                <p>Нет идей</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = appData.ideas.map(idea => `
        <div class="idea-item" onclick="openIdeaModal('${idea.id}')">
            <div class="idea-header">
                <div class="idea-title">${idea.title}</div>
                <span class="idea-status ${idea.status}">${getStatusLabel(idea.status)}</span>
            </div>
            ${idea.description ? `<div class="idea-description">${idea.description}</div>` : ''}
            ${idea.implementation ? `<div class="idea-implementation">Реализация: ${idea.implementation}</div>` : ''}
        </div>
    `).join('');
}

function openIdeaModal(ideaId = null) {
    const modal = document.getElementById('ideaModal');
    const title = document.getElementById('ideaModalTitle');
    
    if (ideaId) {
        currentEditingIdeaId = ideaId;
        const idea = appData.ideas.find(i => i.id === ideaId);
        if (idea) {
            title.textContent = 'Редактировать идею';
            document.getElementById('ideaTitle').value = idea.title;
            document.getElementById('ideaDescription').value = idea.description || '';
            document.getElementById('ideaImplementation').value = idea.implementation || '';
            document.getElementById('ideaStatus').value = idea.status;
        }
    } else {
        currentEditingIdeaId = null;
        title.textContent = 'Добавить идею';
        document.getElementById('ideaTitle').value = '';
        document.getElementById('ideaDescription').value = '';
        document.getElementById('ideaImplementation').value = '';
        document.getElementById('ideaStatus').value = 'new';
    }
    
    modal.classList.add('show');
    document.getElementById('ideaTitle').focus();
}

function closeIdeaModal() {
    document.getElementById('ideaModal').classList.remove('show');
    currentEditingIdeaId = null;
}

function saveIdea() {
    const title = document.getElementById('ideaTitle').value.trim();
    const description = document.getElementById('ideaDescription').value.trim();
    const implementation = document.getElementById('ideaImplementation').value.trim();
    const status = document.getElementById('ideaStatus').value;
    
    if (!title) {
        alert('Пожалуйста, введите название идеи');
        return;
    }
    
    if (currentEditingIdeaId) {
        const idea = appData.ideas.find(i => i.id === currentEditingIdeaId);
        if (idea) {
            idea.title = title;
            idea.description = description;
            idea.implementation = implementation;
            idea.status = status;
        }
    } else {
        const newIdea = {
            id: generateId(),
            title,
            description,
            implementation,
            status
        };
        appData.ideas.push(newIdea);
    }
    
    closeIdeaModal();
    renderIdeas();
    debounceSave();
}

function getStatusLabel(status) {
    const labels = {
        'new': 'Новая',
        'in-progress': 'В процессе',
        'implemented': 'Реализована'
    };
    return labels[status] || status;
}

// Pomodoro Functions
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
        if (pomodoroState.timeRemaining > 0) {
            pomodoroState.timeRemaining--;
            updatePomodoroDisplay();
        } else {
            completeSession();
        }
    }, 1000);
}

function pausePomodoro() {
    pomodoroState.isRunning = false;
    document.getElementById('pomodoroStart').textContent = 'Старт';
    clearInterval(pomodoroState.intervalId);
}

function resetPomodoro() {
    pausePomodoro();
    pomodoroState.isWorkSession = true;
    pomodoroState.timeRemaining = appData.pomodoroSettings.workDuration * 60;
    document.getElementById('pomodoroSession').textContent = 'Работа';
    updatePomodoroDisplay();
}

function completeSession() {
    pausePomodoro();
    
    if (pomodoroState.isWorkSession) {
        appData.pomodoroSettings.completedSessions++;
        document.getElementById('completedSessions').textContent = appData.pomodoroSettings.completedSessions;
        pomodoroState.timeRemaining = appData.pomodoroSettings.breakDuration * 60;
        pomodoroState.isWorkSession = false;
        document.getElementById('pomodoroSession').textContent = 'Перерыв';
        debounceSave();
    } else {
        pomodoroState.timeRemaining = appData.pomodoroSettings.workDuration * 60;
        pomodoroState.isWorkSession = true;
        document.getElementById('pomodoroSession').textContent = 'Работа';
    }
    
    updatePomodoroDisplay();
    
    // Play notification sound (silent in this implementation)
    if ('vibrate' in navigator) {
        navigator.vibrate([200, 100, 200]);
    }
}

function updatePomodoroDisplay() {
    const minutes = Math.floor(pomodoroState.timeRemaining / 60);
    const seconds = pomodoroState.timeRemaining % 60;
    document.getElementById('pomodoroTime').textContent = 
        `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    
    // Update progress circle
    const totalTime = pomodoroState.isWorkSession 
        ? appData.pomodoroSettings.workDuration * 60 
        : appData.pomodoroSettings.breakDuration * 60;
    const progress = pomodoroState.timeRemaining / totalTime;
    const circumference = 2 * Math.PI * 120;
    const offset = circumference * (1 - progress);
    
    const circle = document.getElementById('progressCircle');
    circle.style.strokeDasharray = `${circumference} ${circumference}`;
    circle.style.strokeDashoffset = offset;
}

// Utility Functions
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function formatDate(dateString) {
    const date = new Date(dateString + 'T00:00:00');
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    today.setHours(0, 0, 0, 0);
    tomorrow.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);
    
    if (date.getTime() === today.getTime()) return 'Сегодня';
    if (date.getTime() === tomorrow.getTime()) return 'Завтра';
    
    const options = { day: 'numeric', month: 'long' };
    return date.toLocaleDateString('ru-RU', options);
}

// Make functions global for onclick handlers
window.toggleTask = toggleTask;
window.deleteTask = deleteTask;
window.openIdeaModal = openIdeaModal;