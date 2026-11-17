/** Self-contained dashboard page served at the dashboard path. No framework, no external requests. */
export function dashboardHtml(dashboardPath: string): string {
  return DASHBOARD_TEMPLATE.replace('__WS_PATH__', JSON.stringify(`${dashboardPath}/ws?role=dashboard`));
}

const DASHBOARD_TEMPLATE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Performance dashboard</title>
<style>
:root{--bg:#fff;--fg:#161616;--mut:#525252;--line:#e0e0e0;--surf:#f4f4f4;--good:#198038;--warn:#b28600;--bad:#da1e28;--acc:#0f62fe}
*{box-sizing:border-box}
body{margin:0;font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--fg);background:var(--bg)}
header{display:flex;flex-wrap:wrap;gap:12px;align-items:center;padding:12px 24px;border-bottom:1px solid var(--line)}
h1{font-size:18px;margin:0 12px 0 0}
.status{padding:2px 10px;border-radius:12px;font-size:12px;background:var(--surf)}
.status.ok{color:var(--good)}.status.off{color:var(--bad)}
nav{display:flex;gap:4px;padding:0 24px;border-bottom:1px solid var(--line);overflow:auto}
nav button{border:0;background:none;padding:10px 14px;cursor:pointer;font:inherit;color:var(--mut);border-bottom:2px solid transparent}
nav button[aria-selected=true]{color:var(--fg);border-color:var(--acc)}
.bar{display:flex;flex-wrap:wrap;gap:8px;padding:12px 24px;align-items:center}
select,button.btn,input{font:inherit;padding:4px 8px;border:1px solid var(--line);background:#fff;border-radius:2px}
button.btn{cursor:pointer}
main{padding:0 24px 48px}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;margin:12px 0}
.card{background:var(--surf);padding:12px;border-left:4px solid var(--line)}
.card.good{border-color:var(--good)}.card.needs-improvement{border-color:var(--warn)}.card.poor{border-color:var(--bad)}
.card .l{color:var(--mut);font-size:12px}.card .v{font-size:22px}
table{border-collapse:collapse;width:100%;margin:8px 0 24px}
th,td{text-align:left;padding:6px 10px;border-bottom:1px solid var(--line);vertical-align:top;word-break:break-all}
th{background:var(--surf);cursor:pointer;white-space:nowrap}
td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}
h2{font-size:15px;margin:20px 0 4px}
.mut{color:var(--mut)}.bad{color:var(--bad)}
canvas{width:100%;height:120px;background:var(--surf)}
.hidden{display:none}
</style>
</head>
<body>
<header>
  <h1>Performance dashboard</h1>
  <span id="status" class="status off">disconnected</span>
  <span id="count" class="mut"></span>
</header>
<nav id="tabs" role="tablist"></nav>
<div class="bar">
  <label>Route <select id="f-route"><option value="">All</option></select></label>
  <label>Time <select id="f-time">
    <option value="0">All</option><option value="60000">Last minute</option>
    <option value="300000">Last 5 min</option><option value="1800000">Last 30 min</option></select></label>
  <button class="btn" id="b-clear">Clear</button>
  <button class="btn" id="b-export">Export JSON</button>
</div>
<main id="view"></main>
<script>
(function(){
  var WS_PATH = __WS_PATH__;
  var MAX = 20000;
  var events = [];
  var tab = 'overview';
  var sort = {};
  var TABS = [['overview','Overview'],['components','Components'],['network','Network'],['browser','Browser performance'],['navigation','Navigation'],['errors','Errors'],['settings','Settings']];
  var settings = { paused:false };
  var $ = function(id){return document.getElementById(id)};

  function el(tag, cls, text){var e=document.createElement(tag); if(cls)e.className=cls; if(text!==undefined)e.textContent=text; return e}
  function fmt(n,u){ if(n==null||typeof n!=='number'||!isFinite(n)) return 'unavailable'; return (Math.round(n*100)/100).toLocaleString()+(u||'') }
  function route(e){ return (e.page&&e.page.route)||'/' }

  var tabsEl=$('tabs');
  TABS.forEach(function(t){
    var b=el('button',null,t[1]); b.setAttribute('role','tab'); b.dataset.id=t[0];
    b.onclick=function(){tab=t[0];render()}; tabsEl.appendChild(b);
  });

  function filtered(){
    var r=$('f-route').value, w=+$('f-time').value, now=Date.now();
    return events.filter(function(e){ return (!r||route(e)===r)&&(!w||now-e.timestamp<=w) });
  }
  function ofType(list,t){return list.filter(function(e){return e.type===t})}

  function table(cols,rows,key){
    var t=el('table'), head=el('tr');
    var s=sort[key]||{i:-1,d:1};
    cols.forEach(function(c,i){
      var th=el('th',c.n?'n':'',c.h); th.onclick=function(){sort[key]={i:i,d:s.i===i?-s.d:-1};render()}; head.appendChild(th);
    });
    t.appendChild(head);
    if(s.i>=0){ rows=rows.slice().sort(function(a,b){var x=a[s.i],y=b[s.i]; return (x>y?1:x<y?-1:0)*-s.d}); }
    rows.slice(0,200).forEach(function(r){
      var tr=el('tr'); r.forEach(function(v,i){ tr.appendChild(el('td',cols[i].n?'n':'',cols[i].n&&typeof v==='number'?fmt(v):String(v==null?'':v))) }); t.appendChild(tr);
    });
    if(!rows.length){var tr=el('tr'),td=el('td','mut','No data yet'); td.colSpan=cols.length; tr.appendChild(td); t.appendChild(tr)}
    return t;
  }
  function section(view,title,node,note){view.appendChild(el('h2',null,title)); if(note)view.appendChild(el('div','mut',note)); view.appendChild(node)}

  function group(list,keyFn){var m={}; list.forEach(function(e){var k=keyFn(e); (m[k]=m[k]||[]).push(e)}); return m}
  function sum(a){return a.reduce(function(x,y){return x+y},0)}

  function sparkline(values){
    var c=document.createElement('canvas'); c.width=800; c.height=120;
    var g=c.getContext('2d'); if(!g||values.length<2) return c;
    var max=Math.max.apply(null,values)||1;
    g.strokeStyle='#0f62fe'; g.beginPath();
    values.forEach(function(v,i){var x=i/(values.length-1)*c.width, y=c.height-8-(v/max)*(c.height-16); i?g.lineTo(x,y):g.moveTo(x,y)});
    g.stroke(); return c;
  }

  var views={
    overview:function(v,list){
      var cards=el('div','cards');
      ['LCP','INP','CLS','FCP','TTFB'].forEach(function(name){
        var m=ofType(list,'web-vital').filter(function(e){return e.metrics.name===name}).pop();
        var c=el('div','card'+(m?' '+m.metrics.rating:'')); c.appendChild(el('div','l',name));
        c.appendChild(el('div','v',m?fmt(m.metrics.value, name==='CLS'?'':' ms'):'unavailable')); c.appendChild(el('div','l',m?String(m.metrics.rating):'no event observed')); cards.appendChild(c);
      });
      v.appendChild(cards);
      var net=ofType(list,'network'), errs=ofType(list,'error'), tasks=ofType(list,'long-task'), mem=ofType(list,'memory');
      var c2=el('div','cards');
      [['Requests',net.length],['Failed requests',net.filter(function(e){return e.metrics.failed}).length],['JS errors',errs.length],['Long tasks',tasks.length],
       ['Heap (MB)',mem.length?Math.round(mem[mem.length-1].metrics.usedJSHeapSize/1048576*10)/10:'unavailable']].forEach(function(p){
        var c=el('div','card'); c.appendChild(el('div','l',p[0])); c.appendChild(el('div','v',String(p[1]))); c2.appendChild(c)});
      v.appendChild(c2);
      var slow=ofType(list,'component-render').slice().sort(function(a,b){return (b.metrics.duration||0)-(a.metrics.duration||0)}).slice(0,5);
      section(v,'Slowest component renders',table([{h:'Component'},{h:'Phase'},{h:'Duration (ms)',n:1}],slow.map(function(e){return [e.metrics.componentName,e.metrics.phase,e.metrics.duration]}),'ov'));
      v.appendChild(el('p','mut','Render duration, commit duration, and interaction latency are different measurements and are never summed. An unsupported metric is shown as unavailable, not 0.'));
    },
    components:function(v,list){
      var g=group(ofType(list,'component-render'),function(e){return e.metrics.componentName});
      var rows=Object.keys(g).map(function(k){var d=g[k].map(function(e){return e.metrics.duration}).filter(function(x){return typeof x==='number'});
        var t=sum(d); return [k,g[k].length,d.length?t:null,d.length?t/d.length:null,d.length?Math.max.apply(null,d):null]});
      section(v,'Components',table([{h:'Component'},{h:'Render count',n:1},{h:'Total observed (ms)',n:1},{h:'Average (ms)',n:1},{h:'Max (ms)',n:1}],rows,'comp'),
        'Repeated renders are not necessarily wasted. React Strict Mode doubles development renders.');
    },
    network:function(v,list){
      var net=ofType(list,'network');
      var g=group(net,function(e){return e.metrics.method+' '+e.metrics.url});
      var rows=Object.keys(g).map(function(k){var d=g[k].map(function(e){return e.metrics.duration}); return [k,g[k].length,sum(d)/d.length,Math.max.apply(null,d),g[k].filter(function(e){return e.metrics.failed}).length]});
      section(v,'Endpoints',table([{h:'Request'},{h:'Count',n:1},{h:'Avg (ms)',n:1},{h:'Max (ms)',n:1},{h:'Failures',n:1}],rows,'net'),'Fetch/XHR instrumentation is opt-in (networkTracking).');
      var res=ofType(list,'resource').slice().sort(function(a,b){return b.metrics.duration-a.metrics.duration});
      section(v,'Slowest resources',table([{h:'URL'},{h:'Type'},{h:'Duration (ms)',n:1},{h:'Transfer (B)',n:1}],res.map(function(e){return [e.metrics.url,e.metrics.initiatorType,e.metrics.duration,e.metrics.transferSize]}),'res'));
    },
    browser:function(v,list){
      var lt=ofType(list,'long-task'), laf=ofType(list,'long-animation-frame'), mem=ofType(list,'memory');
      section(v,'Long tasks',table([{h:'Route'},{h:'Start (ms)',n:1},{h:'Duration (ms)',n:1}],lt.map(function(e){return [route(e),e.metrics.startTime,e.metrics.duration]}),'lt'),'Availability depends on the browser. No entries does not mean no problem.');
      section(v,'Long animation frames',table([{h:'Route'},{h:'Start (ms)',n:1},{h:'Duration (ms)',n:1},{h:'Blocking (ms)',n:1}],laf.map(function(e){return [route(e),e.metrics.startTime,e.metrics.duration,e.metrics.blockingDuration]}),'laf'));
      v.appendChild(el('h2',null,'Memory trend'));
      if(mem.length){ v.appendChild(sparkline(mem.map(function(e){return e.metrics.usedJSHeapSize}))); v.appendChild(el('div','mut','A rising heap alone does not prove a memory leak. Values are approximate.')) }
      else v.appendChild(el('p','mut','Unavailable: no memory observations (unsupported by this browser or disabled).'));
    },
    navigation:function(v,list){
      var nav=ofType(list,'navigation');
      section(v,'Navigation history',table([{h:'Time'},{h:'Kind'},{h:'Route'},{h:'Duration (ms)',n:1}],nav.map(function(e){return [new Date(e.timestamp).toLocaleTimeString(),e.metrics.kind,e.metrics.route||route(e),e.metrics.duration]}),'nav'));
      var g=group(ofType(list,'web-vital').filter(function(e){return e.metrics.name==='LCP'}),route);
      section(v,'LCP by route',table([{h:'Route'},{h:'Latest LCP (ms)',n:1}],Object.keys(g).map(function(k){return [k,g[k][g[k].length-1].metrics.value]}),'lcp'));
    },
    errors:function(v,list){
      var errs=ofType(list,'error'), g=group(errs,function(e){return e.metrics.kind+': '+(e.metrics.message||e.metrics.url||'')});
      section(v,'Grouped errors',table([{h:'Error'},{h:'Count',n:1},{h:'Last route'}],Object.keys(g).map(function(k){return [k,g[k].length,route(g[k][g[k].length-1])]}),'err'));
      var failed=ofType(list,'network').filter(function(e){return e.metrics.failed});
      section(v,'Failed requests',table([{h:'Request'},{h:'Status',n:1},{h:'Duration (ms)',n:1}],failed.map(function(e){return [e.metrics.method+' '+e.metrics.url,e.metrics.status,e.metrics.duration]}),'ferr'));
    },
    settings:function(v){
      var p=el('p',null,'Collectors, sampling, buffer and flush, exclusions and privacy rules are configured in the monitored app (PerformanceMonitor config). This page only displays and exports received data.');
      v.appendChild(p);
      var b=el('button','btn',settings.paused?'Resume live updates':'Pause live updates'); b.onclick=function(){settings.paused=!settings.paused;render()}; v.appendChild(b);
      v.appendChild(el('p','mut','Events held in this tab: '+events.length+' (max '+MAX+').'));
    }
  };

  function renderRoutes(){
    var sel=$('f-route'), cur=sel.value, seen={};
    events.forEach(function(e){seen[route(e)]=1});
    var keys=Object.keys(seen).sort(), have=[].map.call(sel.options,function(o){return o.value}).slice(1);
    if(keys.join()===have.join()) return;
    while(sel.options.length>1) sel.remove(1);
    keys.forEach(function(k){var o=el('option',null,k); o.value=k; sel.appendChild(o)});
    sel.value=keys.indexOf(cur)>=0?cur:'';
  }

  var pending=false;
  function render(){
    pending=false;
    [].forEach.call(tabsEl.children,function(b){b.setAttribute('aria-selected',String(b.dataset.id===tab))});
    renderRoutes();
    $('count').textContent=events.length+' events';
    var v=$('view'); v.textContent='';
    views[tab](v,filtered());
  }
  function schedule(){ if(!pending){pending=true; setTimeout(render,250)} }

  $('f-route').onchange=render; $('f-time').onchange=render;
  $('b-clear').onclick=function(){events=[]; if(ws&&ws.readyState===1)ws.send(JSON.stringify({kind:'clear'})); render()};
  $('b-export').onclick=function(){
    var blob=new Blob([JSON.stringify(events,null,2)],{type:'application/json'});
    var a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='performance-events.json'; a.click(); setTimeout(function(){URL.revokeObjectURL(a.href)},1000);
  };

  var ws, attempt=0;
  function setStatus(ok){var s=$('status'); s.textContent=ok?'connected':'disconnected'; s.className='status '+(ok?'ok':'off')}
  function connect(){
    var scheme=location.protocol==='https:'?'wss':'ws';
    ws=new WebSocket(scheme+'://'+location.host+WS_PATH);
    ws.onopen=function(){attempt=0;setStatus(true)};
    ws.onclose=function(){setStatus(false); setTimeout(connect,Math.min(10000,500*Math.pow(2,attempt++)))};
    ws.onmessage=function(m){
      var d; try{d=JSON.parse(m.data)}catch(e){return}
      if(d.kind==='history'){events=d.events.slice(-MAX)}
      else if(d.kind==='batch'){ if(settings.paused)return; events=events.concat(d.events); if(events.length>MAX)events=events.slice(-MAX) }
      else if(d.kind==='clear'){events=[]}
      schedule();
    };
  }
  render(); connect();
})();
</script>
</body>
</html>`;
