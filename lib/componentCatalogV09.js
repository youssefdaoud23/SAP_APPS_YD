(function(root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.InvartureComponentCatalogV09 = api;
    if (root.InvartureModel?.COMPONENTS) Object.assign(root.InvartureModel.COMPONENTS, api.COMPONENTS);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const COMPONENTS = Object.freeze({
    link: { group: 'Basic', label: 'Link', icon: '↗', bindable: true, defaults: { text: 'Open details', href: '#', target: '_self' } },
    icon: { group: 'Basic', label: 'Icon', icon: '◆', bindable: false, defaults: { symbol: '●', size: 28, label: '' } },
    avatar: { group: 'Basic', label: 'Avatar', icon: '◉', bindable: true, defaults: { initials: 'JD', name: 'Business User', subtitle: 'SAP user', size: 44 } },
    objectStatus: { group: 'Data', label: 'Object Status', icon: '●', bindable: true, defaults: { text: 'In Progress', state: 'information', icon: '' } },
    currency: { group: 'Data', label: 'Amount / Currency', icon: '€', bindable: true, defaults: { value: '12500.00', currency: 'EUR', label: 'Net value' } },
    progress: { group: 'Data', label: 'Progress', icon: '%', bindable: true, defaults: { value: 65, label: 'Completion', displayValue: '65%' } },
    list: { group: 'Data', label: 'List', icon: '☷', bindable: true, defaults: { title: 'Business objects', items: 'Purchase Order 450001;Purchase Order 450002;Purchase Order 450003', description: 'Select an item to continue' } },
    objectList: { group: 'Data', label: 'Object List', icon: '▤', bindable: true, defaults: { title: 'Open Purchase Orders', items: '450001|ACME Industries|12,450 EUR|Open;450002|Contoso GmbH|8,920 EUR|Approved;450003|Northwind SAS|21,300 EUR|Blocked' } },
    timeline: { group: 'Data', label: 'Timeline', icon: '◷', bindable: true, defaults: { title: 'History', items: 'Created|Purchase order created|08:30;Approved|Manager approval completed|10:15;Sent|Order sent to supplier|11:05' } },
    calendar: { group: 'Data', label: 'Calendar', icon: '▦', bindable: true, defaults: { title: 'Schedule', month: '', events: '03|Release;12|Approval;21|Delivery' } },
    valueHelp: { group: 'Forms', label: 'Value Help / F4', icon: '⌕', bindable: true, defaults: { label: 'Vendor', placeholder: 'Select vendor', value: '', helpText: 'Search SAP master data' } },
    multiInput: { group: 'Forms', label: 'Multi Input', icon: '⊞', bindable: true, defaults: { label: 'Plants', tokens: '1000,1100', placeholder: 'Add value' } },
    radioGroup: { group: 'Forms', label: 'Radio Group', icon: '◉', bindable: true, defaults: { label: 'Priority', options: 'Low,Normal,High', selected: 'Normal' } },
    time: { group: 'Forms', label: 'Time', icon: '◷', bindable: true, defaults: { label: 'Time', value: '09:00' } },
    datetime: { group: 'Forms', label: 'Date & Time', icon: '▣', bindable: true, defaults: { label: 'Required at', value: '' } },
    stepInput: { group: 'Forms', label: 'Step Input', icon: '±', bindable: true, defaults: { label: 'Quantity', value: 1, min: 0, max: 9999, step: 1 } },
    slider: { group: 'Forms', label: 'Slider', icon: '━', bindable: true, defaults: { label: 'Threshold', value: 50, min: 0, max: 100 } },
    rating: { group: 'Forms', label: 'Rating', icon: '★', bindable: true, defaults: { label: 'Rating', value: 3, max: 5 } },
    fileUpload: { group: 'Forms', label: 'File Upload', icon: '⇧', bindable: false, defaults: { label: 'Attachments', accept: '*/*', multiple: true } },
    panel: { group: 'Layout', label: 'Panel', icon: '▣', bindable: false, defaults: { title: 'Section', text: 'Panel content', collapsible: false } },
    pageHeader: { group: 'Layout', label: 'Object Header', icon: '▰', bindable: true, defaults: { title: 'Purchase Order 450001', subtitle: 'ACME Industries', status: 'Open', number: '12,450', unit: 'EUR' } },
    wizard: { group: 'Layout', label: 'Wizard', icon: '①', bindable: false, defaults: { steps: 'General,Items,Review,Submit', activeStep: 1 } },
    attachmentList: { group: 'Media', label: 'Attachment List', icon: '⌇', bindable: true, defaults: { title: 'Attachments', items: 'quotation.pdf|PDF|124 KB;drawing.png|PNG|842 KB' } },
    emptyState: { group: 'Feedback', label: 'Empty State', icon: '○', bindable: false, defaults: { title: 'No items found', text: 'Adjust the filters or create a new item.', actionText: 'Create' } },
    messagePage: { group: 'Feedback', label: 'Message Page', icon: '!', bindable: false, defaults: { title: 'Unable to load data', text: 'Check the connection and try again.', state: 'warning' } }
  });

  function esc(value = '') {
    return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]));
  }

  function csv(value) {
    return String(value || '').split(',').map(item => item.trim()).filter(Boolean);
  }

  function semi(value) {
    return String(value || '').split(';').map(item => item.trim()).filter(Boolean);
  }

  function clamp(value, min, max, fallback = min) {
    const number = Number(value);
    return Math.max(min, Math.min(max, Number.isFinite(number) ? number : fallback));
  }

  function statusClass(value) {
    const state = String(value || 'information').toLowerCase();
    return ['success','warning','error','information','neutral'].includes(state) ? state : 'information';
  }

  function render(type, component = {}) {
    const c = component || {};
    switch (type) {
      case 'link': return `<a class="v09-link" href="${esc(c.href || '#')}" target="${esc(c.target || '_self')}">${esc(c.text || 'Open details')} <span>↗</span></a>`;
      case 'icon': return `<div class="v09-icon" style="font-size:${clamp(c.size,12,96,28)}px" title="${esc(c.label || '')}">${esc(c.symbol || '●')}</div>`;
      case 'avatar': return `<div class="v09-avatar-row"><div class="v09-avatar" style="width:${clamp(c.size,28,96,44)}px;height:${clamp(c.size,28,96,44)}px">${esc(c.initials || 'JD').slice(0,3)}</div><div><strong>${esc(c.name || 'Business User')}</strong><small>${esc(c.subtitle || '')}</small></div></div>`;
      case 'objectStatus': return `<span class="v09-status ${statusClass(c.state)}">${c.icon ? `<span>${esc(c.icon)}</span>` : ''}${esc(c.text || 'Status')}</span>`;
      case 'currency': return `<div class="v09-amount"><small>${esc(c.label || 'Amount')}</small><strong>${esc(c.value || '0')} <span>${esc(c.currency || '')}</span></strong></div>`;
      case 'progress': { const v = clamp(c.value,0,100,0); return `<div class="v09-progress"><div><strong>${esc(c.label || 'Progress')}</strong><span>${esc(c.displayValue || `${v}%`)}</span></div><div class="v09-progress-track"><i style="width:${v}%"></i></div></div>`; }
      case 'list': return `<div class="v09-list"><strong>${esc(c.title || 'List')}</strong><small>${esc(c.description || '')}</small>${semi(c.items).map(item => `<div class="v09-list-item"><span>${esc(item)}</span><b>›</b></div>`).join('')}</div>`;
      case 'objectList': return `<div class="v09-object-list"><strong>${esc(c.title || 'Objects')}</strong>${semi(c.items).map(item => { const p=item.split('|'); return `<div class="v09-object-row"><div><b>${esc(p[0] || '')}</b><small>${esc(p[1] || '')}</small></div><div><strong>${esc(p[2] || '')}</strong><span class="v09-status neutral">${esc(p[3] || '')}</span></div></div>`; }).join('')}</div>`;
      case 'timeline': return `<div class="v09-timeline"><strong>${esc(c.title || 'History')}</strong>${semi(c.items).map(item => { const p=item.split('|'); return `<div class="v09-timeline-item"><i></i><div><b>${esc(p[0] || '')}</b><p>${esc(p[1] || '')}</p><small>${esc(p[2] || '')}</small></div></div>`; }).join('')}</div>`;
      case 'calendar': { const events = new Map(semi(c.events).map(item => { const p=item.split('|'); return [String(Number(p[0]) || ''),p[1] || 'Event']; })); const days=Array.from({length:28},(_,i)=>i+1); return `<div class="v09-calendar"><div class="v09-calendar-head"><strong>${esc(c.title || 'Calendar')}</strong><span>${esc(c.month || 'Month view')}</span></div><div class="v09-calendar-grid">${days.map(d=>`<div class="${events.has(String(d))?'has-event':''}"><b>${d}</b>${events.has(String(d))?`<small>${esc(events.get(String(d)))}</small>`:''}</div>`).join('')}</div></div>`; }
      case 'valueHelp': return `<div class="ui-field"><label>${esc(c.label || 'Value')}</label><div class="v09-value-help"><span>${esc(c.value || c.placeholder || 'Select value')}</span><b>⌕</b></div><small class="v09-help">${esc(c.helpText || '')}</small></div>`;
      case 'multiInput': return `<div class="ui-field"><label>${esc(c.label || 'Values')}</label><div class="v09-multi">${csv(c.tokens).map(token=>`<span>${esc(token)} ×</span>`).join('')}<em>${esc(c.placeholder || '')}</em></div></div>`;
      case 'radioGroup': return `<div class="ui-field"><label>${esc(c.label || 'Options')}</label><div class="v09-radio">${csv(c.options).map(option=>`<span><i class="${option===(c.selected||csv(c.options)[0])?'active':''}"></i>${esc(option)}</span>`).join('')}</div></div>`;
      case 'time': return `<div class="ui-field"><label>${esc(c.label || 'Time')}</label><div class="ui-input">${esc(c.value || '09:00')} <span style="float:right">◷</span></div></div>`;
      case 'datetime': return `<div class="ui-field"><label>${esc(c.label || 'Date & Time')}</label><div class="ui-input">${esc(c.value || 'YYYY-MM-DD HH:mm')} <span style="float:right">▣</span></div></div>`;
      case 'stepInput': return `<div class="ui-field"><label>${esc(c.label || 'Quantity')}</label><div class="v09-step"><button>−</button><span>${esc(c.value == null ? 1 : c.value)}</span><button>+</button></div></div>`;
      case 'slider': { const v=clamp(c.value,Number(c.min)||0,Number(c.max)||100,50); const min=Number(c.min)||0,max=Number(c.max)||100,pct=max===min?0:((v-min)/(max-min))*100; return `<div class="ui-field"><label>${esc(c.label || 'Slider')} <span style="float:right">${esc(v)}</span></label><div class="v09-slider"><i style="width:${pct}%"></i><b style="left:${pct}%"></b></div></div>`; }
      case 'rating': { const max=Math.round(clamp(c.max,1,10,5)),value=Math.round(clamp(c.value,0,max,0)); return `<div class="ui-field"><label>${esc(c.label || 'Rating')}</label><div class="v09-rating">${Array.from({length:max},(_,i)=>`<span class="${i<value?'on':''}">★</span>`).join('')}</div></div>`; }
      case 'fileUpload': return `<div class="v09-upload"><div>⇧</div><strong>${esc(c.label || 'Upload files')}</strong><small>${c.multiple ? 'Drop files here or browse' : 'Drop a file here or browse'}</small></div>`;
      case 'panel': return `<div class="v09-panel"><div class="v09-panel-head"><strong>${esc(c.title || 'Section')}</strong>${c.collapsible?'<span>⌃</span>':''}</div><p>${esc(c.text || '')}</p></div>`;
      case 'pageHeader': return `<div class="v09-object-header"><div><small>${esc(c.subtitle || '')}</small><h3>${esc(c.title || 'Object')}</h3><span class="v09-status information">${esc(c.status || '')}</span></div><div class="v09-object-number"><strong>${esc(c.number || '')}</strong><span>${esc(c.unit || '')}</span></div></div>`;
      case 'wizard': { const steps=csv(c.steps),active=Math.max(1,Math.min(steps.length,Number(c.activeStep)||1)); return `<div class="v09-wizard">${steps.map((step,i)=>`<div class="${i+1<active?'done':i+1===active?'active':''}"><span>${i+1<active?'✓':i+1}</span><b>${esc(step)}</b></div>`).join('')}</div>`; }
      case 'attachmentList': return `<div class="v09-attachments"><strong>${esc(c.title || 'Attachments')}</strong>${semi(c.items).map(item=>{const p=item.split('|');return `<div><span>⌇</span><b>${esc(p[0]||'file')}</b><small>${esc([p[1],p[2]].filter(Boolean).join(' · '))}</small><em>⋮</em></div>`;}).join('')}</div>`;
      case 'emptyState': return `<div class="v09-empty"><div>○</div><strong>${esc(c.title || 'No items')}</strong><p>${esc(c.text || '')}</p>${c.actionText?`<button class="ui-button secondary">${esc(c.actionText)}</button>`:''}</div>`;
      case 'messagePage': return `<div class="v09-message ${statusClass(c.state)}"><div>!</div><strong>${esc(c.title || 'Message')}</strong><p>${esc(c.text || '')}</p></div>`;
      default: return '';
    }
  }

  function isEnterpriseType(type) {
    return Object.prototype.hasOwnProperty.call(COMPONENTS, type);
  }

  return { COMPONENTS, render, isEnterpriseType };
});
