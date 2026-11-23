// Generated: shared optional update controls; edit the original client templates.
(function(){
/* DSH workbench UI v1. MIT. Canonical source: dsh-suite/ui/workbench-ui.js.
 * Vendored into each plugin: no Suite or extra runtime dependency is required.
 * Styles are scoped to .dshw and never replace the host chrome or theme.
 */
function createWorkbenchUI(React) {
  const h = React.createElement;
  const { useEffect, useId, useRef } = React;
  const cx = (...values) => values.filter(Boolean).join(' ');
  const paths = {
    book: ['M4 4h6a3 3 0 0 1 2 2v15a4 4 0 0 0-4-2H4z', 'M20 4h-6a3 3 0 0 0-2 2v15a4 4 0 0 1 4-2h4z'],
    calendar: ['M5 5h14a2 2 0 0 1 2 2v13H3V7a2 2 0 0 1 2-2Z', 'M7 3v4M17 3v4M3 10h18'],
    mail: ['M3 5h18v14H3z', 'm3 6 9 7 9-7'],
    rss: ['M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16', 'M4 19h.01'],
    slides: ['M3 4h18v13H3z', 'M12 17v4M8 21h8'],
    shield: ['m12 3 8 3v6c0 4-4 7-8 9-4-2-8-5-8-9V6z', 'm8 12 3 3 5-6'],
    layers: ['M5 3h16v16H5z', 'M2 7v15h15'],
    play: ['m9 6 9 6-9 6Z'],
    video: ['M3 5h12v14H3z', 'm15 10 6-4v12l-6-4'],
    search: ['M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15Z', 'm16 16 5 5'],
    plus: ['M12 5v14M5 12h14'],
    refresh: ['M20 7a9 9 0 1 0 1 8', 'M20 2v5h-5'],
    settings: ['m9 3-.7 2.4-2 .9L4 5.8 2.5 8.4l1.7 1.8v2.3L2.5 14 4 17l2.5-.4 1.9 1L9 20h3l.8-2.4 2-1 2.5.4 1.5-2.7-1.7-1.9v-2.2l1.7-1.8-1.5-2.6-2.5.4-2-1L12 3Z', 'M14 11.5a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Z'],
    close: ['m6 6 12 12M18 6 6 18'],
    left: ['m14 5-7 7 7 7'],
    right: ['m10 5 7 7-7 7'],
    down: ['m5 9 7 7 7-7'],
    filter: ['M4 5h16M7 12h10M10 19h4'],
    download: ['M12 3v12m-5-5 5 5 5-5', 'M4 16v5h16v-5'],
    upload: ['M12 16V4m-5 5 5-5 5 5', 'M4 16v5h16v-5'],
    copy: ['M8 8h13v13H8z', 'M16 8V3H3v13h5'],
    external: ['M14 3h7v7m0-7L10 14', 'M10 3H3v18h18v-7'],
    file: ['M4 3h10l6 6v12H4z', 'M14 3v6h6M8 13h8M8 17h6'],
    folder: ['M3 5h7l2 3h9v12H3z'],
    edit: ['m15 4 5 5-10 10-6 1 1-6Z', 'm13 6 5 5'],
    trash: ['M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7'],
    more: ['M5 12h.01M12 12h.01M19 12h.01'],
    info: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z', 'M12 11v6M12 7h.01'],
    check: ['m5 12 4 4L19 6'],
    quote: ['M4 12h6v7H3v-7c0-4 2-6 5-7M15 12h6v7h-7v-7c0-4 2-6 5-7'],
    star: ['m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z'],
    reply: ['m9 5-7 7 7 7v-5h6c3 0 5 2 6 5 0-8-4-11-12-11Z'],
    link: ['m10 13 4-4M8 16l-2 2a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0', 'm14 8 2-2a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0'],
  };
  function Icon({ name = 'file', size = 20, ...props }) {
    return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, focusable: false, ...props },
      (paths[name] || paths.file).map((d, index) => h('path', { key: index, d })));
  }
  function Button({ children, icon, variant, className, ...props }) {
    return h('button', { type: 'button', ...props, className: cx('w-button', variant && 'w-' + variant, className) }, icon ? h(Icon, { name: icon, size: 18 }) : null, children);
  }
  function IconButton({ label, icon, ...props }) {
    return h(Button, { ...props, icon, className: cx('w-icon-button', props.className), 'aria-label': label, title: label });
  }
  function Page({ title, subtitle, actions, children, workbench = false, className, rootRef, ...props }) {
    return h('section', { ...props, ref: rootRef, className: cx('dshw', 'w-page', className), 'data-main': workbench ? 'true' : 'false' },
      h(Styles, { key: 'styles' }),
      h('header', { className: 'w-page-header' }, h('div', { className: 'w-heading' }, h('h1', null, title), subtitle ? h('p', { className: 'w-subtitle' }, subtitle) : null), actions ? h('div', { className: 'w-header-actions' }, actions) : null),
      h('div', { className: 'w-body' }, children));
  }
  function Tabs({ items, value, onChange, label, children }) {
    const id = useId();
    const active = items.some(item => item.id === value) ? value : items[0]?.id;
    function keys(event, index) {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length;
      const node = event.currentTarget.parentElement?.querySelectorAll('[role=tab]')[next];
      if (node) { onChange(items[next].id); node.focus(); }
    }
    return h('div', { className: 'w-tabs-layout' },
      h('div', { className: 'w-tabs', role: 'tablist', 'aria-label': label }, items.map((item, index) => h('button', {
        type: 'button', role: 'tab', key: item.id, id: id + '-' + item.id, 'aria-controls': id + '-panel', 'aria-selected': active === item.id, tabIndex: active === item.id ? 0 : -1,
        onClick: () => onChange(item.id), onKeyDown: event => keys(event, index),
      }, item.label, item.count !== undefined ? h('span', { className: 'w-count' }, item.count) : null))),
      h('div', { className: 'w-tab-panel', id: id + '-panel', role: 'tabpanel', 'aria-labelledby': id + '-' + active }, children));
  }
  function Status({ children, tone = 'info', className }) {
    if (!children) return null;
    return h('div', { className: cx('dshw', 'w-status', 'w-status-' + tone, className), role: tone === 'error' ? 'alert' : 'status', 'aria-live': tone === 'error' ? 'assertive' : 'polite' }, h(Icon, { name: tone === 'success' ? 'check' : 'info', size: 18 }), h('div', null, children));
  }
  function Empty({ title, children, action, icon = 'file' }) {
    return h('div', { className: 'dshw w-empty' }, h(Styles, { key: 'styles' }), h(Icon, { name: icon, size: 32 }), h('h2', null, title), children ? h('div', { className: 'w-muted' }, children) : null, action ? h('div', { className: 'w-toolbar' }, action) : null);
  }
  function Split({ list, detail, selected, onBack, backLabel, className, listWidth = 360 }) {
    const ref = useRef(null);
    useEffect(() => {
      if (!selected || !ref.current || ref.current.clientWidth > 760) return;
      const heading = ref.current.querySelector('.w-detail h2');
      if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
    }, [selected]);
    return h('div', { ref, className: cx('w-split', className), 'data-selected': selected ? 'true' : 'false', style: { '--w-list-width': listWidth + 'px' } },
      h('div', { className: 'w-master' }, list),
      h('div', { className: 'w-detail' }, selected ? h(Button, { className: 'w-back', icon: 'left', variant: 'ghost', onClick: onBack }, backLabel) : null, detail));
  }
  function Row({ title, meta, description, active, onClick, children, status, className, disabled }) {
    return h('div', { className: cx('w-row', active && 'w-selected', className) },
      children ? h('div', { className: 'w-row-select' }, children) : null,
      h('button', { type: 'button', className: 'w-row-button', onClick, disabled, 'aria-pressed': !!active },
        h('span', { className: 'w-row-head' }, h('strong', null, title), status ? h('span', { className: 'w-tag' }, status) : null),
        meta ? h('span', { className: 'w-row-meta' }, meta) : null,
        description ? h('span', { className: 'w-row-description' }, description) : null));
  }
  function Search({ label, value, onChange, ...props }) {
    const id = useId();
    return h('div', { className: 'w-search' }, h(Icon, { name: 'search', size: 18 }), h('input', { type: 'search', id, 'aria-label': label, placeholder: label, value, onChange, ...props }));
  }
  function Switch({ label, checked, onChange, disabled }) {
    return h('label', { className: 'w-switch-label' }, h('span', null, label), h('input', { type: 'checkbox', role: 'switch', checked, disabled, onChange, 'aria-label': label }), h('span', { className: 'w-switch-track', 'aria-hidden': true }));
  }
  function Dialog({ title, children, onClose, closeLabel, className, busy = false }) {
    const id = useId(), panel = useRef(null);
    useEffect(() => {
      const previous = document.activeElement;
      panel.current?.querySelector('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')?.focus();
      return () => { if (previous?.isConnected) previous.focus({ preventScroll: true }); };
    }, []);
    function keydown(event) {
      if (event.key === 'Escape' && !event.isComposing) { event.preventDefault(); event.stopPropagation(); if (!busy) onClose(); return; }
      if (event.key !== 'Tab') return;
      const controls = [...panel.current.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]')].filter(node => node.getClientRects().length);
      const first = controls[0], last = controls.at(-1);
      if (!controls.length) { event.preventDefault(); panel.current.focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    return h('div', { className: 'dshw w-overlay', onClick: event => { if (!busy && event.target === event.currentTarget) onClose(); } },
      h(Styles, { key: 'styles' }),
      h('section', { ref: panel, className: cx('w-dialog', className), role: 'dialog', 'aria-modal': true, 'aria-labelledby': id, tabIndex: -1, onKeyDown: keydown },
        h('header', { className: 'w-dialog-header' }, h('h2', { id }, title), h(IconButton, { icon: 'close', label: closeLabel, disabled: busy, onClick: onClose })), h('div', { className: 'w-dialog-body' }, children)));
  }
  function register(ctx, { id, label, icon, component, inject, order = 50 }) {
    // The two slots are optional. Existing settings and manual tools still load
    // in hosts without a workbench, while RC.3 owns navigation/pinning itself.
    ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: id, inject: () => ({ ...(inject?.() || {}), workbench: true }) }, component));
    ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id, order, label }, function WorkbenchIcon({ size }) { return h(Icon, { name: icon, size }); }));
  }
  const styles = `
.dshw{--w-bg:var(--dsw-alias-bg-layer-1,#fff);--w-soft:var(--dsw-alias-bg-layer-2,#f7f8fa);--w-text:var(--dsw-alias-label-primary,#18202c);--w-muted:var(--dsw-alias-label-secondary,#667085);--w-border:var(--dsw-alias-border-l3,#e7e9ef);--w-accent:var(--dsh-plugin-workbench-accent,#4f6bdb);--w-selected:color-mix(in srgb,var(--w-accent) 10%,var(--w-bg));--w-primary:var(--w-text);--w-on-primary:var(--w-bg);container-type:inline-size;container-name:dsh-workbench;color:var(--w-text);font:14px/1.65 var(--dsh-font-family-content,system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif);min-width:0;max-width:100%;box-sizing:border-box;text-align:start;color-scheme:inherit}
.dshw *,.dshw *:before,.dshw *:after{box-sizing:border-box}.dshw h1,.dshw h2,.dshw h3,.dshw h4,.dshw p{margin:0}.dshw h1{font-size:30px;line-height:1.25;letter-spacing:-.025em;font-weight:650}.dshw h2{font-size:24px;line-height:1.35;font-weight:650;letter-spacing:-.015em;overflow-wrap:anywhere}.dshw h3,.dshw h4{font-size:16px;line-height:1.4;font-weight:600}.dshw a{color:var(--w-accent);text-underline-offset:3px;overflow-wrap:anywhere}.dshw button,.dshw input,.dshw select,.dshw textarea{font:inherit;color:inherit;max-width:100%}.dshw input:not([type=checkbox]):not([type=radio]):not([type=file]),.dshw select,.dshw textarea{background:var(--dsw-specific-input-major,var(--w-bg));border:1px solid var(--w-border);border-radius:8px;padding:8px 11px;min-width:0;line-height:1.5}.dshw input:not([type=checkbox]):not([type=radio]):not([type=file]),.dshw select{min-height:38px}.dshw textarea{resize:vertical}.dshw input[type=checkbox],.dshw input[type=radio]{width:16px;height:16px;flex-shrink:0;accent-color:var(--w-accent)}.dshw :focus-visible{outline:2px solid var(--w-accent);outline-offset:3px}.dshw button:disabled,.dshw input:disabled,.dshw select:disabled,.dshw textarea:disabled{opacity:.5;cursor:not-allowed}.dshw label{font-size:13px}.dshw fieldset{min-width:0;border:1px solid var(--w-border);border-radius:8px}.dshw summary{cursor:pointer;font-weight:550;list-style:none;display:flex;align-items:center;gap:8px}.dshw summary::-webkit-details-marker{display:none}.dshw summary:after{content:'';display:block;margin-inline-start:auto;width:7px;height:7px;border-inline-end:1.75px solid currentColor;border-bottom:1.75px solid currentColor;transform:rotate(45deg);flex-shrink:0}.dshw details[open]>summary:after{transform:rotate(225deg)}.dshw details>summary+*{margin-top:12px}.dshw pre{white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.7 ui-monospace,SFMono-Regular,Consolas,monospace;max-width:100%;background:var(--w-soft);border-radius:6px;padding:14px}.dshw img,.dshw video,.dshw iframe{max-width:100%}
.w-page{display:flex;flex-direction:column;position:relative;padding:0;min-height:540px;gap:0}.w-page[data-main=true]{height:100%;min-height:0;padding:calc(24px + var(--dsh-frame-top-clearance,0px)) 28px 0 max(28px,var(--dsh-frame-leading-clearance,0px));overflow:auto}.dshw[data-main=true]{background:var(--w-bg)}.dshw.w-page,.dshw .w-body,.dshw .w-tab-panel{overflow-x:clip}.w-page-header{display:flex;justify-content:space-between;gap:24px;align-items:flex-start;padding-bottom:22px;flex-shrink:0}.w-heading{min-width:0}.w-subtitle{margin-top:8px!important;font-size:14px;color:var(--w-muted);line-height:1.6}.w-header-actions,.w-toolbar,.w-actions{display:flex;align-items:center;flex-wrap:wrap;gap:8px;min-width:0}.w-header-actions{justify-content:flex-end}.w-body,.w-tabs-layout{display:flex;flex-direction:column;flex:1;min-height:0;min-width:0}.w-body{overflow:auto}.w-tab-panel{flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;overflow:auto}.w-tabs{display:flex;align-items:stretch;gap:20px;border-bottom:1px solid var(--w-border);flex-shrink:0;overflow-x:auto;scrollbar-width:thin}.dshw .w-tabs>button{border:0;border-bottom:2px solid transparent;background:transparent;padding:11px 8px 13px;white-space:nowrap;font-size:14px;font-weight:550;cursor:pointer;color:var(--w-muted);display:flex;align-items:center;gap:7px}.dshw .w-tabs>button[aria-selected=true]{border-bottom-color:var(--w-accent);color:var(--w-accent)}.w-count,.w-tag{font-size:12px;line-height:1.5;display:inline-flex;align-items:center;flex-shrink:0;background:var(--w-soft);border-radius:5px;padding:1px 6px;color:var(--w-muted)}.w-tabs [aria-selected=true] .w-count,.w-selected .w-tag{color:var(--w-accent);background:var(--w-selected)}
.dshw .w-button{display:inline-flex;justify-content:center;align-items:center;gap:7px;background:var(--w-bg);border:1px solid var(--w-border);border-radius:8px;padding:8px 12px;min-height:36px;line-height:1.4;font-size:14px;font-weight:500;cursor:pointer;text-decoration:none;white-space:normal}.dshw .w-button:not(:disabled):hover{background:var(--w-soft)}.dshw .w-primary{background:var(--w-primary);border-color:var(--w-primary);color:var(--w-on-primary)}.dshw .w-primary:not(:disabled):hover{background:var(--w-primary);opacity:.9}.dshw .w-ghost{background:transparent;border-color:transparent}.dshw .w-danger{color:var(--dsw-alias-state-error-primary,#b43c3c)}.dshw .w-icon-button{width:36px;min-width:36px;padding:8px}.dshw .w-button svg{flex-shrink:0}.w-muted{color:var(--w-muted);font-size:12px;line-height:1.6}.w-section{padding:24px 0;border-bottom:1px solid var(--w-border);min-width:0}.w-section>h3{margin-bottom:12px}.w-section>p+p{margin-top:8px}.w-fields{display:grid;gap:16px;min-width:0}.w-field{display:grid;gap:6px;min-width:0}.w-field>input,.w-field>select,.w-field>textarea{width:100%}.w-status{display:flex;align-items:flex-start;gap:8px;padding:11px 13px;margin:12px 0;border:1px solid var(--w-border);border-radius:8px;background:var(--w-soft);font-size:13px;overflow-wrap:anywhere;flex-shrink:0}.w-status>svg{flex-shrink:0;margin-top:2px}.w-status-error{color:var(--dsw-alias-state-error-primary,#ad3636)}.w-status-success{color:var(--dsw-alias-state-success-primary,#24794a)}.w-status-warn{color:var(--dsw-alias-state-warning-primary,#8a5a00)}.w-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:14px;width:100%;max-width:580px;padding:48px 24px;margin:auto;min-height:280px;overflow-wrap:anywhere}.w-empty>svg{color:var(--w-muted)}.w-empty h2{font-size:20px}.w-empty .w-muted{font-size:14px}.w-empty .w-toolbar{justify-content:center}
.w-split{display:grid;grid-template-columns:minmax(240px,var(--w-list-width)) minmax(0,1fr);min-height:460px;flex:1;min-width:0}.w-master{min-width:0;border-inline-end:1px solid var(--w-border);overflow:auto;padding-bottom:24px}.w-detail{min-width:0;padding:26px 28px;overflow:auto;overflow-wrap:anywhere;display:flex;flex-direction:column}.w-master-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:20px 16px}.w-search{display:flex;align-items:center;gap:8px;border:1px solid var(--w-border);border-radius:8px;padding:0 10px;min-width:0;flex:1;background:var(--w-bg)}.w-search>svg{color:var(--w-muted);flex-shrink:0}.dshw .w-search>input{border:0!important;background:transparent!important;padding:8px 0!important;width:100%;outline-offset:0}.w-row{display:flex;gap:0;min-width:0;position:relative;border-bottom:1px solid var(--w-border);border-inline-start:3px solid transparent}.w-row-select{display:flex;align-items:flex-start;padding:21px 0 0 14px}.dshw .w-row-button{display:flex;flex-direction:column;align-items:stretch;gap:7px;text-align:start;width:100%;padding:18px 18px 18px 16px;border:0;background:transparent;color:inherit;min-width:0;cursor:pointer;line-height:1.5}.dshw .w-row-button:hover{background:var(--w-soft)}.w-row-head{display:flex;align-items:flex-start;gap:10px;justify-content:space-between;min-width:0}.w-row-head>strong{font-size:14px;line-height:1.5;font-weight:600;overflow-wrap:anywhere}.w-row-meta,.w-row-description{color:var(--w-muted);font-size:12px;line-height:1.6;overflow-wrap:anywhere}.w-row-description{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.w-selected{background:var(--w-selected);border-inline-start-color:var(--w-accent)}.w-back{display:none!important}.w-detail-title{margin-bottom:12px!important}.w-detail-meta{color:var(--w-muted);font-size:13px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}.w-detail-footer{padding:24px 0;display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:auto;border-top:1px solid var(--w-border)}.w-detail-footer .w-muted{flex:1;min-width:160px}.w-definition{display:grid;grid-template-columns:minmax(80px,120px) minmax(0,1fr);gap:8px 16px;font-size:14px;margin:20px 0}.w-definition dt{color:var(--w-muted)}.w-definition dd{margin:0;min-width:0;overflow-wrap:anywhere}
.w-switch-label{display:inline-flex;align-items:center;gap:8px;font-size:13px;position:relative;cursor:pointer}.w-switch-label>input{position:absolute;opacity:0;inset-inline-end:0;width:36px!important;height:22px!important;margin:0;cursor:pointer}.w-switch-track{width:36px;height:22px;border-radius:12px;display:block;background:var(--w-border);border:1px solid var(--w-border);pointer-events:none;padding:2px;transition:background .15s}.w-switch-track:before{content:'';display:block;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 2px #0002;transition:transform .15s}.w-switch-label>input:checked+.w-switch-track{background:var(--w-accent);border-color:var(--w-accent)}.w-switch-label>input:checked+.w-switch-track:before{transform:translateX(14px)}.w-switch-label>input:focus-visible+.w-switch-track{outline:2px solid var(--w-accent);outline-offset:3px}.w-switch-label:has(>input:disabled){opacity:.5;cursor:not-allowed}
.w-overlay{position:fixed;inset:0;background:#0005;display:flex;justify-content:flex-end;z-index:1000;padding:12px;overflow:auto}.w-dialog{width:min(620px,100%);max-height:100%;display:flex;flex-direction:column;min-height:0;background:var(--w-bg);color:var(--w-text);border:1px solid var(--w-border);border-radius:12px;box-shadow:0 18px 70px #0003}.w-dialog-header{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:20px 24px;border-bottom:1px solid var(--w-border);flex-shrink:0}.w-dialog-header>h2{font-size:20px}.w-dialog-body{overflow:auto;padding:20px 24px;min-height:0}.w-editor-grid{display:grid;grid-template-columns:210px minmax(0,1fr) 300px;min-height:500px;flex:1}.w-editor-list{padding:20px 12px;border-inline-end:1px solid var(--w-border);min-width:0}.w-editor-canvas{background:var(--w-soft);padding:20px;min-width:0;display:flex;flex-direction:column;gap:14px}.w-editor-inspector{padding:24px;border-inline-start:1px solid var(--w-border);min-width:0;overflow:auto}.w-editor-inspector h3{margin-bottom:18px}.w-preview-empty{display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;gap:12px;aspect-ratio:16/9;min-height:180px;background:var(--w-soft);border:1px solid var(--w-border);border-radius:8px;padding:24px;color:var(--w-muted)}.w-content-pad{padding:24px 0}.w-stack{display:flex;flex-direction:column;gap:16px;min-width:0}.w-scroll-x{overflow:auto;max-width:100%}
@container dsh-workbench (max-width:1000px){.w-editor-grid{grid-template-columns:160px minmax(0,1fr)}.w-editor-inspector{grid-column:1/-1;border-inline-start:0;border-top:1px solid var(--w-border)}.w-header-actions{max-width:60%}.w-split{grid-template-columns:minmax(240px,32%) minmax(0,1fr)}}
@container dsh-workbench (max-width:760px){.w-page-header{gap:14px;flex-wrap:wrap;padding-bottom:18px}.w-heading{flex:1;min-width:170px}.dshw h1{font-size:24px}.w-header-actions{max-width:100%;justify-content:flex-start}.w-subtitle{font-size:13px}.w-tabs{gap:12px}.dshw .w-tabs>button{padding:10px 4px 12px}.w-split{display:block;min-height:360px}.w-split[data-selected=false]>.w-detail{display:none}.w-split[data-selected=true]>.w-master{display:none}.w-master{border-inline-end:0}.w-detail{padding:20px 0}.w-back{display:inline-flex!important;align-self:flex-start;margin:0 0 16px!important}.w-detail h2{font-size:22px}.w-master-toolbar{padding:16px 0}.dshw .w-row-button{padding:16px 10px}.w-detail-footer{position:static}.w-detail-footer .w-muted{flex-basis:100%}.w-editor-grid{display:flex;flex-direction:column}.w-editor-list{border-inline-end:0;border-bottom:1px solid var(--w-border);padding:16px 0}.w-editor-canvas{padding:16px 0;background:var(--w-bg)}.w-editor-inspector{padding:20px 0}.w-dialog-header,.w-dialog-body{padding:16px}.w-button{min-height:40px}.w-definition{grid-template-columns:80px minmax(0,1fr)}}
@media(max-width:700px){.w-page[data-main=true]{padding:calc(16px + var(--dsh-frame-top-clearance,0px)) 16px 0 max(16px,var(--dsh-frame-leading-clearance,0px))}.w-overlay{padding:8px}.w-dialog{width:100%}}
@media(prefers-reduced-motion:reduce){.dshw *,.dshw *:before{scroll-behavior:auto!important;transition:none!important;animation:none!important}}
`;
  function Styles() { return h('style', null, styles); }
  return { Icon, Button, IconButton, Page, Tabs, Status, Empty, Split, Row, Search, Switch, Dialog, Styles, register, styles };
}

/* One update control per plugin. Only transport, idle guards and installation
 * coordination are shared; no global update page or update-all action exists. */
function __stardustUpdatesGuards() {
  const key = Symbol.for('stardustlc.plugin-updates.guards.v1');
  return globalThis[key] ||= { values: new Map(), listeners: new Set(), viewListeners: new Set(), clients: new Set() };
}
function __stardustUpdatesGuard(React, name, { dirty = false, busy = false, retainOnClose = false } = {}) {
  const token = React.useRef(null);
  if (!token.current) token.current = {};
  React.useLayoutEffect(() => {
    const pool = __stardustUpdatesGuards();
    if (!dirty && !busy) for (const [key, value] of pool.values) if (value.name === name && value.orphan) pool.values.delete(key);
    pool.values.set(token.current, { name, dirty: !!dirty, busy: !!busy, retainOnClose, orphan: false });
    for (const listener of pool.listeners) listener();
  }, [name, !!dirty, !!busy, retainOnClose]);
  React.useEffect(() => () => {
    const pool = __stardustUpdatesGuards(), value = pool.values.get(token.current);
    if (value?.retainOnClose && (value.dirty || value.busy)) value.orphan = true;
    else pool.values.delete(token.current);
    for (const listener of pool.listeners) listener();
  }, []);
}
function __StardustPluginUpdatesFooter({ React, name }) {
  const [, render] = React.useState(0), pool = __stardustUpdatesGuards();
  React.useEffect(() => { const fn = () => render(value => value + 1); pool.viewListeners.add(fn); return () => pool.viewListeners.delete(fn); }, []);
  const client = [...pool.clients].find(client => typeof client.Footer === 'function' && client.has(name));
  if (!client) return null;
  return React.createElement(client.Footer, { name });
}
function __stardustUpdatesFooter(React, name) {
  return React.createElement(__StardustPluginUpdatesFooter, { key: 'plugin-updates', React, name });
}
function __stardustUpdatesInlinePage(React, element, name) {
  return React.cloneElement(element, null, element.props.children, __stardustUpdatesFooter(React, name));
}
function __stardustUpdatesDetailName(subject, rows) {
  if (!subject || !['bundle', 'row'].includes(subject.kind)) return null;
  if (subject.kind === 'row' && subject.pkg?.name === '@stardustlc/dsh-suite') {
    const component = rows.find(row => row.bundledBy === subject.pkg.name && (subject.row?.moduleName === row.name || subject.row?.moduleName?.startsWith(row.name + '/')));
    if (component) return component.name;
  }
  return rows.some(row => row.name === subject.pkg?.name) ? subject.pkg.name : null;
}
function __stardustUpdatesNativeFormState(document) {
  let dirty = false, busy = false;
  for (const scope of document.querySelectorAll('[data-plugin-detail],[data-plugin-row-detail]')) for (const button of scope.querySelectorAll('button')) {
    if (!button.getClientRects().length || button.closest('.plugin-updates-footer')) continue;
    const label = (button.getAttribute('aria-label') || button.textContent || '').trim();
    if (/^(?:正在保存|保存中|Saving)(?:[.…\s]|$)/i.test(label) || button.getAttribute('aria-busy') === 'true') busy = true;
    if (!button.disabled && button.getAttribute('aria-disabled') !== 'true' && /^(?:保存(?:更改|设置|配置)?|Save(?: changes| settings| configuration)?)(?:\s+(?:Ctrl|⌘|Enter|↵).*)?$/i.test(label)) dirty = true;
  }
  return { dirty, busy };
}
function __stardustUpdatesDisplayRows(next, known) {
  for (const row of next.rows) known.set(row.name, row);
  if (!['verifying', 'installing', 'cancelling', 'unknown', 'restore-failed'].includes(next.job?.state)) return next;
  const rows = [...next.rows];
  for (const row of known.values()) if ((row.name === next.job.name || row.bundledBy === next.job.name) && !rows.some(item => item.name === row.name)) rows.push({ ...row, updating: true });
  return { ...next, rows };
}
function __stardustUpdatesSuiteRows(next, participants) {
  // The official manager lists top-level dependencies, not Suite's transitive
  // components. Project active, build-identified clients for display only.
  // Installation and preferences still use the real Suite row from the host.
  const suiteUpdating = next.job?.name === '@stardustlc/dsh-suite' && ['verifying', 'installing', 'cancelling', 'unknown', 'restore-failed'].includes(next.job?.state);
  const suite = next.rows.find(row => row.name === '@stardustlc/dsh-suite' && (row.enabled || suiteUpdating));
  if (!suite) return next;
  const rows = [...next.rows], names = new Set(rows.map(row => row.name));
  for (const item of participants) if (item.suiteComponent && item.packageVersion && item.label && !names.has(item.name)) {
    names.add(item.name);
    rows.push({ name: item.name, version: item.packageVersion, enabled: true, sourceKind: 'suite', loadError: false, label: item.label, labelEn: item.labelEn, bundledBy: suite.name });
  }
  return { ...next, rows };
}
function __stardustUpdatesWrap(definition, participant) {
  return { ...definition, factory(require) {
    const original = definition.factory(require);
    if (!original || typeof original !== 'object') return original;
    const React = require('react');
    return { ...original, apply(ctx, ...args) {
      const result = original.apply?.call(this, ctx, ...args);
      // The optional alpha.3 slot stays dormant in older hosts; its scoped
      // injection unregisters naturally when the plugin is unloaded.
      if (participant.iconData && participant.sectionIds?.length && typeof ctx.inject === 'function') ctx.inject(['slots'], host => {
        for (const id of new Set(participant.sectionIds)) host.slots.inject('settings.section.icon', () => host.slots.register({ name: 'settings.section.icon', id }, function PluginSettingsIcon({ size = 20 }) {
          return React.createElement('img', { src: participant.iconData, alt: '', 'aria-hidden': true, width: size, height: size, style: { objectFit: 'contain', display: 'block', flexShrink: 0 } });
        }));
      });
      if (typeof ctx.inject === 'function') ctx.inject(['slots', 'locale', 'remote', 'remote.pluginManager'], host => __stardustUpdatesJoin(host, React, require, participant));
      return result;
    } };
  } };
}
function __stardustUpdatesJoin(host, React, require, participant) {
  const key = Symbol.for('stardustlc.plugin-updates.client.v1'), pools = globalThis[key] ||= new WeakMap(), root = host.root || host;
  if (typeof root.plugin !== 'function') return;
  let record = pools.get(root);
  if (!record) {
    record = { refs: new Map(), timer: null, version: participant.version, alive: true, hold: false, uiRevision: 11, migration: Promise.resolve() };
    pools.set(root, record);
    __stardustUpdatesActivate(record, pools, root, React, require);
  } else if ((record.uiRevision || 0) < 11 && !record.upgrading) {
    // An earlier loaded participant may still own an older client revision. Keep
    // its references and draft guards, wait for any admitted install, then
    // replace that one client fiber instead of running two window heartbeats.
    const shared = record;
    const previousMigration = record.migration;
    record.upgrading = record.migration = Promise.resolve(previousMigration).then(async () => {
      while (shared.alive && shared.hold) await new Promise(resolve => setTimeout(resolve, 500));
      if (!shared.alive || !shared.refs.size) return;
      await shared.fiber?.dispose?.();
      if (!shared.refs.size) return;
      shared.alive = true; shared.uiRevision = 11; pools.set(root, shared);
      __stardustUpdatesActivate(shared, pools, root, React, require);
    }).catch(() => { /* The original page remains usable if host disposal fails. */ });
  }
  clearTimeout(record.timer);
  const ref = {}; record.refs.set(ref, participant);
  host.effect(() => () => {
    record.refs.delete(ref);
    const stop = () => {
      if (record.refs.size || !record.alive) return;
      if (record.hold) { record.timer = setTimeout(stop, 1000); return; }
      record.alive = false; Promise.resolve(record.fiber?.dispose?.()).catch(() => {});
    };
    if (!record.refs.size) record.timer = setTimeout(stop, 1000);
  });
}
function __stardustUpdatesActivate(shared, pools, root, React, require) {
  shared.fiber = root.plugin({ name: 'stardustlc-plugin-updates-client', inject: ['slots', 'locale', 'remote', 'remote.pluginManager'], apply(ctx) {
    const client = __stardustUpdatesClient(ctx, React, require, shared);
    ctx.effect(() => () => { shared.alive = false; client.dispose(); if (pools.get(root) === shared) pools.delete(root); });
  } });
  Promise.resolve(shared.fiber).catch(() => { shared.alive = false; if (pools.get(root) === shared) pools.delete(root); });
}
function __stardustUpdatesClient(ctx, React, require, shared) {
  const h = React.createElement, W = createWorkbenchUI(React), route = new URL('api/stardustlc/plugin-updates', document.baseURI);
  const { useState, useEffect, useRef } = React, id = crypto.randomUUID(), listeners = new Set(), pool = __stardustUpdatesGuards(), requests = new Set(), knownRows = new Map();
  let alive = true, registered = false, state = null, lastInteraction = Date.now(), inPoll = false, manualOperation = false;
  const language = () => String(ctx.locale?.getSnapshot?.().active || '').startsWith('en') ? 'en' : 'zh';
  const t = (zh, en) => language() === 'en' ? en : zh;
  const REPOS = { 'dsh-calendar': 'dsh-calendar', 'dsh-cite': 'dsh-cite', 'dsh-code-security': 'dsh-code-security', 'dsh-codex-port': 'dsh-codex-port', 'deepseek-computer-use': 'deepseek-computer-use', 'dsh-dingtalk': 'dsh-dingtalk', '@stardustlc/dsh-docker': 'dsh-docker', '@stardustlc/dsh-dream': 'dsh-dream', 'dsh-email': 'dsh-email', 'dsh-ffmpeg': 'dsh-ffmpeg', 'dsh-flakefinder': 'dsh-flakefinder', 'dsh-hyperframes': 'dsh-hyperframes', 'dsh-minimal-ptc': 'dsh-minimal-ptc', 'dsh-ppt': 'dsh-ppt', 'dsh-remotion': 'dsh-remotion', '@stardustlc/dsh-review': 'dsh-review', 'dsh-rss': 'dsh-rss', 'dsh-slack': 'dsh-slack', 'dsh-sql': 'dsh-sql', '@stardustlc/dsh-suite': 'dsh-suite', 'dsh-voice': 'dsh-voice' };
  const repoUrl = pkg => Object.hasOwn(REPOS, pkg) ? 'https://github.com/STARDUSTLC666/' + REPOS[pkg] : null;
  const preferences = name => state?.preferences.packages[name] || { checkEnabled: true, autoInstall: false, autoScope: 'compatible', deferredUntil: 0, ignoredVersion: null };
  const originalRow = name => state?.rows.find(row => row.name === name);
  const rowFor = name => { const row = originalRow(name); return row?.bundledBy ? originalRow(row.bundledBy) : row; };
  const activeJob = () => ['verifying', 'installing', 'cancelling'].includes(state?.job?.state);
  function notify() { shared.hold = manualOperation || activeJob(); for (const listener of listeners) listener(); for (const listener of pool.viewListeners) listener(); }
  async function api(body = { action: 'state' }) {
    const controller = new AbortController(); requests.add(controller);
    const timeout = setTimeout(() => controller.abort(), body.action === 'check' ? 95000 : 45000);
    try {
      const response = await fetch(route, { method: 'POST', credentials: 'same-origin', cache: 'no-store', signal: controller.signal, headers: { 'content-type': 'application/json', 'x-stardustlc-updates': '1' }, body: JSON.stringify(body) });
      let data; try { data = await response.json(); } catch { throw new Error('service-unavailable'); }
      if (!response.ok || !data.ok) throw new Error(response.status === 403 ? 'owner-required' : data.code || 'service-unavailable');
      return data.value;
    } catch (error) { if (error?.name === 'AbortError') throw new Error('service-unavailable'); throw error; }
    finally { clearTimeout(timeout); requests.delete(controller); }
  }
  function pageState(manual = manualOperation) {
    const values = [...pool.values.values()], nativeForm = __stardustUpdatesNativeFormState(document);
    const dialog = [...document.querySelectorAll('[role="dialog"],dialog[open]')].some(node => node.getClientRects().length && !(manual && (node.closest('.plugin-updates-footer') || node.querySelector('.plugin-updates-footer'))));
    return { action: 'heartbeat', id, dirty: nativeForm.dirty || values.some(value => value.dirty), busy: nativeForm.busy || values.some(value => value.busy) || dialog, idleForMs: Math.min(86400000, Math.max(0, Date.now() - lastInteraction)) };
  }
  const heartbeat = () => api(pageState());
  function interaction() { lastInteraction = Date.now(); if (registered && alive) void heartbeat().catch(() => {}); }
  const guardChanged = () => { if (registered && alive) void heartbeat().catch(() => {}); };
  for (const event of ['pointerdown', 'keydown', 'input']) document.addEventListener(event, interaction, { capture: true, passive: true });
  pool.listeners.add(guardChanged);
  const close = () => { void fetch(route, { method: 'POST', credentials: 'same-origin', keepalive: true, headers: { 'content-type': 'application/json', 'x-stardustlc-updates': '1' }, body: JSON.stringify({ action: 'client-close', id }) }).catch(() => {}); };
  window.addEventListener('pagehide', close);
  async function refresh() { const next = await api(); if (alive) { state = __stardustUpdatesDisplayRows(__stardustUpdatesSuiteRows(next, shared.refs.values()), knownRows); notify(); } return next; }
  const STALE_CHECK_MS = 30 * 60 * 1000, STALE_RETRY_MS = 5 * 60 * 1000, staleChecks = new Map(), staleInFlight = new Set();
  function refreshIfStale(row) {
    if (!alive || !row || row.sourceKind !== 'registry' || row.bundledBy || !row.available || row.updating) return;
    const now = Date.now();
    if (row.checkedAt && now - row.checkedAt <= STALE_CHECK_MS) return;
    if (staleInFlight.has(row.name) || now - (staleChecks.get(row.name) ?? -Infinity) < STALE_RETRY_MS) return;
    staleChecks.set(row.name, now);
    staleInFlight.add(row.name);
    void (async () => {
      try { await api({ action: 'check', name: row.name }); await refresh(); }
      catch { /* Offline or transient errors stay silent and throttled by staleChecks. */ }
      finally { staleInFlight.delete(row.name); }
    })();
  }
  function useSnapshot() {
    const [, render] = useState(0);
    useEffect(() => { const fn = () => render(value => value + 1); listeners.add(fn); const stop = ctx.locale?.subscribe?.(fn); return () => { listeners.delete(fn); stop?.(); }; }, []);
    return state;
  }
  function message(code) {
    return ({
      'page-dirty': t('有未保存的修改。请先保存或放弃修改，再更新。', 'Save or discard unsaved changes before updating.'),
      'page-busy': t('有页面操作或对话框尚未结束，请完成后再试。', 'Finish the active page operation or close its dialog, then retry.'),
      'page-not-ready': t('还有窗口状态未确认，或旧版插件尚未提供状态保护。请刷新相关窗口，必要时先手动更新旧版插件。', 'A window state is unknown or an older plugin lacks state protection. Refresh the affected windows and manually update legacy plugins if needed.'),
      busy: t('DSH 正在执行任务或安装，请等操作结束。', 'DSH is running a task or installation. Wait for it to finish.'),
      'activity-unknown': t('无法确认任务是否空闲，已暂停安装。', 'Installation paused because task activity is unknown.'),
      'restart-required': t('更新服务需要重启后继续。请在方便时手动重启 DSH。', 'The updater needs a restart. Restart DSH manually when convenient.'),
      'operation-unconfirmed': t('上次安装未确认或恢复失败。请在官方插件管理中检查并修复，之后手动重启 DSH。', 'The last installation is unconfirmed or recovery failed. Check and repair it in native plugin management, then restart DSH manually.'),
      'check-first': t('检查结果已过期，请重新检查。', 'This check expired. Check again.'),
      'release-changed': t('发现更新的发布版本（或发布信息已更新），已刷新至最新状态，请再次确认安装。', 'A newer release or updated metadata was found and refreshed; confirm again to install.'),
      'preferences-conflict': t('另一个窗口修改了偏好，已刷新，请重试。', 'Preferences changed in another window. They have been refreshed; retry.'),
      'preferences-unreadable': t('更新偏好文件无法读取，自动安装已关闭。请检查当前 profile 的 stardustlc-plugin-updates.json。', 'Preferences could not be read. Automatic installation is off. Check stardustlc-plugin-updates.json in this profile.'),
      'no-update': t('版本已变化或暂不兼容，请重新检查。', 'The version changed or is incompatible. Check again.'),
      'source-not-registry': t('本地源码、Git 等安装，请通过原安装方式更新。', 'Update local, Git and other external sources through their original installation method.'),
      'managed-by-suite': t('这个插件随 Suite 安装，通过 Suite 更新。', 'This plugin was installed through Suite and is updated through Suite.'),
      'owner-required': t('只有 profile 拥有者能管理更新。', 'Only the profile owner can manage updates.'),
      'version-mismatch': t('宿主装入的版本与目标不同。请重新检查版本和软件源策略。', 'The installed version differs from the target. Check the release and registry policy.'),
      'unexpected-package': t('宿主装入的包或版本与目标不同。请检查版本和软件源策略。', 'The installed package or version differed from the target. Check the release and registry policy.'),
      'version-unconfirmed': t('尚未确认新版已加载，请在插件详情中检查当前版本。', 'The new version could not be confirmed. Check the installed version in plugin details.'),
      'build-blocked': t('构建脚本等待批准。请查看原生插件管理中的安装提示。', 'Build scripts await approval. Review the install details in native plugin management.'),
      'bundle-in-use': t('宿主暂时无法热卸载旧版（通常因本轮刚更新过其他共用底层依赖的插件，内存路径待刷新；或同时启用了包含此组件的组合包）：直接手动重启一次 DSH 即可继续更新，无需逐个停用插件。', 'The host cannot hot-unload the previous version right now (usually because another plugin sharing dependencies was updated earlier in this session, or a bundle containing this component is also active): restart DSH once and retry without disabling plugins one by one.'),
      'already-installed': t('该包已在当前配置中，请刷新或重启 DSH 后查看当前版本。', 'This package is already present in the profile; refresh or restart DSH to inspect its version.'),
      'incompatible-version': t('目标版本与当前运行的 DSH 版本不兼容。', 'The target version is incompatible with the running DSH version.'),
      'stop-profile': t('当前配置未启用热重载，需关闭 DSH 后再通过命令行更新。', 'This profile runs without hot reload; stop DSH and update via CLI.'),
      'not-removable': t('此内置或受保护插件不支持在此处移除替换。', 'This built-in or protected bundle cannot be replaced here.'),
      'pkg-network': t('连接 npm 源时网络中断，请稍后重试。', 'Network error reaching the package registry. Retry shortly.'),
      'pkg-timeout': t('包管理器请求超时，请检查网络后重试。', 'Package manager request timed out. Check your connection and retry.'),
      'pkg-not-found': t('未找到目标版本或已被源撤回，请重新检查更新。', 'Target release was not found on the registry. Check again.'),
      'pkg-no-matching-version': t('没有匹配当前兼容性要求的已发布版本。', 'No published version matches the compatibility constraints.'),
      'pkg-integrity': t('下载包的完整性校验未通过，已放弃安装，请重试。', 'Package integrity verification failed. Installation aborted; retry.'),
      'pkg-disk-full': t('磁盘空间不足，请清理后重试。', 'Disk space is full. Free disk space and retry.'),
      'pkg-permission': t('无权写入当前 profile 目录，请检查文件权限。', 'Permission denied writing to this profile directory.'),
      'pkg-pnpm-missing': t('未检测到可用的 pnpm，请在环境或宿主插件设置中检查。', 'pnpm is unavailable to the host package manager.'),
      'operation-error': t('宿主包管理器未能完成操作，可在原生「插件」详情页点击更新查看完整日志。', 'Host package manager did not complete the operation. Retry from native plugin details to inspect logs.'),
    })[code] || t('操作未完成，请刷新后重试。DSH 不会因此自动重启。', 'The operation could not be completed. Refresh and retry. DSH will not restart automatically.');
  }
  function reasonOf(job) {
    if (!job) return null;
    if (job.reason) return job.reason;
    const res = job.outcome?.result;
    if (res?.pendingBuilds || res?.failureKind === 'build-blocked') return 'build-blocked';
    if (res?.failureKind && ['network', 'timeout', 'not-found', 'no-matching-version', 'integrity', 'pnpm-missing', 'disk-full', 'permission'].includes(res.failureKind)) return 'pkg-' + res.failureKind;
    return res?.error?.code || null;
  }
  // releaseOf() keeps the failing engine/peer range check as a stable code; say which
  // environment has to change instead of only reporting that the release is incompatible.
  function requirement(release) {
    return ({
      'dsh-version': t('需要换成与该版本匹配的 DSH 本体', 'it needs a different DSH version'),
      'node-version': t('需要换成与该版本匹配的 Node.js', 'it needs a different Node.js version'),
      deprecated: t('作者已把这个版本标记为弃用', 'the author marked this release as deprecated'),
      'not-bundle': t('这个版本不是可加载的 DSH 插件包', 'this release is not a loadable DSH plugin bundle'),
    })[release?.reason] || t('发布元数据的兼容范围与当前环境不符', 'its published compatibility range does not match this environment');
  }
  function jobLabel(job) {
    if (job.state === 'installing') {
      const phase = ({
        checking: t('宿主正在检查版本', 'Host checking release'),
        removing: t('正在卸载旧版', 'Unloading the previous version'),
        applying: t('正在加载新版', 'Loading the new version'),
        restoring: t('正在恢复旧版', 'Restoring the previous version'),
      })[job.phase];
      if (phase) return phase;
    }
    return ({ verifying: t('正在核对版本', 'Verifying release'), installing: t('正在安装', 'Installing'), cancelling: t('正在请求取消', 'Requesting cancellation'), complete: t('已更新', 'Updated'), 'restart-required': t('已安装，等待你手动重启', 'Installed; manual restart needed'), restored: t('更新未成功，已恢复原版本', 'Update failed; previous version restored'), 'restore-failed': t('恢复未成功，请检查官方插件管理', 'Recovery failed; check native plugin management'), unknown: t('结果未确认，请检查官方插件管理', 'Result unconfirmed; check native plugin management'), cancelled: t('已取消', 'Cancelled'), failed: t('更新未成功', 'Update failed') })[job.state] || job.state;
  }
  const FOOTER_CSS = '.plugin-updates-footer{box-sizing:border-box;flex-shrink:0;margin-top:16px;padding-top:14px;border-top:var(--dsh-control-border-width,0.5px) solid var(--dsw-alias-border-l2,var(--dsw-alias-border-l3,#e5e7eb));min-width:0;max-width:100%;color:var(--dsw-alias-label-primary,#202124)}'
    + '.dshw.plugin-updates-footer.is-inline{display:block!important;width:100%!important;max-width:100%!important;margin-block:auto 0!important;margin-inline:0!important;padding:6px 14px!important;border-top:var(--dsh-control-border-width,0.5px) solid var(--dsw-alias-border-l2,var(--dsw-alias-border-l3,#e5e7eb));background:var(--dsw-alias-bg-layer-1,var(--w-soft,#f7f8fa));font-size:12px;line-height:1.45}'
    + '.plugin-updates-footer .updates-bar{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px 12px;min-block-size:28px;min-width:0}'
    + '.plugin-updates-footer .updates-bar-info,.plugin-updates-footer .updates-bar-actions,.plugin-updates-footer .updates-head-actions,.plugin-updates-footer .updates-title-row{display:flex;align-items:center;flex-wrap:wrap;gap:6px 8px;min-width:0}'
    + '.plugin-updates-footer .updates-head{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px 12px}'
    + '.plugin-updates-footer .updates-compact-bar{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px 12px}'
    + '.plugin-updates-footer .updates-compact-bar>.updates-options{margin-top:0;min-width:0}'
    + '.plugin-updates-footer .updates-compact-bar>.updates-options[open]{flex:1 1 100%}'
    + '.plugin-updates-footer h2{font-size:13.5px;line-height:1.4;margin:0;font-weight:600}'
    + '.plugin-updates-footer .updates-pill{display:inline-flex;align-items:center;padding:1px 7px;border-radius:999px;font-size:11px;font-weight:600;line-height:1.5;background:var(--dsw-alias-bg-layer-2,var(--w-soft,#eef1f6));color:var(--dsw-alias-label-secondary,#657080)}'
    + '.plugin-updates-footer .updates-pill.is-accent{background:color-mix(in srgb,var(--w-accent,#4f6bdb) 14%,transparent);color:var(--w-accent,#4f6bdb)}'
    + '.plugin-updates-footer .updates-pill.is-error{background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#ad3636) 14%,transparent);color:var(--dsw-alias-state-error-primary,#ad3636)}'
    + '.plugin-updates-footer .updates-mono,.plugin-updates-footer .updates-subtitle,.plugin-updates-footer .updates-version{font:12px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace;overflow-wrap:anywhere;margin:0}'
    + '.plugin-updates-footer .updates-badge{padding:1px 6px;border-radius:5px;background:var(--dsw-alias-bg-layer-2,var(--w-soft,#eef1f6));color:var(--dsw-alias-label-secondary,#657080)}'
    + '.plugin-updates-footer .updates-meta-line,.plugin-updates-footer .updates-note{margin:3px 0 0;font-size:12px;line-height:1.55}'
    + '.plugin-updates-footer .updates-inline-msg.is-error{color:var(--dsw-alias-state-error-primary,#ad3636);font-size:12px}'
    + '.plugin-updates-footer .w-button.is-sm{min-block-size:26px;min-inline-size:26px;min-height:26px;padding:3px 9px;font-size:12px;gap:5px;border-radius:6px}'
    + '.plugin-updates-footer .updates-options{margin-top:8px}'
    + '.plugin-updates-footer .updates-options>summary{cursor:pointer;display:inline-flex;align-items:center;gap:0.55ch;min-block-size:24px;font-size:12px;line-height:1.5;font-weight:500;color:var(--dsw-alias-label-secondary,#657080);list-style:none}'
    + '.plugin-updates-footer .updates-options>summary:after{display:none}'
    + '.plugin-updates-footer .updates-options>summary::before{content:"";inline-size:6px;block-size:6px;flex-shrink:0;border-inline-end:1.5px solid currentColor;border-block-end:1.5px solid currentColor;rotate:-45deg}'
    + '.plugin-updates-footer .updates-options>summary:dir(rtl)::before{rotate:135deg}'
    + '.plugin-updates-footer .updates-options[open]>summary::before{rotate:45deg}'
    + '.plugin-updates-footer .updates-options>summary:focus-visible{outline:2px solid var(--dsw-focus-ring-color,#6b79df);outline-offset:3px;border-radius:4px}'
    + '.plugin-updates-footer details::details-content{interpolate-size:allow-keywords;overflow:clip;contain:layout}'
    + '.plugin-updates-footer details:not([open])::details-content{block-size:0}'
    + '.plugin-updates-footer .updates-settings{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,250px),1fr));gap:14px;padding:10px 0 2px}'
    + '.plugin-updates-footer>.w-section{margin:8px 0 0;padding:0;border:0}'
    + '.plugin-updates-footer .w-toolbar{margin-top:8px!important}'
    + '.plugin-updates-footer .w-switch-label{max-width:100%;gap:12px;align-items:flex-start}'
    + '.plugin-updates-footer .w-switch-track{flex-shrink:0}'
    + '.plugin-updates-footer .updates-notes{margin-top:8px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l3,#e5e7eb);border-radius:8px;background:var(--dsw-alias-bg-base,var(--w-bg,#fff))}'
    + '.plugin-updates-footer .updates-notes pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:220px;overflow:auto;margin:6px 0;padding:10px;font:12px/1.65 ui-monospace,monospace}'
    + '.plugin-updates-footer .updates-notes pre code{font:inherit;background:transparent;padding:0}'
    + '.plugin-updates-footer .updates-links{display:flex;flex-wrap:wrap;align-items:center;gap:4px 14px;margin-top:10px;padding-top:8px;border-top:1px dashed var(--dsw-alias-border-l3,#e5e7eb);font-size:12px;line-height:1.5;color:var(--dsw-alias-label-secondary,#657080)}'
    + '.plugin-updates-footer .updates-links a{color:inherit;text-decoration:none;display:inline-flex;align-items:center;min-block-size:24px;gap:4px}'
    + '.plugin-updates-footer .updates-links a:hover{color:var(--dsw-alias-label-primary,#202124);text-decoration:underline}'
    + '.plugin-updates-footer .updates-links a:focus-visible{outline:2px solid var(--dsw-focus-ring-color,#6b79df);outline-offset:3px;border-radius:4px}'
    + '.plugin-updates-footer .w-overlay{z-index:1002}'
    + '.plugin-updates-footer .updates-auto-nudge{display:flex;align-items:center;flex-wrap:wrap;gap:6px 10px;margin-top:6px;font-size:12px;color:var(--dsw-alias-label-secondary,#657080)}'
    + '@media(pointer:coarse){.plugin-updates-footer .w-button.is-sm{min-block-size:32px;min-height:32px;padding:5px 11px}}'
    + '@media(prefers-reduced-motion:no-preference){.plugin-updates-footer .updates-options>summary::before{transition:rotate .18s ease}.plugin-updates-footer details::details-content{transition:block-size .22s ease,content-visibility .22s ease allow-discrete}}'
    + '@media(max-width:600px){.plugin-updates-footer .updates-head{gap:8px}.plugin-updates-footer .w-toolbar{gap:6px;flex-wrap:wrap}.plugin-updates-footer .w-button{max-width:100%}}';
  function FooterFrame({ name, label, inline = false, supplement = false, head, children }) {
    return h('section', { className: 'dshw plugin-updates-footer' + (inline ? ' is-inline' : ''), 'data-plugin-update-footer': name, 'aria-label': label + (supplement ? t(' · 自动更新与反馈', ' · Auto-update and feedback') : t(' · 版本与更新', ' · Version and updates')) },
      h('style', null, W.styles),
      h('style', null, FOOTER_CSS),
      head, children);
  }
  function Panel({ name, inline = false }) {
    const snapshot = useSnapshot(), [error, setError] = useState(''), [working, setWorking] = useState(false), [checking, setChecking] = useState(false), [dialog, setDialog] = useState(null), [selectedVersion, setSelectedVersion] = useState(null), [notes, setNotes] = useState(null), [notesOpen, setNotesOpen] = useState(false), [loadingNotes, setLoadingNotes] = useState(false), [dismissedJobId, setDismissedJobId] = useState(null);
    const seenActiveJob = useRef ? useRef(null) : { current: null };
    const row = rowFor(name), original = originalRow(name), target = row?.name || name, prefs = preferences(target), job = snapshot?.job?.name === target ? snapshot.job : null;
    if (job && ['verifying', 'installing', 'cancelling'].includes(job.state)) seenActiveJob.current = job.id;
    const panelStaleTarget = !!snapshot && !!row && !!original && (!inline || (row.sourceKind === 'registry' && row.available && prefs.deferredUntil <= Date.now() && prefs.ignoredVersion !== row.release?.version));
    useEffect(() => { if (panelStaleTarget && !activeJob()) refreshIfStale(row); }, [panelStaleTarget, row?.name, row?.available, row?.checkedAt]);
    async function perform(callback) { setError(''); setWorking(true); try { await callback(); await refresh(); } catch (error) { setError(error.message); await refresh().catch(() => {}); } finally { setWorking(false); } }
    async function save(changes, consent) { await api({ action: 'preferences', name: target, revision: state.preferences.revision, changes, consent }); }
    async function check() { setError(''); setChecking(true); try { staleChecks.set(target, Date.now()); await api({ action: 'check', name: target }); await refresh(); } catch (error) { setError(error.message); } finally { setChecking(false); } }
    async function runOperation(request) {
      setDialog(null); manualOperation = true; notify();
      setError(''); setWorking(true);
      try {
        try {
          await heartbeat();
          const started = await api(request);
          seenActiveJob.current = started.id;
          while (alive) {
            await new Promise(resolve => setTimeout(resolve, 800)); await heartbeat(); await refresh();
            if (state.job?.id !== started.id) throw new Error('operation-unconfirmed');
            if (!activeJob()) break;
          }
          await refresh();
        } finally { manualOperation = false; notify(); }
      } catch (err) {
        setError(err.message);
        if (request.action === 'install' && ['check-first', 'release-changed'].includes(err?.message)) {
          staleChecks.set(target, Date.now());
          await api({ action: 'check', name: target }).catch(() => {});
        }
        await refresh().catch(() => {});
      } finally { setWorking(false); }
    }
    async function showNotes() {
      if (notesOpen) { setNotesOpen(false); return; }
      setNotesOpen(true); setNotes(null); setLoadingNotes(true); setError('');
      try { setNotes(await api({ action: 'notes', name: target, version: row.release.version })); } catch (error) { setError(error.message); } finally { setLoadingNotes(false); }
    }
    if (inline && (!snapshot || !row || !original)) return null;
    if (!snapshot) return h('p', { className: 'dshw w-muted' }, t('正在读取更新状态…', 'Loading update status…'));
    if (!row || !original) return h(W.Status, null, t('此插件尚未安装或已从当前 profile 移除。', 'This plugin is not installed in the current profile.'));
    const title = language() === 'en' ? original.labelEn : original.label;
    const ownPage = pageState(true), unconfirmed = ['unknown', 'restore-failed'].includes(snapshot.job?.state);
    const staleWindows = (snapshot.pages.clients || []).some(client => !client.fresh);
    const pageBusy = ownPage.busy || (snapshot.pages.clients || []).some(client => client.id !== id && client.busy);
    const installLocked = working || activeJob() || unconfirmed || snapshot.updaterRestart || snapshot.preferenceError || !snapshot.activity.known
      || snapshot.activity.busy || snapshot.pages.dirty || ownPage.dirty || pageBusy || !snapshot.pages.known;
    const checkingThis = checking || snapshot.checkingNames?.includes(target);
    const managed = row.sourceKind === 'registry';
    const showUpdate = managed && row.available;
    const deferred = prefs.deferredUntil > Date.now();
    const ignored = !!row.release?.version && prefs.ignoredVersion === row.release.version;
    const actionableUpdate = showUpdate && !deferred && !ignored;
    const canConfirm = showUpdate && row.release?.version === selectedVersion && !installLocked && !row.loadError;
    const isSuite = target === '@stardustlc/dsh-suite';
    const jobResult = job?.outcome?.result;
    const jobReason = reasonOf(job);
    const jobActiveThis = !!job && ['verifying', 'installing', 'cancelling'].includes(job.state);
    const canCancel = jobActiveThis && !['applying', 'restoring'].includes(job.phase);
    const jobAttentionThis = !!job && ['restart-required', 'restored', 'restore-failed', 'unknown', 'failed'].includes(job.state) && (unconfirmed || dismissedJobId !== job.id);
    const jobJustCompleted = !!job && job.state === 'complete' && seenActiveJob.current === job.id && dismissedJobId !== job.id;
    const canSuggestAuto = !!job && job.state === 'complete' && !jobReason && job.mode !== 'automatic' && (!prefs.autoInstall || prefs.autoScope !== 'compatible') && managed && !snapshot.preferenceError && dismissedJobId !== job.id;
    const inlineJobVisible = jobActiveThis || jobAttentionThis || jobJustCompleted;
    if (inline && !actionableUpdate && !inlineJobVisible && !working && !checking && !error && !dialog && !notesOpen) return null;
    const notesSection = notesOpen && h('section', { className: 'updates-notes', 'aria-label': t('更新记录', 'Release notes') },
      h('strong', null, target + ' · ' + (notes?.version || row.release?.version || '')),
      loadingNotes ? h('p', { className: 'w-muted updates-note' }, t('正在读取…', 'Loading…'))
        : notes?.text ? h('pre', { tabIndex: 0, role: 'region', 'aria-label': t('更新记录内容', 'Release notes content') }, h('code', null, notes.text))
        : h('p', { className: 'w-muted updates-note' }, t('未找到此版本的独立更新记录。', 'No separate notes were found for this version.')),
      notes?.url && h('a', { href: notes.url, target: '_blank', rel: 'noreferrer noopener' }, t('查看仓库更新记录', 'View repository changelog')));
    const windowsDialog = dialog === 'windows' && h(W.Dialog, { title: t('断开的窗口都已关闭？', 'Are the disconnected windows closed?'), closeLabel: t('关闭', 'Close'), onClose: () => setDialog(null) },
      h('div', { className: 'w-stack' }, h('p', null, t('只清除超过 45 秒未回应的其他窗口记录。请先确认它们已经关闭；仍在使用的窗口请保存修改并刷新。当前或仍在回应的窗口保护会保留。', 'Only other windows silent for over 45 seconds are cleared. Confirm that they are closed; save and refresh windows still in use. Current and responsive windows remain protected.')), h('div', { className: 'w-toolbar' }, h(W.Button, { onClick: () => setDialog(null) }, t('取消', 'Cancel')), h(W.Button, { onClick: () => { setDialog(null); void perform(() => api({ ...pageState(true), action: 'reconfirm-windows', confirmation: 'other-stale-windows-are-closed' })); } }, t('已关闭，重新确认状态', 'They are closed; reconfirm')))));
    const confirmDialog = ['automatic', 'install'].includes(dialog) && h(W.Dialog, { title: dialog === 'automatic' ? (isSuite ? t('允许 Suite 空闲时自动热更新？', 'Allow idle automatic updates for Suite?') : t('允许这个插件空闲时自动热更新？', 'Allow idle automatic updates for this plugin?')) : (isSuite ? t('确认更新 Suite 整包', 'Confirm Suite bundle update') : t('确认更新此插件', 'Confirm this plugin update')), closeLabel: t('关闭', 'Close'), onClose: () => setDialog(null) },
      dialog === 'automatic' ? h('div', { className: 'w-stack' }, h('p', null, (language() === 'en' ? row.labelEn : row.label) + ' · ' + target), isSuite && h('p', null, t('此处设置作用于 Suite 整包（包含 18 个组件）。独立安装的其他插件不受影响。', 'This setting applies to the whole Suite (including its 18 components). Other independently installed plugins are unaffected.')), h('p', null, t('你正在主动启用自动安装。只处理通过当前 DSH 与 Node 兼容性校验的稳定版本（含功能小版本与补丁，跨主版本仍需手动确认）；有任务、未保存修改、未知窗口或等待重启时暂停。', 'You are explicitly enabling automatic installation for compatible stable releases (minor and patch updates matching this DSH and Node runtime; major upgrades still require manual confirmation). Running tasks, unsaved changes, unknown windows or a pending restart pause it.')), h('p', null, t('支持热更新时原地重载，不会自动重启 DSH；其他插件不会跟着开启，可随时关闭。', 'Hot-reloads in place when supported and never restarts DSH automatically. Other plugins remain unchanged; turn it off anytime.')), h('div', { className: 'w-toolbar' }, h(W.Button, { onClick: () => setDialog(null) }, t('保持关闭', 'Keep off')), h(W.Button, { variant: 'primary', onClick: () => { setDialog(null); void perform(() => save({ checkEnabled: true, autoInstall: true, autoScope: 'compatible' }, 'enable-idle-compatible-updates')); } }, t('允许空闲自动热更新', 'Allow idle automatic updates')))) :
      h('div', { className: 'w-stack' },
        isSuite && h('p', null, t('此处操作的是 Suite 整包，包含 18 个组件。独立安装的其他插件不受影响。', 'This action applies to the whole Suite, including its 18 components. Other independently installed plugins are unaffected.')),
        h('p', { className: 'updates-version' }, target + ' · ' + row.version + ' → ' + selectedVersion),
        h('p', null, selectedVersion === row.release?.version ? t('Harness 会热更新并重新加载；需要手动重启时，更新区会显示宿主结果，停用状态会保留。', 'Harness hot-updates and reloads in place. If a manual restart is needed, it appears in the update result; disabled status is preserved.') : (showUpdate && row.release?.version ? message('release-changed') : message('check-first'))),
        h('div', { className: 'w-toolbar' }, h(W.Button, { onClick: () => setDialog(null) }, t('取消', 'Cancel')),
          showUpdate && row.release?.version && row.release.version !== selectedVersion
            ? h(W.Button, { variant: 'primary', disabled: installLocked || row.loadError, onClick: () => { setError(''); setSelectedVersion(row.release.version); } }, t('更新为 v', 'Use v') + row.release.version)
            : h(W.Button, { variant: 'primary', disabled: !canConfirm, onClick: () => runOperation({ action: 'install', name: target, version: selectedVersion, confirmation: 'update-installed-plugin' }) }, t('安装此版本', 'Install this version')))));
    const checkButton = variant => h(W.Button, { variant, className: 'is-sm', icon: 'refresh', disabled: checkingThis || !managed, onClick: check }, checkingThis ? t('正在检查…', 'Checking…') : isSuite ? t('检查整包更新', 'Check Suite updates') : t('检查更新', 'Check for updates'));
    const recheckButton = variant => h(W.Button, { variant, className: 'is-sm', icon: 'refresh', disabled: checkingThis || !managed, onClick: check }, checkingThis ? t('正在检查…', 'Checking…') : t('重新检查', 'Check again'));
    const primary = showUpdate
      ? h(W.Button, { variant: 'primary', className: 'is-sm', icon: 'download', disabled: installLocked || row.loadError, onClick: () => { setError(''); if (job && !jobActiveThis && !unconfirmed) setDismissedJobId(job.id); setSelectedVersion(row.release.version); setDialog('install'); } }, (isSuite ? t('更新 Suite 至 v', 'Update Suite to v') : t('更新至 v', 'Update to v')) + row.release.version)
      : managed ? checkButton() : null;
    if (inline) {
      const lockHint = unconfirmed ? message('operation-unconfirmed')
        : snapshot.updaterRestart ? message('restart-required')
        : snapshot.preferenceError ? message('preferences-unreadable')
        : (snapshot.pages.dirty || ownPage.dirty) ? t('请先保存修改后再更新', 'Save changes before updating')
        : (snapshot.activity.busy || pageBusy) ? t('当前任务或对话框结束后可更新', 'Finish active task or dialog to update')
        : (!snapshot.activity.known || !snapshot.pages.known) ? t('等待窗口状态确认', 'Waiting for window confirmation')
        : '';
      return h(FooterFrame, { name, label: title, inline: true, head: h('div', { className: 'updates-bar' },
        h('div', { className: 'updates-bar-info' },
          inlineJobVisible
            ? h(React.Fragment, null,
              h('span', { className: 'updates-pill' + (jobActiveThis ? ' is-accent' : ['failed', 'restore-failed', 'unknown', 'restored'].includes(job.state) ? ' is-error' : '') }, jobLabel(job)),
              job.to && h('span', { className: 'updates-mono' }, (isSuite ? 'dsh-suite ' : '') + job.from + ' → ' + job.to),
              jobReason && h('span', { className: 'updates-inline-msg is-error' }, message(jobReason)))
            : actionableUpdate ? h(React.Fragment, null,
              h('span', { className: 'updates-pill is-accent' }, isSuite ? t('Suite 新版本', 'Suite update') : t('有新版本', 'Update available')),
              h('span', { className: 'updates-mono' }, (isSuite ? 'dsh-suite ' : '') + 'v' + row.version + ' → v' + row.release.version),
              lockHint && h('span', { className: 'w-muted' }, '· ' + lockHint)) : null,
          error && h('span', { className: 'updates-inline-msg is-error', role: 'alert' }, message(error))),
        h('div', { className: 'updates-bar-actions' },
          staleWindows && actionableUpdate && h(W.Button, { variant: 'ghost', className: 'is-sm', onClick: () => setDialog('windows') }, t('确认已关闭窗口', 'Confirm closed windows')),
          canCancel && h(W.Button, { className: 'is-sm', disabled: job?.state === 'cancelling', onClick: () => perform(() => api({ action: 'cancel', id: job.id })) }, t('取消更新', 'Cancel update')),
          !jobActiveThis && error === 'check-first' && managed && recheckButton(actionableUpdate ? 'ghost' : 'primary'),
          !jobActiveThis && actionableUpdate && row.release && h(W.Button, { variant: 'ghost', className: 'is-sm', onClick: showNotes, 'aria-expanded': notesOpen }, t('更新记录', 'Release notes')),
          !jobActiveThis && actionableUpdate && h(W.Button, { variant: 'ghost', className: 'is-sm', disabled: working, onClick: () => perform(() => api({ action: 'later', name: target, revision: state.preferences.revision })) }, t('明天再提醒', 'Remind me tomorrow')),
          !jobActiveThis && actionableUpdate && h(W.Button, { variant: 'ghost', className: 'is-sm', disabled: working, onClick: () => perform(() => api({ action: 'ignore', name: target, revision: state.preferences.revision, version: row.release.version })) }, t('忽略此版', 'Ignore')),
          !jobActiveThis && actionableUpdate && primary,
          !jobActiveThis && !actionableUpdate && canSuggestAuto && h(W.Button, { variant: 'primary', className: 'is-sm', disabled: working, onClick: () => { setError(''); setDialog('automatic'); } }, t('开启空闲自动热更新', 'Enable idle auto-updates')),
          !jobActiveThis && !actionableUpdate && !unconfirmed && h(W.Button, { variant: 'ghost', className: 'is-sm', onClick: () => { setError(''); setNotesOpen(false); if (job) setDismissedJobId(job.id); } }, t('关闭', 'Dismiss')))) },
        notesSection, windowsDialog, confirmDialog);
    }
    function progress() {
      if (!job || (!jobActiveThis && !unconfirmed && dismissedJobId === job.id)) return null;
      if (job.state === 'complete' && !jobReason) {
        return job.to ? h('div', null,
          h('p', { className: 'w-muted updates-note' }, '✓ ' + jobLabel(job) + ' · ' + job.from + ' → ' + job.to + (job.mode === 'automatic' ? t(' · 自动更新', ' · Automatic update') : '')),
          canSuggestAuto && h('div', { className: 'updates-auto-nudge' },
            h('span', null, t('以后有兼容新版本时，需要空闲自动热更新吗？', 'Auto-install future compatible updates while idle?')),
            h(W.Button, { variant: 'ghost', className: 'is-sm', disabled: working, onClick: () => { setError(''); setDialog('automatic'); } }, t('开启空闲自动热更新', 'Enable idle auto-updates')),
            h(W.Button, { variant: 'ghost', className: 'is-sm', onClick: () => setDismissedJobId(job.id) }, t('关闭', 'Dismiss')))) : null;
      }
      return h('section', { className: 'w-section', role: 'status', 'aria-label': t('更新进度', 'Update progress') },
        h('h3', null, jobLabel(job)),
        job.to && h('p', { className: 'w-muted' }, job.from + ' → ' + job.to + (job.mode === 'automatic' ? t(' · 自动更新', ' · Automatic update') : '')),
        job.state === 'restart-required' && jobResult?.restartReason === 'package-moved' && h('p', { className: 'w-muted updates-note' }, t('新版已就绪；因多个独立插件共用底层依赖，请先手动重启一次 DSH 生效后再继续更新其他插件。', 'Installed; because standalone plugins share dependencies, restart DSH once before updating additional plugins.')),
        jobReason && h(W.Status, { tone: 'error' }, message(jobReason)),
        h('div', { className: 'updates-bar-actions', style: { marginTop: '6px' } },
          canCancel && h(W.Button, { className: 'is-sm', disabled: job.state === 'cancelling', onClick: () => perform(() => api({ action: 'cancel', id: job.id })) }, t('取消更新', 'Cancel update')),
          !jobActiveThis && !unconfirmed && h(W.Button, { variant: 'ghost', className: 'is-sm', onClick: () => setDismissedJobId(job.id) }, t('关闭提示', 'Dismiss'))));
    }
    function windowControls() {
      if (!staleWindows) return null;
      return h(W.Status, null, h('p', null, t('有窗口已断开，无法确认是否还有未保存修改。仍在使用的窗口请先保存并刷新；已关闭的窗口可以手动重新确认。', 'A disconnected window may contain unsaved changes. Save and refresh windows still in use. If they are closed, you can confirm that manually.')), h(W.Button, { className: 'is-sm', onClick: () => setDialog('windows') }, t('重新确认已关闭的窗口', 'Confirm closed windows')));
    }
    const incompatibleText = row.release && !row.release.compatible ? t('新版本暂不兼容当前环境：', 'Latest release is incompatible with this environment: ') + requirement(row.release) + (row.release.required ? ' (' + row.release.required + ')' : '') : '';
    const optionsSection = h('details', { className: 'updates-options' },
      h('summary', null, !original.bundledBy ? t('自动更新与提醒', 'Auto-update & reminders') : t('更新选项', 'Update options'), ' · ', prefs.checkEnabled ? t('自动检查：开', 'Checks: on') : t('自动检查：关', 'Checks: off'), ' · ', prefs.autoInstall ? (prefs.autoScope === 'compatible' ? t('空闲自动热更新：兼容版', 'Idle auto-update: compatible') : t('空闲自动热更新：仅补丁', 'Idle auto-update: patches')) : t('空闲自动热更新：关', 'Idle auto-update: off')),
      h('section', { className: 'updates-settings', 'aria-label': t('这个插件的更新偏好', 'Update preferences for this plugin') },
        h('div', null, h(W.Switch, { label: isSuite ? t('自动检查 Suite 整包更新', 'Automatically check Suite updates') : t('自动检查这个插件的更新', 'Automatically check this plugin'), checked: prefs.checkEnabled, disabled: working || !!snapshot.preferenceError || !managed, onChange: event => perform(() => save({ checkEnabled: event.target.checked })) }), h('p', { className: 'w-muted updates-note' }, t('默认开启，每 6 小时最多一次。只影响这个安装包，关闭后仍可手动检查。', 'On by default, at most every 6 hours. This affects only this bundle; manual checks remain available.'))),
        h('div', null, h(W.Switch, { label: isSuite ? t('空闲时自动热更新 Suite 兼容版本', 'Auto-install compatible Suite updates while idle') : t('空闲时自动热更新兼容版本', 'Auto-install compatible updates while idle'), checked: prefs.autoInstall, disabled: working || !!snapshot.preferenceError || !managed, onChange: event => event.target.checked ? (setError(''), setDialog('automatic')) : perform(() => save({ autoInstall: false })) }), h('p', { className: 'w-muted updates-note' }, t('默认关闭。明确开启后，仅在空闲且无未保存修改时热更新兼容稳定版（含功能小版本与补丁，不含跨主版本）。其他插件的开关不变。', 'Off by default. Explicitly enable compatible stable updates (minor and patch, excluding major) while idle with no unsaved changes. Other plugins’ settings stay unchanged.')), prefs.autoInstall && prefs.autoScope !== 'compatible' && h(W.Button, { variant: 'ghost', className: 'is-sm', disabled: working, onClick: () => { setError(''); setDialog('automatic'); } }, t('升级为包含兼容功能小版本', 'Include compatible minor updates')))));
    const errorStatus = error && h(W.Status, { tone: 'error' }, error === 'check-first' && managed ? h('div', { className: 'updates-bar-actions' }, h('span', null, message(error)), recheckButton('ghost')) : message(error));
    const linksNav = (() => {
      const ownRepo = repoUrl(original.name), suiteRepo = repoUrl('@stardustlc/dsh-suite'), starRepo = isSuite ? suiteRepo : ownRepo;
      if (!ownRepo && !starRepo) return null;
      return h('nav', { className: 'updates-links', 'aria-label': t('开源仓库与反馈', 'Repository and feedback') },
        starRepo && h('a', { href: starRepo, target: '_blank', rel: 'noreferrer noopener' }, isSuite ? t('★ 觉得好用？在 GitHub 给 dsh-suite 点个 Star', '★ Useful? Star dsh-suite on GitHub') : t('★ 觉得好用？在 GitHub 点个 Star', '★ Useful? Star on GitHub')),
        ownRepo && h('a', { href: ownRepo + '/issues', target: '_blank', rel: 'noreferrer noopener' }, t('提交建议 / 问题反馈', 'Feedback & issues')),
        isSuite && original.name !== '@stardustlc/dsh-suite' && ownRepo && h('a', { href: ownRepo, target: '_blank', rel: 'noreferrer noopener' }, t('组件仓库', 'Component repo')),
        !isSuite && suiteRepo && h('a', { href: suiteRepo, target: '_blank', rel: 'noreferrer noopener' }, t('了解 dsh-suite（18 合 1 组合包）', 'Explore dsh-suite (18-in-1 bundle)')));
    })();
    if (!original.bundledBy) {
      // Native bundle detail pages in DSH already render their own Version & Source sections
      // ("重新检查", version list & "更新" button). Keep only non-duplicative auto-update preferences,
      // inline changelog notes, compatibility/error diagnostics, and GitHub feedback links here.
      return h(FooterFrame, { name, label: title, supplement: true, head: h('div', { className: 'updates-compact-bar' },
        optionsSection,
        (row.release || (showUpdate && (!deferred || !ignored))) && h('div', { className: 'updates-head-actions' },
          row.release && h(W.Button, { variant: 'ghost', className: 'is-sm', onClick: showNotes, 'aria-expanded': notesOpen }, t('更新记录', 'Release notes')),
          showUpdate && !deferred && h(W.Button, { variant: 'ghost', className: 'is-sm', disabled: working, onClick: () => perform(() => api({ action: 'later', name: target, revision: state.preferences.revision })) }, t('推迟提醒 24h', 'Snooze 24h')),
          showUpdate && !ignored && h(W.Button, { variant: 'ghost', className: 'is-sm', disabled: working, onClick: () => perform(() => api({ action: 'ignore', name: target, revision: state.preferences.revision, version: row.release.version })) }, t('忽略此版提醒', 'Mute reminder')))) },
        notesSection,
        incompatibleText && h(W.Status, null, incompatibleText),
        errorStatus, snapshot.preferenceError && h(W.Status, { tone: 'error' }, message('preferences-unreadable')),
        snapshot.pendingRestart && h(W.Status, null, snapshot.updaterRestart ? message('restart-required') : t('已有插件更新等待手动重启后生效；空闲自动热更新已暂停，建议先重启一次 DSH 再继续更新其他共用依赖的插件。', 'An update awaits a manual restart; idle auto-updates are paused. Restart DSH once before updating other plugins that share dependencies.')),
        prefs.autoInstall && snapshot.autoReady === false && h(W.Status, null, message('page-not-ready')),
        (prefs.autoInstall || jobActiveThis) && windowControls(),
        jobActiveThis && (snapshot.pages.dirty || ownPage.dirty) && h(W.Status, null, message('page-dirty')),
        jobActiveThis && (snapshot.activity.busy || pageBusy) && h(W.Status, null, message(snapshot.activity.busy ? 'busy' : 'page-busy')),
        deferred && h('p', { className: 'w-muted updates-note' }, t('已推迟此插件的工作台更新提示 24 小时。', 'Workbench update notices for this plugin are snoozed for 24 hours.')),
        unconfirmed && h(W.Status, { tone: 'error' }, message('operation-unconfirmed')),
        progress(),
        linksNav,
        windowsDialog, confirmDialog
      );
    }
    const status = !managed ? t('本地 / 外部来源，保留原安装方式', 'Local / external source; keep original install method') : row.loadError ? t('加载异常，请先检查原生插件管理', 'Loading error; check native plugin management') : row.error ? t('检查失败，可以重试', 'Check failed; retry available') : incompatibleText || (row.available ? (ignored ? t('已忽略提醒，仍可手动更新', 'Reminder ignored; manual update available') : t('有兼容的新版本', 'Compatible update available')) : row.checkedAt ? t('当前已是最新稳定版', 'Latest stable version') : t('尚未检查', 'Not checked yet'));
    return h(FooterFrame, { name, label: title, head: h('div', { className: 'updates-head' },
      h('div', null,
        h('div', { className: 'updates-title-row' }, h('h2', null, t('随 Suite 整包管理', 'Managed via Suite bundle')), h('span', { className: 'updates-mono updates-badge' }, original.name + ' · v' + original.version)),
        h('p', { className: 'w-muted updates-meta-line' }, status, row.checkedAt ? ' · ' + t('上次检查：', 'Last checked: ') + new Date(row.checkedAt).toLocaleString(language() === 'en' ? 'en-US' : 'zh-CN') : ''),
        h('p', { className: 'updates-version updates-note' }, target + ' · v' + row.version, row.release?.version && row.release.version !== row.version ? ' → v' + row.release.version : '')),
      h('div', { className: 'updates-head-actions' },
        showUpdate && checkButton('ghost'),
        row.release && h(W.Button, { variant: 'ghost', className: 'is-sm', onClick: showNotes, 'aria-expanded': notesOpen }, t('更新记录', 'Release notes')),
        showUpdate && !deferred && h(W.Button, { variant: 'ghost', className: 'is-sm', disabled: working, onClick: () => perform(() => api({ action: 'later', name: target, revision: state.preferences.revision })) }, t('明天再提醒', 'Remind me tomorrow')),
        showUpdate && !ignored && h(W.Button, { variant: 'ghost', className: 'is-sm', disabled: working, onClick: () => perform(() => api({ action: 'ignore', name: target, revision: state.preferences.revision, version: row.release.version })) }, t('忽略此版本提醒', 'Ignore this reminder')),
        primary)) },
      notesSection,
      optionsSection,
      errorStatus, snapshot.preferenceError && h(W.Status, { tone: 'error' }, message('preferences-unreadable')),
      snapshot.pendingRestart && h(W.Status, null, snapshot.updaterRestart ? message('restart-required') : t('已有插件更新等待手动重启后生效；空闲自动热更新已暂停。', 'An update awaits a manual restart; idle auto-updates are paused.')),
      prefs.autoInstall && snapshot.autoReady === false && h(W.Status, null, message('page-not-ready')),
      windowControls(),
      (showUpdate || jobActiveThis) && (snapshot.pages.dirty || ownPage.dirty) && h(W.Status, null, message('page-dirty')),
      (showUpdate || jobActiveThis) && (snapshot.activity.busy || pageBusy) && h(W.Status, null, message(snapshot.activity.busy ? 'busy' : 'page-busy')),
      deferred && h(W.Status, null, t('已推迟 Suite 提醒和自动安装 24 小时，仍可手动更新。', 'Suite reminders and automatic installation are deferred for 24 hours. Manual updates remain available.')),
      unconfirmed && h(W.Status, { tone: 'error' }, message('operation-unconfirmed')),
      progress(),
      linksNav,
      windowsDialog, confirmDialog
    );
  }
  function InlineFooter({ name }) { return h(Panel, { name, inline: true }); }
  function NativeFooter({ subject }) {
    const snapshot = useSnapshot(), name = __stardustUpdatesDetailName(subject, snapshot?.rows || []);
    return name ? h(Panel, { name, inline: false }) : null;
  }
  function register() {
    if (!alive) return;
    if (!registered) {
      registered = true; pool.clients.add(client);
      ctx.slots.inject('plugins.detail.section', () => ctx.slots.register({ name: 'plugins.detail.section', id: 'stardustlc.plugin-update-footer', order: 1000 }, NativeFooter));
      notify();
    }
  }
  async function poll() {
    if (inPoll || !alive || !shared.refs.size) return;
    inPoll = true;
    try { await refresh(); register(); await heartbeat(); }
    catch { /* Owner-only controls stay absent for guests and unsupported hosts. */ }
    finally { inPoll = false; }
  }
  const timer = setInterval(() => { void poll(); }, 15000), first = setTimeout(() => { void poll(); }, 100);
  const client = { t, Footer: InlineFooter, NativeFooter, Button: W.Button, open(name) { const footer = [...document.querySelectorAll('[data-plugin-update-footer]')].find(node => node.getAttribute('data-plugin-update-footer') === name); if (!footer) return false; footer.scrollIntoView({ block: 'end', behavior: 'smooth' }); return true; }, has: name => registered && !!originalRow(name), row: rowFor, dispose() {
    close(); alive = false; clearTimeout(first); clearInterval(timer); pool.clients.delete(client);
    pool.listeners.delete(guardChanged); listeners.clear();
    for (const event of ['pointerdown', 'keydown', 'input']) document.removeEventListener(event, interaction, true);
    window.removeEventListener('pagehide', close);
    for (const controller of requests) controller.abort();
    for (const listener of pool.viewListeners) listener();
  } };
  return client;
}

/* STARDUSTLC_UPDATE_CLIENT_BODY_START */
window.__ModuleLoader__.load(__stardustUpdatesWrap({id:"dsh-slack",factory:require=>({apply(){}})},{"name":"dsh-slack","version":"0.1.0","hasWorkbench":false,"packageVersion":"0.5.8","label":"Slack","labelEn":"Slack","suiteComponent":true,"sectionIds":[],"iconData":"data:image/webp;base64,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"}));

/* STARDUSTLC_UPDATE_CLIENT_BODY_END */
})();
