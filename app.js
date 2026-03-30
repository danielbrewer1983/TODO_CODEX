const STORAGE_KEY = "mobile-todo-board-v1";
const createId = () => globalThis.crypto?.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const cloneData = (value) => globalThis.structuredClone ? structuredClone(value) : JSON.parse(JSON.stringify(value));

const defaultCategories = [
  {
    id: createId(),
    name: "General",
    color: "#1d8f6a",
    links: [
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
  },
  {
    id: createId(),
    name: "MOOSE",
    color: "#7c5c3b",
    links: []
  },
  {
    id: createId(),
    name: "FAMILY",
    color: "#c1607a",
    links: []
  },
  {
    id: createId(),
    name: "HOME",
    color: "#4b7f52",
    links: []
  },
  {
    id: createId(),
    name: "HEALTH",
    color: "#3b7ca5",
    links: []
  }
];

const state = loadState();
ensureDefaultCategories();
ensureTodoNumbers();

const todoForm = document.querySelector("#todoForm");
const todoList = document.querySelector("#todoList");
const archiveList = document.querySelector("#archiveList");
const activeCount = document.querySelector("#activeCount");
const archiveCount = document.querySelector("#archiveCount");
const todoCategory = document.querySelector("#todoCategory");
const exportCsvButton = document.querySelector("#exportCsvButton");
const emptyStateTemplate = document.querySelector("#emptyStateTemplate");

let dragState = null;

render();

todoForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(todoForm);
  const title = formData.get("title").toString().trim();
  const categoryId = formData.get("categoryId").toString();

  if (!title) {
    return;
  }

  state.todos.push({
    id: createId(),
    itemNumber: getNextTodoNumber(),
    title,
    categoryId,
    createdAt: new Date().toISOString()
  });

  persist();
  todoForm.reset();
  document.querySelector("#todoTitle").focus();
  render();
});

exportCsvButton.addEventListener("click", () => {
  if (!state.archive.length) {
    window.alert("There are no completed items to export yet.");
    return;
  }

  const header = ["Title", "Category", "Created At", "Completed At"];
  const rows = state.archive.map((item) => [
    formatTodoLabel(item),
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

todoList.addEventListener("change", (event) => {
  const checkbox = event.target.closest("input[data-action='complete']");
  if (!checkbox || !checkbox.checked) {
    return;
  }

  completeTodo(checkbox.dataset.todoId);
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
    pointerId: event.pointerId,
    sourceCategoryId: card.dataset.categoryId
  };
  card.classList.add("dragging");
  document.body.style.userSelect = "none";
});

window.addEventListener("pointermove", (event) => {
  if (!dragState || dragState.pointerId !== event.pointerId) {
    return;
  }

  const hoveredCard = document.elementFromPoint(event.clientX, event.clientY)?.closest(".todo-card");
  const hoveredGroup = document.elementFromPoint(event.clientX, event.clientY)?.closest(".todo-group");
  document.querySelectorAll(".todo-card").forEach((card) => {
    card.classList.remove("drop-target");
  });
  document.querySelectorAll(".todo-group").forEach((group) => {
    group.classList.remove("group-drop-target");
  });

  if (hoveredCard && hoveredCard.dataset.todoId !== dragState.todoId) {
    hoveredCard.classList.add("drop-target");
  } else if (hoveredGroup && hoveredGroup.dataset.categoryId !== dragState.sourceCategoryId) {
    hoveredGroup.classList.add("group-drop-target");
  }
});

window.addEventListener("pointerup", (event) => {
  if (!dragState || dragState.pointerId !== event.pointerId) {
    return;
  }

  const draggedId = dragState.todoId;
  const dropPointElement = document.elementFromPoint(event.clientX, event.clientY);
  const targetCard = dropPointElement?.closest(".todo-card");
  const targetGroup = dropPointElement?.closest(".todo-group");

  document.querySelectorAll(".todo-card").forEach((card) => {
    card.classList.remove("dragging", "drop-target");
  });
  document.querySelectorAll(".todo-group").forEach((group) => {
    group.classList.remove("group-drop-target");
  });

  if (targetCard && draggedId !== targetCard.dataset.todoId) {
    moveTodoRelative(draggedId, targetCard.dataset.todoId, targetCard.dataset.categoryId);
  } else if (targetGroup && targetGroup.dataset.categoryId) {
    moveTodoToCategoryEnd(draggedId, targetGroup.dataset.categoryId);
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

  const todosByCategory = new Map();
  state.todos.forEach((todo) => {
    const category = getCategory(todo.categoryId);
    if (!todosByCategory.has(category.id)) {
      todosByCategory.set(category.id, {
        category,
        todos: []
      });
    }
    todosByCategory.get(category.id).todos.push(todo);
  });

  state.categories.forEach((category) => {
    const group = todosByCategory.get(category.id) || { category, todos: [] };

    const section = document.createElement("section");
    section.className = "todo-group";
    section.dataset.categoryId = category.id;

    const heading = document.createElement("div");
    heading.className = "todo-group-header";

    const title = document.createElement("h3");
    title.className = "todo-group-title";
    title.textContent = category.name;
    applyCategoryColors(title, category.color);

    const count = document.createElement("span");
    count.className = "todo-group-count";
    count.textContent = `${group.todos.length}`;

    heading.append(title, count);
    section.append(heading);

    if (!group.todos.length) {
      const emptyDrop = document.createElement("div");
      emptyDrop.className = "todo-group-empty";
      emptyDrop.textContent = "Drop a todo here";
      section.append(emptyDrop);
      todoList.append(section);
      return;
    }

    group.todos.forEach((todo) => {
      const card = document.createElement("article");
      card.className = "todo-card";
      card.dataset.todoId = todo.id;
      card.dataset.categoryId = category.id;

      card.innerHTML = `
        <div class="todo-topline">
          <div class="todo-title-row">
            <label class="todo-check">
              <input type="checkbox" data-action="complete" data-todo-id="${todo.id}" aria-label="Complete ${escapeHtml(todo.title)}">
              <span></span>
            </label>
            <div>
              <h3 class="todo-title"></h3>
            </div>
          </div>
          <button class="drag-handle" type="button" aria-label="Drag to reorder">|||</button>
        </div>
      `;

      card.querySelector(".todo-title").textContent = formatTodoLabel(todo);

      section.append(card);
    });

    todoList.append(section);
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
      <div class="meta">
        <span>Completed: ${formatDateTime(item.completedAt)}</span>
      </div>
    `;

    const pill = card.querySelector(".category-pill");
    pill.textContent = category.name;
    applyCategoryColors(pill, category.color);

    card.querySelector(".archive-title").textContent = formatTodoLabel(item);

    archiveList.append(card);
  });
}

function populateCategorySelects() {
  const currentTodoValue = todoCategory.value;

  todoCategory.innerHTML = "";
  state.categories.forEach((category) => {
    const option = document.createElement("option");
    option.value = category.id;
    option.textContent = category.name;
    todoCategory.append(option);
  });

  todoCategory.value = currentTodoValue || state.categories[0]?.id || "";
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

function moveTodoRelative(draggedId, targetId, categoryId) {
  const draggedIndex = state.todos.findIndex((todo) => todo.id === draggedId);
  const targetIndex = state.todos.findIndex((todo) => todo.id === targetId);

  if (draggedIndex === -1 || targetIndex === -1) {
    return;
  }

  const [draggedTodo] = state.todos.splice(draggedIndex, 1);
  draggedTodo.categoryId = categoryId;
  const adjustedTargetIndex = state.todos.findIndex((todo) => todo.id === targetId);
  state.todos.splice(adjustedTargetIndex, 0, draggedTodo);
  persist();
  render();
}

function moveTodoToCategoryEnd(todoId, categoryId) {
  const draggedIndex = state.todos.findIndex((todo) => todo.id === todoId);
  if (draggedIndex === -1) {
    return;
  }

  const [draggedTodo] = state.todos.splice(draggedIndex, 1);
  draggedTodo.categoryId = categoryId;

  const insertAfterIndex = findLastIndex(state.todos, (todo) => todo.categoryId === categoryId);
  if (insertAfterIndex === -1) {
    state.todos.push(draggedTodo);
  } else {
    state.todos.splice(insertAfterIndex + 1, 0, draggedTodo);
  }

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
  element.style.background = solid ? theme : "transparent";
  element.style.color = solid ? "#ffffff" : theme;
  element.style.border = "none";
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

function ensureDefaultCategories() {
  const existingNames = new Set(state.categories.map((category) => category.name.toUpperCase()));
  let changed = false;

  defaultCategories.forEach((category) => {
    if (!existingNames.has(category.name.toUpperCase())) {
      state.categories.push(cloneData(category));
      changed = true;
    }
  });

  if (changed) {
    persist();
  }
}

function ensureTodoNumbers() {
  let nextNumber = 10;
  let changed = false;
  const allItems = [...state.todos, ...state.archive];

  allItems.forEach((item) => {
    if (typeof item.itemNumber === "number") {
      nextNumber = Math.max(nextNumber, item.itemNumber + 1);
    }
  });

  allItems.forEach((item) => {
    if (typeof item.itemNumber !== "number") {
      item.itemNumber = nextNumber;
      nextNumber += 1;
      changed = true;
    }
  });

  if (changed) {
    persist();
  }
}

function getNextTodoNumber() {
  return [...state.todos, ...state.archive].reduce((maxNumber, item) => {
    if (typeof item.itemNumber === "number") {
      return Math.max(maxNumber, item.itemNumber);
    }
    return maxNumber;
  }, 9) + 1;
}

function formatTodoLabel(item) {
  return `#${item.itemNumber} ${item.title}`;
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

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function findLastIndex(items, predicate) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index], index)) {
      return index;
    }
  }
  return -1;
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
  document.querySelectorAll(".todo-group").forEach((group) => {
    group.classList.remove("group-drop-target");
  });
  dragState = null;
  document.body.style.userSelect = "";
}
