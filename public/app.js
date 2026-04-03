// State
let departments = [];
let plans = [];
let currentView = "dashboard";
let editingPlan = null;

const main = document.getElementById("main-content");
const modalOverlay = document.getElementById("modal-overlay");
const modal = document.getElementById("modal");

// Nav
document.querySelectorAll("[data-view]").forEach(a => {
  a.addEventListener("click", e => {
    e.preventDefault();
    currentView = a.dataset.view;
    document.querySelectorAll("[data-view]").forEach(x => x.classList.remove("active"));
    document.querySelectorAll(`[data-view="${currentView}"]`).forEach(x => x.classList.add("active"));
    render();
  });
});

// API
async function api(path, opts) {
  const r = await fetch("api" + path, { headers: { "Content-Type": "application/json" }, ...opts });
  return r.json();
}
const loadData = async () => {
  [departments, plans] = await Promise.all([api("/departments"), api("/plans")]);
};

// Render router
async function render() {
  await loadData();
  const views = { dashboard: renderDashboard, company: () => renderPlans("company"), department: () => renderPlans("department"),
    weekly: () => renderByPeriod("week"), monthly: () => renderByPeriod("month"), yearly: () => renderByPeriod("year"), departments: renderDepartments };
  (views[currentView] || renderDashboard)();
}

// Dashboard
function renderDashboard() {
  const total = plans.length;
  const inProg = plans.filter(p => p.status === "in-progress").length;
  const completed = plans.filter(p => p.status === "completed").length;
  const avgProg = total ? Math.round(plans.reduce((s, p) => s + p.progress, 0) / total) : 0;
  const companyPlans = plans.filter(p => p.scope === "company").length;
  const deptPlans = plans.filter(p => p.scope === "department").length;

  main.innerHTML = `
    <div class="page-header"><h1>📊 Operations Dashboard</h1>
      <button class="btn btn-primary" onclick="openNewPlan()">+ New Plan</button></div>
    <div class="stats-grid">
      <div class="stat-card"><div class="label">Total Plans</div><div class="value">${total}</div><div class="sub">${companyPlans} company · ${deptPlans} department</div></div>
      <div class="stat-card"><div class="label">In Progress</div><div class="value" style="color:var(--primary)">${inProg}</div></div>
      <div class="stat-card"><div class="label">Completed</div><div class="value" style="color:var(--success)">${completed}</div></div>
      <div class="stat-card"><div class="label">Avg Progress</div><div class="value">${avgProg}%</div>
        <div class="progress-bar"><div class="fill" style="width:${avgProg}%;background:var(--primary)"></div></div></div>
    </div>
    <h2 style="margin-bottom:16px">Recent Plans</h2>
    <div class="plans-grid">${plans.slice(0, 6).map(planCard).join("") || emptyState("No plans yet")}</div>`;
}

// Plans view
function renderPlans(scope) {
  const title = scope === "company" ? "🏢 Company Plans" : "👥 Department Plans";
  const filtered = plans.filter(p => p.scope === scope);

  main.innerHTML = `
    <div class="page-header"><h1>${title}</h1>
      <button class="btn btn-primary" onclick="openNewPlan('${scope}')">+ New Plan</button></div>
    <div class="tabs">
      <button class="tab active" onclick="filterTab(this,'all')">All</button>
      <button class="tab" onclick="filterTab(this,'week')">Weekly</button>
      <button class="tab" onclick="filterTab(this,'month')">Monthly</button>
      <button class="tab" onclick="filterTab(this,'year')">Yearly</button>
    </div>
    <div class="plans-grid" id="plans-container">${filtered.map(planCard).join("") || emptyState("No " + scope + " plans")}</div>`;

  window._scopeFilter = scope;
}

function renderByPeriod(period) {
  const labels = { week: "📅 Weekly Plans", month: "🗓️ Monthly Plans", year: "📆 Yearly Plans" };
  const filtered = plans.filter(p => p.period === period);

  main.innerHTML = `
    <div class="page-header"><h1>${labels[period]}</h1>
      <button class="btn btn-primary" onclick="openNewPlan(null,'${period}')">+ New Plan</button></div>
    <div class="tabs">
      <button class="tab active" onclick="filterTab(this,'all')">All</button>
      <button class="tab" onclick="filterTab(this,'company')">Company</button>
      <button class="tab" onclick="filterTab(this,'department')">Department</button>
    </div>
    <div class="plans-grid" id="plans-container">${filtered.map(planCard).join("") || emptyState("No " + period + "ly plans")}</div>`;

  window._periodFilter = period;
}

// Tab filter
function filterTab(el, val) {
  el.parentElement.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  el.classList.add("active");
  let filtered = plans;
  if (window._scopeFilter) {
    filtered = filtered.filter(p => p.scope === window._scopeFilter);
    if (val !== "all") filtered = filtered.filter(p => p.period === val);
  } else if (window._periodFilter) {
    filtered = filtered.filter(p => p.period === window._periodFilter);
    if (val !== "all") filtered = filtered.filter(p => p.scope === val);
  }
  document.getElementById("plans-container").innerHTML = filtered.map(planCard).join("") || emptyState("No matching plans");
}

// Plan card HTML
function planCard(p) {
  const dept = p.department_name ? `<span class="dept-badge"><span class="dept-dot" style="background:${p.department_color}"></span>${p.department_name}</span>` : "";
  const objs = (p.objectives || []).slice(0, 3).map(o => `<div class="obj ${o.completed ? "done" : ""}">${o.text}</div>`).join("");
  const moreObjs = (p.objectives || []).length > 3 ? `<div class="obj" style="opacity:.5">+${p.objectives.length - 3} more</div>` : "";

  return `<div class="plan-card priority-${p.priority}" onclick="openEditPlan(${p.id})">
    <div class="card-header">
      <div class="card-title">${esc(p.title)}</div>
      <span class="status status-${p.status}">${p.status}</span>
    </div>
    <div class="card-desc">${esc(p.description)}</div>
    <div class="tags">
      <span class="tag tag-scope">${p.scope}</span>
      <span class="tag tag-period">${p.period}ly</span>
      ${dept}
    </div>
    ${p.period_label ? `<div style="font-size:.78rem;color:var(--text2);margin-bottom:6px">📌 ${esc(p.period_label)}</div>` : ""}
    <div class="progress-bar"><div class="fill" style="width:${p.progress}%;background:${p.progress >= 100 ? 'var(--success)' : 'var(--primary)'}"></div></div>
    <div style="font-size:.75rem;color:var(--text2);margin-top:4px">${p.progress}% complete</div>
    ${objs ? `<div class="objectives-list">${objs}${moreObjs}</div>` : ""}
  </div>`;
}

function emptyState(msg) {
  return `<div class="empty" style="grid-column:1/-1"><div class="icon">📋</div><p>${msg}</p><p style="margin-top:8px;font-size:.85rem">Click "+ New Plan" to get started</p></div>`;
}

// Departments view
function renderDepartments() {
  main.innerHTML = `
    <div class="page-header"><h1>⚙️ Departments</h1>
      <button class="btn btn-primary" onclick="openNewDept()">+ Add Department</button></div>
    <div class="dept-list">${departments.map(d => `
      <div class="dept-item">
        <div class="left"><div class="dept-color" style="background:${d.color}"></div><strong>${esc(d.name)}</strong>
          <span style="color:var(--text2);font-size:.82rem">${plans.filter(p=>p.department_id===d.id).length} plans</span></div>
        <button class="btn btn-sm btn-ghost" onclick="deleteDept(${d.id})">🗑️</button>
      </div>`).join("")}
    </div>`;
}

// Modal helpers
function openModal(html) { modal.innerHTML = html; modalOverlay.classList.add("active"); }
function closeModal() { modalOverlay.classList.remove("active"); editingPlan = null; }
modalOverlay.addEventListener("click", e => { if (e.target === modalOverlay) closeModal(); });

// New/Edit Plan
function openNewPlan(scope, period) {
  editingPlan = null;
  openPlanForm({ scope: scope || "company", period: period || "week", status: "planned", priority: "medium", progress: 0, objectives: [] });
}
function openEditPlan(id) {
  editingPlan = plans.find(p => p.id === id);
  if (editingPlan) openPlanForm(editingPlan);
}

function openPlanForm(p) {
  const deptOpts = departments.map(d => `<option value="${d.id}" ${p.department_id == d.id ? "selected" : ""}>${esc(d.name)}</option>`).join("");
  const objs = (p.objectives || []).map((o, i) => objRow(i, o.text, o.completed)).join("");

  openModal(`
    <h2>${editingPlan ? "Edit" : "New"} Plan</h2>
    <form id="plan-form" onsubmit="savePlan(event)">
      <div class="form-group"><label>Title *</label><input name="title" value="${esc(p.title || "")}" required></div>
      <div class="form-group"><label>Description</label><textarea name="description">${esc(p.description || "")}</textarea></div>
      <div class="form-row">
        <div class="form-group"><label>Scope *</label><select name="scope">
          <option value="company" ${p.scope==="company"?"selected":""}>Company</option>
          <option value="department" ${p.scope==="department"?"selected":""}>Department</option></select></div>
        <div class="form-group"><label>Department</label><select name="department_id">
          <option value="">— None —</option>${deptOpts}</select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Period *</label><select name="period">
          <option value="week" ${p.period==="week"?"selected":""}>Weekly</option>
          <option value="month" ${p.period==="month"?"selected":""}>Monthly</option>
          <option value="year" ${p.period==="year"?"selected":""}>Yearly</option></select></div>
        <div class="form-group"><label>Period Label *</label><input name="period_label" value="${esc(p.period_label || "")}" placeholder="e.g. Week 14, April 2026, FY2026" required></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Status</label><select name="status">
          <option value="planned" ${p.status==="planned"?"selected":""}>Planned</option>
          <option value="in-progress" ${p.status==="in-progress"?"selected":""}>In Progress</option>
          <option value="completed" ${p.status==="completed"?"selected":""}>Completed</option>
          <option value="cancelled" ${p.status==="cancelled"?"selected":""}>Cancelled</option></select></div>
        <div class="form-group"><label>Priority</label><select name="priority">
          <option value="low" ${p.priority==="low"?"selected":""}>Low</option>
          <option value="medium" ${p.priority==="medium"?"selected":""}>Medium</option>
          <option value="high" ${p.priority==="high"?"selected":""}>High</option>
          <option value="critical" ${p.priority==="critical"?"selected":""}>Critical</option></select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Start Date</label><input type="date" name="start_date" value="${p.start_date || ""}"></div>
        <div class="form-group"><label>End Date</label><input type="date" name="end_date" value="${p.end_date || ""}"></div>
      </div>
      <div class="form-group"><label>Progress (${p.progress || 0}%)</label>
        <input type="range" name="progress" min="0" max="100" value="${p.progress || 0}" oninput="this.previousElementSibling.textContent='Progress ('+this.value+'%)'"></div>
      <div class="form-group"><label>Key Objectives</label>
        <div class="obj-inputs" id="obj-inputs">${objs}</div>
        <button type="button" class="add-obj-btn" onclick="addObjRow()">+ Add Objective</button></div>
      <div class="form-actions">
        ${editingPlan ? `<button type="button" class="btn btn-danger" onclick="deletePlan(${editingPlan.id})">Delete</button>` : ""}
        <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">${editingPlan ? "Update" : "Create"} Plan</button>
      </div>
    </form>`);
}

let objCounter = 100;
function objRow(i, text, done) {
  const id = objCounter++;
  return `<div class="obj-row"><input type="checkbox" ${done?"checked":""} data-obj-check="${id}"><input data-obj-text="${id}" value="${esc(text || "")}" placeholder="Objective..."><button type="button" class="remove-obj" onclick="this.parentElement.remove()">✕</button></div>`;
}
function addObjRow() {
  document.getElementById("obj-inputs").insertAdjacentHTML("beforeend", objRow(objCounter, "", false));
}

async function savePlan(e) {
  e.preventDefault();
  const f = new FormData(e.target);
  const objectives = [];
  document.querySelectorAll(".obj-row").forEach(row => {
    const textEl = row.querySelector("[data-obj-text]");
    const checkEl = row.querySelector("[data-obj-check]");
    if (textEl && textEl.value.trim()) objectives.push({ text: textEl.value.trim(), completed: checkEl?.checked ? 1 : 0 });
  });

  const body = {
    title: f.get("title"), description: f.get("description"), scope: f.get("scope"),
    department_id: f.get("department_id") || null, period: f.get("period"), period_label: f.get("period_label"),
    status: f.get("status"), priority: f.get("priority"), progress: parseInt(f.get("progress")),
    start_date: f.get("start_date") || null, end_date: f.get("end_date") || null, objectives
  };

  if (editingPlan) {
    await api("/plans/" + editingPlan.id, { method: "PUT", body: JSON.stringify(body) });
  } else {
    await api("/plans", { method: "POST", body: JSON.stringify(body) });
  }
  closeModal();
  render();
}

async function deletePlan(id) {
  if (!confirm("Delete this plan?")) return;
  await api("/plans/" + id, { method: "DELETE" });
  closeModal();
  render();
}

// Departments
function openNewDept() {
  openModal(`<h2>New Department</h2>
    <form onsubmit="saveDept(event)">
      <div class="form-group"><label>Name</label><input name="name" required></div>
      <div class="form-group"><label>Color</label><input type="color" name="color" value="#3b82f6"></div>
      <div class="form-actions"><button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">Add</button></div>
    </form>`);
}
async function saveDept(e) {
  e.preventDefault();
  const f = new FormData(e.target);
  await api("/departments", { method: "POST", body: JSON.stringify({ name: f.get("name"), color: f.get("color") }) });
  closeModal(); render();
}
async function deleteDept(id) {
  if (!confirm("Delete department?")) return;
  await api("/departments/" + id, { method: "DELETE" });
  render();
}

function esc(s) { const d = document.createElement("div"); d.textContent = s || ""; return d.innerHTML; }

// Init
render();
