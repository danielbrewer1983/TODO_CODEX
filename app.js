const STORAGE_KEY = "mobile-todo-board-v1";
const createId = () => globalThis.crypto?.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const cloneData = (value) => globalThis.structuredClone ? structuredClone(value) : JSON.parse(JSON.stringify(value));

const defaultCategories = [
  {
    id: createId(),
    name: "General",
    color: "#1d8f6a",
    links: [
      { id: createId(), label: "Calendar", url: "https://calendar.google.com" },
      { id: createId(), label: "Notes", url: "https://keep.google.com" }
    ]
  },
  {
    id: createId(),
    name: "Work",
    color: "#ff8a3d",
    links: [
      { id: createId(), label: "Email", url: "https://mail.google.com" }
    ]
  }
];

const state = loadState();

const todoForm = document.querySelector("#todoForm");
const categoryForm = document.querySelector("#categoryForm");
const linkForm = document.querySelector("#linkForm");
const todoList = document.querySelector("#todoList");
const archiveList = document.querySelector("#archiveList");
const activeCount = document.querySelector("#activeCount");
const archiveCount = document.querySelector("#archiveCount");
const todoCategory = document.querySelector("#todoCategory");
const linkCategory = document.querySelector("#linkCategory");
const exportCsvButton = document.querySelector("#exportCsvButton");
const emptyStateTemplate = document.querySelector("#emptyStateTemplate");

let dragState = null;

render();

todoForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(todoForm);
  const title = formData.get("title").toString().trim();
  const notes = formData.get("notes").toString().trim();
  const categoryId = formData.get("categoryId").toString();

  if (!title) {
    return;
  }

  state.todos.push({
    id: createId(),
    title,
    notes,
    categoryId,
    createdAt: new Date().toISOString()
  });

  persist();
  todoForm.reset();
  document.querySelector("#todoTitle").focus();
  render();
});

categoryForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(categoryForm);
  const name = formData.get("name").toString().trim();
  const color = formData.get("color").toString();

  if (!name) {
    return;
  }

  state.categories.push({
    id: createId(),
    name,
    color,
    links: []
  });

  persist();
  categoryForm.reset();
  document.querySelector("#categoryColor").value = "#1d8f6a";
  render();
});

linkForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(linkForm);
  const categoryId = formData.get("categoryId").toString();
  const label = formData.get("label").toString().trim();
  const url = formData.get("url").toString().trim();

  const category = state.categories.find((entry) => entry.id === categoryId);
  if (!category || !label || !url) {
    return;
  }

  category.links.push({
    id: createId(),
    label,
    url
  });

  persist();
  linkForm.reset();
  render();
});

exportCsvButton.addEventListener("click", () => {
  if (!state.archive.length) {
    window.alert("There are no completed items to export yet.");
    return;
  }

  const header = ["Title", "Notes", "Category", "Created At", "Completed At"];
  const rows = state.archive.map((item) => [
    item.title,
    item.notes || "",
    getCategoryName(item.categoryId),
    formatDateTime(item.createdAt),
    formatDateTime(item.completedAt)
  ]);

  const csv = [header, ...rows]
    .map((row) => row.map(csvEscape).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const downloadUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.download = `completed-todos-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(downloadUrl);
});

todoList.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) {
    return;
  }

  const todoId = button.dataset.todoId;
  const action = button.dataset.action;

  if (action === "complete") {
    completeTodo(todoId);
  }

  if (action === "delete") {
    deleteTodo(todoId);
  }
});

archiveList.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action='remove-archive']");
  if (!button) {
    return;
  }

  state.archive = state.archive.filter((item) => item.id !== button.dataset.todoId);
  persist();
  render();
});

todoList.addEventListener("pointerdown", (event) => {
  const handle = event.target.closest(".drag-handle");
  if (!handle) {
    return;
  }

  const card = handle.closest(".todo-card");
  if (!card) {
    return;
  }

  dragState = {
    todoId: card.dataset.todoId,
    pointerId: event.pointerId
  };
  card.classList.add("dragging");
  document.body.style.userSelect = "none";
});

window.addEventListener("pointermove", (event) => {
  if (!dragState || dragState.pointerId !== event.pointerId) {
    return;
  }

  const hoveredCard = document.elementFromPoint(event.clientX, event.clientY)?.closest(".todo-card");
  document.querySelectorAll(".todo-card").forEach((card) => {
    card.classList.remove("drop-target");
  });

  if (!hoveredCard || hoveredCard.dataset.todoId === dragState.todoId) {
    return;
  }

  hoveredCard.classList.add("drop-target");
});

window.addEventListener("pointerup", (event) => {
  if (!dragState || dragState.pointerId !== event.pointerId) {
    return;
  }

  const draggedId = dragState.todoId;
  const targetCard = document.elementFromPoint(event.clientX, event.clientY)?.closest(".todo-card");

  document.querySelectorAll(".todo-card").forEach((card) => {
    card.classList.remove("dragging", "drop-target");
  });

  if (targetCard && draggedId !== targetCard.dataset.todoId) {
    reorderTodos(draggedId, targetCard.dataset.todoId);
  }

  dragState = null;
  document.body.style.userSelect = "";
});

window.addEventListener("pointercancel", clearDragState);

function render() {
  populateCategorySelects();
  renderTodoList();
  renderArchive();
  activeCount.textContent = String(state.todos.length);
  archiveCount.textContent = String(state.archive.length);
}

function renderTodoList() {
  todoList.innerHTML = "";

  if (!state.todos.length) {
    todoList.append(emptyState("No active todos yet. Add one above to get started."));
    return;
  }

  state.todos.forEach((todo) => {
    const category = getCategory(todo.categoryId);
    const card = document.createElement("article");
    card.className = "todo-card";
    card.dataset.todoId = todo.id;

    const linksMarkup = category.links.map((link) => {
      const anchor = document.createElement("a");
      anchor.className = "category-link";
      anchor.href = link.url;
      anchor.target = "_blank";
      anchor.rel = "noreferrer";
      anchor.textContent = link.label;
      applyCategoryColors(anchor, category.color, true);
      return anchor;
    });

    const linksWrap = document.createElement("div");
    linksWrap.className = "category-links";
    linksMarkup.forEach((anchor) => linksWrap.append(anchor));

    card.innerHTML = `
      <div class="todo-topline">
        <div class="todo-title-row">
          <button class="drag-handle" type="button" aria-label="Drag to reorder">|||</button>
          <div>
            <div class="category-pill"></div>
            <h3 class="todo-title"></h3>
          </div>
        </div>
      </div>
      <p class="todo-notes"></p>
      <div class="meta">
        <span>Added: ${formatDateTime(todo.createdAt)}</span>
      </div>
      <div class="todo-actions">
        <button class="tiny-button complete" type="button" data-action="complete" data-todo-id="${todo.id}">Complete</button>
        <button class="tiny-button delete" type="button" data-action="delete" data-todo-id="${todo.id}">Delete</button>
      </div>
    `;

    const pill = card.querySelector(".category-pill");
    pill.textContent = category.name;
    applyCategoryColors(pill, category.color);

    card.querySelector(".todo-title").textContent = todo.title;
    const notes = card.querySelector(".todo-notes");
    notes.textContent = todo.notes || "No notes";
    notes.hidden = !todo.notes;

    if (linksMarkup.length) {
      card.append(linksWrap);
    }

    todoList.append(card);
  });
}

function renderArchive() {
  archiveList.innerHTML = "";

  if (!state.archive.length) {
    archiveList.append(emptyState("Completed todos will appear here with timestamps."));
    return;
  }

  const archiveItems = [...state.archive].sort((a, b) => (
    new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
  ));

  archiveItems.forEach((item) => {
    const category = getCategory(item.categoryId);
    const card = document.createElement("article");
    card.className = "archive-card";
    card.dataset.todoId = item.id;

    card.innerHTML = `
      <div class="archive-topline">
        <div>
          <div class="category-pill"></div>
          <h3 class="archive-title"></h3>
        </div>
      </div>
      <p class="archive-notes"></p>
      <div class="meta">
        <span>Added: ${formatDateTime(item.createdAt)}</span>
        <span>Completed: ${formatDateTime(item.completedAt)}</span>
      </div>
      <div class="archive-actions">
        <button class="icon-button" type="button" data-action="remove-archive" data-todo-id="${item.id}">Remove</button>
      </div>
    `;

    const pill = card.querySelector(".category-pill");
    pill.textContent = category.name;
    applyCategoryColors(pill, category.color);

    card.querySelector(".archive-title").textContent = item.title;
    const notes = card.querySelector(".archive-notes");
    notes.textContent = item.notes || "No notes";
    notes.hidden = !item.notes;

    archiveList.append(card);
  });
}

function populateCategorySelects() {
  const currentTodoValue = todoCategory.value;
  const currentLinkValue = linkCategory.value;

  [todoCategory, linkCategory].forEach((select) => {
    select.innerHTML = "";
    state.categories.forEach((category) => {
      const option = document.createElement("option");
      option.value = category.id;
      option.textContent = category.name;
      select.append(option);
    });
  });

  todoCategory.value = currentTodoValue || state.categories[0]?.id || "";
  linkCategory.value = currentLinkValue || state.categories[0]?.id || "";
}

function completeTodo(todoId) {
  const index = state.todos.findIndex((todo) => todo.id === todoId);
  if (index === -1) {
    return;
  }

  const [todo] = state.todos.splice(index, 1);
  state.archive.push({
    ...todo,
    completedAt: new Date().toISOString()
  });

  persist();
  render();
}

function deleteTodo(todoId) {
  state.todos = state.todos.filter((todo) => todo.id !== todoId);
  persist();
  render();
}

function reorderTodos(draggedId, targetId) {
  const draggedIndex = state.todos.findIndex((todo) => todo.id === draggedId);
  const targetIndex = state.todos.findIndex((todo) => todo.id === targetId);

  if (draggedIndex === -1 || targetIndex === -1) {
    return;
  }

  const [draggedTodo] = state.todos.splice(draggedIndex, 1);
  state.todos.splice(targetIndex, 0, draggedTodo);
  persist();
  render();
}

function getCategory(categoryId) {
  return state.categories.find((category) => category.id === categoryId) || state.categories[0];
}

function getCategoryName(categoryId) {
  return getCategory(categoryId)?.name || "Uncategorized";
}

function applyCategoryColors(element, color, solid = false) {
  const theme = color || "#1d8f6a";
  element.style.background = solid ? theme : `${theme}22`;
  element.style.color = solid ? "#ffffff" : theme;
  element.style.border = solid ? "none" : `1px solid ${theme}55`;
}

function loadState() {
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    return {
      categories: cloneData(defaultCategories),
      todos: [],
      archive: []
    };
  }

  try {
    const parsed = JSON.parse(saved);
    const categories = Array.isArray(parsed.categories) && parsed.categories.length
      ? parsed.categories
      : cloneData(defaultCategories);

    return {
      categories,
      todos: Array.isArray(parsed.todos) ? parsed.todos : [],
      archive: Array.isArray(parsed.archive) ? parsed.archive : []
    };
  } catch {
    return {
      categories: cloneData(defaultCategories),
      todos: [],
      archive: []
    };
  }
}

function persist() {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function csvEscape(value) {
  const normalized = String(value ?? "");
  return `"${normalized.replaceAll('"', '""')}"`;
}

function emptyState(message) {
  const fragment = emptyStateTemplate.content.firstElementChild.cloneNode(true);
  fragment.querySelector("p").textContent = message;
  return fragment;
}

function clearDragState() {
  document.querySelectorAll(".todo-card").forEach((card) => {
    card.classList.remove("dragging", "drop-target");
  });
  dragState = null;
  document.body.style.userSelect = "";
}
