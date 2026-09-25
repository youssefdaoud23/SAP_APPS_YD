(() => {
  'use strict';

  let overlay = null;
  let selectedWorkflow = null;
  let observer = null;
  let decorating = false;

  function esc(value = '') {
    return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]));
  }

  function attr(value = '') { return esc(value).replace(/`/g, '&#96;'); }

  async function request(url, options = {}) {
    const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin', ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
    let body = {};
    try { body = await response.json(); } catch {}
    if (!response.ok) throw new Error(body.error || `${response.status} ${response.statusText}`);
    return { body, response };
  }

  function toast(message, type = 'info') {
    let stack = document.getElementById('v09-workflow-toasts');
    if (!stack) {
      stack = document.createElement('div');
      stack.id = 'v09-workflow-toasts';
      stack.className = 'toast-stack';
      document.body.appendChild(stack);
    }
    const node = document.createElement('div');
    node.className = `toast ${type}`;
    node.textContent = message;
    stack.appendChild(node);
    setTimeout(() => node.remove(), 3200);
  }

  function closeOverlay() {
    overlay?.remove();
    overlay = null;
    selectedWorkflow = null;
  }

  function showOverlay(title, body) {
    closeOverlay();
    const node = document.createElement('div');
    node.className = 'v09-workflow-overlay';
    node.innerHTML = `<div class="v09-workflow-window"><header><div><strong>${esc(title)}</strong><small>Durable PostgreSQL workflow runtime</small></div><span></span><button class="btn small" data-v09-wf-close>Close</button></header><main>${body}</main></div>`;
    document.body.appendChild(node);
    overlay = node;
    node.querySelector('[data-v09-wf-close]')?.addEventListener('click', closeOverlay);
    return node;
  }

  function defaultSteps() {
    return [
      { id: 'start', type: 'start', next: 'review' },
      { id: 'review', type: 'approval', title: 'Approval required', description: 'Review request from {{actor}}', assignedRole: 'platform-admin', choices: ['approve','reject'], approveNext: 'approved', rejectNext: 'rejected', dueHours: 48 },
      { id: 'approved', type: 'set', values: { status: 'Approved' }, next: 'end' },
      { id: 'rejected', type: 'set', values: { status: 'Rejected' }, next: 'end' },
      { id: 'end', type: 'end', result: { status: '{{data.status}}' } }
    ];
  }

  function workflowCard(workflow) {
    return `<button class="v09-wf-list-item ${selectedWorkflow?.id===workflow.id?'active':''}" data-v09-wf-id="${attr(workflow.id)}"><span><strong>${esc(workflow.name)}</strong><small>/${esc(workflow.slug)}</small></span><em class="status ${esc(workflow.status)}">${esc(workflow.status)}</em></button>`;
  }

  function stepCard(step, index) {
    const links = [step.next, step.then, step.else, step.approveNext, step.rejectNext].filter(Boolean);
    return `<div class="v09-wf-step ${esc(step.type)}"><div class="v09-wf-step-num">${index + 1}</div><div><strong>${esc(step.id)}</strong><span>${esc(step.type)}</span><small>${esc(step.title || step.description || '')}</small>${links.length?`<em>→ ${esc(links.join(' / '))}</em>`:''}</div></div>`;
  }

  function editorHtml(workflow) {
    if (!workflow) return `<section class="v09-wf-empty"><div>◇</div><strong>Select a workflow</strong><p>Create a workflow or select one from the registry to edit its definition.</p></section>`;
    return `<section class="v09-wf-editor" data-v09-editor>
      <div class="v09-wf-form-grid">
        <label>Name<input id="v09-wf-name" value="${attr(workflow.name)}"></label>
        <label>Slug<input id="v09-wf-slug" value="${attr(workflow.slug)}"></label>
        <label>Status<select id="v09-wf-status"><option value="draft" ${workflow.status==='draft'?'selected':''}>Draft</option><option value="published" ${workflow.status==='published'?'selected':''}>Published</option><option value="disabled" ${workflow.status==='disabled'?'selected':''}>Disabled</option></select></label>
        <label>Revision<input value="${attr(workflow.revision)}" disabled></label>
      </div>
      <label class="v09-wf-block">Description<textarea id="v09-wf-description">${esc(workflow.description || '')}</textarea></label>
      <div class="v09-wf-section-head"><div><strong>Visual pipeline</strong><small>Execution follows the explicit step links.</small></div><div class="v09-wf-actions"><button class="btn small" data-v09-template-approval>Approval template</button><button class="btn small" data-v09-template-task>Task template</button></div></div>
      <div class="v09-wf-pipeline">${(workflow.steps || []).map(stepCard).join('')}</div>
      <details class="v09-wf-advanced"><summary>Advanced definition</summary>
        <label class="v09-wf-block">Input schema JSON<textarea id="v09-wf-schema" class="v09-code">${esc(JSON.stringify(workflow.inputSchema || {}, null, 2))}</textarea></label>
        <label class="v09-wf-block">Steps JSON<textarea id="v09-wf-steps" class="v09-code tall">${esc(JSON.stringify(workflow.steps || [], null, 2))}</textarea></label>
      </details>
      <div class="v09-wf-footer"><button class="btn danger" data-v09-wf-delete>Delete</button><span></span><button class="btn" data-v09-wf-refresh>Reload</button>${workflow.status==='published'?'<button class="btn" data-v09-wf-start>Start test instance</button>':''}<button class="btn primary" data-v09-wf-save>Save workflow</button></div>
    </section>`;
  }

  async function renderDesigner(selectId = null) {
    try {
      const [{ body: listBody }, { body: instancesBody }] = await Promise.all([
        request('/api/workflows'),
        request('/api/workflows?instances=true&limit=50')
      ]);
      const workflows = listBody.workflows || [];
      if (selectId) {
        try { selectedWorkflow = (await request(`/api/workflows?id=${encodeURIComponent(selectId)}`)).body; }
        catch { selectedWorkflow = null; }
      } else if (selectedWorkflow) {
        selectedWorkflow = workflows.find(item => item.id === selectedWorkflow.id) || null;
      }
      const node = showOverlay('Workflow Designer', `
        <div class="v09-wf-layout">
          <aside><div class="v09-wf-sidebar-head"><strong>Workflows</strong><button class="btn small primary" data-v09-wf-new>+ New</button></div><div class="v09-wf-list">${workflows.map(workflowCard).join('') || '<p>No workflows yet.</p>'}</div><div class="v09-wf-sidebar-head secondary"><strong>Recent instances</strong><span>${(instancesBody.instances || []).length}</span></div><div class="v09-wf-instances">${(instancesBody.instances || []).slice(0,20).map(item=>`<div><span class="status ${esc(item.status)}">${esc(item.status)}</span><strong>${esc(item.workflowName || item.workflowId)}</strong><small>${esc(item.startedBy || '')}</small></div>`).join('') || '<p>No instances yet.</p>'}</div></aside>
          ${editorHtml(selectedWorkflow)}
        </div>`);
      wireDesigner(node, workflows);
    } catch (error) {
      showOverlay('Workflow Designer', `<div class="v09-wf-error"><strong>Workflow Designer unavailable</strong><p>${esc(error.message)}</p><p>PostgreSQL and the workflows.manage permission are required.</p></div>`);
    }
  }

  function parseJson(id, label) {
    const value = overlay?.querySelector(id)?.value || '';
    try { return JSON.parse(value); }
    catch { throw new Error(`${label} contains invalid JSON.`); }
  }

  function readEditor() {
    return {
      name: overlay.querySelector('#v09-wf-name').value.trim(),
      slug: overlay.querySelector('#v09-wf-slug').value.trim(),
      description: overlay.querySelector('#v09-wf-description').value.trim(),
      status: overlay.querySelector('#v09-wf-status').value,
      inputSchema: parseJson('#v09-wf-schema', 'Input schema'),
      steps: parseJson('#v09-wf-steps', 'Steps'),
      revision: selectedWorkflow.revision
    };
  }

  function setSteps(steps) {
    const editor = overlay?.querySelector('#v09-wf-steps');
    if (!editor) return;
    editor.value = JSON.stringify(steps, null, 2);
  }

  function wireDesigner(node, workflows) {
    node.querySelector('[data-v09-wf-new]')?.addEventListener('click', async () => {
      try {
        const stamp = Date.now().toString(36).slice(-5);
        const created = (await request('/api/workflows', { method: 'POST', body: JSON.stringify({ name: 'New Approval Workflow', slug: `approval-${stamp}`, status: 'draft', description: 'Business approval workflow.', inputSchema: {}, steps: defaultSteps() }) })).body;
        selectedWorkflow = created;
        toast('Workflow created', 'success');
        await renderDesigner(created.id);
      } catch (error) { toast(error.message, 'error'); }
    });
    node.querySelectorAll('[data-v09-wf-id]').forEach(button => button.addEventListener('click', () => renderDesigner(button.dataset.v09WfId)));
    node.querySelector('[data-v09-wf-refresh]')?.addEventListener('click', () => renderDesigner(selectedWorkflow?.id));
    node.querySelector('[data-v09-template-approval]')?.addEventListener('click', () => setSteps(defaultSteps()));
    node.querySelector('[data-v09-template-task]')?.addEventListener('click', () => setSteps([
      { id:'start', type:'start', next:'task' },
      { id:'task', type:'user-task', title:'Complete business task', description:'Task started by {{actor}}', assignedRole:'developer', choices:['complete'], next:'end', dueHours:24 },
      { id:'end', type:'end', result:{ result:'Completed' } }
    ]));
    node.querySelector('[data-v09-wf-save]')?.addEventListener('click', async () => {
      try {
        const input = readEditor();
        const saved = (await request(`/api/workflows?id=${encodeURIComponent(selectedWorkflow.id)}`, { method: 'PUT', headers: { 'If-Match': `W/"workflow-${selectedWorkflow.revision}"` }, body: JSON.stringify(input) })).body;
        selectedWorkflow = saved;
        toast('Workflow saved', 'success');
        await renderDesigner(saved.id);
      } catch (error) { toast(error.message, 'error'); }
    });
    node.querySelector('[data-v09-wf-delete]')?.addEventListener('click', async () => {
      if (!selectedWorkflow || !confirm(`Delete workflow ${selectedWorkflow.name}?`)) return;
      try {
        await request(`/api/workflows?id=${encodeURIComponent(selectedWorkflow.id)}`, { method: 'DELETE' });
        selectedWorkflow = null;
        toast('Workflow deleted', 'success');
        await renderDesigner();
      } catch (error) { toast(error.message, 'error'); }
    });
    node.querySelector('[data-v09-wf-start]')?.addEventListener('click', () => showStartDialog(selectedWorkflow));
  }

  function showStartDialog(workflow) {
    const parent = overlay;
    const dialog = document.createElement('div');
    dialog.className = 'v09-mini-backdrop';
    dialog.innerHTML = `<div class="v09-mini"><header><strong>Start ${esc(workflow.name)}</strong><button class="btn small" data-close>×</button></header><label>Input JSON<textarea class="v09-code">{}</textarea></label><div><button class="btn" data-close>Cancel</button><button class="btn primary" data-start>Start</button></div></div>`;
    parent.appendChild(dialog);
    dialog.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => dialog.remove()));
    dialog.querySelector('[data-start]').addEventListener('click', async () => {
      try {
        const input = JSON.parse(dialog.querySelector('textarea').value || '{}');
        const result = (await request(`/runtime/workflows/${encodeURIComponent(workflow.slug)}/start`, { method: 'POST', body: JSON.stringify(input) })).body;
        dialog.remove();
        toast(`Workflow instance ${result.instance?.status || 'started'}`, 'success');
        await renderDesigner(workflow.id);
      } catch (error) { toast(error.message, 'error'); }
    });
  }

  async function renderTasks(includeCompleted = false) {
    try {
      const { body } = await request(`/runtime/tasks${includeCompleted?'?includeCompleted=true':''}`);
      const tasks = body.tasks || [];
      const node = showOverlay('My Tasks', `
        <div class="v09-task-toolbar"><div><strong>Task Inbox</strong><small>Tasks assigned directly, by role, or unassigned</small></div><label><input type="checkbox" data-v09-show-completed ${includeCompleted?'checked':''}> Show completed</label><button class="btn small" data-v09-task-refresh>Refresh</button></div>
        <div class="v09-task-list">${tasks.map(taskHtml).join('') || '<div class="v09-wf-empty"><div>✓</div><strong>Inbox is clear</strong><p>No workflow tasks are currently assigned to you.</p></div>'}</div>`);
      node.querySelector('[data-v09-task-refresh]')?.addEventListener('click', () => renderTasks(includeCompleted));
      node.querySelector('[data-v09-show-completed]')?.addEventListener('change', event => renderTasks(event.target.checked));
      node.querySelectorAll('[data-v09-task-action]').forEach(button => button.addEventListener('click', () => completeTask(button.dataset.taskId, button.dataset.v09TaskAction, includeCompleted)));
    } catch (error) {
      showOverlay('My Tasks', `<div class="v09-wf-error"><strong>Task Inbox unavailable</strong><p>${esc(error.message)}</p></div>`);
    }
  }

  function taskHtml(task) {
    const overdue = task.dueAt && new Date(task.dueAt).getTime() < Date.now() && task.status === 'open';
    const choices = task.status === 'open' ? (task.choices?.length ? task.choices : ['complete']) : [];
    return `<article class="v09-task ${overdue?'overdue':''}"><div class="v09-task-main"><span class="status ${esc(task.status)}">${esc(task.status)}</span><div><strong>${esc(task.title)}</strong><p>${esc(task.description || '')}</p><small>${esc(task.workflowName || '')} · ${esc(task.stepId)}${task.assignedTo?` · ${esc(task.assignedTo)}`:task.assignedRole?` · role:${esc(task.assignedRole)}`:''}${task.dueAt?` · due ${esc(new Date(task.dueAt).toLocaleString())}`:''}</small></div></div>${choices.length?`<div class="v09-task-actions">${choices.map(choice=>`<button class="btn small ${choice==='approve'?'primary':choice==='reject'?'danger':''}" data-v09-task-action="${attr(choice)}" data-task-id="${attr(task.id)}">${esc(choice[0].toUpperCase()+choice.slice(1))}</button>`).join('')}</div>`:''}${task.resolution?`<div class="v09-task-resolution">Resolved: <strong>${esc(task.resolution)}</strong> by ${esc(task.completedBy || '')}</div>`:''}</article>`;
  }

  async function completeTask(id, resolution, includeCompleted) {
    try {
      await request(`/runtime/tasks/${encodeURIComponent(id)}/complete`, { method: 'POST', body: JSON.stringify({ resolution, payload: {} }) });
      toast(`Task ${resolution}`, 'success');
      await renderTasks(includeCompleted);
    } catch (error) { toast(error.message, 'error'); }
  }

  function injectNavigation() {
    const nav = document.querySelector('.sidebar .nav');
    if (!nav || nav.querySelector('[data-v09-workflows]')) return;
    const workflow = document.createElement('button');
    workflow.className = 'nav-button';
    workflow.dataset.v09Workflows = 'true';
    workflow.innerHTML = '<span class="nav-icon">◇</span><span>Workflows</span>';
    const tasks = document.createElement('button');
    tasks.className = 'nav-button';
    tasks.dataset.v09Tasks = 'true';
    tasks.innerHTML = '<span class="nav-icon">✓</span><span>My Tasks</span>';
    nav.append(workflow, tasks);
    workflow.addEventListener('click', () => renderDesigner());
    tasks.addEventListener('click', () => renderTasks(false));
  }

  function injectCss() {
    if (document.getElementById('v09-workflow-css')) return;
    const style = document.createElement('style');
    style.id = 'v09-workflow-css';
    style.textContent = `
      .v09-workflow-overlay{position:fixed;inset:0;z-index:16000;background:rgba(9,17,27,.68);backdrop-filter:blur(5px);padding:3vh 3vw;overflow:auto}.v09-workflow-window{width:min(1440px,96vw);height:min(900px,94vh);margin:auto;background:var(--surface);border:1px solid var(--line);border-radius:18px;box-shadow:var(--shadow-lg);display:grid;grid-template-rows:auto 1fr;overflow:hidden}.v09-workflow-window>header{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:12px;padding:14px 18px;border-bottom:1px solid var(--line);background:var(--surface)}.v09-workflow-window>header>div{display:grid}.v09-workflow-window>header small{font-size:9px;color:var(--muted);margin-top:2px}.v09-workflow-window>main{min-height:0;overflow:auto}
      .v09-wf-layout{height:100%;display:grid;grid-template-columns:280px minmax(0,1fr)}.v09-wf-layout>aside{border-right:1px solid var(--line);background:var(--surface-2);padding:12px;overflow:auto}.v09-wf-sidebar-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:5px 2px 10px}.v09-wf-sidebar-head.secondary{margin-top:18px;border-top:1px solid var(--line);padding-top:13px}.v09-wf-list{display:grid;gap:5px}.v09-wf-list-item{width:100%;border:1px solid var(--line);background:var(--surface);color:var(--text);border-radius:9px;padding:9px;text-align:left;display:flex;justify-content:space-between;align-items:center;gap:8px}.v09-wf-list-item.active{border-color:var(--blue);box-shadow:0 0 0 2px color-mix(in srgb,var(--blue) 14%,transparent)}.v09-wf-list-item span{display:grid;gap:2px}.v09-wf-list-item small{color:var(--muted);font-size:8px}.v09-wf-list-item em{font-style:normal}.v09-wf-instances{display:grid;gap:6px}.v09-wf-instances>div{display:grid;grid-template-columns:auto 1fr;gap:3px 7px;align-items:center;padding:7px;background:var(--surface);border:1px solid var(--line);border-radius:8px;font-size:9px}.v09-wf-instances small{grid-column:2;color:var(--muted)}
      .v09-wf-editor{padding:18px 22px;overflow:auto}.v09-wf-form-grid{display:grid;grid-template-columns:2fr 1.2fr 1fr .7fr;gap:10px}.v09-wf-editor label{display:grid;gap:5px;font-size:10px;font-weight:700}.v09-wf-editor input,.v09-wf-editor select,.v09-wf-editor textarea{border:1px solid var(--line-2);border-radius:8px;background:var(--surface);color:var(--text);padding:8px;font:inherit}.v09-wf-block{margin-top:12px}.v09-wf-block textarea{min-height:70px}.v09-wf-section-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:18px 0 10px}.v09-wf-section-head>div:first-child{display:grid}.v09-wf-section-head small{color:var(--muted);font-size:9px}.v09-wf-actions{display:flex;gap:6px}.v09-wf-pipeline{display:flex;align-items:stretch;gap:8px;overflow:auto;padding:4px 2px 12px}.v09-wf-step{min-width:170px;display:grid;grid-template-columns:26px 1fr;gap:8px;border:1px solid var(--line);background:var(--surface-2);border-radius:10px;padding:10px}.v09-wf-step-num{width:24px;height:24px;border-radius:50%;display:grid;place-items:center;background:var(--surface);border:1px solid var(--line);font-size:9px;font-weight:800}.v09-wf-step>div:last-child{display:grid;gap:3px;align-content:start}.v09-wf-step span{font-size:8px;color:var(--blue);text-transform:uppercase;font-weight:800}.v09-wf-step small{font-size:9px;color:var(--muted);white-space:normal}.v09-wf-step em{font-size:8px;color:var(--muted);font-style:normal}.v09-wf-step.approval{border-color:#d7b45a}.v09-wf-step.end{border-color:#78b89a}.v09-wf-advanced{margin-top:12px;border:1px solid var(--line);border-radius:10px;padding:10px}.v09-wf-advanced summary{cursor:pointer;font-size:10px;font-weight:800}.v09-code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace!important;font-size:10px!important;line-height:1.5}.v09-code.tall{min-height:290px!important}.v09-wf-footer{display:grid;grid-template-columns:auto 1fr auto auto auto;gap:8px;margin-top:16px;padding-top:14px;border-top:1px solid var(--line)}
      .v09-wf-empty,.v09-wf-error{margin:auto;max-width:600px;text-align:center;padding:60px 20px;color:var(--muted)}.v09-wf-empty>div{font-size:42px;margin-bottom:8px}.v09-wf-empty strong,.v09-wf-error strong{display:block;color:var(--text);font-size:14px}.v09-wf-empty p,.v09-wf-error p{font-size:10px;line-height:1.6}.v09-wf-error strong{color:var(--red)}
      .v09-mini-backdrop{position:absolute;inset:0;background:rgba(9,17,27,.5);display:grid;place-items:center;z-index:3}.v09-mini{width:min(620px,90vw);background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:15px;box-shadow:var(--shadow-lg)}.v09-mini header,.v09-mini>div{display:flex;align-items:center;justify-content:space-between;gap:8px}.v09-mini label{display:grid;gap:6px;font-size:10px;margin:13px 0}.v09-mini textarea{min-height:180px;border:1px solid var(--line);border-radius:8px;padding:9px;background:var(--surface-2);color:var(--text)}
      .v09-task-toolbar{display:flex;align-items:center;gap:14px;padding:14px 18px;border-bottom:1px solid var(--line);position:sticky;top:0;background:var(--surface);z-index:2}.v09-task-toolbar>div{display:grid;flex:1}.v09-task-toolbar small{color:var(--muted);font-size:9px}.v09-task-toolbar label{font-size:10px;display:flex;align-items:center;gap:5px}.v09-task-list{padding:16px;display:grid;gap:9px}.v09-task{border:1px solid var(--line);border-radius:11px;padding:12px;background:var(--surface)}.v09-task.overdue{border-left:4px solid var(--red)}.v09-task-main{display:grid;grid-template-columns:auto 1fr;gap:10px;align-items:start}.v09-task-main strong{font-size:12px}.v09-task-main p{font-size:10px;color:var(--muted);margin:4px 0}.v09-task-main small{font-size:8px;color:var(--muted)}.v09-task-actions{display:flex;gap:6px;justify-content:flex-end;margin-top:10px;padding-top:9px;border-top:1px solid var(--line)}.v09-task-resolution{font-size:9px;color:var(--muted);margin-top:8px}
      @media(max-width:900px){.v09-workflow-overlay{padding:0}.v09-workflow-window{width:100vw;height:100vh;border-radius:0}.v09-wf-layout{grid-template-columns:1fr}.v09-wf-layout>aside{max-height:260px;border-right:0;border-bottom:1px solid var(--line)}.v09-wf-form-grid{grid-template-columns:1fr 1fr}.v09-wf-pipeline{flex-direction:column}.v09-wf-step{min-width:0}.v09-wf-footer{grid-template-columns:1fr 1fr}.v09-wf-footer span{display:none}}
    `;
    document.head.appendChild(style);
  }

  function decorate() {
    if (decorating) return;
    decorating = true;
    try { injectCss(); injectNavigation(); }
    finally { decorating = false; }
  }

  const app = document.getElementById('app');
  observer = new MutationObserver(() => {
    if (!decorating) requestAnimationFrame(decorate);
  });
  if (app) observer.observe(app, { childList: true, subtree: true });
  decorate();
})();
