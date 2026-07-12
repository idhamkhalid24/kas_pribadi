const SUPABASE_URL='https://myxrvipyodadnldtomzs.supabase.co';
const SUPABASE_ANON_KEY='sb_publishable_aG-kyasJNCEk2U9fN5T4qg_GfY0FpPH';
const OWNER_ID='rocky-hijab'; const APP_PIN='123';

// === SERVER PUSAT SUPABASE SOURCE ===
// Kas Pribadi tetap menyimpan data finance di Supabase pribadi di atas,
// sedangkan omset kasir dibaca dari Server Pusat Supabase yang sama dengan aplikasi utama.
const SERVER_PUSAT_URL='https://ismjupxoiywttkrekmfg.supabase.co';
const SERVER_PUSAT_ANON_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlzbWp1cHhvaXl3dHRrcmVrbWZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyNzc4MDEsImV4cCI6MjA5NDg1MzgwMX0.WVwqEdkPQ_x9NWR8QXTm85mIAvN8d9V2FaMJ2NiAMC0';
let serverPusatClient=null;
const CASH_DRAWER_TABLE='cash_drawer_audits';
const ROCKY_STAFF_NOTIFY_WORKER_BASE_URL='https://rocky-notif-worker.alfajrihanif24.workers.dev';
const ROCKY_STAFF_NOTIFY_CASH_DRAWER_URL=ROCKY_STAFF_NOTIFY_WORKER_BASE_URL+'/notify-cash-drawer-status';
const ROCKY_STAFF_NOTIFY_SECRET='rockyNotifRahasia2026';

let supabaseClient=null,transactions=[],zakatHistory=[],emergencyFundHistory=[],expenseCategories=[],cashDrawerAudits=[],receivables=[],currentFilter='today',currentFinanceReportFilter='month',pendingAction=null,currentPage='home';
let autoDebitSettings={enabled:false,amount:0,last_run_date:null};
let firebaseDb=null,firebaseUnsub=null,todayFirebaseUnsub=null,firebaseUploadDate='',firebaseIncomeRows=[],firebaseIncomeTotal=0,todayFirebaseIncomeRows=[],todayFirebaseIncomeTotal=0,pendingFirebaseUploads=[],monthValidityBusy=false,emergencyFundTableReady=false,cashDrawerTableReady=false;
const HISTORY_PAGE_SIZE=15;
let historyVisibleCount=HISTORY_PAGE_SIZE,currentGoldHomeTab='buy',currentCashDrawerFilter='today',cashDrawerEditingId=null;
function $(id){return document.getElementById(id)}
function resetHistoryPaging(){historyVisibleCount=HISTORY_PAGE_SIZE}
function loadMoreTransactions(){historyVisibleCount+=HISTORY_PAGE_SIZE;render()}
function toggleHomeSection(id){
  const el=$(id);if(!el)return;
  el.classList.toggle('is-collapsed');
}
function setGoldHomeTab(tab='buy'){
  currentGoldHomeTab=['buy','history','calc'].includes(tab)?tab:'buy';
  ['buy','history','calc'].forEach(name=>{
    const btn=$('goldHomeTab-'+name),panel=$('goldPanel-'+name);
    if(btn)btn.classList.toggle('active',name===currentGoldHomeTab);
    if(panel)panel.classList.toggle('active',name===currentGoldHomeTab);
  });
}
function renderActiveFilterChip(){
  const box=$('activeFilterChips');if(!box)return;
  const label=typeof getPeriodLabel==='function'?getPeriodLabel():'Riwayat';
  const clear=currentFilter==='all'?'':`<button type="button" onclick="changeFilter('all')" aria-label="Hapus filter aktif">x</button>`;
  box.innerHTML=`<span class="active-filter-chip">${escapeHtml(label)}${clear}</span>`;
}
function isSupabaseConfigured(){return SUPABASE_URL&&SUPABASE_ANON_KEY&&!SUPABASE_URL.includes('ISI_')&&!SUPABASE_ANON_KEY.includes('ISI_')}
function initSupabase(){if(!isSupabaseConfigured()){showToast('Supabase belum disetting');return false}supabaseClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);return true}
function goPage(p){currentPage=p;['home','history','laci','laporan','firebase'].forEach(x=>{ const page=$('page'+x[0].toUpperCase()+x.slice(1)); if(page)page.classList.toggle('active',x===p); const nav=$('nav-'+x); if(nav)nav.classList.toggle('active',x===p)}); render(); if(p==='firebase')startFirebaseWatch(firebaseUploadDate||getLocalDateString()); if(p==='laporan')renderFinanceReport(); if(p==='laci')renderCashDrawerPage(); }
let kasRefreshBusy=false;
async function loadReceivables() {
  if (!supabaseClient) return;
  try {
    const {data, error} = await supabaseClient.from('receivables').select('*').eq('owner_id', OWNER_ID).order('status', {ascending: false}).order('id', {ascending: false});
    if (!error) receivables = data || [];
  } catch (e) {
    console.warn('loadReceivables err:', e);
  }
}
async function refreshApp(){if(kasRefreshBusy)return;kasRefreshBusy=true;showToast('Menyinkronkan data...',2000);await Promise.all([loadTransactions(),loadZakatHistory(),loadEmergencyFundHistory(),loadExpenseCategories(),loadCashDrawerAudits(),loadSalaryTargets(),loadReceivables()]);await checkAndCreateMissingFirebaseUsers();checkEmergencyFundAlerts();checkZakatAlerts();checkCashDrawerMinusAlert();await Promise.all([refreshFirebaseIncome(),refreshTodayFirebaseIncome()]);render();kasRefreshBusy=false;showToast('Data diperbarui')}

async function refreshKasApp(){
  if(kasRefreshBusy)return;
  kasRefreshBusy=true;
  const btn=$('kasRefreshBtn'),st=$('statusText'),sb=$('statusBadge');
  const oldBtnText=btn?btn.textContent:'Refresh';
  if(btn){btn.disabled=true;btn.classList.add('is-loading');btn.textContent='Refresh...';}
  if(st)st.innerText='Refresh...';
  if(sb){sb.style.background='#e0f2fe';sb.style.color='#0369a1';}
  try{
    await loadTransactions();
    try{await loadCashDrawerAudits();}catch(e){console.warn('Refresh audit cash fisik gagal:',e)}
    try{await loadExpenseCategories();}catch(e){console.warn('Refresh kategori gagal:',e)}
    try{await loadZakatHistory();}catch(e){console.warn('Refresh zakat gagal:',e)}
    try{await refreshGoldPrice(false);}catch(e){console.warn('Refresh harga emas gagal:',e)}
    if(firebaseDb){
      await refreshFirebaseRowsOnce(getLocalDateString(),'today');
      if(currentPage==='firebase')await refreshFirebaseRowsOnce(firebaseUploadDate||getLocalDateString(),'selected');
    }
    render();
    renderCashFisik();
    renderFinanceReport();
    if(st)st.innerText='Aman';
    if(sb){sb.style.background='';sb.style.color='';}
    showToast('Data kas direfresh');
  }catch(e){
    console.error(e);
    if(st)st.innerText='Error';
    if(sb){sb.style.background='var(--red-light)';sb.style.color='var(--red)';}
    showToast('Gagal refresh: '+(e.message||e),5000);
  }finally{
    if(btn){btn.disabled=false;btn.classList.remove('is-loading');btn.textContent=oldBtnText||'Refresh';}
    kasRefreshBusy=false;
  }
}

let transactionKeyboardFixReady=false,transactionKeyboardTimer=null;
function bindTransactionKeyboardFix(){
  if(transactionKeyboardFixReady)return;
  transactionKeyboardFixReady=true;
  const schedule=()=>{
    if(transactionKeyboardTimer)clearTimeout(transactionKeyboardTimer);
    if(window.requestAnimationFrame)requestAnimationFrame(adjustTransactionModalForKeyboard);
    transactionKeyboardTimer=setTimeout(adjustTransactionModalForKeyboard,60);
  };
  try{window.addEventListener('resize',schedule,{passive:true});}catch(e){window.addEventListener('resize',schedule);}
  try{window.addEventListener('orientationchange',schedule,{passive:true});}catch(e){window.addEventListener('orientationchange',schedule);}
  if(window.visualViewport){
    try{window.visualViewport.addEventListener('resize',schedule,{passive:true});}catch(e){window.visualViewport.addEventListener('resize',schedule);}
    try{window.visualViewport.addEventListener('scroll',schedule,{passive:true});}catch(e){window.visualViewport.addEventListener('scroll',schedule);}
  }
  document.addEventListener('focusin',e=>{const m=$('transactionModal');if(m&&m.contains(e.target))schedule();},true);
  document.addEventListener('focusout',e=>{const m=$('transactionModal');if(m&&m.contains(e.target))setTimeout(adjustTransactionModalForKeyboard,180);},true);
}
function resetTransactionModalKeyboardPosition(){
  const modal=$('transactionModal');if(!modal)return;
  modal.classList.remove('keyboard-open');
  modal.style.removeProperty('--modal-vvh');
  modal.style.removeProperty('--modal-vvo');
  modal.style.removeProperty('--modal-keyboard');
  modal.style.removeProperty('height');
  modal.style.removeProperty('top');
  modal.style.removeProperty('bottom');
}
function adjustTransactionModalForKeyboard(){
  const modal=$('transactionModal');
  if(!modal||modal.classList.contains('hidden'))return;
  const vv=window.visualViewport;
  const layoutH=window.innerHeight||document.documentElement.clientHeight||screen.height||0;
  const visibleH=Math.max(280,Math.floor(vv&&vv.height?vv.height:layoutH));
  const offsetTop=Math.max(0,Math.floor(vv&&typeof vv.offsetTop==='number'?vv.offsetTop:0));
  const hiddenByKeyboard=Math.max(0,Math.floor(layoutH-visibleH-offsetTop));
  const activeInModal=modal.contains(document.activeElement);
  const mustLift=modal.classList.contains('fab-full-mode')||activeInModal||hiddenByKeyboard>70;
  modal.style.setProperty('--modal-vvh',visibleH+'px');
  modal.style.setProperty('--modal-vvo',offsetTop+'px');
  modal.style.setProperty('--modal-keyboard',hiddenByKeyboard+'px');
  if(mustLift){
    modal.classList.add('keyboard-open');
    // Android WebView kadang tidak mengecilkan fixed element saat keyboard tampil.
    // Tinggi dan top dipaksa mengikuti visualViewport agar modal tidak ketutup keyboard.
    modal.style.height=visibleH+'px';
    modal.style.top=offsetTop+'px';
    modal.style.bottom='auto';
  }else{
    modal.classList.remove('keyboard-open');
    modal.style.removeProperty('height');
    modal.style.removeProperty('top');
    modal.style.removeProperty('bottom');
  }
}
function prepareTransactionModalForKeyboard(){
  bindTransactionKeyboardFix();
  adjustTransactionModalForKeyboard();
  setTimeout(adjustTransactionModalForKeyboard,80);
  setTimeout(adjustTransactionModalForKeyboard,260);
  setTimeout(adjustTransactionModalForKeyboard,520);
}

function focusTransactionAmountInput(opts={}){
  const amount=$('amount');
  if(!amount)return;
  const keepAdvancedOpen=!!(opts&&opts.keepAdvancedOpen);
  try{amount.blur();}catch(e){}
  const doFocus=()=>{
    const adv=$('transactionAdvanced');
    if(adv&&!keepAdvancedOpen)adv.open=false;
    try{adjustTransactionModalForKeyboard();}catch(e){}
    try{amount.focus({preventScroll:true});}catch(e){try{amount.focus();}catch(_){}}
    try{adjustTransactionModalForKeyboard();}catch(e){}
    try{amount.scrollIntoView({block:'center',inline:'nearest'});}catch(e){}
    try{
      const len=String(amount.value||'').length;
      amount.setSelectionRange(len,len);
    }catch(e){}
  };
  if(window.requestAnimationFrame)requestAnimationFrame(doFocus);
  setTimeout(doFocus,80);
}
function openTransactionModal(opts={}){
  const isFab=!!(opts&&opts.fromFab);
  const inputDate=$('inputDate'),type=$('type'),adv=$('transactionAdvanced'),modal=$('transactionModal'),desc=$('description');
  if(inputDate)inputDate.value=getLocalDateString();
  // Khusus tombol FAB + Transaksi: langsung terbuka penuh seperti gambar pertama.
  // Detail lanjutan otomatis tampil, tipe otomatis Pengeluaran, kategori langsung muncul,
  // jadi tidak perlu klik Detail lanjutan dulu.
  if(isFab&&type)type.value='expense';
  if(adv)adv.open=!!isFab;
  if(desc)try{desc.blur();}catch(e){}
  renderCategorySelects();
  updatePlaceholder();
  if(adv)adv.open=!!isFab;
  if(modal){
    modal.classList.remove('hidden');
    modal.classList.toggle('fab-full-mode',isFab);
    try{const box=modal.querySelector('.box');if(isFab&&box)box.scrollTop=0;}catch(e){}
  }
  prepareTransactionModalForKeyboard();
  focusTransactionAmountInput({keepAdvancedOpen:isFab});
}
function openFabTransactionModal(){openTransactionModal({fromFab:true})}
function closeTransactionModal(){const modal=$('transactionModal');if(modal){modal.classList.add('hidden');modal.classList.remove('fab-full-mode');resetTransactionModalKeyboardPosition()}}

const DEFAULT_CATEGORY_NAME='Lainnya';
const OPS_CATEGORY_NAME='Operasional Toko';
const ZAKAT_CATEGORY_NAME='Zakat';
const ZAKAT_PREFIX='[ZAKAT:';
const EMERGENCY_CATEGORY_NAME='Dana Darurat';
const EMERGENCY_RATE=0.05;
const EMERGENCY_PREFIX='[DANA_DARURAT:';
const GOLD_CATEGORY_NAME='Tabungan Emas';
const GOLD_PREFIX='[EMAS:BELI:';
const CASH_DRAWER_ADJ_PREFIX='[SELISIH_LACI:';
const CASH_DRAWER_MINUS_CATEGORY_NAME='Selisih Kas Minus';
const CASH_DRAWER_PLUS_CATEGORY_NAME='Selisih Kas Lebih';
// === DANA GAJI ===
const SALARY_FUND_PREFIX='[DANA_GAJI:';
const SALARY_CATEGORY_NAME='Gaji & Bonus';
const SALARY_FUND_TARGET_KEY='kas_dana_gaji_target_v1';
// === AUTO DEBET HARIAN (meniru auto debet ATM) ===
const AUTO_DEBIT_PREFIX='[AUTODEBET:';
const AUTO_DEBIT_CATEGORY_NAME='Auto Debet Harian';
const GOLD_ADMIN_FEE=2500;
const GOLD_TROY_OUNCE_GRAM=31.1034768;
const GOLD_PRICE_CACHE_KEY='kas_gold_price_cache_v2';
const GOLD_MANUAL_PRICE_KEY='kas_gold_manual_price_v1';
// Sumber harga dibuat 1 sumber saja: Pegadaian Tring.
// Catatan: halaman resmi Pegadaian sering tidak melepas angka harga ke HTML statis/CORS,
// jadi app mengambilnya lewat 1 proxy milik kamu. Proxy hanya boleh mengembalikan data Pegadaian.
const PEGADAIAN_GOLD_PAGE='https://pegadaian.co.id/harga-emas';
const PEGADAIAN_GOLD_API='https://pegadaian-proxy.vercel.app/api/harga-emas';
const PEGADAIAN_GOLD_FETCH_ROUTES=[
  {kind:'pegadaian_proxy',url:PEGADAIAN_GOLD_API,label:'Pegadaian Tring'}
];
let goldPriceState={price:0,buyback:0,source:'',recordedDate:'',updatedAt:'',cached:false,manual:false,url:''};
let goldPriceBusy=false;
let goldBuySyncing=false;
let goldBuyMode='gram';
const EMERGENCY_HISTORY_ID_OFFSET=7000000000000;
function normalizeCategoryRecord(r={}){return {id:Number(r.id)||Date.now(),owner_id:r.owner_id||OWNER_ID,name:String(r.name||'').trim(),sort_order:Number(r.sort_order||0),created_at:r.created_at||''}}
function sortExpenseCategories(){expenseCategories=(expenseCategories||[]).filter(c=>c&&c.name).sort((a,b)=>Number(a.sort_order||0)-Number(b.sort_order||0)||String(a.name).localeCompare(String(b.name),'id'))}
function getCategoryById(id){return (expenseCategories||[]).find(c=>String(c.id)===String(id))||null}
function getCategoryByName(name){return (expenseCategories||[]).find(c=>String(c.name||'').toLowerCase()===String(name||'').toLowerCase())||null}
function isZakatExpenseTx(t={}){
  const desc=String(t&&t.description||'');
  const cat=String(t&&t.category_name||'');
  return !!(t&&t.type==='expense'&&(desc.includes(ZAKAT_PREFIX)||cat.toLowerCase()===ZAKAT_CATEGORY_NAME.toLowerCase()||/^Zakat\s+Mal/i.test(desc)));
}
function cleanZakatDesc(desc){return String(desc||'Zakat Mal').replace(/\s*\[ZAKAT:[^\]]+\]\s*/g,'').trim()||'Zakat Mal'}
function getDefaultExpenseCategory(){return getCategoryByName(DEFAULT_CATEGORY_NAME)||expenseCategories[0]||null}
async function loadExpenseCategories(){
  if(!supabaseClient)return [];
  const {data,error}=await supabaseClient.from('expense_categories').select('*').eq('owner_id',OWNER_ID).order('sort_order',{ascending:true}).order('name',{ascending:true});
  if(error){expenseCategories=[];showToast('Tabel kategori belum ada. Jalankan SQL kategori dulu.');throw error}
  expenseCategories=(data||[]).map(normalizeCategoryRecord);sortExpenseCategories();return expenseCategories;
}
async function insertExpenseCategory(name,sortOrder=0){
  name=String(name||'').trim();if(!name)throw new Error('Nama kategori kosong');
  const row={id:Date.now()+Math.floor(Math.random()*999),owner_id:OWNER_ID,name,sort_order:sortOrder};
  const {error}=await supabaseClient.from('expense_categories').insert(row);
  if(error)throw error;return row;
}
async function ensureDefaultExpenseCategories(){
  if(!supabaseClient)return;
  try{
    if(!getCategoryByName(DEFAULT_CATEGORY_NAME)){await insertExpenseCategory(DEFAULT_CATEGORY_NAME,1)}
    if(!getCategoryByName(OPS_CATEGORY_NAME)){await insertExpenseCategory(OPS_CATEGORY_NAME,2)}
    if(!getCategoryByName(ZAKAT_CATEGORY_NAME)){await insertExpenseCategory(ZAKAT_CATEGORY_NAME,3)}
    if(!getCategoryByName(EMERGENCY_CATEGORY_NAME)){await insertExpenseCategory(EMERGENCY_CATEGORY_NAME,4)}
    if(!getCategoryByName(GOLD_CATEGORY_NAME)){await insertExpenseCategory(GOLD_CATEGORY_NAME,5)}
    if(!getCategoryByName(CASH_DRAWER_MINUS_CATEGORY_NAME)){await insertExpenseCategory(CASH_DRAWER_MINUS_CATEGORY_NAME,6)}
    if(!getCategoryByName(AUTO_DEBIT_CATEGORY_NAME)){await insertExpenseCategory(AUTO_DEBIT_CATEGORY_NAME,7)}
    await loadExpenseCategories();
  }catch(e){console.warn('Default kategori gagal:',e);}
}
async function migrateLegacyExpenseCategories(){
  const def=getDefaultExpenseCategory();
  if(!supabaseClient||!def)return;
  const legacy=(transactions||[]).filter(t=>t.type==='expense'&&!isCashOut(t)&&!t.category_id&&!String(t.category_name||'').trim());
  if(!legacy.length)return;
  try{
    for(let i=0;i<legacy.length;i+=80){
      const ids=legacy.slice(i,i+80).map(t=>Number(t.id));
      const {error}=await supabaseClient.from('transactions').update({category_id:def.id,category_name:def.name}).eq('owner_id',OWNER_ID).in('id',ids);
      if(error)throw error;
    }
    transactions=(transactions||[]).map(t=>legacy.some(x=>Number(x.id)===Number(t.id))?{...t,category_id:def.id,category_name:def.name}:t);
    showToast(`${legacy.length} pengeluaran lama masuk kategori ${def.name}`);
  }catch(e){console.warn('Migrasi kategori lama gagal:',e);showToast('Migrasi kategori lama gagal: '+(e.message||e));}
}
function renderCategorySelects(selectedId){
  const sel=$('expenseCategorySelect');if(!sel)return;
  sortExpenseCategories();
  if(!expenseCategories.length){sel.innerHTML='<option value="">Jalankan SQL kategori dulu</option>';return;}
  const def=getDefaultExpenseCategory();
  const value=selectedId||sel.value||(def?def.id:'');
  sel.innerHTML=expenseCategories.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  if(value)sel.value=String(value);
}
function resetCategoryForm(){const id=$('categoryEditId'),inp=$('categoryNameInput'),btn=$('btnSaveCategory');if(id)id.value='';if(inp){inp.value='';inp.focus()}if(btn)btn.innerText='Simpan Kategori'}
function renderCategoryModal(){
  renderCategorySelects();
  const list=$('categoryList');if(!list)return;
  if(!expenseCategories.length){list.innerHTML='<div class="empty">Belum ada kategori. Jalankan SQL lalu tambah kategori.</div>';return;}
  const usage={};(transactions||[]).forEach(t=>{if(t.type==='expense'&&!isCashOut(t)){const nm=getExpenseCategoryName(t);usage[nm]=(usage[nm]||0)+1}});
  list.innerHTML=expenseCategories.map(c=>{
    const isDefault=String(c.name).toLowerCase()===DEFAULT_CATEGORY_NAME.toLowerCase();
    const used=usage[c.name]||0;
    return `<div class="category-manage-row"><div style="min-width:0"><b style="font-size:13px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(c.name)}${isDefault?'<span class="lock-badge">WAJIB</span>':''}</b><small style="color:var(--muted);font-size:10px">${used} transaksi</small></div><div class="category-actions"><button class="mini-btn" type="button" onclick="editCategory(${c.id})">Edit</button><button class="mini-btn danger" type="button" ${isDefault?'disabled style="opacity:.45"':''} onclick="deleteCategory(${c.id})">Hapus</button></div></div>`;
  }).join('');
}
function openCategoryModal(){
  const modal=$('categoryModal');
  if(!modal){showToast('Modal kategori belum ditemukan');return;}
  document.body.classList.add('category-modal-open');
  modal.classList.remove('hidden');
  modal.style.zIndex='5000';
  modal.scrollTop=0;
  renderCategoryModal();
  setTimeout(()=>{const inp=$('categoryNameInput');if(inp){inp.scrollIntoView({block:'center',behavior:'smooth'});inp.focus();}},120);
}
function closeCategoryModal(){$('categoryModal').classList.add('hidden');document.body.classList.remove('category-modal-open');resetCategoryForm();renderCategorySelects();}
function editCategory(id){const c=getCategoryById(id);if(!c)return;$('categoryEditId').value=c.id;$('categoryNameInput').value=c.name;$('btnSaveCategory').innerText='Simpan Edit';$('categoryNameInput').focus()}
async function saveCategoryFromModal(){
  const input=$('categoryNameInput');
  if(!input){showToast('Kolom nama kategori belum tampil, buka ulang modal kategori');return;}
  const name=String(input.value||'').trim();if(!name){showToast('Nama kategori wajib diisi');input.focus();return;}
  const editId=$('categoryEditId')?$('categoryEditId').value:'';
  const duplicate=(expenseCategories||[]).find(c=>String(c.name).toLowerCase()===name.toLowerCase()&&String(c.id)!==String(editId));
  if(duplicate){showToast('Kategori sudah ada');return;}
  try{
    if(editId){
      const old=getCategoryById(editId);const {error}=await supabaseClient.from('expense_categories').update({name,updated_at:new Date().toISOString()}).eq('owner_id',OWNER_ID).eq('id',Number(editId));
      if(error)throw error;
      await supabaseClient.from('transactions').update({category_name:name}).eq('owner_id',OWNER_ID).eq('category_id',Number(editId));
      showToast(`Kategori ${old?old.name:''} diubah`);
    }else{
      await insertExpenseCategory(name,(expenseCategories.length+1)*10);showToast('Kategori ditambahkan');
    }
    await loadExpenseCategories();resetCategoryForm();renderCategoryModal();renderCategorySelects();render();
  }catch(e){showToast('Gagal simpan kategori: '+(e.message||e));}
}
async function deleteCategory(id){
  const c=getCategoryById(id);if(!c)return;
  if(String(c.name).toLowerCase()===DEFAULT_CATEGORY_NAME.toLowerCase()){showToast('Kategori Lainnya tidak bisa dihapus');return;}
  const def=getDefaultExpenseCategory();if(!def){showToast('Kategori Lainnya belum ada');return;}
  if(!confirm(`Hapus kategori "${c.name}"?\nTransaksi yang sudah memakai kategori ini akan dipindah ke "${def.name}".`))return;
  try{
    await supabaseClient.from('transactions').update({category_id:def.id,category_name:def.name}).eq('owner_id',OWNER_ID).eq('category_id',Number(id));
    const {error}=await supabaseClient.from('expense_categories').delete().eq('owner_id',OWNER_ID).eq('id',Number(id));
    if(error)throw error;
    await loadExpenseCategories();await loadTransactions();renderCategoryModal();renderCategorySelects();render();showToast('Kategori dihapus');
  }catch(e){showToast('Gagal hapus kategori: '+(e.message||e));}
}
function getExpenseCategoryName(t={}){
  if(!t||t.type!=='expense')return '';
  if(isCashDrawerAdjustmentTx(t))return CASH_DRAWER_MINUS_CATEGORY_NAME;
  if(isCashOut(t)){
    const type=getCashOutType(t);return type==='qris'?'Cash Out QRIS':type==='tabungan'?'Cash Out Tabungan':'Cash Out Lainnya';
  }
  if(isGoldPurchaseTx(t))return GOLD_CATEGORY_NAME;
  if(isEmergencyFundTx(t))return EMERGENCY_CATEGORY_NAME;
  const byId=getCategoryById(t.category_id);if(byId)return byId.name;
  const stored=String(t.category_name||'').trim();if(stored)return stored;
  return DEFAULT_CATEGORY_NAME;
}
function getExpenseCategoryChip(t={}){
  if(!t||t.type!=='expense')return '';
  const name=getExpenseCategoryName(t);
  return `<span class="category-chip ${isCashOut(t)?'':'redchip'}">${escapeHtml(name)}</span>`;
}

function isGoldPurchaseTx(t={}){
  const desc=String(t&&t.description||'');
  const cat=String(t&&t.category_name||'');
  return !!(t&&t.type==='expense'&&(desc.startsWith(GOLD_PREFIX)||cat.toLowerCase()===GOLD_CATEGORY_NAME.toLowerCase()));
}
function cleanGoldDesc(desc){
  return String(desc||'Beli emas').replace(/^\[EMAS:BELI:[^\]]+\]\s*/,'').trim()||'Beli emas';
}
function getGoldGramFromTx(t={}){
  const desc=String(t&&t.description||'');
  const m=desc.match(/^\[EMAS:BELI:([0-9.,]+)GR/i);
  if(!m)return 0;
  return Number(String(m[1]).replace(',','.'))||0;
}
function getGoldAdminFeeFromTx(t={}){
  const desc=String(t&&t.description||'');
  const m=desc.match(/\|ADMIN:([0-9.,]+)/i);
  if(!m)return 0;
  return Math.round(Number(String(m[1]).replace(',','.'))||0);
}
function getGoldPurchaseAmountFromTx(t={}){
  const desc=String(t&&t.description||'');
  const explicit=desc.match(/\|EMAS:([0-9.,]+)/i);
  if(explicit)return Math.round(Number(String(explicit[1]).replace(',','.'))||0);
  const paid=Math.round(Number(t&&t.amount||0)||0);
  const admin=getGoldAdminFeeFromTx(t);
  if(admin>0&&paid>admin)return paid-admin;
  return paid;
}
function formatGoldGram(n){
  const val=Number(n||0);
  if(!Number.isFinite(val)||val<=0)return '0 gr';
  return new Intl.NumberFormat('id-ID',{minimumFractionDigits:0,maximumFractionDigits:4}).format(val)+' gr';
}
function getSavedManualGoldPrice(){
  try{return Number(localStorage.getItem(GOLD_MANUAL_PRICE_KEY)||0)||0}catch(e){return 0}
}
function saveManualGoldPrice(price){
  const n=Number(price||0);
  try{
    if(n>0)localStorage.setItem(GOLD_MANUAL_PRICE_KEY,String(Math.round(n)));
    else localStorage.removeItem(GOLD_MANUAL_PRICE_KEY);
  }catch(e){}
}
function buildGoldState(price,source,url='',extra={}){
  const p=Math.round(Number(price||0));
  if(!Number.isFinite(p)||p<=0)return null;
  return {price:p,buyback:Number(extra.buyback||0)||0,source:source||'Harga Emas',recordedDate:extra.recordedDate||'',updatedAt:new Date().toISOString(),cached:false,manual:!!extra.manual,url:url||''};
}
function parseGoldNumber(value){
  if(typeof value==='number')return Number.isFinite(value)?value:0;
  const raw=String(value??'').trim();
  if(!raw)return 0;
  const hasJuta=/juta/i.test(raw);
  const hasRibu=/ribu/i.test(raw);
  const multiplier=hasJuta?1000000:(hasRibu?1000:1);
  const cleaned=raw.replace(/,/g,'.').replace(/[^0-9.-]/g,'');
  if(!cleaned)return 0;
  const dots=(cleaned.match(/\./g)||[]).length;
  const normalized=(dots>1&&!hasJuta&&!hasRibu)?cleaned.replace(/\./g,''):cleaned;
  const n=Number(normalized);
  return Number.isFinite(n)?n*multiplier:0;
}
function parsePegadaianProxyGold(json={},url=''){
  const fallback=json&&json.fallback?json.fallback:null;
  const item=Array.isArray(json.data)&&json.data[0]?json.data[0]:null;
  if(item){
    const weight=Number(item.weight||item.berat||item.gram||1)||1;
    const sell=parseGoldNumber(item.sellPrice??item.price??item.hargaJual??item.harga_jual??item.harga??item.beli_per_gram??0);
    const buybackRaw=parseGoldNumber(item.buybackPrice??item.buyPrice??item.hargaBeli??item.harga_beli??item.buyback??item.jual_per_gram??0);
    if(sell>0){
      return buildGoldState(weight>0?sell/weight:sell,'Pegadaian Tring',PEGADAIAN_GOLD_PAGE,{
        buyback:buybackRaw>0?Math.round(buybackRaw/(weight||1)):0,
        recordedDate:item.recordedDate||json.tanggal||json.recordedDate||json.timestamp||''
      });
    }
  }
  const beliGram=parseGoldNumber(json.beli_per_gram||json.harga_per_gram||(fallback&&fallback.beli_per_gram)||0);
  const jualGram=parseGoldNumber(json.jual_per_gram||(fallback&&fallback.jual_per_gram)||0);
  const beli001=parseGoldNumber(json.beli_001||(fallback&&fallback.beli_001)||0);
  const jual001=parseGoldNumber(json.jual_001||(fallback&&fallback.jual_001)||0);
  const price=beliGram>0?beliGram:(beli001>0?beli001*100:0);
  const buyback=jualGram>0?jualGram:(jual001>0?jual001*100:0);
  if(!price)return null;
  return buildGoldState(price,json.sumber||fallback?.sumber||'Pegadaian Tring',PEGADAIAN_GOLD_PAGE,{buyback,recordedDate:json.tanggal||json.recordedDate||json.timestamp||''});
}
function findPegadaianPriceNear(text,keywords=[]){
  const src=String(text||'').replace(/&nbsp;/gi,' ').replace(/\s+/g,' ');
  const keys=(keywords||[]).filter(Boolean);
  const money='(?:Rp\\s*)?[0-9][0-9.]{4,}(?:,[0-9]+)?';
  for(const key of keys){
    const safe=String(key).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const re1=new RegExp(safe+'.{0,180}?('+money+')','i');
    const m1=src.match(re1);
    if(m1){const n=parseGoldNumber(m1[1]);if(n>100000)return n;}
    const re2=new RegExp('('+money+').{0,180}?'+safe,'i');
    const m2=src.match(re2);
    if(m2){const n=parseGoldNumber(m2[1]);if(n>100000)return n;}
  }
  return 0;
}
function parsePegadaianOfficialText(text='',url=PEGADAIAN_GOLD_PAGE){
  const raw=String(text||'');
  if(!raw.trim())return null;
  // Kalau halaman/proxy mengembalikan JSON, tetap diperlakukan sebagai data Pegadaian.
  try{
    const json=JSON.parse(raw);
    const fromProxy=parsePegadaianProxyGold(json,url);
    if(fromProxy)return fromProxy;
    const data=Array.isArray(json.data)?json.data:(Array.isArray(json.prices)?json.prices:(Array.isArray(json)?json:[]));
    const row=data.find(x=>/tabungan|pegadaian|emas/i.test(String(x.displayName||x.source||x.materialType||x.material||x.type||'')))||data[0];
    if(row){
      const weight=Number(row.weight||row.berat||row.gram||1)||1;
      const sell=parseGoldNumber(row.sellPrice??row.price??row.hargaJual??row.harga_jual??row.harga??row.beli_per_gram??0);
      const buyback=parseGoldNumber(row.buybackPrice??row.buyPrice??row.hargaBeli??row.harga_beli??row.buyback??row.jual_per_gram??0);
      if(sell>0)return buildGoldState(weight>0?sell/weight:sell,'Pegadaian Resmi',PEGADAIAN_GOLD_PAGE,{buyback:buyback>0?Math.round(buyback/(weight||1)):0,recordedDate:row.recordedDate||row.date||row.updatedAt||row.timestamp||''});
    }
  }catch(e){}
  const withoutTags=raw
    .replace(/<script[\s\S]*?<\/script>/gi,' ')
    .replace(/<style[\s\S]*?<\/style>/gi,' ')
    .replace(/<[^>]+>/g,' ')
    .replace(/&amp;/g,'&')
    .replace(/&nbsp;/g,' ')
    .replace(/\s+/g,' ')
    .trim();
  const recorded=(withoutTags.match(/Update\s+([^|<]+?\d{4})/i)||raw.match(/Update\s+([^|<]+?\d{4})/i)||[])[1]||'';
  const price=
    findPegadaianPriceNear(withoutTags,['Harga Beli','Beli Tabungan','Beli Emas','Tabungan Emas','harga jual'])||
    findPegadaianPriceNear(raw,['beli_per_gram','harga_per_gram','hargaJual','sellPrice','price']);
  const buyback=
    findPegadaianPriceNear(withoutTags,['Harga Jual','Jual Tabungan','Jual Emas','Buyback','harga beli'])||
    findPegadaianPriceNear(raw,['jual_per_gram','hargaBeli','buybackPrice','buyPrice','buyback']);
  if(price>0)return buildGoldState(price,'Pegadaian Resmi',PEGADAIAN_GOLD_PAGE,{buyback:buyback>0?buyback:0,recordedDate:recorded});
  return null;
}
function addCacheBuster(url){
  const sep=String(url||'').includes('?')?'&':'?';
  return String(url||'')+sep+'_t='+Date.now();
}
function fetchGoldUrl(url,timeoutMs=10000){
  const opt={cache:'no-store'};
  const finalUrl=addCacheBuster(url);
  if(typeof AbortController==='undefined')return fetch(finalUrl,opt);
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  return fetch(finalUrl,{...opt,signal:controller.signal}).finally(()=>clearTimeout(timer));
}
function restoreGoldPriceCache(){
  try{
    const cached=JSON.parse(localStorage.getItem(GOLD_PRICE_CACHE_KEY)||'null');
    if(cached&&Number(cached.price)>0){
      goldPriceState={...cached,cached:true,manual:false};
      return goldPriceState;
    }
  }catch(e){}
  const manual=getSavedManualGoldPrice();
  if(manual>0){
    goldPriceState=buildGoldState(manual,'Harga Manual','',{manual:true})||goldPriceState;
    return goldPriceState;
  }
  return null;
}
function saveGoldPriceCache(){
  try{
    if(Number(goldPriceState.price)>0&&!goldPriceState.manual){
      localStorage.setItem(GOLD_PRICE_CACHE_KEY,JSON.stringify(goldPriceState));
    }
  }catch(e){}
}
function getActiveGoldPrice(){
  const manualInput=Number($('goldManualPrice')?.value||0)||0;
  if(manualInput>0)return manualInput;
  const manualSaved=getSavedManualGoldPrice();
  if(manualSaved>0&&(!goldPriceState.price||goldPriceState.manual))return manualSaved;
  return Number(goldPriceState.price||0)||0;
}
async function fetchGoldPrice(){
  let lastErr=null;
  for(const route of PEGADAIAN_GOLD_FETCH_ROUTES){
    try{
      const res=await fetchGoldUrl(route.url);
      const json=await res.json();
      // Kalau proxy bilang harga_tersedia:false → semua sumber mati, jangan pakai cache
      if(json.harga_tersedia===false){
        throw Object.assign(new Error(json.message||'Harga tidak tersedia. Semua sumber sedang tidak dapat diakses.'),{semua_gagal:true});
      }
      if(!res.ok)throw new Error('HTTP '+res.status);
      const picked=parsePegadaianProxyGold(json,route.url);
      if(picked&&picked.price>0){goldPriceState=picked;saveGoldPriceCache();return picked;}
      throw new Error(json.message||'Format harga Pegadaian tidak cocok');
    }catch(e){
      lastErr=e;
      console.warn('Harga emas Pegadaian gagal dari proxy '+(route.url||''),e);
      // Kalau semua sumber proxy mati, langsung lempar error tanpa coba cache
      if(e.semua_gagal)throw e;
    }
  }
  const cached=restoreGoldPriceCache();
  if(cached&&cached.price)return cached;
  throw lastErr||new Error('Harga emas Pegadaian tidak tersedia');
}
async function refreshGoldPrice(showMsg=false){
  if(goldPriceBusy)return;
  goldPriceBusy=true;
  const st=$('goldPriceStatus');if(st)st.innerText='UPDATE';
  try{
    await fetchGoldPrice();
    renderGoldSection();
    if(showMsg)showToast('Harga emas Pegadaian Tring berhasil direfresh');
  }catch(e){
    restoreGoldPriceCache();
    renderGoldSection();
    if(showMsg)showToast('Harga emas Pegadaian Tring gagal. Isi harga manual di tombol Beli. Detail: '+(e.message||e),6000);
  }finally{goldPriceBusy=false;}
}
function getGoldSummary(){
  const rows=(transactions||[]).filter(isGoldPurchaseTx);
  // Total Beli Emas dihitung dari nominal emas saja, admin tidak ikut.
  // Total Terpotong tetap memakai amount transaksi karena itulah uang yang keluar dari Saldo Bersih.
  const totalAmount=rows.reduce((s,t)=>s+getGoldPurchaseAmountFromTx(t),0);
  const totalPaid=rows.reduce((s,t)=>s+Number(t.amount||0),0);
  const totalGram=rows.reduce((s,t)=>s+getGoldGramFromTx(t),0);
  return {rows,totalAmount,totalPaid,totalGram};
}
function renderGoldSection(){
  const state=goldPriceState&&Number(goldPriceState.price)>0?goldPriceState:restoreGoldPriceCache();
  const summary=getGoldSummary();
  const priceEl=$('goldPricePerGram'),infoEl=$('goldPriceInfo'),statusEl=$('goldPriceStatus');
  if(priceEl)priceEl.innerText=state&&state.price?formatRupiah(state.price):'Belum ada harga';
  if(infoEl){
    if(state&&state.price){
      const date=String(state.recordedDate||state.updatedAt||'').slice(0,10);
      const mode=state.manual?'Manual':(state.cached?'Cache terakhir':'Realtime');
      infoEl.innerText=`${mode} · ${state.source||'Harga Emas'}${date?' · '+date:''}`;
    }else infoEl.innerText='Klik Refresh atau isi harga manual saat Beli';
  }
  if(statusEl){
    statusEl.innerText=state&&state.price?(state.manual?'MANUAL':(state.cached?'CACHE':'LIVE')):'OFF';
  }
  const activePrice=getActiveGoldPrice();
  const currentGram=activePrice>0&&summary.totalAmount>0?summary.totalAmount/activePrice:summary.totalGram;
  if($('goldCurrentGram'))$('goldCurrentGram').innerText=formatGoldGram(currentGram);
  if($('goldTotalGram'))$('goldTotalGram').innerText=formatGoldGram(summary.totalGram);
  if($('goldTotalAmount'))$('goldTotalAmount').innerText=formatRupiah(summary.totalAmount);
  if($('goldTotalPaid'))$('goldTotalPaid').innerText=formatRupiah(summary.totalPaid||summary.totalAmount);
  if($('goldGramCalcInfo'))$('goldGramCalcInfo').innerText=activePrice>0?`Gram Saat Ini = ${formatRupiah(summary.totalAmount)} ÷ ${formatRupiah(activePrice)} = ${formatGoldGram(currentGram)}`:'Gram Saat Ini menunggu harga emas terbaru.';
  if($('goldManualPrice')&&state&&state.manual&&!$('goldManualPrice').value)$('goldManualPrice').value=String(Math.round(state.price));
  if($('goldBuyPricePerGram'))$('goldBuyPricePerGram').innerText=activePrice?formatRupiah(activePrice):'Rp 0';
  if($('goldBuyPriceInfo'))$('goldBuyPriceInfo').innerText=activePrice?`Harga ${formatRupiah(activePrice)} / gram`:'Harga emas belum tersedia';
  if($('goldBuySource')){
    if(activePrice&&Number($('goldManualPrice')?.value||0)>0)$('goldBuySource').innerText='Sumber: Harga manual kamu';
    else $('goldBuySource').innerText=state&&state.price?`Sumber: ${state.source||'-'}${state.cached?' (cache terakhir)':''}${state.manual?' (manual)':''}`:'Sumber: -';
  }
}
function getGoldMinGram(){return 0.01}
function getGoldPresetValues(){
  if(goldBuyMode==='rupiah')return [100000,250000,500000,1000000];
  return [0.01,0.1,0.5,1];
}
function formatGoldInputValue(value,mode=goldBuyMode){
  const n=Number(value||0);
  if(!n)return '';
  if(mode==='rupiah')return String(Math.round(n));
  return String(n).replace(/0+$/,'').replace(/\.$/,'');
}
function renderGoldBuyMode(){
  const isRp=goldBuyMode==='rupiah';
  const label=$('goldBuyMainLabel'),input=$('goldBuyValue'),btnRp=$('goldModeRupiah'),btnGr=$('goldModeGram'),note=$('goldBuyMinNote');
  if(btnRp)btnRp.classList.toggle('active',isRp);
  if(btnGr)btnGr.classList.toggle('active',!isRp);
  if(label)label.innerText=isRp?'Nominal Pembelian':'Berat emas';
  if(input){
    input.placeholder=isRp?'100000':'0,1';
    input.step=isRp?'1000':'0.0001';
    input.inputMode=isRp?'numeric':'decimal';
  }
  if(note)note.innerText=isRp?'Nominal akan otomatis dihitung menjadi gram emas':'Minimal pembelian 0,0100 gr';
  renderGoldQuickPresets();
  updateGoldBuyPreview();
}
function renderGoldQuickPresets(){
  const grid=$('goldPresetGrid');if(!grid)return;
  const vals=getGoldPresetValues();
  grid.innerHTML=vals.map(v=>{
    const label=goldBuyMode==='rupiah'?formatRupiah(v):formatGoldGram(v);
    return `<button type="button" class="gold-preset-btn" data-gold-preset="${v}" onclick="applyGoldPreset(${v})">${label}</button>`;
  }).join('');
}
function setGoldPresetActive(value){
  document.querySelectorAll('[data-gold-preset]').forEach(btn=>{
    const v=Number(btn.getAttribute('data-gold-preset')||0);
    btn.classList.toggle('active',Math.abs(v-Number(value||0))<0.00001);
  });
}
function setGoldBuyMode(mode){
  const oldMode=goldBuyMode;
  goldBuyMode=mode==='rupiah'?'rupiah':'gram';
  const input=$('goldBuyValue');
  const price=Number(getActiveGoldPrice()||0);
  if(input&&price>0&&oldMode!==goldBuyMode){
    const current=Number(input.value||0)||0;
    if(current>0){
      if(goldBuyMode==='rupiah')input.value=String(Math.round(current*price));
      else input.value=String((current/price).toFixed(4)).replace(/0+$/,'').replace(/\.$/,'');
    }
  }
  handleGoldBuyValueInput(false);
  renderGoldBuyMode();
}
function applyGoldPreset(value){
  const input=$('goldBuyValue');
  if(input)input.value=formatGoldInputValue(value,goldBuyMode);
  handleGoldBuyValueInput();
  setGoldPresetActive(value);
}
function handleGoldBuyValueInput(markPreset=true){
  const price=Number(getActiveGoldPrice()||0);
  const val=Number($('goldBuyValue')?.value||0)||0;
  let gram=0,amount=0;
  if(goldBuyMode==='rupiah'){
    amount=Math.round(val);
    gram=price>0&&amount>0?amount/price:0;
  }else{
    gram=val;
    amount=price>0&&gram>0?Math.round(gram*price):0;
  }
  if($('goldBuyGram'))$('goldBuyGram').value=gram>0?String(gram):'';
  if($('goldBuyNominal'))$('goldBuyNominal').value=amount>0?String(amount):'';
  if(markPreset)setGoldPresetActive(val);
  updateGoldBuyPreview();
}
function openGoldBuyModal(){
  const main=$('goldBuyValue'),gram=$('goldBuyGram'),nom=$('goldBuyNominal'),manual=$('goldManualPrice'),prev=$('goldBuyPreview'),nomPrev=$('goldBuyNominalPreview');
  goldBuyMode='gram';
  if(main)main.value='';if(gram)gram.value='';if(nom)nom.value='';if(nomPrev)nomPrev.innerText='';
  if(manual){
    const saved=getSavedManualGoldPrice();
    manual.value=saved>0?String(saved):'';
  }
  if(prev)prev.innerText='Isi gram atau nominal untuk hitung otomatis.';
  renderGoldSection();renderGoldBuyMode();
  $('goldBuyModal').classList.remove('hidden');
  if(!goldPriceState.price||goldPriceState.manual)refreshGoldPrice(false).then(()=>{renderGoldBuyMode();handleGoldBuyValueInput(false);}).catch(()=>{});
  setTimeout(()=>{if(main)main.focus();},80);
}
function closeGoldBuyModal(){$('goldBuyModal').classList.add('hidden')}
function handleGoldManualPriceInput(){
  const manual=Number($('goldManualPrice')?.value||0)||0;
  if(manual>0){saveManualGoldPrice(manual);goldPriceState=buildGoldState(manual,'Harga Manual','',{manual:true})||goldPriceState;}
  else saveManualGoldPrice(0);
  renderGoldSection();
  handleGoldBuyValueInput(false);
}
function syncGoldBuyFromGram(){
  if(goldBuySyncing)return;goldBuySyncing=true;
  goldBuyMode='gram';
  const gram=Number($('goldBuyGram')?.value||0);
  if($('goldBuyValue'))$('goldBuyValue').value=gram>0?formatGoldInputValue(gram,'gram'):'';
  goldBuySyncing=false;handleGoldBuyValueInput(false);renderGoldBuyMode();
}
function syncGoldBuyFromNominal(){
  if(goldBuySyncing)return;goldBuySyncing=true;
  goldBuyMode='rupiah';
  const nominal=Number($('goldBuyNominal')?.value||0);
  if($('goldBuyValue'))$('goldBuyValue').value=nominal>0?String(Math.round(nominal)):'';
  goldBuySyncing=false;handleGoldBuyValueInput(false);renderGoldBuyMode();
}
function updateGoldBuyPreview(){
  const price=Number(getActiveGoldPrice()||0),gram=Number($('goldBuyGram')?.value||0),nominal=Number($('goldBuyNominal')?.value||0);
  const amount=nominal>0?Math.round(nominal):(price>0&&gram>0?Math.round(gram*price):0);
  const adminFee=amount>0?GOLD_ADMIN_FEE:0;
  const totalPayment=amount+adminFee;
  const finalGram=gram>0?gram:(price>0&&amount>0?amount/price:0);
  const prev=$('goldBuyPreview'),nomPrev=$('goldBuyNominalPreview'),converted=$('goldBuyConverted'),total=$('goldTotalPaymentPreview'),fee=$('goldAdminFeePreview');
  if(nomPrev)nomPrev.innerText=amount?formatRupiah(amount):'';
  if(fee)fee.innerText=formatRupiah(GOLD_ADMIN_FEE);
  if(total)total.innerText=amount?formatRupiah(totalPayment):'Rp 0';
  if(converted){
    if(goldBuyMode==='rupiah')converted.innerText=`Berat emas ${finalGram?formatGoldGram(finalGram):'0 gr'}`;
    else converted.innerText=`Nominal Pembelian ${amount?formatRupiah(amount):'Rp 0'}`;
  }
  if(prev){
    if(!price)prev.innerText='Harga emas belum tersedia. Refresh harga atau isi harga manual / gram.';
    else if(!amount)prev.innerText=`Isi gram atau nominal. Setiap pembelian otomatis kena biaya admin ${formatRupiah(GOLD_ADMIN_FEE)}.`;
    else if(finalGram<getGoldMinGram())prev.innerText=`Minimal pembelian ${formatGoldGram(getGoldMinGram())}. Saat ini ${formatGoldGram(finalGram)}.`;
    else prev.innerText=`Akan beli ${formatGoldGram(finalGram)} senilai ${formatRupiah(amount)} + admin ${formatRupiah(GOLD_ADMIN_FEE)}. Total terpotong ${formatRupiah(totalPayment)}.`;
  }
}
async function getGoldExpenseCategory(){
  await loadExpenseCategories().catch(()=>{});
  let cat=getCategoryByName(GOLD_CATEGORY_NAME);
  if(!cat){
    await insertExpenseCategory(GOLD_CATEGORY_NAME,5);
    await loadExpenseCategories();
    cat=getCategoryByName(GOLD_CATEGORY_NAME);
  }
  return cat||getDefaultExpenseCategory();
}
async function saveGoldPurchase(){
  handleGoldBuyValueInput(false);
  const price=Number(getActiveGoldPrice()||0);
  const gramInput=Number($('goldBuyGram')?.value||0);
  const nominalInput=Number($('goldBuyNominal')?.value||0);
  const goldAmount=Math.round(nominalInput>0?nominalInput:(price>0&&gramInput>0?gramInput*price:0));
  const adminFee=goldAmount>0?GOLD_ADMIN_FEE:0;
  const totalPayment=goldAmount+adminFee;
  const gram=gramInput>0?gramInput:(price>0&&goldAmount>0?goldAmount/price:0);
  if(!price){showToast('Harga emas belum tersedia. Klik Refresh atau isi harga manual / gram.');return;}
  if(!goldAmount||goldAmount<=0){showToast('Isi gram atau nominal emas dulu');return;}
  if(gram<getGoldMinGram()){showToast('Minimal pembelian emas 0,0100 gr');return;}
  const manualNow=Number($('goldManualPrice')?.value||0)||0;
  if(manualNow>0){saveManualGoldPrice(manualNow);goldPriceState=buildGoldState(manualNow,'Harga Manual','',{manual:true})||goldPriceState;}
  try{
    const cat=await getGoldExpenseCategory();
    const today=getLocalDateString();
    const desc=`${GOLD_PREFIX}${Number(gram||0).toFixed(4)}GR@${Math.round(price)}|ADMIN:${adminFee}|EMAS:${goldAmount}] Beli emas ${formatGoldGram(gram)} · emas ${formatRupiah(goldAmount)} · admin ${formatRupiah(adminFee)} · total ${formatRupiah(totalPayment)}`;
    await saveTransaction({id:Date.now()+88,date:today,description:desc,amount:totalPayment,type:'expense',category_id:cat?Number(cat.id):null,category_name:GOLD_CATEGORY_NAME});
    await loadTransactions();
    render();renderCashFisik();renderGoldSection();
    closeGoldBuyModal();
    showToast(`Beli emas tersimpan: ${formatGoldGram(gram)} / ${formatRupiah(goldAmount)} + admin ${formatRupiah(adminFee)}. Saldo Bersih berkurang ${formatRupiah(totalPayment)}.`);
  }catch(e){showToast('Gagal simpan beli emas: '+(e.message||e),6000)}
}

const ZAKAT_LOCAL_BACKUP_KEY='kas_zakat_history_backup_v2';
function roundRp(n){const x=Number(n||0);return Number.isFinite(x)?Math.round(x):0}
function normalizeZakatRecord(r={}){
  const zakatPaidRaw=r.zakatPaid??r.zakat_paid??0;
  const rawProfit=roundRp(r.profitAtPayment??r.profit_at_payment??0);
  const paid=roundRp(zakatPaidRaw);
  const profitFromPaid=paid?roundRp(paid/0.025):0;
  // Fix data lama: kalau profitAtPayment pernah tersimpan sebesar nominal zakat,
  // basis laba yang sudah dizakatkan dipulihkan dari zakatPaid / 2.5%.
  let profit=Math.max(rawProfit,profitFromPaid);
  if(!profit&&rawProfit)profit=rawProfit;
  const note=r.note||'';
  const autoCancelled=!!r.cancelled&&/auto batal/i.test(note);
  const migrated=paid&&rawProfit&&profitFromPaid>rawProfit;
  const finalNote=autoCancelled?(note+' · dipulihkan oleh fix'):(migrated&&!/basis zakat dipulihkan/i.test(note)?(note+' · basis zakat dipulihkan'):note);
  return {id:Number(r.id)||Date.now(),date:r.date||getWibDateTimeString(),profitAtPayment:profit,zakatPaid:paid||roundRp(profit*0.025),cancelled:autoCancelled?false:!!r.cancelled,cancelledAt:autoCancelled?null:(r.cancelledAt||r.cancelled_at||null),note:finalNote};
}
function getZakatHistory(){return Array.isArray(zakatHistory)?zakatHistory:[]}
function persistZakatLocal(history=getZakatHistory()){try{localStorage.setItem(ZAKAT_LOCAL_BACKUP_KEY,JSON.stringify((history||[]).map(normalizeZakatRecord)))}catch(e){}}
function readZakatLocal(){try{return (JSON.parse(localStorage.getItem(ZAKAT_LOCAL_BACKUP_KEY)||'[]')||[]).map(normalizeZakatRecord)}catch(e){return[]}}
async function loadZakatHistory(){
  if(!supabaseClient){zakatHistory=readZakatLocal();return zakatHistory}
  const{data,error}=await supabaseClient.from('zakat_history').select('*').eq('owner_id',OWNER_ID).order('id',{ascending:true});
  if(error){const backup=readZakatLocal();if(backup.length){zakatHistory=backup;showToast('Riwayat zakat pakai backup lokal');return zakatHistory}throw error}
  zakatHistory=(data||[]).map(normalizeZakatRecord);
  persistZakatLocal(zakatHistory);
  return zakatHistory;
}
async function saveZakatHistory(history){
  const clean=(history||[]).map(normalizeZakatRecord);
  const old=getZakatHistory();
  zakatHistory=clean;
  persistZakatLocal(clean);
  if(!supabaseClient)return;
  const del=await supabaseClient.from('zakat_history').delete().eq('owner_id',OWNER_ID);
  if(del.error){zakatHistory=old;persistZakatLocal(old);throw del.error}
  if(!clean.length)return;
  const rows=clean.map(r=>({id:r.id,owner_id:OWNER_ID,date:r.date,profit_at_payment:roundRp(r.profitAtPayment),zakat_paid:roundRp(r.zakatPaid),cancelled:!!r.cancelled,cancelled_at:r.cancelledAt||null,note:r.note||''}));
  const ins=await supabaseClient.from('zakat_history').insert(rows);
  if(ins.error){showToast('Zakat aman di backup lokal, Supabase gagal simpan');throw ins.error}
}
async function appendZakatHistoryRecord(record){
  const row=normalizeZakatRecord(record);
  zakatHistory=[...getZakatHistory(),row];
  persistZakatLocal(zakatHistory);
  if(!supabaseClient)return;
  const payload={id:row.id,owner_id:OWNER_ID,date:row.date,profit_at_payment:roundRp(row.profitAtPayment),zakat_paid:roundRp(row.zakatPaid),cancelled:false,cancelled_at:null,note:row.note||''};
  const ins=await supabaseClient.from('zakat_history').insert(payload);
  if(ins.error)throw ins.error;
}
async function appendZakatHistory(row){return appendZakatHistoryRecord(row)}
function getWibDateTimeString(){const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(x=>[x.type,x.value]));return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`}
function getJakartaDateTimeString(){return getWibDateTimeString()}
function getWibDateOffsetString(offsetDays=0){const today=getLocalDateString();const ms=new Date(`${today}T00:00:00+07:00`).getTime()+(Number(offsetDays||0)*86400000);return getLocalDateString(new Date(ms))}
function getZakatCutoffDate(){return getWibDateOffsetString(-1)}
function isOnOrBeforeZakatCutoff(date){const d=String(date||'').slice(0,10);return !!d&&d<=getZakatCutoffDate()}
function getZakatBasisLabel(){return `s.d ${getZakatCutoffDate()} (H-1 / data final)`}
function getTotalProfit(){
  // Basis zakat dibuat FINAL sampai H-1 agar tidak berubah saat ada transaksi baru hari ini.
  // Yang dihitung hanya pemasukan manual + SERVER LOCK yang sudah masuk Supabase sampai kemarin.
  // Server Pusat hari ini sengaja TIDAK dihitung; sync dulu besok, baru masuk zakat berikutnya.
  let totalIncome=0;
  (transactions||[]).forEach(t=>{
    if(t&&t.type==='income'&&isOnOrBeforeZakatCutoff(t.date))totalIncome+=Number(t.amount||0);
  });
  return roundRp(totalIncome*.2);
}
function getZakatCoveredProfit(r={}){const profit=roundRp(r.profitAtPayment??r.profit_at_payment??0),paid=roundRp(r.zakatPaid??r.zakat_paid??0),fromPaid=paid?roundRp(paid/0.025):0;return Math.max(profit,fromPaid)}
function getPaidProfitFromZakatRow(r){return (!r||r.cancelled)?0:getZakatCoveredProfit(r)}
function getTotalProfitZakatPaid(){return getZakatHistory().reduce((a,r)=>a+(!r.cancelled?getZakatCoveredProfit(r):0),0)}
function getUnpaidProfit(){return Math.max(0,roundRp(getTotalProfit()-getTotalProfitZakatPaid()))}
function getCurrentZakatDue(){return roundRp(getUnpaidProfit()*.025)}

async function getZakatExpenseCategory(){
  // Bayar zakat harus masuk sebagai pengeluaran agar Saldo Bersih ikut berkurang.
  // Kalau tabel kategori sedang bermasalah, transaksi tetap disimpan dengan category_name='Zakat'.
  try{
    await loadExpenseCategories();
    let cat=getCategoryByName(ZAKAT_CATEGORY_NAME);
    if(!cat){
      try{await insertExpenseCategory(ZAKAT_CATEGORY_NAME,3);}catch(e){console.warn('Auto kategori Zakat gagal:',e)}
      await loadExpenseCategories();
      cat=getCategoryByName(ZAKAT_CATEGORY_NAME);
    }
    return cat||{id:null,name:ZAKAT_CATEGORY_NAME};
  }catch(e){
    console.warn('Kategori Zakat tidak siap, pakai category_name saja:',e);
    return {id:null,name:ZAKAT_CATEGORY_NAME};
  }
}
function validateAndCancelInvalidZakat(){
  // Jangan auto-batalkan riwayat zakat yang sudah dibayar.
  // Riwayat lama yang sempat auto-batal dipulihkan lewat normalizeZakatRecord().
  return false;
}
async function markZakatPaid(){
  const due=getCurrentZakatDue();
  if(due<=0){showToast('Zakat sudah lunas');return}
  const unpaid=getUnpaidProfit();
  const ds=getWibDateTimeString();
  const cutoff=getZakatCutoffDate();
  if(confirm(`Bayar Zakat Mal:
Data final sampai ${cutoff} (H-1)
2.5% × ${formatRupiah(unpaid)} (laba belum dizakatkan)
= ${formatRupiah(due)}

Nominal ini akan otomatis masuk Pengeluaran kategori Zakat, jadi Saldo Bersih ikut berkurang.
Transaksi hari ini tidak ikut. Lanjutkan?`)){
    const baseId=Date.now();
    const txId=baseId;
    let txSaved=false;
    try{
      const cat=await getZakatExpenseCategory();
      const txPayload={
        id:txId,
        date:getLocalDateString(),
        description:`Zakat Mal [ZAKAT:${cutoff}]`,
        amount:due,
        type:'expense',
        category_id:cat&&cat.id?Number(cat.id):null,
        category_name:ZAKAT_CATEGORY_NAME
      };
      await saveTransaction(txPayload);
      txSaved=true;
      await appendZakatHistoryRecord({
        id:baseId+1,
        date:ds,
        profitAtPayment:unpaid,
        zakatPaid:due,
        cancelled:false,
        note:`Zakat 2.5% dari laba ${formatRupiah(unpaid)} sampai ${cutoff} · otomatis masuk pengeluaran Zakat · tx:${txId}`
      });
      await loadTransactions();
      renderCategorySelects();
      render();
      showToast('Zakat dibayar. Saldo Bersih otomatis berkurang '+formatRupiah(due));
    }catch(e){
      if(txSaved){
        try{await deleteTransactionFromDB(txId);await loadTransactions();render();}catch(rollbackErr){console.warn('Rollback transaksi zakat gagal:',rollbackErr)}
      }
      showToast('Gagal bayar zakat: '+(e.message||e));
    }
  }
}
function showZakatHistoryModal(){const h=getZakatHistory(),box=$('zakatHistoryList');box.innerHTML=h.length?h.slice().reverse().map(r=>`<div class="item ${r.cancelled?'danger-card':''}"><div class="desc"><b>${r.date} ${r.cancelled?'(Batal)':''}</b><small>Dari laba ${formatRupiah(r.profitAtPayment)}</small></div><b class="num ${r.cancelled?'red':'gold'}">${formatRupiah(r.zakatPaid)}</b></div>`).join(''):'<div class="empty">Belum ada riwayat zakat</div>';$('zakatHistoryModal').classList.remove('hidden')}
function closeZakatHistoryModal(){$('zakatHistoryModal').classList.add('hidden')}

// =====================================================
// DANA DARURAT
// 5% dari Cash Fisik yang sudah final sampai H-1.
// Reset otomatis setiap bulan karena basis hitung memakai month_key bulan berjalan.
// Saat dibayar, nominal juga dibuat sebagai transaksi expense kategori "Dana Darurat".
// =====================================================
const EMERGENCY_LOCAL_BACKUP_KEY='kas_dana_darurat_history_v1';
function getEmergencyMonthKey(date=getLocalDateString()){return String(date||getLocalDateString()).slice(0,7)}
function getEmergencyCutoffDate(){return getWibDateOffsetString(-1)}
function isEmergencyFundTx(t={}){
  const desc=String(t&&t.description||'');
  const cat=String(t&&t.category_name||'');
  return desc.startsWith(EMERGENCY_PREFIX) || cat.toLowerCase()===EMERGENCY_CATEGORY_NAME.toLowerCase();
}
function isAutoEmergencyFundTx(t={}){
  const desc=String(t&&t.description||'');
  return !!(t&&t.type==='expense'&&desc.startsWith(EMERGENCY_PREFIX));
}
function getEmergencyFundHistory(){return Array.isArray(emergencyFundHistory)?emergencyFundHistory:[]}
function normalizeEmergencyFundRecord(r={}){
  const amount=roundRp(r.amountSaved??r.amount_saved??r.amount??0);
  const income=roundRp(r.incomeAtPayment??r.income_at_payment??0);
  const fromAmount=amount?roundRp(amount/EMERGENCY_RATE):0;
  const monthKey=String(r.monthKey||r.month_key||String(r.date||getLocalDateString()).slice(0,7)||getEmergencyMonthKey()).slice(0,7);
  return {
    id:Number(r.id)||Date.now(),
    owner_id:r.owner_id||OWNER_ID,
    date:r.date||getWibDateTimeString(),
    monthKey,
    cutoffDate:r.cutoffDate||r.cutoff_date||getEmergencyCutoffDate(),
    incomeAtPayment:Math.max(income,fromAmount),
    amountSaved:amount||roundRp(income*EMERGENCY_RATE),
    transactionId:Number(r.transactionId??r.transaction_id??0)||null,
    cancelled:!!r.cancelled,
    cancelledAt:r.cancelledAt||r.cancelled_at||null,
    note:r.note||''
  };
}
function persistEmergencyFundLocal(history=getEmergencyFundHistory()){
  try{localStorage.setItem(EMERGENCY_LOCAL_BACKUP_KEY,JSON.stringify((history||[]).map(normalizeEmergencyFundRecord)))}catch(e){}
}
function readEmergencyFundLocal(){
  try{return (JSON.parse(localStorage.getItem(EMERGENCY_LOCAL_BACKUP_KEY)||'[]')||[]).map(normalizeEmergencyFundRecord)}catch(e){return[]}
}

function parseEmergencyMonthFromTransaction(t={}){
  const desc=String(t&&t.description||'');
  const m=desc.match(/\[DANA_DARURAT:(\d{4}-\d{2})\]/i);
  return (m&&m[1]) || String(t&&t.date||getLocalDateString()).slice(0,7) || getEmergencyMonthKey();
}
function parseEmergencyCutoffFromTransaction(t={}){
  const desc=String(t&&t.description||'');
  const m=desc.match(/sampai\s+(\d{4}-\d{2}-\d{2})/i);
  return (m&&m[1]) || String(t&&t.date||getLocalDateString()).slice(0,10) || getEmergencyCutoffDate();
}
function emergencyRecordFromTransaction(t={}){
  const txId=Number(t&&t.id||0);
  const amount=roundRp(t&&t.amount||0);
  const monthKey=parseEmergencyMonthFromTransaction(t);
  const cutoffDate=parseEmergencyCutoffFromTransaction(t);
  return normalizeEmergencyFundRecord({
    id:txId?EMERGENCY_HISTORY_ID_OFFSET+txId:Date.now()+Math.floor(Math.random()*999),
    owner_id:OWNER_ID,
    date:String(t&&t.date||getLocalDateString()),
    monthKey,
    cutoffDate,
    incomeAtPayment:amount?roundRp(amount/EMERGENCY_RATE):0,
    amountSaved:amount,
    transactionId:txId||null,
    cancelled:false,
    note:'Migrasi otomatis dari transaksi Dana Darurat yang belum masuk riwayat khusus'
  });
}
async function syncEmergencyFundHistoryFromTransactions(){
  // Riwayat khusus Dana Darurat sudah tidak dipakai. Sumber kebenaran hanya tabel transactions.
  emergencyFundHistory=[];
  try{localStorage.removeItem(EMERGENCY_LOCAL_BACKUP_KEY);}catch(e){}
  emergencyFundTableReady=true;
  return 0;
}

async function loadEmergencyFundHistory(){
  // Riwayat khusus Dana Darurat tidak dipakai lagi supaya tidak membingungkan.
  emergencyFundHistory=[];
  try{localStorage.removeItem(EMERGENCY_LOCAL_BACKUP_KEY);}catch(e){}
  emergencyFundTableReady=true;
  return emergencyFundHistory;
}

async function saveEmergencyFundHistory(history){
  // No-op: Dana Darurat sekarang cukup tercatat sebagai transaksi pengeluaran.
  emergencyFundHistory=[];
  try{localStorage.removeItem(EMERGENCY_LOCAL_BACKUP_KEY);}catch(e){}
  emergencyFundTableReady=true;
}

async function appendEmergencyFundRecord(record){
  // No-op: tidak membuat tabel/riwayat khusus lagi.
  emergencyFundHistory=[];
  try{localStorage.removeItem(EMERGENCY_LOCAL_BACKUP_KEY);}catch(e){}
  emergencyFundTableReady=true;
}

function getEmergencyCashFisikForDate(date){
  const day=String(date||'').slice(0,10);
  if(!day)return 0;
  const rows=transactions||[];
  const serverIncome=rows
    .filter(t=>t&&t.type==='income'&&isFirebaseUploaded(t)&&String(t.date||'').slice(0,10)===day)
    .reduce((sum,t)=>sum+Number(t.amount||0),0);
  const opsTotal=rows
    .filter(t=>t&&isOpsExpense(t)&&String(t.date||'').slice(0,10)===day)
    .reduce((sum,t)=>sum+Number(t.amount||0),0);
  const cashOutTotal=rows
    .filter(t=>t&&isCashOut(t)&&String(t.date||'').slice(0,10)===day)
    .reduce((sum,t)=>sum+Number(t.amount||0),0);
  const base=Math.max(0,roundRp(serverIncome-opsTotal-cashOutTotal));
  const adjustment=getCashDrawerAppliedAdjustmentForDate(day);
  return Math.max(0,roundRp(base+adjustment));
}
function getEmergencyCashFisikBasis(monthKey=getEmergencyMonthKey()){
  const cutoff=getEmergencyCutoffDate();
  const days=[...new Set((transactions||[])
    .map(t=>String(t&&t.date||'').slice(0,10))
    .filter(d=>d&&d.startsWith(monthKey)&&d<=cutoff))];
  return roundRp(days.reduce((sum,day)=>sum+getEmergencyCashFisikForDate(day),0));
}
function getEmergencyServerIncome(monthKey=getEmergencyMonthKey()){
  // Nama fungsi lama dipertahankan agar tidak memutus kode lain.
  // Basis Dana Darurat sekarang memakai Cash Fisik H-1, bukan Server Pusat mentah.
  return getEmergencyCashFisikBasis(monthKey);
}
function getEmergencyFundTransactions(monthKey){
  return (transactions||[])
    .filter(t=>t&&t.type==='expense'&&isEmergencyFundTx(t))
    .filter(t=>!monthKey||parseEmergencyMonthFromTransaction(t)===monthKey);
}
function getAutoEmergencyFundTransactions(monthKey){
  return (transactions||[])
    .filter(t=>isAutoEmergencyFundTx(t))
    .filter(t=>!monthKey||parseEmergencyMonthFromTransaction(t)===monthKey);
}
function getEmergencySavedAmountFromTransactions(monthKey){
  return roundRp(getAutoEmergencyFundTransactions(monthKey).reduce((sum,t)=>sum+Number(t.amount||0),0));
}
function getEmergencySavedCoveredIncomeFromTransactions(monthKey){
  return roundRp(getAutoEmergencyFundTransactions(monthKey).reduce((sum,t)=>sum+(Number(t.amount||0)/EMERGENCY_RATE),0));
}
function getEmergencyFundTotalSavedAll(){
  // Sumber kebenaran Total Dana Darurat Terkumpul = transaksi yang benar-benar masih ada.
  return roundRp(getEmergencyFundTransactions().reduce((sum,t)=>sum+Number(t.amount||0),0));
}
function emergencyRecordStillHasTransaction(row={}){
  return !!findEmergencyFundTransactionForRecord(row);
}
function getActiveEmergencyFundHistory(){
  // Riwayat khusus boleh ada, tapi status lunas hanya valid kalau transaksi pasangannya masih ada.
  return getEmergencyFundHistory().filter(r=>!r.cancelled&&emergencyRecordStillHasTransaction(r));
}
function getEmergencyCoveredIncome(r={}){
  const amount=roundRp(r.amountSaved??r.amount_saved??0);
  const income=roundRp(r.incomeAtPayment??r.income_at_payment??0);
  const fromAmount=amount?roundRp(amount/EMERGENCY_RATE):0;
  return Math.max(income,fromAmount);
}
function getEmergencySavedCoveredIncome(monthKey=getEmergencyMonthKey()){
  // Hitungan wajib 5% hanya dikurangi transaksi dari tombol Nabung.
  // Input manual kategori Dana Darurat tetap masuk total terkumpul, tapi tidak mematikan tombol Nabung.
  return getEmergencySavedCoveredIncomeFromTransactions(monthKey);
}
function getEmergencySavedAmount(monthKey=getEmergencyMonthKey()){
  // Nominal yang sudah memenuhi target 5% bulanan hanya dari tombol Nabung.
  return getEmergencySavedAmountFromTransactions(monthKey);
}
function getUnpaidEmergencyIncome(monthKey=getEmergencyMonthKey()){
  return Math.max(0,roundRp(getEmergencyServerIncome(monthKey)-getEmergencySavedCoveredIncome(monthKey)));
}
function getCurrentEmergencyFundDue(monthKey=getEmergencyMonthKey()){
  return roundRp(getUnpaidEmergencyIncome(monthKey)*EMERGENCY_RATE);
}
async function getEmergencyExpenseCategory(){
  await loadExpenseCategories().catch(()=>{});
  let cat=getCategoryByName(EMERGENCY_CATEGORY_NAME);
  if(!cat){
    await insertExpenseCategory(EMERGENCY_CATEGORY_NAME,3);
    await loadExpenseCategories();
    cat=getCategoryByName(EMERGENCY_CATEGORY_NAME);
  }
  return cat;
}
async function markEmergencyFundSaved(){
  const monthKey=getEmergencyMonthKey(),cutoff=getEmergencyCutoffDate();
  const due=getCurrentEmergencyFundDue(monthKey);
  if(due<=0){showToast(`Dana Darurat bulan ${monthKey} sudah aman / belum ada Cash Fisik final`);return;}
  const unpaidIncome=getUnpaidEmergencyIncome(monthKey);
  if(!confirm(`Nabung Dana Darurat:
Bulan: ${monthKey}
Data Cash Fisik sampai ${cutoff} (H-1)
5% × ${formatRupiah(unpaidIncome)}
= ${formatRupiah(due)}

Nominal ini akan masuk sebagai Pengeluaran kategori "Dana Darurat". Lanjutkan?`))return;
  const txId=Date.now()+77;
  try{
    const cat=await getEmergencyExpenseCategory();
    const tx={id:txId,date:getLocalDateString(),description:`${EMERGENCY_PREFIX}${monthKey}] Tabungan Dana Darurat sampai ${cutoff}`,amount:due,type:'expense',category_id:cat?Number(cat.id):null,category_name:EMERGENCY_CATEGORY_NAME};
    await saveTransaction(tx);
    await loadTransactions();
    render();renderCashFisik();
    showToast(`Dana Darurat tersimpan di Riwayat Transaksi: ${formatRupiah(due)}`);
  }catch(e){showToast('Gagal simpan Dana Darurat: '+(e.message||e),6000)}
}

function renderEmergencyFundSection(){
  const monthKey=getEmergencyMonthKey(),cutoff=getEmergencyCutoffDate();
  const income=getEmergencyServerIncome(monthKey),unpaid=getUnpaidEmergencyIncome(monthKey),due=getCurrentEmergencyFundDue(monthKey),saved=getEmergencySavedAmount(monthKey),totalSaved=getEmergencyFundTotalSavedAll();
  if($('emergencyFundTotalSavedDisplay'))$('emergencyFundTotalSavedDisplay').innerText=formatRupiah(totalSaved);
  if($('emergencyFundAmountLarge'))$('emergencyFundAmountLarge').innerText=formatRupiah(due);
  if($('emergencyFundIncomeDisplay'))$('emergencyFundIncomeDisplay').innerText=formatRupiah(income);
  if($('emergencyFundUnpaidDisplay'))$('emergencyFundUnpaidDisplay').innerText=formatRupiah(unpaid);
  if($('emergencyFundBasisInfo'))$('emergencyFundBasisInfo').innerText=`Dana Darurat = 5% × Cash Fisik bulan ${monthKey} sampai ${cutoff} (H-1). Sudah via tombol Nabung: ${formatRupiah(saved)}. Total termasuk input manual: ${formatRupiah(totalSaved)}.`;
  const btn=$('payEmergencyFundBtn'),st=$('emergencyFundStatusText');
  if(btn&&income<=0){btn.disabled=true;btn.style.opacity=.55;if(st)st.innerText=`Belum ada Cash Fisik final bulan ${monthKey} sampai ${cutoff}`;}
  else if(btn&&due<=0){btn.disabled=true;btn.style.opacity=.55;if(st)st.innerText=`Dana Darurat bulan ${monthKey} sudah aman ✓`;}
  else if(btn){btn.disabled=false;btn.style.opacity=1;if(st)st.innerText=`Wajib nabung 5% bulan ${monthKey}: ${formatRupiah(due)}`;}
}

function showEmergencyFundHistoryModal(){
  showToast('Riwayat Dana Darurat khusus sudah dihapus. Cek/hapus Dana Darurat dari Riwayat Transaksi.');
}

function closeEmergencyFundHistoryModal(){
  const modal=$('emergencyFundHistoryModal');
  if(modal)modal.classList.add('hidden');
}

async function cancelEmergencyFundRecord(id){
  showToast('Riwayat Dana Darurat khusus sudah tidak dipakai. Hapus transaksinya dari Riwayat Transaksi.');
}

function findEmergencyFundTransactionForRecord(row={}){
  const directId=Number(row.transactionId||0);
  if(directId){
    const direct=(transactions||[]).find(t=>Number(t.id)===directId);
    if(direct)return direct;
  }
  const month=String(row.monthKey||'').slice(0,7);
  const cutoff=String(row.cutoffDate||'').slice(0,10);
  const amount=roundRp(row.amountSaved||0);
  return (transactions||[]).find(t=>{
    const desc=String(t&&t.description||'');
    return isEmergencyFundTx(t)
      && (!amount||roundRp(t.amount||0)===amount)
      && (!month||desc.includes(month))
      && (!cutoff||desc.includes(cutoff));
  })||null;
}
async function deleteEmergencyFundRecord(id){
  showToast('Riwayat Dana Darurat khusus sudah tidak dipakai. Hapus transaksinya dari Riwayat Transaksi.');
}


// ============================================================
// DANA GAJI — Sistem Sisihkan Gaji Karyawan
// Penyisihan masuk Supabase (transaksi nyata, kategori Gaji & Bonus).
// Target per bulan disimpan di localStorage (setting angka, bukan uang).
// ============================================================
let salaryTargets=[];
async function loadSalaryTargets(){
  if(!supabaseClient)return;
  try{
    const {data,error}=await supabaseClient.from('salary_targets').select('*').eq('owner_id',OWNER_ID);
    if(!error&&data) salaryTargets=data;
  }catch(e){console.warn('loadSalaryTargets',e)}
}
function getSalaryFundTarget(monthKey){
  const mk=monthKey||getSalaryFundMonthKey();
  const found=salaryTargets.find(t=>t.month_key===mk);
  if(found) return Math.round(Number(found.target_amount||0));
  // Fallback: if user hasn't set this month, maybe fallback to previous logic or 0
  // but to keep it simple, return 0 so they are forced to set it each month, OR
  // find the latest target set and use that as default.
  // We'll just return 0 for strict monthly targets.
  return 0;
}
async function setSalaryFundTarget(amount){
  const n=Math.round(Number(amount||0));
  const mk=getSalaryFundMonthKey();
  if(!supabaseClient)return;
  const payload={owner_id:OWNER_ID, month_key:mk, target_amount:n, updated_at:new Date().toISOString()};
  const {error}=await supabaseClient.from('salary_targets').upsert(payload,{onConflict:'owner_id,month_key'});
  if(error) throw new Error(error.message);
  let existing=salaryTargets.find(t=>t.month_key===mk);
  if(existing) existing.target_amount=n;
  else salaryTargets.push(payload);
}
function getSalaryFundMonthKey(date){return String(date||getLocalDateString()).slice(0,7)}
function isSalaryFundTx(t={}){
  const desc=String(t&&t.description||'');
  return !!(t&&t.type==='expense'&&desc.startsWith(SALARY_FUND_PREFIX));
}
function getSalaryFundTxForMonth(monthKey){
  const mk=monthKey||getSalaryFundMonthKey();
  return (transactions||[]).filter(t=>isSalaryFundTx(t)&&String(t.description||'').includes(mk));
}
function getSalaryFundSaved(monthKey){
  return roundRp(getSalaryFundTxForMonth(monthKey||getSalaryFundMonthKey()).reduce((sum,t)=>sum+Number(t.amount||0),0));
}
function getSalaryFundDue(monthKey){
  const target=getSalaryFundTarget();
  if(target<=0)return 0;
  return Math.max(0,roundRp(target-getSalaryFundSaved(monthKey||getSalaryFundMonthKey())));
}
function getSalaryDaysLeft(){
  const today=getLocalDateString();
  const yr=Number(today.slice(0,4)),mo=Number(today.slice(5,7));
  const lastDay=new Date(yr,mo,0).getDate();
  const curDay=Number(today.slice(8,10));
  return Math.max(1,lastDay-curDay+1);
}
const SALARY_BOOST_RAMAI_START=20;  // cash fisik >= 20x idealDaily mulai dianggap 'ramai'
const SALARY_BOOST_RAMAI_FULL=40;   // cash fisik >= 40x idealDaily -> boost penuh (2x)
const SALARY_BOOST_MAX=2;           // boost maksimal 2x idealDaily
function computeSalaryHint(due,daysLeft,cashFisik){
  const idealDaily=due>0?roundRp(Math.ceil(due/daysLeft)):0;
  const safeCap=roundRp(Math.floor(Math.max(0,cashFisik)*0.10));
  if(due<=0)return{hint:0,idealDaily,safeCap,capped:false,boosted:false,boostMultiplier:1};
  if(safeCap<idealDaily){
    // Sepi: cash fisik hari ini gak cukup buat kejar target ideal -> sisihkan semampunya (10% cash)
    return{hint:safeCap,idealDaily,safeCap,capped:true,boosted:false,boostMultiplier:1};
  }
  // Cash fisik cukup. Cek apakah lagi ramai banget sampai layak di-boost biar due kekejar lebih cepat.
  const ratio=idealDaily>0?cashFisik/idealDaily:0;
  let boostMultiplier=1;
  if(ratio>SALARY_BOOST_RAMAI_START){
    const progress=Math.min(1,(ratio-SALARY_BOOST_RAMAI_START)/(SALARY_BOOST_RAMAI_FULL-SALARY_BOOST_RAMAI_START));
    boostMultiplier=1+progress*(SALARY_BOOST_MAX-1);
  }
  const boosted=boostMultiplier>1.001;
  const boostedAmount=roundRp(Math.ceil(idealDaily*boostMultiplier));
  const hint=Math.min(boostedAmount,safeCap,due);
  return{hint,idealDaily,safeCap,capped:false,boosted,boostMultiplier};
}
function getSalaryDailyHint(monthKey){
  const due=getSalaryFundDue(monthKey||getSalaryFundMonthKey());
  if(due<=0)return 0;
  const daysLeft=getSalaryDaysLeft();
  const cashFisik=getTodayCashFisikData().cashFisik;
  return computeSalaryHint(due,daysLeft,cashFisik).hint;
}
function getSalaryDailyHintDetail(monthKey){
  const due=getSalaryFundDue(monthKey||getSalaryFundMonthKey());
  const daysLeft=getSalaryDaysLeft();
  const cashFisik=getTodayCashFisikData().cashFisik;
  const {hint,idealDaily,capped,boosted,boostMultiplier}=computeSalaryHint(due,daysLeft,cashFisik);
  return {hint,idealDaily,cashFisik,capped,boosted,boostMultiplier,daysLeft};
}
async function getSalaryCategory(){
  // Cari kategori yang persis sama namanya (case-insensitive).
  let cat=(expenseCategories||[]).find(c=>String(c.name||'').toLowerCase()===SALARY_CATEGORY_NAME.toLowerCase());
  if(!cat){
    await loadExpenseCategories().catch(()=>{});
    cat=(expenseCategories||[]).find(c=>String(c.name||'').toLowerCase()===SALARY_CATEGORY_NAME.toLowerCase());
  }
  // Kalau kategori belum ada sama sekali, fallback ke Lainnya agar tidak error.
  return cat||getDefaultExpenseCategory()||null;
}
function renderSalaryFundSection(){
  const monthKey=getSalaryFundMonthKey();
  const target=getSalaryFundTarget();
  const saved=getSalaryFundSaved(monthKey);
  const due=getSalaryFundDue(monthKey);
  const detail=getSalaryDailyHintDetail(monthKey);
  const {hint,cashFisik,capped,boosted,daysLeft}=detail;
  const pct=target>0?Math.min(100,Math.round((saved/target)*100)):0;
  if($('salaryFundAmountLarge'))$('salaryFundAmountLarge').innerText=formatRupiah(saved);
  if($('salaryFundProgressFill'))$('salaryFundProgressFill').style.width=pct+'%';
  if($('salaryFundProgressPct'))$('salaryFundProgressPct').innerText=pct+'%';
  if($('salaryFundProgressLabel'))$('salaryFundProgressLabel').innerText='Target: '+formatRupiah(target);
  
  if($('miniSalaryPct'))$('miniSalaryPct').innerText=pct+'%';
  if($('miniSalaryFill'))$('miniSalaryFill').style.width=pct+'%';

  if($('salaryFundSavedDisplay'))$('salaryFundSavedDisplay').innerText=formatRupiah(saved);
  if($('salaryFundDueDisplay'))$('salaryFundDueDisplay').innerText=formatRupiah(due);
  if($('salaryFundDailyHint'))$('salaryFundDailyHint').innerText=formatRupiah(hint);
  if($('salaryFundDaysLeft'))$('salaryFundDaysLeft').innerText=daysLeft+' hari';
  const statusEl=$('salaryFundStatusText'),btn=$('paySalaryFundBtn');
  if(target<=0){
    if(statusEl)statusEl.innerText='Set target gaji dulu via tombol Sisihkan';
    if(btn){btn.disabled=false;btn.style.opacity=1;}
  }else if(due<=0){
    if(statusEl)statusEl.innerText='Dana Gaji bulan '+monthKey+' sudah aman \u2713';
    if(btn){btn.disabled=false;btn.style.opacity=1;}
  }else{
    if(statusEl)statusEl.innerText='Terkumpul '+formatRupiah(saved)+' \xb7 Kurang '+formatRupiah(due);
    if(btn){btn.disabled=false;btn.style.opacity=1;}
  }
  if($('salaryFundBasisInfo')){
    if(target<=0){
      $('salaryFundBasisInfo').innerText='Tap Sisihkan untuk set target gaji per bulan dan mulai menyisihkan.';
    }else if(due<=0){
      $('salaryFundBasisInfo').innerText='Target gaji bulan ini sudah terpenuhi. Kerja keras terbayar! \u2728';
    }else{
      if(hint>0){
        const cashInfo=" \xb7 Cash fisik: "+formatRupiah(cashFisik);
        const cappedInfo=capped?" (disesuaikan, bukan dipaksakan)":"";
        let basisInfo;
        if(capped)basisInfo=" \xb7 Dibatasi maks 10% cash fisik";
        else if(boosted)basisInfo=" \xb7 Lagi ramai, dinaikkan biar kekejar lebih cepat";
        else basisInfo=" \xb7 Sesuai target harian";
        $('salaryFundBasisInfo').innerText="Saran hari ini: "+formatRupiah(hint)+cappedInfo+basisInfo+cashInfo+" \xb7 Sisa "+daysLeft+" hari.";
      }else{
        $('salaryFundBasisInfo').innerText="Belum ada cash fisik hari ini. Kumpulkan profit dulu (saran 10%). Sisa "+daysLeft+" hari.";
      }
    }
  }
}
function renderSalaryFundModal(){
  const monthKey=getSalaryFundMonthKey();
  const target=getSalaryFundTarget();
  const saved=getSalaryFundSaved(monthKey);
  const due=getSalaryFundDue(monthKey);
  const detail=getSalaryDailyHintDetail(monthKey);
  const {hint,idealDaily,cashFisik,capped,boosted,daysLeft}=detail;
  const pct=target>0?Math.min(100,Math.round((saved/target)*100)):0;
  if($('salaryModalMonthKey'))$('salaryModalMonthKey').innerText=monthKey;
  if($('salaryModalSaved'))$('salaryModalSaved').innerText=formatRupiah(saved);
  if($('salaryModalTarget'))$('salaryModalTarget').innerText=formatRupiah(target);
  if($('salaryModalDue'))$('salaryModalDue').innerText=formatRupiah(due);
  if($('salaryModalProgressFill'))$('salaryModalProgressFill').style.width=pct+'%';
  const hintBox=$('salaryModalHintBox'),hintTxt=$('salaryModalHintText');
  if(hintBox&&hintTxt){
    if(target>0&&due>0){
      if(hint>0){
        let msg="Sisihkan "+formatRupiah(hint)+" hari ini";
        if(capped){
          msg+=" \xb7 Disesuaikan dari cash fisik "+formatRupiah(cashFisik)+" (10%). Idealnya "+formatRupiah(idealDaily)+"/hari, tapi tidak perlu dipaksakan.";
        }else if(boosted){
          msg+=" \xb7 Lagi ramai (cash fisik "+formatRupiah(cashFisik)+"), dinaikkan dari "+formatRupiah(idealDaily)+"/hari biar target kekejar lebih cepat.";
        }else{
          msg+=" \xb7 Sesuai target harian agar tercapai dalam "+daysLeft+" hari (cash fisik hari ini: "+formatRupiah(cashFisik)+", cukup untuk itu).";
        }
        hintTxt.innerText=msg;
        hintBox.style.display='block';
      }else{
        hintTxt.innerText="Belum ada cash fisik hari ini. Kumpulkan profit dulu untuk bisa menyisihkan gaji (saran 10% dari cash fisik).";
        hintBox.style.display='block';
      }
    }else if(due<=0&&target>0){
      hintTxt.innerText="Target bulan ini sudah terpenuhi. Kamu bisa sisihkan lebih awal untuk bulan depan. \u2728";
      hintBox.style.display='block';
    }else{
      hintBox.style.display='none';
    }
  }
  // Pre-fill target input jika sudah ada
  const targetInp=$('salaryFundTargetInput');
  if(targetInp&&target>0&&!targetInp.value)targetInp.value=String(target);
  // Render riwayat penyisihan bulan ini
  const histList=$('salaryFundHistoryList'),histCount=$('salaryFundHistoryCount');
  const rows=getSalaryFundTxForMonth(monthKey).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  if(histCount)histCount.innerText=rows.length+' data';
  if(histList){
    if(!rows.length){
      histList.innerHTML='<div class="empty" style="color:#7c3aed">Belum ada penyisihan bulan ini.</div>';
    }else{
      histList.innerHTML=rows.map(t=>`<div class="item" style="border-color:#e9d5ff;display:flex;justify-content:space-between;align-items:center"><div><b style="font-size:12px;color:#7c3aed">${escapeHtml(t.date)}</b><div class="small" style="color:#6b7280;margin-top:1px">Disisihkan</div></div><b class="num" style="color:#7c3aed">${formatRupiah(Number(t.amount||0))}</b></div>`).join('');
    }
  }
}
function openSalaryFundModal(){
  renderSalaryFundModal();
  const modal=$('salaryFundModal');
  if(modal)modal.classList.remove('hidden');
  bindGlobalKeyboardFix();
}
function closeSalaryFundModal(){
  const modal=$('salaryFundModal');
  if(modal)modal.classList.add('hidden');
  const amtInp=$('salaryFundAmountInput');
  if(amtInp){amtInp.value='';}
  if($('salaryFundAmountPreview'))$('salaryFundAmountPreview').innerText='';
}
async function saveSalaryFundTarget(){
  const inp=$('salaryFundTargetInput');
  if(!inp)return;
  const val=getActualAmount(inp.value);
  if(val<=0){showToast('Isi nominal target gaji dulu');inp.focus();return;}
  const btn=$('saveSalaryTargetBtn') || inp.nextElementSibling;
  if(btn) btn.disabled=true;
  try{
    await setSalaryFundTarget(val);
    renderSalaryFundSection();
    renderSalaryFundModal();
    showToast('Target gaji '+getSalaryFundMonthKey()+' disimpan: '+formatRupiah(val));
  }catch(e){
    showToast('Gagal simpan target: '+e.message);
  }finally{
    if(btn) btn.disabled=false;
  }
}
async function saveSalaryFundEntry(){
  const amtInp=$('salaryFundAmountInput');
  if(!amtInp)return;
  const amount=getActualAmount(amtInp.value);
  if(amount<=0){showToast('Isi nominal yang disisihkan');amtInp.focus();return;}
  const monthKey=getSalaryFundMonthKey();
  const btn=$('saveSalaryFundBtn');
  if(btn){btn.disabled=true;btn.innerText='Menyimpan...';}
  try{
    const cat=await getSalaryCategory();
    const desc=`${SALARY_FUND_PREFIX}${monthKey}] Sisihkan Dana Gaji`;
    const tx={
      id:Date.now()+Math.floor(Math.random()*999),
      date:getLocalDateString(),
      description:desc,
      amount,
      type:'expense',
      category_id:cat?Number(cat.id):null,
      category_name:cat?cat.name:SALARY_CATEGORY_NAME
    };
    await saveTransaction(tx);
    await loadTransactions();
    render();
    renderSalaryFundSection();
    renderSalaryFundModal();
    if(amtInp){amtInp.value='';}
    if($('salaryFundAmountPreview'))$('salaryFundAmountPreview').innerText='';
    showToast('Penyisihan tersimpan: '+formatRupiah(amount));
  }catch(e){
    showToast('Gagal simpan penyisihan: '+(e.message||e),5000);
  }finally{
    if(btn){btn.disabled=false;btn.innerText='💾 Sisihkan';}
  }
}
function handleSalaryTargetPreview(inp){
  const v=getActualAmount(inp.value);
  const el=$('salaryFundTargetPreview');
  if(el)el.innerText=v>0?formatRupiah(v):'';
}
function handleSalaryAmountPreview(inp){
  const v=getActualAmount(inp.value);
  const el=$('salaryFundAmountPreview');
  if(el)el.innerText=v>0?formatRupiah(v):'';
}
// ============================================================


async function loadTransactions(){
  try{localStorage.removeItem('rh_tx_cache');}catch(e){}
  const [res1, res2] = await Promise.all([
    supabaseClient.from('transactions').select('*').eq('owner_id',OWNER_ID),
    supabaseClient.from('manual_incomes').select('*').eq('owner_id',OWNER_ID)
  ]);
  if(res1.error) throw res1.error;
  if(res2.error) throw res2.error;
  const allData = [...(res1.data||[]), ...(res2.data||[])];
  allData.sort((a,b) => {
    if(a.date !== b.date) return b.date.localeCompare(a.date);
    return b.id - a.id;
  });
  transactions=allData.map(r=>({id:Number(r.id),date:r.date,description:r.description,amount:Number(r.amount||0),type:r.type,category_id:r.category_id||null,category_name:r.category_name||''}));
  return transactions;
}
async function saveTransaction(t){
  const isManualIncome = (t.type === 'income' && !isFirebaseUploaded(t) && !t.__firebasePreview && !isCashDrawerAdjustmentTx(t));
  const table = isManualIncome ? 'manual_incomes' : 'transactions';
  const{error}=await supabaseClient.from(table).insert({...t,owner_id:OWNER_ID});
  if(error)throw error;
}
async function deleteTransactionFromDB(id){
  const t = transactions.find(x => x.id === id);
  const isManualIncome = t && (t.type === 'income' && !isFirebaseUploaded(t) && !t.__firebasePreview && !isCashDrawerAdjustmentTx(t));
  const table = isManualIncome ? 'manual_incomes' : 'transactions';
  const{error}=await supabaseClient.from(table).delete().eq('owner_id',OWNER_ID).eq('id',id);
  if(error)throw error;
}
async function clearManualTransactions(){
  const manualRows=transactions.filter(t=>!isFirebaseUploaded(t)&&!isAutoQrisCashOut(t));
  for(const t of manualRows){
    const isManualIncome = (t.type === 'income' && !isFirebaseUploaded(t) && !t.__firebasePreview && !isCashDrawerAdjustmentTx(t));
    const table = isManualIncome ? 'manual_incomes' : 'transactions';
    const{error}=await supabaseClient.from(table).delete().eq('owner_id',OWNER_ID).eq('id',t.id);
    if(error)throw error;
  }
}
async function clearAllTransactions(){
  // Reset FULL: hapus semua transaksi Server Pusat, termasuk data Server Pusat sync/LOCK, cash out, dan ops.
  return clearFullSupabaseData();
}
async function clearFullSupabaseData(){
  if(!supabaseClient)throw new Error('Supabase belum aktif');
  // Reset FULL hanya menghapus ISI data: transaksi, data sync/LOCK, cash out, ops, dan riwayat zakat.
  // Master kategori pengeluaran sengaja TIDAK dihapus. Kategori hanya bisa dihapus manual dari modal Kategori.
  const txDel=await supabaseClient.from('transactions').delete().eq('owner_id',OWNER_ID);
  if(txDel.error)throw txDel.error;
  const zkDel=await supabaseClient.from('zakat_history').delete().eq('owner_id',OWNER_ID);
  if(zkDel.error)throw zkDel.error;
  try{
    const cdDel=await supabaseClient.from(CASH_DRAWER_TABLE).delete().eq('owner_id',OWNER_ID);
    if(cdDel.error)throw cdDel.error;
  }catch(e){console.warn('Reset audit cash fisik dilewati:',e)}
  try{
    await loadExpenseCategories();
    await ensureDefaultExpenseCategories();
    await loadExpenseCategories();
  }catch(e){console.warn('Kategori tetap dipertahankan, tapi gagal dimuat ulang:',e);}
}
function resetLocalAfterFullDelete(){
  transactions=[];
  zakatHistory=[];
  emergencyFundHistory=[];
  cashDrawerAudits=[];
  // Kategori tidak direset di sini supaya master kategori tetap tampil setelah Hapus Semua Data Full.
  pendingFirebaseUploads=[];
  firebaseIncomeRows=[];
  firebaseIncomeTotal=0;
  todayFirebaseIncomeRows=[];
  todayFirebaseIncomeTotal=0;
  if($('pendingUploadList'))$('pendingUploadList').innerHTML='';
  if($('pendingUploadSummary'))$('pendingUploadSummary').innerText='Belum ada scan setelah reset full.';
  if($('pendingScanStatus'))$('pendingScanStatus').innerText='Idle';
}
async function importTransactions(newTransactions){
  // Import hanya mengganti data manual. Data SERVER LOCK tetap dipertahankan.
  await clearManualTransactions();
  const rows=newTransactions
    .filter(t=>!isFirebaseUploaded(t))
    .map(t=>({id:t.id,owner_id:OWNER_ID,date:t.date,description:t.description,amount:t.amount,type:t.type,category_id:t.category_id||null,category_name:t.category_name||''}));
  if(!rows.length)return;
  const{error}=await supabaseClient.from('transactions').insert(rows);
  if(error)throw error;
}
function getLocalDateString(date=new Date()){
  // Pakai tanggal WIB agar sama dengan aplikasi kasir Server Pusat utama.
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
}
function isLastDayOfMonth(dateStr) {
  if(!dateStr)return false;
  const parts=dateStr.split('-');
  if(parts.length!==3)return false;
  const y=parseInt(parts[0],10);
  const m=parseInt(parts[1],10);
  const d=parseInt(parts[2],10);
  const lastDay=new Date(y,m,0).getDate();
  return d===lastDay;
}
function getFirebaseRecordDateKey(t){
  if(!t)return '';
  if(t.dateKey)return String(t.dateKey).slice(0,10);
  if(t.date)return String(t.date).slice(0,10);
  if(typeof t.time==='string'&&t.time.length>=10)return t.time.slice(0,10);
  if(typeof t.createdAt==='string'&&t.createdAt.length>=10)return t.createdAt.slice(0,10);
  if(t.createdAt&&typeof t.createdAt.toDate==='function')return getLocalDateString(t.createdAt.toDate());
  if(Number(t.createdAtMs||0))return getLocalDateString(new Date(Number(t.createdAtMs)));
  // Index versi baru tetap pakai createdAtMs, tapi beberapa backup/data lama masih menyimpan timestamp angka.
  if(Number(t.timestamp||0))return getLocalDateString(new Date(Number(t.timestamp)));
  return '';
}
function isFirebaseRecordDeleted(t){return t&&(t.deleted===true||t.deleted==='true'||t.isDeleted===true||t.isDeleted==='true'||t.canceled===true||t.canceled==='true'||t.cancelled===true||t.cancelled==='true'||['deleted','canceled','cancelled'].includes(String(t.status||'').toLowerCase()))}
function isTruthyServerFlag(value){return value===true||value===1||String(value||'').toLowerCase()==='true'||String(value||'')==='1'}
function isTrialServerRecord(t){
  if(!t)return false;
  const accountType=String(t.accountType||t.account_type||t.mode||'').toLowerCase();
  return isTruthyServerFlag(t.isDummy)||
    isTruthyServerFlag(t.is_dummy)||
    isTruthyServerFlag(t.dummy)||
    isTruthyServerFlag(t.trialMode)||
    isTruthyServerFlag(t.trial_mode)||
    isTruthyServerFlag(t.excludeFromReports)||
    isTruthyServerFlag(t.exclude_from_reports)||
    accountType==='dummy'||
    accountType==='trial';
}
function normalizeFirebaseRows(rows){
  return (rows||[])
    .map(t=>({...t,dateKey:getFirebaseRecordDateKey(t),amount:Number(t.amount||0)}))
    .filter(t=>t.dateKey&&!isFirebaseRecordDeleted(t)&&!isTrialServerRecord(t));
}
function wibDayStartMs(date){return new Date(`${date}T00:00:00+07:00`).getTime()}
function wibDayEndMs(date){return new Date(`${date}T23:59:59+07:00`).getTime()}
const SERVER_PUSAT_RANGE_LIMIT=1500;
async function fetchFirebaseRowsByRange(start,end){
  if(!serverPusatClient)return [];
  const merged={};
  const addRows=(rows=[])=>rows.forEach(r=>{merged[String(r.id)]={id:r.id,_docId:r.id,...((r&&r.data&&typeof r.data==='object')?r.data:{})}});
  const rangeQuery=async(field,from,to)=>{
    const path=`data->>${field}`;
    let allData=[];
    let startRange=0;
    const step=1000;
    while(true){
      const {data,error}=await serverPusatClient.from('transactions').select('id,data').gte(path,String(from)).lte(path,String(to)).range(startRange,startRange+step-1);
      if(error)throw error;
      if(data)allData.push(...data);
      if(!data||data.length<step)break;
      startRange+=step;
    }
    addRows(allData);
  };
  const errors=[];
  await Promise.allSettled([
    rangeQuery('dateKey',start,end),
    rangeQuery('createdAtMs',wibDayStartMs(start),wibDayEndMs(end)),
    rangeQuery('timestamp',wibDayStartMs(start),wibDayEndMs(end))
  ]).then(results=>results.forEach(r=>{if(r.status==='rejected')errors.push(r.reason)}));
  if(!Object.keys(merged).length&&errors.length>=3){
    const {data,error}=await serverPusatClient.from('transactions').select('id,data').limit(5000);
    if(error)throw error;
    addRows(data||[]);
  }
  const rows=Object.values(merged);
  return normalizeFirebaseRows(rows).filter(t=>t.dateKey>=start&&t.dateKey<=end);
}
function sumFirebaseRows(rows){return normalizeFirebaseRows(rows||[]).reduce((a,b)=>a+Number(b.amount||0),0)}

function serverUsernameKey(value){
  return String(value||'').trim().toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_.-]/g,'');
}
function serverRecordUsername(row={}){
  return serverUsernameKey(row.username||row.user||row.targetUsername||row.staffUsername||row.staff||row.createdBy||row.id||'');
}
function serverRoleKey(value){return serverUsernameKey(value)}
function isServerDailyUser(row={}){
  const role=serverRoleKey(row.role||row.userRole||row.actualRole||'');
  const group=serverRoleKey(row.bonusGroup||row.group||'');
  return isTruthyServerFlag(row.isDaily)||
    isTruthyServerFlag(row.actualDaily)||
    isTruthyServerFlag(row.dailyMode)||
    role==='harian'||role==='daily'||role==='karyawan_harian'||group==='harian';
}
function isActiveServerUser(row={}){
  if(!row||isFirebaseRecordDeleted(row)||isTrialServerRecord(row))return false;
  if(row.active===false||String(row.active||'').toLowerCase()==='false')return false;
  if(row.disabled===true||String(row.disabled||'').toLowerCase()==='true')return false;
  return true;
}
function normalizeServerPusatJsonRows(rows=[]){
  return (rows||[]).map(row=>({id:row?.id,...((row&&row.data&&typeof row.data==='object')?row.data:{})}));
}
async function fetchServerPusatJsonRows(table,{dateKey='',limit=2000}={}){
  if(!serverPusatClient)throw new Error('Server Pusat belum aktif');
  let req=serverPusatClient.from(table).select('id,data');
  const d=String(dateKey||'').slice(0,10);
  if(d)req=req.eq('data->>dateKey',d);
  const {data,error}=await req.limit(Number(limit||2000));
  if(error)throw error;
  return normalizeServerPusatJsonRows(data||[]);
}
async function fetchServerPusatDateRows(table,dateKey,{limit=2000,fallbackLimit=5000}={}){
  const d=String(dateKey||getLocalDateString()).slice(0,10);
  let rows=[];
  try{
    rows=await fetchServerPusatJsonRows(table,{dateKey:d,limit});
  }catch(e){
    console.warn(`Filter ${table} tanggal ${d} gagal, pakai fallback:`,e?.message||e);
    rows=await fetchServerPusatJsonRows(table,{limit:fallbackLimit});
  }
  return rows.filter(row=>getFirebaseRecordDateKey(row)===d&&!isFirebaseRecordDeleted(row)&&!isTrialServerRecord(row));
}
function uniqueServerUsernames(values=[]){
  return Array.from(new Set((values||[]).map(serverUsernameKey).filter(Boolean))).sort();
}
async function resolveCashDrawerNotifyTargets(dateKey=getLocalDateString()){
  const d=String(dateKey||getLocalDateString()).slice(0,10);
  if(!serverPusatClient)throw new Error('Server Pusat belum aktif');
  const [users,attendanceRows,txRows]=await Promise.all([
    fetchServerPusatJsonRows('users',{limit:1500}).catch(e=>{console.warn('Data user Server Pusat gagal dibaca:',e?.message||e);return []}),
    fetchServerPusatDateRows('attendance',d,{limit:1500}).catch(e=>{console.warn('Data absen Server Pusat gagal dibaca:',e?.message||e);return []}),
    fetchFirebaseRowsByRange(d,d).catch(e=>{console.warn('Data transaksi Server Pusat gagal dibaca:',e?.message||e);return []})
  ]);
  const allUserByName=new Map();
  users.forEach(user=>{
    const username=serverRecordUsername(user);
    if(username)allUserByName.set(username,user);
  });
  const userByName=new Map();
  allUserByName.forEach((user,username)=>{
    if(isActiveServerUser(user))userByName.set(username,user);
  });
  const dailyUsers=new Set();
  userByName.forEach((user,username)=>{if(isServerDailyUser(user))dailyUsers.add(username)});

  const attendedUsers=uniqueServerUsernames(attendanceRows.map(serverRecordUsername));
  const txUsers=uniqueServerUsernames(txRows.map(serverRecordUsername));
  const isKnownInactive=username=>allUserByName.has(username)&&!userByName.has(username);
  const staffAttendedUsernames=attendedUsers.filter(username=>!isKnownInactive(username)&&!dailyUsers.has(username)&&!isServerDailyUser(userByName.get(username)||{}));
  const dailyTransactionUsernames=txUsers.filter(username=>{
    if(isKnownInactive(username))return false;
    const user=userByName.get(username)||{};
    const txSample=txRows.find(row=>serverRecordUsername(row)===username)||{};
    return dailyUsers.has(username)||isServerDailyUser(user)||isServerDailyUser(txSample);
  });
  const usernames=uniqueServerUsernames([...staffAttendedUsernames,...dailyTransactionUsernames]);
  return {
    dateKey:d,
    rule:'staff_sudah_absen_dan_harian_ada_transaksi',
    usernames,
    staffAttendedUsernames:uniqueServerUsernames(staffAttendedUsernames),
    dailyTransactionUsernames:uniqueServerUsernames(dailyTransactionUsernames),
    userCount:userByName.size,
    attendanceCount:attendanceRows.length,
    transactionCount:txRows.length,
    attendedUserCount:attendedUsers.length,
    transactionUserCount:txUsers.length
  };
}
function cashDrawerNotifySkipText(result={}){
  if(result.reason==='target_lookup_failed')return 'gagal cek penerima notif';
  if(result.reason==='cash_drawer_no_target_usernames'||result.reason==='no_eligible_cash_drawer_targets')return 'tidak ada staf yang sudah absen atau harian yang transaksi hari ini';
  return result.message||'tidak ada penerima notif';
}

// === AUTO CASH OUT QRIS DARI SERVER PUSAT KASIR ===
// Transaksi kasir yang metode pembayarannya QRIS / Transfer tetap dihitung sebagai omset,
// lalu otomatis dibuat sebagai Cash Out QRIS supaya Cash Fisik berkurang tanpa input manual.
function getFirebaseDocKeyForAutoCashOut(t={}){
  return String(t._docId||t.clientId||t.id||t.docId||t.doc_id||[
    t.dateKey||getFirebaseRecordDateKey(t),
    t.user||t.username||t.name||'',
    t.note||t.description||'',
    t.amount||0,
    t.createdAtMs||t.timestamp||''
  ].join('|')).trim();
}
function isFirebaseQrisPayment(t={}){
  const raw=String(t.paymentMethod||t.payment_method||t.paymentLabel||t.payment_label||t.paymentType||t.payment_type||t.metodePembayaran||t.metode_pembayaran||'').toLowerCase();
  if(!raw)return false;
  if(/cash|tunai/.test(raw))return false;
  return /qris|qr\s*is|transfer|bank/.test(raw);
}
function autoQrisHash(s){
  let h=2166136261;
  s=String(s||'');
  for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}
  return Math.abs(h>>>0)%1000000;
}
function getAutoQrisCashOutId(t={}){
  const dateDigits=String(t.dateKey||getFirebaseRecordDateKey(t)||getLocalDateString()).replace(/\D/g,'').slice(0,8)||'19700101';
  const hash=String(autoQrisHash(getFirebaseDocKeyForAutoCashOut(t))).padStart(6,'0');
  return Number(dateDigits+'88'+hash);
}
function getAutoQrisCashOutMarker(t={}){
  return `[AUTO-QRIS:${String(autoQrisHash(getFirebaseDocKeyForAutoCashOut(t))).padStart(6,'0')}]`;
}
function buildAutoQrisCashOutDesc(t={}){
  const note=String(t.note||t.description||t.keterangan||'Transaksi QRIS').trim()||'Transaksi QRIS';
  const staff=String(t.name||t.user||t.username||t.kasir||t.createdBy||'').trim();
  const staffText=staff?` · ${staff}`:'';
  return `${CASHOUT_PREFIX}qris] ${getAutoQrisCashOutMarker(t)} QRIS otomatis kasir - ${note}${staffText}`;
}
function isAutoQrisCashOut(t={}){
  const desc=String(t.description||'');
  return isCashOut(t)&&getCashOutType(t)==='qris'&&(desc.includes('[AUTO-QRIS:')||/QRIS\s+otomatis\s+kasir/i.test(desc));
}
function getAutoQrisSyncDates(rows=[],opts={}){
  const dates=new Set();
  const add=d=>{d=String(d||'').slice(0,10);if(/^\d{4}-\d{2}-\d{2}$/.test(d))dates.add(d)};
  add(opts.date||opts.dateKey||opts.firebaseUploadDate);
  if(Array.isArray(opts.dates))opts.dates.forEach(add);
  (rows||[]).forEach(t=>add(t&&((t.dateKey)||getFirebaseRecordDateKey(t))));
  return Array.from(dates);
}
async function deleteStaleAutoQrisCashOut(validIds,dates,opts={}){
  if(!supabaseClient||!dates||!dates.length)return false;
  const dateSet=new Set(dates.map(String));
  const stale=(transactions||[]).filter(t=>isAutoQrisCashOut(t)&&dateSet.has(String(t.date||''))&&!validIds.has(Number(t.id)));
  if(!stale.length)return false;
  for(const t of stale){
    const {error}=await supabaseClient.from('transactions').delete().eq('owner_id',OWNER_ID).eq('id',Number(t.id));
    if(error)throw error;
  }
  if(!opts.quiet)showToast(`${stale.length} QRIS otomatis dihapus karena transaksi staff sudah dihapus`);
  return true;
}
async function syncFirebaseQrisCashOut(rows,opts={}){
  if(!supabaseClient||!Array.isArray(rows))return false;
  const candidates=[];
  const seen=new Set();
  (rows||[]).forEach(t=>{
    if(!t||isFirebaseRecordDeleted(t)||isTrialServerRecord(t)||!isFirebaseQrisPayment(t))return;
    const amount=Number(t.amount||0);
    const date=t.dateKey||getFirebaseRecordDateKey(t);
    if(!date||!amount||amount<=0)return;
    const id=getAutoQrisCashOutId(t);
    if(seen.has(id))return;
    seen.add(id);
    candidates.push({id,owner_id:OWNER_ID,date,description:buildAutoQrisCashOutDesc(t),amount,type:'expense'});
  });
  const validIds=new Set(candidates.map(r=>Number(r.id)));
  const syncDates=getAutoQrisSyncDates(rows,opts);
  const existing=new Map((transactions||[]).map(t=>[Number(t.id),t]));
  const rowsToUpsert=candidates.filter(r=>{
    const old=existing.get(Number(r.id));
    return !(old&&String(old.date||'')===String(r.date)&&String(old.description||'')===String(r.description)&&Number(old.amount||0)===Number(r.amount)&&String(old.type||'')===String(r.type));
  });
  try{
    const staleChanged=await deleteStaleAutoQrisCashOut(validIds,syncDates,opts);
    if(rowsToUpsert.length){
      const {error}=await supabaseClient.from('transactions').upsert(rowsToUpsert,{onConflict:'id'});
      if(error)throw error;
      if(!opts.quiet)showToast(`${rowsToUpsert.length} QRIS otomatis masuk Pengurangan Cash`);
    }
    return staleChanged||rowsToUpsert.length>0;
  }catch(e){
    console.warn('Auto Cash Out QRIS gagal:',e);
    if(!opts.quiet)showToast('Auto QRIS gagal: '+(e.message||e));
    return false;
  }
}

async function syncFirebaseStaffBonus(date){
  if(!serverPusatClient||!date)return false;
  try{
    const monthKey=date.slice(0,7);
    const [txRes, manualRes, closingRes] = await Promise.all([
      serverPusatClient.from('transactions').select('data').eq('data->>monthKey',monthKey),
      serverPusatClient.from('manualBonuses').select('data').eq('data->>monthKey',monthKey),
      serverPusatClient.from('closings').select('data').like('data->>dateKey',`${monthKey}-%`)
    ]);
    
    let total=0;
    const userStats={};
    const getU=(n)=>{
      const name=String(n||'Staff').toLowerCase().trim();
      if(!userStats[name])userStats[name]={earned:0,withdrawn:0,name:n||'Staff'};
      return userStats[name];
    };
    (txRes.data||[]).forEach(r=>{
      const t=r.data||{};
      if(isFirebaseRecordDeleted(t)||isTrialServerRecord(t))return;
      const group=String(t.bonusGroup||'').toLowerCase();
      const role=String(t.userRole||t.role||'').toLowerCase();
      if(group==='harian'||role==='harian')return;
      const rate=Number(t.bonusRate??t.transactionBonusRate??(t.bonusPercent?t.bonusPercent/100:0.015));
      const amt=Number(t.amount||0)*rate;
      total+=amt;
      getU(t.user||t.username).earned+=amt;
    });
    const memosToSave=[];
    (manualRes.data||[]).forEach(r=>{
      const t=r.data||{};
      if(isFirebaseRecordDeleted(t)||isTrialServerRecord(t))return;
      const type=String(t.type||t.bonusType||'').toLowerCase();
      const action=String(t.action||t.bonusAction||'').toLowerCase();
      const source=String(t.source||'').toLowerCase();
      if(type==='bonus_withdrawal'||action==='withdraw'||source==='bonus_withdrawal'||String(t.id).startsWith('bonuswd_')){
        const wAmount=Math.abs(Number(t.amount||0));
        if(wAmount>0){
          const wName=t.name||t.user||'Staff';
          const wDate=(t.dateKey||t.date||`${monthKey}-01`).slice(0,10);
          const memoId=Number(String(autoQrisHash(t.id||(wName+wDate))).padStart(6,'0')+'990002');
          memosToSave.push({id:memoId,date:wDate,name:wName,amount:wAmount});
          getU(wName).withdrawn+=wAmount;
        }
        return;
      }
      const group=String(t.bonusGroup||'').toLowerCase();
      const role=String(t.userRole||t.role||'').toLowerCase();
      if(group==='harian'||role==='harian')return;
      const amt=Number(t.amount||0);
      total+=amt;
      getU(t.user||t.username||t.name).earned+=amt;
    });
    (closingRes.data||[]).forEach(r=>{
      const c=r.data||{};
      if(isFirebaseRecordDeleted(c)||c.closed!==true||c.canceled===true)return;
      const tBonus=Number(c.totalBonus||0);
      total+=tBonus;
      const byUser=c.bonusByUser||c.bonusPerUser||{};
      if(Object.keys(byUser).length>0){
        Object.keys(byUser).forEach(k=>getU(k).earned+=Number(byUser[k]||0));
      }else if(c.user){
        getU(c.user).earned+=tBonus;
      }
    });

    let catId=0;
    const cat=(expenseCategories||[]).find(c=>String(c.name).toLowerCase()==='gaji & bonus');
    if(cat)catId=cat.id;
    else return false;

    const monthDigits=monthKey.replace(/\D/g,'')||'197001';
    const id=Number(monthDigits+'990001');
    const desc=`[AUTO-BONUS-STAFF:${monthKey}] Total Gaji & Bonus Staff`;
    const amount=Math.max(0,Math.round(total));
    const txDate=`${monthKey}-01`; 

    // Hitung Piutang (Minus)
    let totalHutang=0;
    const hutangUsers=[];
    Object.values(userStats).forEach(u=>{
      const hutang=u.withdrawn-u.earned;
      if(hutang>0){
        totalHutang+=hutang;
        hutangUsers.push(`${u.name} ${formatRupiah(hutang)}`);
      }
    });
    const hutangId=Number(monthDigits+'990003');
    const hutangDesc=`[AUTO-HUTANG-STAFF:${monthKey}] Piutang Kasbon: ${hutangUsers.join(' | ')}`;
    const hutangAmount=Math.max(0,Math.round(totalHutang));

    // Clean up any old daily auto-bonus entries we created previously
    const toDelete=(transactions||[]).filter(t=>String(t.description).startsWith('[AUTO-BONUS-STAFF:')&&Number(t.id)!==id);
    if(toDelete.length){
      for(const d of toDelete){
        await supabaseClient.from('transactions').delete().eq('owner_id',OWNER_ID).eq('id',d.id);
      }
    }
    const hutangToDelete=(transactions||[]).filter(t=>String(t.description).startsWith('[AUTO-HUTANG-STAFF:')&&Number(t.id)!==hutangId&&t.date.startsWith(monthKey));
    if(hutangToDelete.length){
      for(const d of hutangToDelete){
        await supabaseClient.from('transactions').delete().eq('owner_id',OWNER_ID).eq('id',d.id);
      }
    }

    const existing=(transactions||[]).find(t=>Number(t.id)===id);
    let mainChanged=false;
    if(amount>0){
      if(!existing||Number(existing.amount)!==amount||existing.description!==desc||Number(existing.category_id)!==catId){
        const payload={id,owner_id:OWNER_ID,date:txDate,description:desc,amount,type:'expense',category_id:catId,category_name:'Gaji & Bonus'};
        await supabaseClient.from('transactions').upsert(payload,{onConflict:'id'});
        mainChanged=true;
      }
    }else if(existing){
      await supabaseClient.from('transactions').delete().eq('owner_id',OWNER_ID).eq('id',id);
      mainChanged=true;
    }

    const exHutang=(transactions||[]).find(t=>Number(t.id)===hutangId);
    let hutangChanged=false;
    if(hutangAmount>0){
      if(!exHutang||Number(exHutang.amount)!==hutangAmount||exHutang.description!==hutangDesc||Number(exHutang.category_id)!==catId){
        const payload={id:hutangId,owner_id:OWNER_ID,date:txDate,description:hutangDesc,amount:hutangAmount,type:'expense',category_id:catId,category_name:'Gaji & Bonus'};
        await supabaseClient.from('transactions').upsert(payload,{onConflict:'id'});
        hutangChanged=true;
      }
    }else if(exHutang){
      await supabaseClient.from('transactions').delete().eq('owner_id',OWNER_ID).eq('id',hutangId);
      hutangChanged=true;
    }

    let memoChanged=false;
    const currentMemos=(transactions||[]).filter(t=>{
      const d=String(t.description);
      return (d.startsWith('[MEMO] Kasbon')||(d.startsWith('Memo ')&&d.includes('ambil bonus')))&&t.date.startsWith(monthKey);
    });
    for(const m of memosToSave){
      const mDesc=`Memo ${m.name} ambil bonus ${formatRupiah(m.amount)}`;
      const ex=currentMemos.find(tx=>Number(tx.id)===m.id);
      if(!ex||ex.description!==mDesc||Number(ex.category_id)!==catId||Number(ex.amount)!==0){
        const payload={id:m.id,owner_id:OWNER_ID,date:m.date,description:mDesc,amount:0,type:'expense',category_id:catId,category_name:'Gaji & Bonus'};
        await supabaseClient.from('transactions').upsert(payload,{onConflict:'id'});
        memoChanged=true;
      }
    }
    // Delete old memos in this month that are no longer valid
    for(const ex of currentMemos){
      if(!memosToSave.find(m=>m.id===Number(ex.id))){
        await supabaseClient.from('transactions').delete().eq('owner_id',OWNER_ID).eq('id',ex.id);
        memoChanged=true;
      }
    }

    return mainChanged || hutangChanged || memoChanged || toDelete.length>0 || hutangToDelete.length>0;
  }catch(e){
    console.warn('syncFirebaseStaffBonus err:',e);
    return false;
  }
}
async function refreshFirebaseRowsOnce(date,mode='selected'){
  // Baca ulang pakai range supaya data index lama/baru tetap kebaca walau field tanggal berbeda.
  if(!firebaseDb||!date)return;
  try{
    const rows=await fetchFirebaseRowsByRange(date,date);
    const qrisChanged=await syncFirebaseQrisCashOut(rows,{quiet:true,date});
    const bonusChanged=await syncFirebaseStaffBonus(date);
    if(qrisChanged||bonusChanged)await loadTransactions();
    if(mode==='today'){
      todayFirebaseIncomeRows=rows.filter(t=>t.dateKey===date);
      todayFirebaseIncomeTotal=sumFirebaseRows(todayFirebaseIncomeRows);
      if(isLastDayOfMonth(date) && todayFirebaseIncomeTotal>0) uploadFirebaseIncomeForDate(date, todayFirebaseIncomeTotal, true);
      renderTodayFirebaseIncomeHome();
      renderZakatSection();
  renderEmergencyFundSection();
  renderSalaryFundSection();
      renderProfitSummary();
  renderFinanceReport();
      renderCashFisik();
      render();
    }else{
      firebaseIncomeRows=rows.filter(t=>t.dateKey===date);
      firebaseIncomeTotal=sumFirebaseRows(firebaseIncomeRows);
      if(isLastDayOfMonth(date) && firebaseIncomeTotal>0) uploadFirebaseIncomeForDate(date, firebaseIncomeTotal, true);
      renderFirebaseUploadCard();
    }
  }catch(e){console.warn('Refresh Server Pusat range gagal:',e.message||e)}
}
$('inputDate').value=getLocalDateString();$('filterStartDate').value=getLocalDateString();$('filterEndDate').value=getLocalDateString();if($('filterStartDateHistory'))$('filterStartDateHistory').value=getLocalDateString();if($('filterEndDateHistory'))$('filterEndDateHistory').value=getLocalDateString();if($('reportStartDate'))$('reportStartDate').value=getLocalDateString();if($('reportEndDate'))$('reportEndDate').value=getLocalDateString();firebaseUploadDate=getLocalDateString();setTimeout(()=>{if($('firebaseUploadDate'))$('firebaseUploadDate').value=firebaseUploadDate;setPendingThisMonth(false);updateMonthValidityIdle()},0);
function openPasswordModal(cb){pendingAction=cb;$('passwordModal').classList.remove('hidden');$('confirmPasswordInput').value='';setTimeout(()=>$('confirmPasswordInput').focus(),80)}function closePasswordModal(){$('passwordModal').classList.add('hidden');pendingAction=null}$('confirmPasswordInput').addEventListener('input',()=>{$('confirmPasswordInput').value=$('confirmPasswordInput').value.replace(/\D/g,'')});$('confirmPasswordInput').addEventListener('keydown',(e)=>{if(e.key==='Enter')$('btnConfirmAction').click()});$('btnConfirmAction').addEventListener('click',()=>{if($('confirmPasswordInput').value===APP_PIN){const a=pendingAction;closePasswordModal();if(a)a()}else{showToast('PIN salah');$('confirmPasswordInput').value='';setTimeout(()=>$('confirmPasswordInput').focus(),80)}});
async function addTransaction(){try{const dateVal=$('inputDate').value,type=$('type').value;let desc=$('description').value.trim();const amount=getActualAmount($('amount').value);let categoryPayload={};if(type==='income'&&!desc)desc='Omset';if(type==='expense'){const catId=$('expenseCategorySelect')?$('expenseCategorySelect').value:'';let cat=getCategoryById(catId)||getDefaultExpenseCategory()||expenseCategories[0];if(!cat){showToast('Kategori pengeluaran belum siap');return}if(!desc)desc=cat.name||'Pengeluaran';categoryPayload={category_id:Number(cat.id),category_name:cat.name};}if(!dateVal||amount<=0){showToast('Nominal tidak valid');return}await saveTransaction({id:Date.now(),date:dateVal,description:desc,amount,type,...categoryPayload});await loadTransactions();render();$('description').value='';$('amount').value='';$('liveAmountPreview').innerText='';$('inputDate').value=getLocalDateString();const adv=$('transactionAdvanced');if(adv)adv.open=false;renderCategorySelects();closeTransactionModal();showToast('Transaksi tersimpan');goPage('home')}catch(e){showToast('Gagal simpan: '+e.message)}}
function onHistoryRangeChange(){resetHistoryPaging();$('filterStartDate').value=$('filterStartDateHistory').value;$('filterEndDate').value=$('filterEndDateHistory').value;render();}
function changeFilter(f){currentFilter=f;resetHistoryPaging();$('rangeSelector').classList.toggle('hidden',f!=='range');const rh=$('rangeSelectorHistory');if(rh)rh.classList.toggle('hidden',f!=='range');if(f==='range'){const s=$('filterStartDateHistory'),e=$('filterEndDateHistory');if(s&&!s.value)s.value=getLocalDateString();if(e&&!e.value)e.value=getLocalDateString();$('filterStartDate').value=s?s.value:getLocalDateString();$('filterEndDate').value=e?e.value:getLocalDateString();}updateFilterUI();render();updateMonthValidityIdle()}function updateFilterUI(){['today','month','range','all'].forEach(f=>{const el=$('filter-'+f);if(el)el.classList.toggle('active',f===currentFilter)})}
async function deleteEmergencyHistoryRowsForTransaction(t={}){
  // No-op: tidak ada riwayat Dana Darurat khusus yang perlu dibersihkan.
  emergencyFundHistory=[];
  try{localStorage.removeItem(EMERGENCY_LOCAL_BACKUP_KEY);}catch(e){}
}
async function deleteTransaction(id){
  const t=transactions.find(x=>Number(x.id)===Number(id));
  if(t&&isZakatExpenseTx(t)){
    showToast('Zakat tidak bisa dihapus dari aplikasi. Jika benar-benar perlu, hapus langsung dari Supabase.');
    return;
  }
  if(t&&isProtectedServerPusatOmsetTx(t)){
    showToast('Omset Server Pusat Hari Ini tidak boleh dihapus.');
    return;
  }
  if(t&&isAutoQrisCashOut(t)){showToast('QRIS otomatis tidak bisa dihapus di sini. Hapus transaksi aslinya dari aplikasi staff.');return}
  if(t&&isCashDrawerAdjustmentTx(t)){showToast('Selisih Cash Fisik dibuat otomatis. Edit/hapus dari halaman Riwayat Cek Cash Fisik.');return}
  if(t&&isFirebaseUploaded(t)){showToast('Data SERVER LOCK. Gunakan tombol Sync di halaman Server Pusat, bukan hapus manual.');return}
  openPasswordModal(async()=>{
    try{
      await deleteTransactionFromDB(id);
      if(t&&isAutoEmergencyFundTx(t)){await deleteEmergencyHistoryRowsForTransaction(t).catch(()=>{});}
      
      // Auto-delete Piutang related data
      if(t) {
        const desc = String(t.description || '');
        if (desc.startsWith('[PIUTANG] ') || desc.startsWith('[PELUNASAN PIUTANG] ')) {
          let pName = desc.replace(/^\[PIUTANG\] /, '').replace(/^\[PELUNASAN PIUTANG\] /, '').split(' - ')[0].trim();
          await supabaseClient.from('receivables').delete().eq('owner_id', OWNER_ID).eq('name', pName);
          await loadReceivables();
        }
      }

      await loadTransactions();
      validateAndCancelInvalidZakat();
      render();
      renderCashFisik();
      showToast(t&&isAutoEmergencyFundTx(t)?'Transaksi Dana Darurat dihapus, status kembali belum ditabung jika belum ada transaksi lain':'Transaksi dihapus');
    }catch(e){showToast('Gagal hapus: '+e.message)}
  });
}
async function requestClearAll(){
  openPasswordModal(async()=>{
    if(confirm('Hapus semua data manual? Data SERVER LOCK tidak akan dihapus.')){
      try{
        await clearManualTransactions();
        await saveZakatHistory([]);
        await loadTransactions();
        render();
        showToast('Data manual dihapus. SERVER LOCK tetap aman.');
      }catch(e){showToast('Gagal reset: '+e.message)}
    }
  });
}
async function requestFullReset(){
  openPasswordModal(async()=>{
    const totalTx=(transactions||[]).length;
    const totalCat=(expenseCategories||[]).length;
    const ok1=confirm('PERINGATAN!\n\nHapus SEMUA ISI data Supabase aplikasi?\n- Semua transaksi manual\n- Semua data Server Pusat sync/LOCK\n- Semua cash out QRIS/Tabungan\n- Semua operasional toko\n- Semua riwayat zakat\n- Semua audit cash fisik\n\nKategori pengeluaran TIDAK dihapus. Contoh kategori Internet tetap ada, hanya transaksi seperti beli kuota 15.000 yang terhapus.\nKategori hanya bisa dihapus manual dari menu Kategori.\n\nTotal transaksi yang akan dihapus: '+totalTx+' data.\nTotal kategori yang dipertahankan: '+totalCat+' kategori.\n\nLanjutkan?');
    if(!ok1)return;
    const ok2=confirm('Konfirmasi terakhir: data yang dihapus tidak bisa dikembalikan dari aplikasi. Tetap hapus semua data full?');
    if(!ok2)return;
    try{
      await clearFullSupabaseData();
      resetLocalAfterFullDelete();
      await loadTransactions();
      try{await loadCashDrawerAudits();}catch(e){}
      try{await loadZakatHistory();}catch(e){}
      try{await loadEmergencyFundHistory();}catch(e){}
      try{await loadExpenseCategories();await ensureDefaultExpenseCategories();await loadExpenseCategories();}catch(e){}
      renderCategorySelects();
      render();
      renderFirebaseUploadCard();
      showToast('Semua isi data dihapus. Kategori tetap aman.');
    }catch(e){showToast('Gagal hapus full: '+e.message)}
  });
}
function formatRupiah(n){return new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',minimumFractionDigits:0,maximumFractionDigits:0}).format(Math.round(Number(n||0)))}function getActualAmount(raw){if(!raw||isNaN(raw))return 0;return parseFloat(raw)*1000}function handleSmartAmount(input){$('liveAmountPreview').innerText=input.value?formatRupiah(getActualAmount(input.value)):''}function updatePlaceholder(){const isExpense=$('type').value==='expense';$('description').placeholder=isExpense?'Contoh: Makan, listrik':'Omset (boleh kosong)';const f=$('expenseCategoryField');if(f)f.classList.toggle('hidden',!isExpense);if(isExpense)renderCategorySelects();}
function getGrossIncomeForRange(mode,startDate,endDate){
  const today=getLocalDateString(), month=today.slice(0,7);
  if(mode==='today'){
    // Pendapatan Hari Ini = Server Pusat hari ini + pemasukan manual - pengeluaran manual hari ini
    const manualIncome=(transactions||[])
      .filter(t=>t.type==='income' && t.date===today && !isFirebaseUploaded(t))
      .reduce((sum,t)=>sum+Number(t.amount||0),0);
    const manualExpense=(transactions||[])
      .filter(t=>t.type==='expense' && !isCashOut(t) && t.date===today)
      .reduce((sum,t)=>sum+Number(t.amount||0),0);
    return manualIncome + Number(todayFirebaseIncomeTotal||0) - manualExpense;
  }
  const incomeRows=transactions.filter(t=>{
    if(t.type!=='income')return false;
    if(mode==='month')return String(t.date||'').startsWith(month);
    if(mode==='range')return t.date>=(startDate||'') && t.date<=(endDate||'');
    return true; // all
  });
  const expenseRows=transactions.filter(t=>{
    if(t.type!=='expense'||isCashOut(t))return false;
    if(mode==='month')return String(t.date||'').startsWith(month);
    if(mode==='range')return t.date>=(startDate||'') && t.date<=(endDate||'');
    return true; // all
  });
  const totalIncome=incomeRows.reduce((sum,t)=>sum+Number(t.amount||0),0);
  const totalExpense=expenseRows.reduce((sum,t)=>sum+Number(t.amount||0),0);
  return totalIncome - totalExpense;
}
function updateNetSummary(){
  const s=$('filterStartDate')?$('filterStartDate').value:'', e=$('filterEndDate')?$('filterEndDate').value:'';
  const todayGross=getGrossIncomeForRange('today'), monthGross=getGrossIncomeForRange('month'), allGross=getGrossIncomeForRange('all');
  const rangeGross=getGrossIncomeForRange('range',s,e);
  if($('netTodaySummary')){$('netTodaySummary').innerText=formatRupiah(todayGross);$('netTodaySummary').className='num '+(todayGross>=0?'green':'red')}
  if($('netMonthSummary')){$('netMonthSummary').innerText=formatRupiah(monthGross);$('netMonthSummary').className='num '+(monthGross>=0?'blue':'red')}
  if($('netAllSummary')){$('netAllSummary').innerText=formatRupiah(allGross);$('netAllSummary').className='num '+(allGross>=0?'gold':'red')}
  // Kotak Custom: muncul hanya kalau filter range aktif
  const rangeBox=$('netRangeBox');
  if(rangeBox){
    if(currentFilter==='range'&&s&&e){
      rangeBox.style.display='';
      const lbl=$('netRangeLabel');if(lbl)lbl.innerText=`${s.slice(5)} s.d ${e.slice(5)}`;
      const val=$('netRangeSummary');if(val){val.innerText=formatRupiah(rangeGross);val.className='num '+(rangeGross>=0?'green':'red');}
    } else {
      rangeBox.style.display='none';
    }
  }
}
function getTodayManualTransactions(){
  const today=getLocalDateString();
  return (transactions||[]).filter(t=>t.date===today && !isFirebaseUploaded(t));
}
function getTodayFirebasePreviewTransaction(){
  const today=getLocalDateString();
  const total=Number(todayFirebaseIncomeTotal||0);
  if(!total || total<=0)return null;
  return {
    id:'firebase_today_preview',
    date:today,
    description:'[SERVERPUSAT:'+today+'] Omset Server Pusat Hari Ini',
    amount:total,
    type:'income',
    __firebasePreview:true
  };
}
function getFilteredTransactions(){
  const now=getLocalDateString(),s=$('filterStartDate').value,e=$('filterEndDate').value;
  if(currentFilter==='today'){
    const rows=getTodayManualTransactions();
    const fb=getTodayFirebasePreviewTransaction();
    return fb?[fb,...rows]:rows;
  }
  return transactions.filter(t=>currentFilter==='month'?t.date.startsWith(now.substring(0,7)):currentFilter==='range'?t.date>=s&&t.date<=e:true)
}
function getPeriodLabel(){const now=getLocalDateString();if(currentFilter==='today')return `Hari Ini (${now})`;if(currentFilter==='month')return `Bulan Ini`;if(currentFilter==='range')return `${$('filterStartDate').value} s.d ${$('filterEndDate').value}`;return 'Semua Riwayat'}
function generateWhatsAppReport(){const f=getFilteredTransactions();let ti=0,te=0,inc=[],exp=[];f.forEach(t=>{if(t.type==='income'){ti+=t.amount;inc.push(`📥 ${t.date} | ${t.description} | +${formatRupiah(t.amount)}`)}else if(isBusinessExpense(t)){te+=t.amount;exp.push(`📤 ${t.date} | ${t.description} | -${formatRupiah(t.amount)}`)}});const labaTotal=getTotalProfit();const zakatDue=getCurrentZakatDue();let r=`📊 *LAPORAN alfajri*\nPeriode: ${getPeriodLabel()}\n\n💚 Pemasukan: ${formatRupiah(ti)}\n❤️ Pengeluaran: ${formatRupiah(te)}\n💙 Saldo: ${formatRupiah(ti-te)}\n💜 Laba 20% final s.d H-1: ${formatRupiah(labaTotal)}\n🕌 Zakat wajib final: ${formatRupiah(zakatDue)}\n\n`;if(inc.length)r+=`*PEMASUKAN*\n${inc.join('\n')}\n\n`;if(exp.length)r+=`*PENGELUARAN*\n${exp.join('\n')}\n\n`;return r+'_Dikirim dari alfajri Finance_'}
function sendWhatsAppReport(){if(!getFilteredTransactions().length){showToast('Tidak ada transaksi');return}const no=prompt('Nomor WhatsApp tujuan. Kosongkan untuk copy laporan.','');const report=generateWhatsAppReport();if(no&&no.trim()){let n=no.replace(/[^0-9]/g,'');if(n.startsWith('0'))n='62'+n.slice(1);if(!n.startsWith('62'))n='62'+n;window.open(`https://wa.me/${n}?text=${encodeURIComponent(report)}`,'_blank');showToast('Membuka WhatsApp')}else{navigator.clipboard.writeText(report).then(()=>showToast('Laporan disalin')).catch(()=>showToast('Gagal salin'))}}

function isFirebaseUploaded(t){const d=String(t?.description||'');return !!(t&&t.__firebasePreview) || d.startsWith('[FIREBASE:') || d.startsWith('[SERVERPUSAT:')}
function cleanFirebaseDesc(desc){return String(desc||'').replace(/^\[(?:FIREBASE|SERVERPUSAT):\d{4}-\d{2}-\d{2}\]\s*/,'')}
function getFirebaseUploadId(date){return Number(String(date||'').replace(/\D/g,'')+'777')}
function getUploadedFirebaseTransaction(date){const id=getFirebaseUploadId(date);return transactions.find(t=>Number(t.id)===id || String(t.description||'').startsWith(`[FIREBASE:${date}]`) || String(t.description||'').startsWith(`[SERVERPUSAT:${date}]`))}
// ============================================================
// AUTO DEBET HARIAN — meniru fitur auto debet ATM (Poket BCA dkk).
// Status aktif/nonaktif + nominal disimpan di Supabase (tabel auto_debit_settings)
// supaya ikut sinkron di semua device, sama seperti data lain.
// ATURAN PENTING: transaksi yang SUDAH tercatat tidak pernah diubah waktu nominal
// diganti. Nominal baru cuma berlaku buat hari ini & seterusnya.
// ============================================================
function isAutoDebitTx(t={}){
  const desc=String(t&&t.description||'');
  return !!(t&&t.type==='expense'&&desc.startsWith(AUTO_DEBIT_PREFIX));
}
function cleanAutoDebitDesc(desc){return String(desc||'').replace(/\[AUTODEBET:[^\]]+\]\s*/,'').trim()||'Auto Debet Harian'}
async function getAutoDebitExpenseCategory(){
  await loadExpenseCategories().catch(()=>{});
  let cat=getCategoryByName(AUTO_DEBIT_CATEGORY_NAME);
  if(!cat){
    await insertExpenseCategory(AUTO_DEBIT_CATEGORY_NAME,7);
    await loadExpenseCategories();
    cat=getCategoryByName(AUTO_DEBIT_CATEGORY_NAME);
  }
  return cat;
}
async function loadAutoDebitSettings(){
  if(!supabaseClient)return;
  try{
    const {data,error}=await supabaseClient.from('auto_debit_settings').select('*').eq('owner_id',OWNER_ID).maybeSingle();
    if(error)throw error;
    autoDebitSettings=data?{enabled:!!data.enabled,amount:Number(data.amount||0),last_run_date:data.last_run_date||null}:{enabled:false,amount:0,last_run_date:null};
  }catch(e){console.warn('Tabel auto_debit_settings belum siap (jalankan SQL dulu):',e);}
}
async function persistAutoDebitSettings(){
  if(!supabaseClient)return;
  const payload={owner_id:OWNER_ID,enabled:!!autoDebitSettings.enabled,amount:Math.round(Number(autoDebitSettings.amount||0)),last_run_date:autoDebitSettings.last_run_date,updated_at:new Date().toISOString()};
  const {error}=await supabaseClient.from('auto_debit_settings').upsert(payload,{onConflict:'owner_id'});
  if(error)throw error;
}
function nextDateStr(dateStr){
  const parts=String(dateStr).split('-').map(Number);
  const dt=new Date(Date.UTC(parts[0],(parts[1]||1)-1,parts[2]||1));
  dt.setUTCDate(dt.getUTCDate()+1);
  return dt.toISOString().slice(0,10);
}
async function insertAutoDebitForDate(dateStr,amount){
  const already=(transactions||[]).some(t=>isAutoDebitTx(t)&&t.date===dateStr);
  if(already||amount<=0)return;
  const cat=await getAutoDebitExpenseCategory();
  const tx={
    id:Date.now()+Math.floor(Math.random()*900)+1,
    date:dateStr,
    description:`${AUTO_DEBIT_PREFIX}${dateStr}] Auto Debet Harian`,
    amount,
    type:'expense',
    category_id:cat?Number(cat.id):null,
    category_name:AUTO_DEBIT_CATEGORY_NAME
  };
  await saveTransaction(tx);
  transactions.push(tx);
}
// Dipanggil sekali tiap app dibuka: catch-up hari yang kelewat kalau statusnya aktif,
// tapi kalau lagi nonaktif, cuma geser penanda "sudah dicek" tanpa nambah transaksi
// (jadi tidak numpuk pas diaktifkan lagi nanti).
async function runDailyAutoDebit(){
  if(!supabaseClient)return;
  await loadAutoDebitSettings();
  const today=getLocalDateString();
  if(!autoDebitSettings.last_run_date){
    // Pertama kali fitur ini dicek: jangan tembak mundur ke hari-hari sebelumnya.
    autoDebitSettings.last_run_date=today;
    try{await persistAutoDebitSettings();}catch(e){}
    return;
  }
  if(autoDebitSettings.last_run_date>=today)return; // sudah dicek hari ini
  if(autoDebitSettings.enabled){
    const amount=Math.round(Number(autoDebitSettings.amount||0));
    let cursor=nextDateStr(autoDebitSettings.last_run_date),guard=0;
    while(cursor<=today&&guard<366){
      try{await insertAutoDebitForDate(cursor,amount);}catch(e){console.warn('Auto debet gagal utk',cursor,e);}
      cursor=nextDateStr(cursor);guard++;
    }
  }
  autoDebitSettings.last_run_date=today;
  try{await persistAutoDebitSettings();}catch(e){}
}
async function toggleAutoDebit(enabled){
  const prev=autoDebitSettings.enabled;
  autoDebitSettings.enabled=!!enabled;
  try{
    if(enabled&&!prev){
      const today=getLocalDateString();
      const amount=Math.round(Number(autoDebitSettings.amount||0));
      if(amount>0)await insertAutoDebitForDate(today,amount);
      autoDebitSettings.last_run_date=today;
    }
    await persistAutoDebitSettings();
    showToast(enabled?'Auto Debet Harian diaktifkan':'Auto Debet Harian dinonaktifkan');
    await loadTransactions();
    render();renderAutoDebitModalContent();
  }catch(e){
    autoDebitSettings.enabled=prev;
    showToast('Gagal ubah status auto debet: '+(e.message||e));
    renderAutoDebitModalContent();
  }
}
function handleAutoDebitAmountPreview(inp){
  const v=getActualAmount(inp.value);
  const el=$('autoDebitAmountPreview');
  if(el)el.innerText=v>0?formatRupiah(v):'';
}
async function saveAutoDebitAmount(){
  const inp=$('autoDebitAmountInput');
  if(!inp)return;
  const val=getActualAmount(inp.value);
  if(val<=0){showToast('Isi nominal auto debet dulu');inp.focus();return;}
  try{
    autoDebitSettings.amount=val;
    await persistAutoDebitSettings();
    // Kalau statusnya lagi Aktif tapi hari ini belum kepotong (misal nominal baru
    // diisi SETELAH toggle di-ON-kan), langsung potong sekarang juga.
    if(autoDebitSettings.enabled){
      const today=getLocalDateString();
      const already=(transactions||[]).some(t=>isAutoDebitTx(t)&&t.date===today);
      if(!already){
        await insertAutoDebitForDate(today,val);
        autoDebitSettings.last_run_date=today;
        await persistAutoDebitSettings();
        await loadTransactions();
        render();
      }
    }
    showToast('Nominal auto debet disimpan: '+formatRupiah(val)+'/hari. Potongan yang sudah lewat tidak ikut berubah.');
    inp.value='';
    if($('autoDebitAmountPreview'))$('autoDebitAmountPreview').innerText='';
    renderAutoDebitSection();renderAutoDebitModalContent();
  }catch(e){showToast('Gagal simpan nominal auto debet: '+(e.message||e));}
}
function getAutoDebitTxRows(){return (transactions||[]).filter(isAutoDebitTx).sort((a,b)=>String(b.date).localeCompare(String(a.date)))}
function getAutoDebitTotal(monthOnly=false){
  const month=getLocalDateString().slice(0,7);
  return getAutoDebitTxRows().filter(t=>!monthOnly||String(t.date).startsWith(month)).reduce((s,t)=>s+Number(t.amount||0),0);
}
function renderAutoDebitSection(){
  const active=!!autoDebitSettings.enabled;
  if($('autoDebitAmountLarge'))$('autoDebitAmountLarge').innerText=formatRupiah(autoDebitSettings.amount||0)+' / hari';
  if($('autoDebitStatusText'))$('autoDebitStatusText').innerText=active?'Aktif':'Nonaktif';
  if($('autoDebitMonthTotal'))$('autoDebitMonthTotal').innerText=formatRupiah(getAutoDebitTotal(true));
  if($('autoDebitAllTotal'))$('autoDebitAllTotal').innerText=formatRupiah(getAutoDebitTotal(false));
}
function renderAutoDebitModalContent(){
  const active=!!autoDebitSettings.enabled;
  if($('autoDebitModalStatus'))$('autoDebitModalStatus').innerText=active?`Aktif — ${formatRupiah(autoDebitSettings.amount||0)}/hari`:'Nonaktif';
  const chk=$('autoDebitToggleInput');if(chk)chk.checked=active;
  const rows=getAutoDebitTxRows();
  if($('autoDebitHistoryCount'))$('autoDebitHistoryCount').innerText=rows.length+' data';
  const list=$('autoDebitHistoryList');
  if(list){
    list.innerHTML=rows.length?rows.slice(0,30).map(t=>`<div class="item" style="border-color:#fde68a;display:flex;justify-content:space-between;align-items:center"><div><b style="font-size:12px;color:#b45309">${escapeHtml(t.date)}</b><div class="small" style="color:#6b7280;margin-top:1px">Terpotong otomatis</div></div><b class="num" style="color:#b45309">-${formatRupiah(Number(t.amount||0))}</b></div>`).join(''):'<div class="empty" style="color:#b45309">Belum ada potongan.</div>';
  }
}
function openAutoDebitModal(){
  renderAutoDebitModalContent();
  const modal=$('autoDebitModal');
  if(modal)modal.classList.remove('hidden');
  bindGlobalKeyboardFix();
}
function closeAutoDebitModal(){
  const modal=$('autoDebitModal');
  if(modal)modal.classList.add('hidden');
  const inp=$('autoDebitAmountInput');
  if(inp)inp.value='';
  if($('autoDebitAmountPreview'))$('autoDebitAmountPreview').innerText='';
}
function initFirebase(){try{serverPusatClient=window.supabase.createClient(SERVER_PUSAT_URL,SERVER_PUSAT_ANON_KEY);firebaseDb=serverPusatClient;return true}catch(e){console.error(e);showToast('Server Pusat gagal aktif: '+e.message);return false}}
function renderTodayFirebaseIncomeHome(){
  // Card Pendapatan Hari Ini sudah digabung ke Cash Fisik — panggil renderCashFisik saja
  renderCashFisik(); return;
  // (kode lama di bawah tidak dipakai lagi)
  const totalEl=$('todayFirebaseIncomeHome'),infoEl=$('todayFirebaseIncomeInfo');
  const today=getLocalDateString();
  const manualRows=(transactions||[]).filter(t=>t.type==='income' && t.date===today && !isFirebaseUploaded(t));
  const manualTotal=manualRows.reduce((sum,t)=>sum+Number(t.amount||0),0);
  const fbTotal=Number(todayFirebaseIncomeTotal||0);
  // Hanya pengeluaran operasional toko yang mengurangi pendapatan hari ini di Home
  const opsRows=(transactions||[]).filter(t=>t.type==='expense' && t.date===today && isOpsExpense(t));
  const opsTotal=opsRows.reduce((sum,t)=>sum+Number(t.amount||0),0);
  const total=manualTotal+fbTotal-opsTotal;
  const fbCount=(todayFirebaseIncomeRows||[]).length;
  // Update total ops di home card
  const opsTodayHomeEl=$('opsTodayHomeTotal');
  if(opsTodayHomeEl)opsTodayHomeEl.innerText=formatRupiah(opsTotal);
  if(totalEl){totalEl.innerText=formatRupiah(total);totalEl.className='num '+(total>=0?'green':'red');totalEl.style.fontSize='24px';}
  // warna card berubah merah kalau pendapatan negatif
  const card=$('todayIncomeCard'),titleEl=$('todayIncomeSectionTitle');
  if(card){card.style.background=total<0?'#fff6f4':'#f3fbf6';card.style.borderColor=total<0?'#ffd7d0':'#ccefd9';}
  if(titleEl){titleEl.style.color=total<0?'var(--red)':'var(--green)';}
  if(infoEl){
    const parts=[];
    if(fbTotal>0)parts.push(`Server Pusat ${formatRupiah(fbTotal)} (${fbCount} trx)`);
    if(manualTotal>0)parts.push(`Manual ${formatRupiah(manualTotal)} (${manualRows.length} trx)`);
    if(opsTotal>0)parts.push(`Ops Toko -${formatRupiah(opsTotal)}`);
    infoEl.innerText=parts.length?parts.join(' · '):'Belum ada pendapatan hari ini';
  }
}
function startTodayFirebaseWatch(){
  if(!firebaseDb)return Promise.resolve();
  const today=getLocalDateString();
  if(todayFirebaseUnsub){todayFirebaseUnsub();todayFirebaseUnsub=null}
  return refreshFirebaseRowsOnce(today,'today').then(()=>{
    renderTodayFirebaseIncomeHome();
    renderZakatSection();
    renderProfitSummary();
    renderCashFisik();
  }).catch(err=>{
    console.error(err);
    if($('todayFirebaseIncomeInfo'))$('todayFirebaseIncomeInfo').innerText='Gagal baca Server Pusat hari ini';
  });
}
function changeFirebaseUploadDate(date){firebaseUploadDate=date||getLocalDateString();startFirebaseWatch(firebaseUploadDate)}
function refreshFirebaseUpload(){startFirebaseWatch(firebaseUploadDate||getLocalDateString());showToast('Data Server Pusat direfresh')}
function startFirebaseWatch(date){
  if(!firebaseDb)return;
  firebaseUploadDate=date||getLocalDateString();
  if($('firebaseUploadDate'))$('firebaseUploadDate').value=firebaseUploadDate;
  if(firebaseUnsub){firebaseUnsub();firebaseUnsub=null}
  return refreshFirebaseRowsOnce(firebaseUploadDate,'selected').then(async()=>{
    const qrisChangedSelected=await syncFirebaseQrisCashOut(firebaseIncomeRows,{quiet:true,date:firebaseUploadDate});
    if(qrisChangedSelected)await loadTransactions();
    renderFirebaseUploadCard();
    renderCashFisik();
  }).catch(err=>{console.error(err);showToast('Gagal baca Server Pusat: '+err.message)});
}


function getCurrentMonthRange(){
  const today=getLocalDateString();
  return {start:today.slice(0,7)+'-01', end:today, month:today.slice(0,7)};
}
function setMonthValidityUI(state,title,desc){
  const card=$('monthValidityCard'),t=$('monthValidityTitle'),d=$('monthValidityDesc'),btn=$('btnCheckMonthValid');
  if(!card||!t||!d)return;
  card.className='month-valid-card '+(state||'idle');
  t.innerText=title;
  d.innerText=desc;
  if(btn){btn.disabled=monthValidityBusy;btn.innerText=monthValidityBusy?'Cek...':'Cek';}
}
function updateMonthValidityIdle(){
  const r=getCurrentMonthRange();
  setMonthValidityUI('idle','Validasi Bulan Ini',`Cek ${r.start} s.d ${r.end}: pastikan omset Server Pusat sudah diupload ke Supabase.`);
}
async function checkMonthValidity(){
  if(!firebaseDb)return showToast('Server Pusat belum aktif');
  const r=getCurrentMonthRange();
  monthValidityBusy=true;
  setMonthValidityUI('idle','Mengecek Bulan...',`Sedang cek ${r.start} s.d ${r.end}`);
  try{
    const firebaseRows=normalizeFirebaseRows(await fetchFirebaseRowsByRange(r.start,r.end));
    const grouped={};
    firebaseRows.forEach(t=>{
      const date=t.dateKey;
      if(!date)return;
      if(!grouped[date])grouped[date]={firebaseTotal:0,count:0};
      grouped[date].firebaseTotal+=t.amount;
      grouped[date].count+=1;
    });
    const dates=Object.keys(grouped).sort();
    const missing=[]; const diff=[]; let totalUploaded=0;
    dates.forEach(date=>{
      const fb=Number(grouped[date].firebaseTotal||0);
      const uploaded=getUploadedFirebaseTransaction(date);
      const up=Number(uploaded?.amount||0);
      totalUploaded+=up;
      if(!uploaded)missing.push(date);
      else if(up!==fb)diff.push(date);
    });
    if(!dates.length){
      setMonthValidityUI('ok','Bulan Valid','Belum ada omset Server Pusat bulan ini. Tidak ada yang perlu diupload.');
    }else if(!missing.length&&!diff.length){
      setMonthValidityUI('ok','Bulan Valid',`${dates.length} hari omset Server Pusat sudah sinkron di Supabase. Total synced bulan: ${formatRupiah(totalUploaded)}.`);
    }else{
      const parts=[];
      if(missing.length)parts.push(`${missing.length} belum upload`);
      if(diff.length)parts.push(`${diff.length} selisih`);
      setMonthValidityUI(diff.length?'bad':'warn','Bulan Belum Valid',`${parts.join(' · ')}. Buka Cek Belum Sync lalu klik Sync sampai aman.`);
      if($('pendingStartDate'))$('pendingStartDate').value=r.start;
      if($('pendingEndDate'))$('pendingEndDate').value=r.end;
    }
  }catch(e){
    console.error(e);
    setMonthValidityUI('bad','Gagal Cek Bulan',e.message||'Gagal membaca data Server Pusat');
  }finally{
    monthValidityBusy=false;
    const btn=$('btnCheckMonthValid'); if(btn){btn.disabled=false;btn.innerText='Cek'}
  }
}

function setPendingThisMonth(show=true){
  const today=getLocalDateString();
  const start=today.slice(0,7)+'-01';
  if($('pendingStartDate'))$('pendingStartDate').value=start;
  if($('pendingEndDate'))$('pendingEndDate').value=today;
  if(show)showToast('Rentang diatur ke bulan ini');
}
function dateFromInputToMs(date){
  const parts=String(date||'').split('-').map(Number);
  if(parts.length!==3||!parts[0]||!parts[1]||!parts[2])return 0;
  return new Date(parts[0],parts[1]-1,parts[2]).getTime();
}
function validatePendingRange(start,end){
  const sMs=dateFromInputToMs(start),eMs=dateFromInputToMs(end);
  if(!sMs||!eMs)return 'Tanggal awal dan akhir wajib diisi';
  if(sMs>eMs)return 'Tanggal awal tidak boleh lebih besar dari tanggal akhir';
  const days=Math.round((eMs-sMs)/86400000)+1;
  if(days>370)return 'Maksimal scan 370 hari sekali cek biar ringan';
  return '';
}
function renderPendingUploadList(){
  const box=$('pendingUploadList'),sum=$('pendingUploadSummary'),status=$('pendingScanStatus');
  if(!box||!sum||!status)return;
  const items=pendingFirebaseUploads||[];
  const totalMissing=items.filter(x=>x.status==='missing').reduce((a,b)=>a+Number(b.firebaseTotal||0),0);
  const totalDiff=items.filter(x=>x.status==='diff').reduce((a,b)=>a+Math.abs(Number(b.firebaseTotal||0)-Number(b.uploadedAmount||0)),0);
  if(!items.length){
    status.className='firebase-status st-uploaded';status.innerText='Aman';
    sum.className='audit-box audit-ok';sum.innerText='Tidak ada pendapatan Server Pusat yang belum diupload pada rentang ini.';
    box.innerHTML='';return;
  }
  status.className='firebase-status st-update';status.innerText=`${items.length} Data`;
  sum.className='audit-box '+(items.some(x=>x.status==='missing')?'audit-warn':'audit-bad');
  sum.innerText=`Ditemukan ${items.length} tanggal perlu dicek. Belum upload: ${formatRupiah(totalMissing)} · Selisih: ${formatRupiah(totalDiff)}.`;
  box.innerHTML=items.map(x=>{
    const isToday=x.date===getLocalDateString();
    const isEOM=isLastDayOfMonth(x.date);
    const label=(isToday && !isEOM)?'HARI INI BELUM FINAL':(x.status==='missing'?'BELUM UPLOAD':'SELISIH');
    const cls=(isToday && !isEOM)?'st-pending':(x.status==='missing'?'st-pending':'st-update');
    const info=(isToday && !isEOM)
      ? `Server Pusat ${formatRupiah(x.firebaseTotal)} · data masih bisa berubah, upload besok`
      : (x.status==='missing'
        ? `Server Pusat ${formatRupiah(x.firebaseTotal)} · ${x.count} transaksi`
        : `Server Pusat ${formatRupiah(x.firebaseTotal)} · Supabase ${formatRupiah(x.uploadedAmount)}`);
    const btn=(isToday && !isEOM)
      ? `<button class="btn secondary" disabled>Lock</button>`
      : `<button class="btn" onclick="uploadPendingFirebaseDate('${x.date}')">${x.status==='missing'?'Sync':'Sync'}</button>`;
    return `<div class="pending-upload-row"><div style="min-width:0"><div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap"><b>${escapeHtml(x.date)}</b><span class="firebase-status ${cls}">${label}</span></div><div class="small" style="margin-top:3px">${escapeHtml(info)}</div></div>${btn}</div>`;
  }).join('');
}
async function scanPendingFirebaseUploads(){
  if(!firebaseDb)return showToast('Server Pusat belum aktif');
  const start=$('pendingStartDate')?.value||getLocalDateString();
  const end=$('pendingEndDate')?.value||getLocalDateString();
  const err=validatePendingRange(start,end);
  if(err)return showToast(err);
  const status=$('pendingScanStatus'),sum=$('pendingUploadSummary'),box=$('pendingUploadList');
  if(status){status.className='firebase-status st-pending';status.innerText='Scan...'}
  if(sum){sum.className='audit-box audit-warn';sum.innerText='Sedang scan Server Pusat dan membandingkan dengan Kas Pribadi...'}
  if(box)box.innerHTML='';
  try{
    const firebaseRows=normalizeFirebaseRows(await fetchFirebaseRowsByRange(start,end));
    const grouped={};
    firebaseRows.forEach(t=>{
      const date=t.dateKey;
      if(!date)return;
      if(!grouped[date])grouped[date]={date,firebaseTotal:0,count:0};
      grouped[date].firebaseTotal+=t.amount;
      grouped[date].count+=1;
    });
    pendingFirebaseUploads=Object.values(grouped).map(row=>{
      const uploaded=getUploadedFirebaseTransaction(row.date);
      const uploadedAmount=Number(uploaded?.amount||0);
      if(!uploaded)return {...row,uploadedAmount,status:'missing'};
      if(uploadedAmount!==Number(row.firebaseTotal||0))return {...row,uploadedAmount,status:'diff'};
      return null;
    }).filter(Boolean).sort((a,b)=>a.date.localeCompare(b.date));
    renderPendingUploadList();
  }catch(e){
    console.error(e);
    pendingFirebaseUploads=[];
    if(status){status.className='firebase-status st-pending';status.innerText='Error'}
    if(sum){sum.className='audit-box audit-bad';sum.innerText='Gagal scan Server Pusat: '+e.message}
    showToast('Gagal scan Server Pusat: '+e.message,5000);
  }
}
async function uploadPendingFirebaseDate(date){
  const item=(pendingFirebaseUploads||[]).find(x=>x.date===date);
  if(!item)return showToast('Data tidak ditemukan, scan ulang dulu');
  try{
    const freshRows=normalizeFirebaseRows(await fetchFirebaseRowsByRange(item.date,item.date));
    const freshTotal=sumFirebaseRows(freshRows.filter(t=>t.dateKey===item.date));
    await uploadFirebaseIncomeForDate(item.date,freshTotal,true);
    pendingFirebaseUploads=pendingFirebaseUploads.filter(x=>x.date!==date);
    renderPendingUploadList();
  }catch(e){showToast('Gagal cek ulang Server Pusat: '+e.message,5000)}
}
async function uploadFirebaseIncomeForDate(date,total,quiet=false){
  if(!supabaseClient)return showToast('Supabase belum aktif');
  if(date===getLocalDateString() && !isLastDayOfMonth(date))return showToast('Pendapatan hari ini belum final. Sync setelah ganti tanggal.');
  const uploadedBefore=getUploadedFirebaseTransaction(date);
  const safeTotal=Number(total||0);
  if(safeTotal<=0 && !uploadedBefore)return showToast('Omset Server Pusat kosong, tidak ada yang perlu disync');
  // Sync berarti angka Kas Pribadi dibuat SAMA dengan Server Pusat, tapi record tetap LOCK dan tidak bisa dihapus manual.
  // Kalau Server Pusat sudah kosong setelah sebelumnya ada arsip, amount akan menjadi 0, bukan menghapus data.
  const row={id:getFirebaseUploadId(date),owner_id:OWNER_ID,date,description:`[SERVERPUSAT:${date}] Omset Kasir Server Pusat`,amount:safeTotal,type:'income'};
  try{
    const {error}=await supabaseClient.from('transactions').upsert(row,{onConflict:'id'});
    if(error)throw error;
    await loadTransactions();
    render();
    if(!quiet)showToast('Sync berhasil. Kas Pribadi sekarang sama dengan Server Pusat.');
    else showToast(`Sync ${date} berhasil`);
    updateMonthValidityIdle();
  }catch(e){showToast('Gagal sync: '+e.message)}
}
function renderFirebaseUploadCard(){
  const totalEl=$('firebaseUploadTotal'),statusEl=$('firebaseUploadStatus'),infoEl=$('firebaseUploadInfo'),btn=$('btnUploadFirebaseIncome'),auditEl=$('firebaseAuditInfo');
  if(!totalEl||!statusEl||!infoEl||!btn)return;
  totalEl.innerText=formatRupiah(firebaseIncomeTotal);
  const uploaded=getUploadedFirebaseTransaction(firebaseUploadDate);
  const uploadedAmount=Number(uploaded?.amount||0);
  const fbAmount=Number(firebaseIncomeTotal||0);
  const diff=fbAmount-uploadedAmount;
  const count=firebaseIncomeRows.length;
  const isToday=firebaseUploadDate===getLocalDateString();

  function setAudit(cls, text){
    if(!auditEl)return;
    auditEl.className='audit-box '+cls;
    auditEl.innerText=text;
  }

  const isEOM=isLastDayOfMonth(firebaseUploadDate);
  if(isToday && !isEOM){
    statusEl.className='firebase-status st-pending';statusEl.innerText='Hari Ini';
    infoEl.innerText=fbAmount>0?`${count} transaksi Server Pusat · belum final, upload besok`:`${firebaseUploadDate} · hari ini belum ada omset Server Pusat`;
    btn.disabled=true;btn.innerText='Belum Final';
    setAudit('audit-warn',`Audit ${firebaseUploadDate}: HARI INI DIKUNCI. Data masih bisa berubah, jadi belum bisa diupload ke Supabase sebelum ganti tanggal.`);
  }else if(!uploaded && fbAmount<=0){
    statusEl.className='firebase-status st-pending';statusEl.innerText='Belum Ada';
    infoEl.innerText=`${firebaseUploadDate} · belum ada omset Server Pusat`;
    btn.disabled=true;btn.innerText='Sync';
    setAudit('audit-warn',`Audit ${firebaseUploadDate}: Server Pusat kosong dan belum ada data sync Supabase.`);
  }else if(!uploaded){
    statusEl.className='firebase-status st-pending';statusEl.innerText='Belum Sync';
    infoEl.innerText=`${count} transaksi Server Pusat · belum masuk Kas Pribadi`;
    btn.disabled=false;btn.innerText='Sync';
    setAudit('audit-warn',`Audit ${firebaseUploadDate}: belum tersync ke Kas Pribadi. Selisih ${formatRupiah(fbAmount)}.`);
  }else if(uploadedAmount!==fbAmount){
    statusEl.className='firebase-status st-update';statusEl.innerText='Perlu Sync';
    infoEl.innerText=`Kas Pribadi ${formatRupiah(uploadedAmount)} · Server Pusat ${formatRupiah(fbAmount)}`;
    btn.disabled=false;btn.innerText='Sync';
    setAudit('audit-bad',`Audit ${firebaseUploadDate}: SELISIH ${formatRupiah(Math.abs(diff))}. Klik Sync agar Kas Pribadi sama dengan Server Pusat. Data tetap LOCK, bukan dihapus.`);
  }else{
    statusEl.className='firebase-status st-uploaded';statusEl.innerText='Sinkron';
    infoEl.innerText=`Sama · ${count} transaksi Server Pusat`;
    btn.disabled=true;btn.innerText='Sinkron';
    setAudit('audit-ok',`Audit ${firebaseUploadDate}: SAMA. Kas Pribadi = Server Pusat ${formatRupiah(fbAmount)}.`);
  }
}
async function uploadFirebaseIncome(){
  const date=firebaseUploadDate||getLocalDateString();
  try{
    const freshRows=await fetchFirebaseRowsByRange(date,date);
    firebaseIncomeRows=freshRows.filter(t=>t.dateKey===date);
    firebaseIncomeTotal=sumFirebaseRows(firebaseIncomeRows);
    const qrisChangedBeforeUpload=await syncFirebaseQrisCashOut(firebaseIncomeRows,{quiet:true,date:firebaseUploadDate});
    if(qrisChangedBeforeUpload)await loadTransactions();
    renderFirebaseUploadCard();
    renderCashFisik();
  }catch(e){showToast('Gagal cek ulang Server Pusat: '+e.message,5000);return;}
  await uploadFirebaseIncomeForDate(date,firebaseIncomeTotal,false);
}
function getDashboardTransactions(){
  // Dashboard utama wajib menghitung SEMUA data Supabase yang sudah tersimpan,
  // termasuk arsip SERVER LOCK. Jangan ikut filter Riwayat/Server Pusat.
  return transactions || [];
}
function renderZakatSection(){
  validateAndCancelInvalidZakat();
  // Zakat = 2.5% dari laba 20% data final sampai H-1.
  const totalProfit=getTotalProfit(),paid=getTotalProfitZakatPaid(),unpaid=getUnpaidProfit(),due=getCurrentZakatDue(),cutoff=getZakatCutoffDate();
  if($('zakatAmountLarge'))$('zakatAmountLarge').innerText=formatRupiah(due);
  if($('totalProfitDisplay'))$('totalProfitDisplay').innerText=formatRupiah(totalProfit);
  if($('totalZakatPaidProfit'))$('totalZakatPaidProfit').innerText=formatRupiah(paid);
  if($('unpaidProfitDisplay'))$('unpaidProfitDisplay').innerText=formatRupiah(unpaid);
  if($('zakatBasisInfo'))$('zakatBasisInfo').innerText=`Zakat dihitung dari data final sampai ${cutoff} (H-1). Transaksi hari ini belum ikut dan akan masuk hitungan besok setelah Server Pusat sync/LOCK.`;
  const pay=$('payZakatBtn'),zs=$('zakatPaymentStatusText');
  if(!pay||!zs)return;
  if(totalProfit<=0){zs.innerText=`Belum ada laba final sampai ${cutoff}`;pay.disabled=true;pay.style.opacity=.5}
  else if(due<=0){zs.innerText=`Zakat lunas ✓ sampai ${cutoff}`;pay.disabled=true;pay.style.opacity=.5}
  else{zs.innerText=`Wajib bayar 2.5% dari laba final sampai ${cutoff}: Rp${formatRupiah(unpaid).replace('Rp','')}`;pay.disabled=false;pay.style.opacity=1}
  const h=getZakatHistory(),prev=$('zakatHistoryPreview'),mini=$('zakatHistoryMiniList');
  if(!prev||!mini)return;
  if(h.length){prev.style.display='flex';const valid=h.filter(x=>!x.cancelled).slice(-2).reverse();mini.innerHTML=valid.length?valid.map(x=>`<span class="chip">${formatRupiah(x.zakatPaid)}</span>`).join(''):'<span class="chip">Zakat batal</span>'}
  else prev.style.display='none';
}
function render(){
  updateNetSummary();
  renderTodayFirebaseIncomeHome();
  renderProfitSummary();
  renderDebtSummary();
  renderPiutangPage();
  renderGoldSection();
  renderCashDrawerPage();

  // Ringkasan dashboard utama: semua data yang sudah masuk Supabase.
  // Ini yang membuat Saldo Bersih langsung berubah setelah upload omset Server Pusat.
  const dashboardRows=getDashboardTransactions();
  const today=getLocalDateString(), thisMonth=today.slice(0,7);
  let totalIn=0,totalOut=0,todayOut=0,monthOut=0;
  dashboardRows.forEach(t=>{
    if(t.type==='income')totalIn+=Number(t.amount||0);
    else if(isBusinessExpense(t)){
      // cashout (QRIS/Tabungan) hanya kurangi cash fisik, bukan pengeluaran bisnis
      totalOut+=Number(t.amount||0);
      if(t.date===today)todayOut+=Number(t.amount||0);
      if(String(t.date||'').startsWith(thisMonth))monthOut+=Number(t.amount||0);
    }
  });
  // Tambah Server Pusat hari ini ke totalIn jika belum di-sync (agar autoProfit & saldo realtime)
  const fbTodayVal=Number(todayFirebaseIncomeTotal||0);
  const uploadedTodayCheck=getUploadedFirebaseTransaction(today);
  const totalInWithFirebase=totalIn+(fbTodayVal>0&&!uploadedTodayCheck?fbTodayVal:0);
  const debtSummary=getDebtSummary(dashboardRows);
  const debtBalance=debtSummary.borrowed-debtSummary.paid;
  const profit=totalInWithFirebase*.2;
  const net=totalInWithFirebase-totalOut+debtBalance;
  $('totalIncome').innerText=formatRupiah(totalInWithFirebase);
  $('totalExpense').innerText=formatRupiah(todayOut);   // hero: hari ini
  $('autoProfit').innerText=formatRupiah(profit);
  if($('autoProfitHero'))$('autoProfitHero').innerText=formatRupiah(profit);
  $('netBalance').innerText=formatRupiah(net);
  // Card Sisa Operasional bawah disamakan dengan Ringkasan Laba.
  // Sebelumnya card ini memakai semua data/kumulatif, sedangkan Ringkasan Laba memakai filter
  // today/month/year/custom. Akibatnya angka sisa operasional bisa terlihat berbeda.
  const opDataForCard=getProfitSummaryData(currentProfitFilter);
  const manualIn=opDataForCard?Number(opDataForCard.manualIncome||0):0;
  if($('manualIncomeTotalDisplay'))$('manualIncomeTotalDisplay').innerText=formatRupiah(manualIn);
  const opProfit=opDataForCard?Number(opDataForCard.laba||0):profit;
  const opSpent=opDataForCard?Number(opDataForCard.totalExpense||0):totalOut;
  const remainingOps=opProfit-opSpent;
  $('spendingLimit').innerText=formatRupiah(todayOut);  // stat card home: hari ini
  $('operationalUsed').innerText=formatRupiah(remainingOps);
  $('operationalTotal').innerText=formatRupiah(opProfit);
  const spentEl=$('operationalSpent');if(spentEl)spentEl.innerText=formatRupiah(opSpent);
  // Riwayat: pengeluaran sesuai filter aktif + semua
  if($('expenseAllSummary'))$('expenseAllSummary').innerText=formatRupiah(totalOut);
  // Stat card kiri ikut filter aktif
  const s2=$('filterStartDate')?$('filterStartDate').value:'', e2=$('filterEndDate')?$('filterEndDate').value:'';
  let filteredOut=0, filteredLabel='Pengeluaran Hari Ini';
  if(currentFilter==='today'){
    filteredOut=todayOut; filteredLabel='Pengeluaran Hari Ini';
  } else if(currentFilter==='month'){
    filteredOut=monthOut; filteredLabel='Pengeluaran Bulan Ini';
  } else if(currentFilter==='range'){
    filteredOut=dashboardRows.filter(t=>isBusinessExpense(t)&&t.date>=s2&&t.date<=e2).reduce((a,t)=>a+Number(t.amount||0),0);
    filteredLabel=s2&&e2?`Pengeluaran ${s2.slice(5)} s.d ${e2.slice(5)}`:'Pengeluaran Custom';
  } else {
    filteredOut=totalOut; filteredLabel='Total Semua Pengeluaran';
  }
  if($('expenseFilteredSummary'))$('expenseFilteredSummary').innerText=formatRupiah(filteredOut);
  if($('expenseFilteredLabel'))$('expenseFilteredLabel').innerText=filteredLabel;

  renderZakatSection();
  renderEmergencyFundSection();
  renderSalaryFundSection();
  renderAutoDebitSection();

  const over=opSpent>opProfit&&opProfit>0;
  const opCard=$('operationalCard');
  if(opCard){
    opCard.classList.remove('safe','danger');
    opCard.classList.add(over?'danger':'safe');
  }
  $('limitWarning').innerText=over?'Over budget: pengeluaran lebih dari 20% omset periode ini':'';
  $('statusText').innerText=over?'Bahaya':'Aman';
  $('statusBadge').style.background=over?'#fff0ee':'#e9f7ef';
  $('statusBadge').style.color=over?'#c0392b':'#176b43';

  // List Riwayat tetap mengikuti filter yang sedang dipilih.
  renderActiveFilterChip();
  const f=getFilteredTransactions();
  const periodIncome=f.reduce((sum,t)=>t.type==='income'?sum+Number(t.amount||0):sum,0);
  // cashout (QRIS/Tabungan) tidak dihitung sebagai pengeluaran di summary
  const list=$('transactionList');
  const more=$('transactionListMore');
  if(!list){renderFirebaseUploadCard();return}
  if(more)more.innerHTML='';
  if(!f.length){list.innerHTML='<div class="empty">Belum ada transaksi</div>';renderFirebaseUploadCard();return}
  const periodExpenseReal=f.filter(isBusinessExpense).reduce((sum,t)=>sum+Number(t.amount||0),0);
  $('currentPeriodLabel').innerText=`${getPeriodLabel()} · ${formatRupiah(periodIncome-periodExpenseReal)}`;
  const visibleRows=f.slice(0,Math.max(HISTORY_PAGE_SIZE,historyVisibleCount));
  list.innerHTML=visibleRows.map(t=>renderHistoryTransactionCard(t)).join('');
  if(more)more.innerHTML=f.length>visibleRows.length?`<button class="load-more-btn" type="button" onclick="loadMoreTransactions()">Muat lebih banyak (${visibleRows.length}/${f.length})</button>`:(f.length>HISTORY_PAGE_SIZE?`<div class="empty compact-empty">Semua ${f.length} data sudah tampil</div>`:'');
  renderFirebaseUploadCard();
}
function escapeHtml(s){return String(s).replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]))}
function getTransactionDetailMeta(t={}){
  const co=isCashOut(t),debt=isDebtTx(t),zakat=isZakatExpenseTx(t),gold=isGoldPurchaseTx(t),emergency=isEmergencyFundTx(t),drawer=isCashDrawerAdjustmentTx(t),autodebit=isAutoDebitTx(t);
  const desc=co?cleanCashOutDesc(t.description):(debt?cleanDebtDesc(t.description):(zakat?cleanZakatDesc(t.description):(gold?cleanGoldDesc(t.description):(emergency?'Tabungan Dana Darurat':(drawer?cleanCashDrawerAdjustmentDesc(t.description):(autodebit?cleanAutoDebitDesc(t.description):cleanFirebaseDesc(t.description)))))));
  const label=drawer?(t.type==='income'?CASH_DRAWER_PLUS_CATEGORY_NAME:CASH_DRAWER_MINUS_CATEGORY_NAME):(t.type==='income'?(isFirebaseUploaded(t)||t.__firebasePreview?'Pendapatan Server Pusat':'Pendapatan Manual'):(debt?(isDebtIn(t)?'Pinjam Uang':'Bayar Pokok Hutang'):getExpenseCategoryName(t)));
  const isIn=t.type==='income'||isDebtIn(t);
  const sign=isIn?'+':'-';
  const color=t.type==='income'?'var(--green)':(co?'#0369a1':(isDebtIn(t)?'#92400e':(isDebtPay(t)?'#15803d':'var(--red)')));
  const icon=drawer?'L':(debt?'H':(t.type==='income'?'+':'-'));
  const chipClass=t.type==='expense'&&!co?'redchip':'';
  return {desc:desc||label,label,sign,color,icon,iconClass:isIn?'in':'out',chipClass};
}
function renderTransactionDetailCard(t={},opts={}){
  const meta=getTransactionDetailMeta(t);
  const action=opts.actionHtml||'';
  const rightClass=action?'right history-action-stack':'right';
  const amt = Math.abs(Number(t.amount||0));
  // Jika expense negatif (offset piutang), kita bisa beri warna hijau atau tetap merah dengan tanda +
  const signOverride = Number(t.amount) < 0 && t.type === 'expense' ? '+' : meta.sign;
  const colorOverride = Number(t.amount) < 0 && t.type === 'expense' ? 'var(--green)' : meta.color;
  return `<div class="item transaction-detail-card"><div class="left"><div class="icon ${meta.iconClass}">${meta.icon}</div><div class="desc"><b>${escapeHtml(meta.desc)}</b><small>${escapeHtml(t.date||'')}</small><span class="category-chip ${meta.chipClass}">${escapeHtml(meta.label)}</span></div></div><div class="${rightClass}"><b class="num" style="color:${colorOverride}">${signOverride}${formatRupiah(amt).replace('Rp','')}</b>${action}</div></div>`;
}
function isProtectedServerPusatOmsetTx(t={}){
  return /Omset Server Pusat Hari Ini/i.test(cleanFirebaseDesc(t&&t.description));
}
function renderHistoryTransactionCard(t={}){
  const action=isProtectedServerPusatOmsetTx(t)?'':`<button class="x history-delete-btn" onclick="deleteTransaction(${Number(t.id)})" type="button" title="Hapus transaksi" aria-label="Hapus transaksi">×</button>`;
  return renderTransactionDetailCard(t,{actionHtml:action});
}
function normalizeCategoryForBackup(c,i){
  return {
    id:Number(c&&c.id)||Date.now()+i,
    owner_id:OWNER_ID,
    name:String(c&&c.name||'').trim(),
    sort_order:Number(c&& (c.sort_order ?? c.sortOrder) || ((i+1)*10)),
    created_at:(c&&c.created_at)||new Date().toISOString(),
    updated_at:(c&&c.updated_at)||new Date().toISOString()
  };
}
function getBackupPayload(){
  return {
    app:'alfajri-finance',
    backupVersion:2,
    exportedAt:getWibDateTimeString?getWibDateTimeString():new Date().toISOString(),
    owner_id:OWNER_ID,
    transactions:(transactions||[]),
    zakatHistory:getZakatHistory?getZakatHistory():(zakatHistory||[]),
    cashDrawerAudits:(cashDrawerAudits||[]).map(normalizeCashDrawerAudit),
    expenseCategories:(expenseCategories||[]).map(normalizeCategoryForBackup).filter(c=>c.name)
  };
}
function openBackupModal(){
  if(!transactions.length&&!zakatHistory.length&&!(cashDrawerAudits||[]).length&&!(expenseCategories||[]).length){showToast('Data kosong');return}
  $('backupOptionModal').classList.remove('hidden')
}
function closeBackupModal(){$('backupOptionModal').classList.add('hidden')}
function showImportModal(){closeBackupModal();$('importModal').classList.remove('hidden')}
function closeImportModal(){$('importModal').classList.add('hidden');$('importDataText').value=''}
function exportToFile(){
  const payload=getBackupPayload();
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=`rocky_backup_${getLocalDateString()}.json`;a.click();URL.revokeObjectURL(url);closeBackupModal();
  showToast('Backup tersimpan (transaksi + zakat + audit cash fisik + dana darurat + kategori)')
}
function copyToClipboard(){
  const payload=getBackupPayload();
  navigator.clipboard.writeText(JSON.stringify(payload)).then(()=>{closeBackupModal();showToast('Data disalin (transaksi + zakat + audit cash fisik + dana darurat + kategori)')}).catch(()=>showToast('Gagal salin'))
}
async function restoreExpenseCategories(importedCategories){
  if(!Array.isArray(importedCategories)||!importedCategories.length){await ensureDefaultExpenseCategories();await loadExpenseCategories();return 0}
  const seenName=new Set(),seenId=new Set();
  const clean=[];
  importedCategories.forEach((c,i)=>{
    const name=String(c&&c.name||'').trim();if(!name)return;
    const key=name.toLowerCase();if(seenName.has(key))return;seenName.add(key);
    let id=Number(c&&c.id)||Date.now()+i;
    while(seenId.has(id)){id++}seenId.add(id);
    clean.push({
      id,owner_id:OWNER_ID,name,
      sort_order:Number(c&& (c.sort_order ?? c.sortOrder) || ((i+1)*10)),
      created_at:(c&&c.created_at)||new Date().toISOString(),
      updated_at:new Date().toISOString()
    });
  });
  await loadExpenseCategories();
  const existingNames=new Set((expenseCategories||[]).map(c=>String(c.name||'').toLowerCase()));
  const toInsert=clean.filter(c=>!existingNames.has(String(c.name||'').toLowerCase()));
  if(toInsert.length){
    const ins=await supabaseClient.from('expense_categories').insert(toInsert);
    if(ins.error)throw ins.error;
  }
  await ensureDefaultExpenseCategories();
  await loadExpenseCategories();
  return toInsert.length;
}
async function restoreCashDrawerAudits(importedAudits){
  if(!Array.isArray(importedAudits)||!importedAudits.length||!supabaseClient)return 0;
  try{if(!cashDrawerTableReady)await loadCashDrawerAudits();}catch(e){console.warn('Restore audit cash fisik dilewati, tabel belum siap:',e);return 0}
  const map=new Map();
  importedAudits.map(normalizeCashDrawerAudit).forEach((row,i)=>{
    let id=Number(row.id)||Date.now()+i;
    while(map.has(id)){id++}
    map.set(id,{...row,id,owner_id:OWNER_ID});
  });
  const rows=[...map.values()].map(cashDrawerAuditDbRow);
  if(!rows.length)return 0;
  const {error}=await supabaseClient.from(CASH_DRAWER_TABLE).upsert(rows,{onConflict:'id'});
  if(error)throw error;
  await loadCashDrawerAudits();
  return rows.length;
}
async function importFromText(){try{const raw=$('importDataText').value.trim();if(!raw){showToast('Data kosong');return}const parsed=JSON.parse(raw);
  // Support format baru {transactions,zakatHistory,expenseCategories} dan format lama array transaksi langsung.
  let importedTx=[], importedZakat=[], importedEmergency=[], importedCategories=[], importedCashDrawer=[];
  if(Array.isArray(parsed)){
    importedTx=parsed;
  } else if(parsed&&Array.isArray(parsed.transactions)){
    importedTx=parsed.transactions;
    importedZakat=Array.isArray(parsed.zakatHistory)?parsed.zakatHistory:[];
    importedEmergency=[];
    importedCategories=Array.isArray(parsed.expenseCategories)?parsed.expenseCategories:[];
    importedCashDrawer=Array.isArray(parsed.cashDrawerAudits)?parsed.cashDrawerAudits:[];
  } else throw new Error('format');
  importedTx=importedTx.map(t=>({...t,amount:Number(t.amount||0)}));
  const ok=importedTx.every(i=>i.id&&i.date&&i.description&&Number.isFinite(Number(i.amount))&&(i.type==='income'||i.type==='expense'||i.type===DEBT_IN_TYPE||i.type===DEBT_PAY_TYPE));
  if(!ok)throw new Error('format');
  const catCount=await restoreExpenseCategories(importedCategories);
  await importTransactions(importedTx);
  if(importedZakat.length){await saveZakatHistory(importedZakat);}
  if(importedEmergency.length){await saveEmergencyFundHistory(importedEmergency);}
  const cashDrawerCount=await restoreCashDrawerAudits(importedCashDrawer);
  await loadTransactions();await loadZakatHistory();await loadEmergencyFundHistory();try{await loadCashDrawerAudits();}catch(e){}await loadExpenseCategories();await migrateLegacyExpenseCategories();
  renderCategorySelects();render();closeImportModal();
  showToast('Import berhasil'+(importedZakat.length?` · ${importedZakat.length} zakat`:``)+(importedEmergency.length?` · ${importedEmergency.length} dana darurat`:``)+(catCount?` · ${catCount} kategori`:``))
}catch(e){console.warn('Import gagal:',e);showToast('Format JSON salah / restore gagal')}}
function showToast(message,duration=2600){const old=document.querySelector('.toast');if(old)old.remove();const t=document.createElement('div');t.className='toast';t.textContent=message;document.body.appendChild(t);setTimeout(()=>t.remove(),duration)}

// =====================================================
// HUTANG UANG
// Pinjaman dan bayar pokok hanya mengubah cash + sisa hutang.
// Tidak masuk pendapatan, pengeluaran, laba, atau zakat.
// =====================================================
const DEBT_IN_TYPE='debt_in';
const DEBT_PAY_TYPE='debt_pay';
const DEBT_IN_PREFIX='[HUTANG:PINJAM] ';
const DEBT_PAY_PREFIX='[HUTANG:BAYAR] ';
let currentDebtMode='borrow';

function isDebtIn(t){return t&&t.type===DEBT_IN_TYPE}
function isDebtPay(t){return t&&t.type===DEBT_PAY_TYPE}
function isDebtTx(t){return isDebtIn(t)||isDebtPay(t)}
function isBusinessExpense(t){return t&&t.type==='expense'&&!isCashOut(t)}
function cleanDebtDesc(desc){return String(desc||'').replace(/^\[HUTANG:(?:PINJAM|BAYAR)\]\s*/,'')}
function buildDebtDesc(prefix,party,note){
  const name=String(party||'').trim()||'Hutang uang';
  const extra=String(note||'').trim();
  return `${prefix}${name}${extra?` - ${extra}`:''}`;
}
function getDebtSummary(rows=transactions){
  const today=getLocalDateString();
  const debtRows=(rows||[]).filter(isDebtTx);
  const borrowed=debtRows.filter(isDebtIn).reduce((s,t)=>s+Number(t.amount||0),0);
  const paid=debtRows.filter(isDebtPay).reduce((s,t)=>s+Number(t.amount||0),0);
  const todayBorrowed=debtRows.filter(t=>isDebtIn(t)&&t.date===today).reduce((s,t)=>s+Number(t.amount||0),0);
  const todayPaid=debtRows.filter(t=>isDebtPay(t)&&t.date===today).reduce((s,t)=>s+Number(t.amount||0),0);
  
  const map = {};
  debtRows.forEach(t => {
    let cleaned = String(t.description || '').replace(/^\[HUTANG:(?:PINJAM|BAYAR)\]\s*/, '');
    let parts = cleaned.split(' - ');
    let nameRaw = parts[0].trim();
    if (!nameRaw) nameRaw = 'Lainnya';
    let nameKey = nameRaw.toLowerCase();
    if (!map[nameKey]) map[nameKey] = { name: nameRaw, borrowed: 0, paid: 0 };
    if (isDebtIn(t)) map[nameKey].borrowed += Number(t.amount||0);
    if (isDebtPay(t)) map[nameKey].paid += Number(t.amount||0);
  });
  const persons = Object.values(map).map(p => ({
    name: p.name,
    borrowed: p.borrowed,
    paid: p.paid,
    active: Math.max(0, p.borrowed - p.paid)
  })).sort((a,b) => b.active - a.active);

  return {rows:debtRows,borrowed,paid,active:Math.max(0,borrowed-paid),todayBorrowed,todayPaid,todayNet:todayBorrowed-todayPaid, persons};
}
function openDebtBorrowModal() {
  if($('debtBorrowDate')) $('debtBorrowDate').value = getLocalDateString();
  if($('debtBorrowParty')) $('debtBorrowParty').value = '';
  if($('debtBorrowNote')) $('debtBorrowNote').value = '';
  if($('debtBorrowAmount')) $('debtBorrowAmount').value = '';
  if($('debtBorrowPreview')) $('debtBorrowPreview').innerText = '';
  if($('debtBorrowModal')) $('debtBorrowModal').classList.remove('hidden');
  setTimeout(() => { if($('debtBorrowParty')) $('debtBorrowParty').focus(); }, 80);
}
function closeDebtBorrowModal() {
  if($('debtBorrowModal')) $('debtBorrowModal').classList.add('hidden');
}
function handleDebtBorrowPreview(input) {
  const val = getActualAmount(input.value);
  if($('debtBorrowPreview')) $('debtBorrowPreview').innerText = val > 0 ? formatRupiah(val) : '';
}
async function saveDebtBorrowSimple() {
  const date = String($('debtBorrowDate')?.value || getLocalDateString()).slice(0, 10);
  const party = String($('debtBorrowParty')?.value || '').trim();
  const note = String($('debtBorrowNote')?.value || '').trim();
  const amount = getActualAmount($('debtBorrowAmount')?.value || '');
  
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)) return showToast('Tanggal hutang tidak valid');
  if(!party) return showToast('Nama orang tidak boleh kosong');
  if(!amount || amount <= 0) return showToast('Nominal hutang tidak valid');

  const btn = event.currentTarget;
  const oldText = btn.innerText;
  btn.innerText = 'Menyimpan...';
  btn.disabled = true;

  try {
    await saveTransaction({
      id: Date.now(),
      date,
      description: buildDebtDesc(DEBT_IN_PREFIX, party, note),
      amount,
      type: DEBT_IN_TYPE
    });
    showToast('Pinjaman uang tersimpan');
    closeDebtBorrowModal();
    await loadTransactions();
    render();
  } catch(e) {
    showToast('Gagal simpan pinjaman: ' + e.message);
  } finally {
    btn.innerText = oldText;
    btn.disabled = false;
  }
}

function openDebtModal(){
  renderDebtSummary();
  $('debtModal').classList.remove('hidden');
}
function closeDebtModal(){$('debtModal').classList.add('hidden')}
function renderDebtHistoryList(){
  const summary=getDebtSummary();
  const rows=summary.rows.slice().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||((Number(b.id)||0)-(Number(a.id)||0)));
  const list=$('debtHistoryList'),count=$('debtHistoryCount');
  if(count)count.innerText=`${rows.length} data`;
  if(!list)return;
  if(!rows.length){list.innerHTML='<div class="empty">Belum ada hutang</div>';return;}
  list.innerHTML=rows.slice(0,80).map(t=>{
    const incoming=isDebtIn(t),color=incoming?'#92400e':'#15803d',label=incoming?'Pinjam':'Bayar';
    const sign=incoming?'+':'-';
    return `<div class="debt-list-item"><div style="min-width:0;flex:1"><b style="font-size:13px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(cleanDebtDesc(t.description)||label)}</b><small style="color:var(--muted)">${t.date} · ${label}</small></div><b class="num" style="font-size:13px;color:${color};white-space:nowrap">${sign}${formatRupiah(t.amount).replace('Rp','')}</b><button class="x" onclick="deleteDebtWithPin(${t.id})">×</button></div>`;
  }).join('')+(rows.length>80?`<div class="empty">Ditampilkan 80 dari ${rows.length} data</div>`:'');
}
function renderDebtSummary(){
  const s=getDebtSummary();
  const setText=(id,val)=>{const el=$(id);if(el)el.innerText=formatRupiah(val)};
  setText('debtActiveTotal',s.active);
  setText('debtTotalBorrowed',s.borrowed);
  setText('debtTotalPaid',s.paid);
  setText('debtTotalUnpaid',s.active);
  setText('debtModalActiveTotal',s.active);
  setText('debtModalBorrowed',s.borrowed);
  setText('debtModalPaid',s.paid);
  const info=$('debtTodayInfo');
  if(info)info.innerText=s.active>0?`Belum dibayar: ${formatRupiah(s.active)}`:'Hutang lunas';
  
  const unpaidPersons = (s.persons||[]).filter(p => p.active > 0);
  if ($('debtPersonListCount')) $('debtPersonListCount').innerText = `${unpaidPersons.length} data aktif`;
  const list = $('debtPersonList');
  if (list) {
    if (!unpaidPersons.length) {
      list.innerHTML = '<div class="empty" style="color:#92400e">Belum ada hutang aktif</div>';
    } else {
      list.innerHTML = unpaidPersons.map(p => {
        const pct = Math.min(100, Math.round((p.paid / p.borrowed) * 100)) || 0;
        return `
          <div class="card" style="margin-bottom:7px; padding:10px 12px">
            <div style="display:flex; justify-content:space-between; align-items:baseline; gap:10px">
              <b style="font-size:13px; color:var(--ink); text-transform:capitalize">${escapeHtml(p.name)}</b>
              <b class="num" style="font-size:14px; color:#92400e; white-space:nowrap">${formatRupiah(p.active)}</b>
            </div>
            <div style="font-size:10px; color:var(--muted); font-weight:600; margin-top:1px">Sisa dari pinjaman ${formatRupiah(p.borrowed)}</div>
            <div class="progressbar" style="height:4px; margin-top:6px"><span style="width:${pct}%"></span></div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:6px">
              <span style="font-size:10px; color:var(--muted); font-weight:600">Terbayar ${formatRupiah(p.paid)} (${pct}%)</span>
              <button class="btn secondary" style="width:auto; min-height:0 !important; height:auto; padding:3px 10px !important; font-size:10.5px; border-radius:6px !important" onclick="openDebtPaymentModal('${escapeHtml(p.name)}', ${p.active})">Bayar</button>
            </div>
          </div>
        `;
      }).join('');
    }
  }
  renderDebtHistoryList();
}



function openDebtPaymentModal(name, active) {
  if($('debtPaymentName')) $('debtPaymentName').innerText = name;
  if($('debtPaymentRemain')) $('debtPaymentRemain').innerText = formatRupiah(active);
  if($('debtPaymentPersonName')) $('debtPaymentPersonName').value = name;
  if($('debtPaymentAmount')) $('debtPaymentAmount').value = '';
  if($('debtPaymentPreview')) $('debtPaymentPreview').innerText = '';
  if($('debtPaymentModal')) $('debtPaymentModal').classList.remove('hidden');
}
function closeDebtPaymentModal() {
  if($('debtPaymentModal')) $('debtPaymentModal').classList.add('hidden');
}
function handleDebtPaymentPreview(input) {
  const val = Number(input.value) || 0;
  if($('debtPaymentPreview')) $('debtPaymentPreview').innerText = val > 0 ? formatRupiah(val) : '';
}
async function saveDebtPaymentSimple() {
  const name = $('debtPaymentPersonName').value.trim();
  const amt = Number($('debtPaymentAmount').value) || 0;
  if (!name || amt <= 0) return showToast('Nominal tidak valid');
  
  const txDesc = `[HUTANG:BAYAR] ${name}`;
  const txPayload = {
    id: Date.now(),
    owner_id: OWNER_ID,
    date: getLocalDateString(),
    description: txDesc,
    amount: amt,
    type: DEBT_PAY_TYPE
  };
  
  const btn = event.currentTarget;
  const oldText = btn.innerText;
  btn.innerText = 'Menyimpan...';
  btn.disabled = true;
  
  try {
    await saveTransaction(txPayload);
    showToast('Pembayaran dicatat & saldo berkurang');
    closeDebtPaymentModal();
    await loadTransactions();
    render();
  } catch (e) {
    showToast('Gagal simpan pembayaran: ' + e.message);
  } finally {
    btn.innerText = oldText;
    btn.disabled = false;
  }
}

function deleteDebtWithPin(id){
  closeDebtModal();
  setTimeout(()=>{
    openPasswordModal(async()=>{
      try{
        await deleteTransactionFromDB(id);
        await loadTransactions();
        render();
        showToast('Data hutang dihapus');
      }catch(e){showToast('Gagal hapus hutang: '+e.message)}
      setTimeout(()=>{openDebtModal('list')},200);
    });
  },200);
}

// =====================================================
// PENGELUARAN OPERASIONAL TOKO
// Ditandai dengan prefix [OPS] di deskripsi.
// Mengurangi "Pendapatan Hari Ini" di Home, tapi
// tetap dihitung sebagai pengeluaran biasa di Riwayat.
// =====================================================
const OPS_PREFIX='[OPS] ';
function isOpsExpense(t){return t&&t.type==='expense'&&String(t.description||'').startsWith(OPS_PREFIX)}
function handleOpsAmountPreview(input){$('opsAmountPreview').innerText=input.value?formatRupiah(getActualAmount(input.value)):''}
function openOpsModal(){
  $('opsDesc').value='';$('opsAmount').value='';$('opsAmountPreview').innerText='';
  renderOpsTodayList();
  $('opsModal').classList.remove('hidden');
  setTimeout(()=>$('opsDesc').focus(),80);
}
function closeOpsModal(){$('opsModal').classList.add('hidden')}
function renderOpsTodayList(){
  const today=getLocalDateString();
  const rows=(transactions||[]).filter(t=>isOpsExpense(t)&&t.date===today);
  rows.sort((a,b)=>b.id-a.id);
  const total=rows.reduce((s,t)=>s+Number(t.amount||0),0);
  const te=$('opsTodayTotal');if(te)te.innerText=formatRupiah(total);
  const list=$('opsTodayList');if(!list)return;
  if(!rows.length){list.innerHTML='<div class="empty">Belum ada operasional hari ini</div>';return;}
  list.innerHTML=rows.map(t=>`<div class="ops-list-item"><div style="min-width:0;flex:1"><b style="font-size:13px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(String(t.description||'').replace(OPS_PREFIX,''))}</b><small style="color:var(--muted)">${t.date}</small></div><b class="num red" style="font-size:13px;white-space:nowrap">-${formatRupiah(t.amount).replace('Rp','')}</b><button class="x" onclick="deleteOpsWithPin(${t.id})">×</button></div>`).join('');
}
function deleteOpsWithPin(id){
  closeOpsModal();
  setTimeout(()=>{
    openPasswordModal(async()=>{
      try{
        await deleteTransactionFromDB(id);
        await loadTransactions();
        render();
        showToast('Operasional dihapus');
      }catch(e){showToast('Gagal hapus: '+e.message)}
      setTimeout(()=>{openOpsModal();},200);
    });
  },200);
}
async function addOpsExpense(){
  const desc=$('opsDesc').value.trim();
  const amount=getActualAmount($('opsAmount').value);
  if(!desc){showToast('Isi deskripsi operasional');return}
  if(!amount||amount<=0){showToast('Nominal tidak valid');return}
  const today=getLocalDateString();
  try{
    const cat=getCategoryByName(OPS_CATEGORY_NAME)||getDefaultExpenseCategory();
    await saveTransaction({id:Date.now(),date:today,description:OPS_PREFIX+desc,amount,type:'expense',category_id:cat?Number(cat.id):null,category_name:cat?cat.name:OPS_CATEGORY_NAME});
    await loadTransactions();
    render();
    renderOpsTodayList();
    $('opsDesc').value='';$('opsAmount').value='';$('opsAmountPreview').innerText='';
    showToast('Operasional toko tersimpan');
  }catch(e){showToast('Gagal simpan: '+e.message)}
}


// =====================================================
// CASH OUT — QRIS / TABUNGAN / LAINNYA
// Mengurangi CASH FISIK hari ini tapi bukan pengeluaran.
// Disimpan dengan prefix [CASHOUT:qris], [CASHOUT:tabungan], dll.
// Type tetap 'expense' tapi DIKECUALIKAN dari semua
// perhitungan laba, zakat, sisa operasional.
// =====================================================
const CASHOUT_PREFIX='[CASHOUT:';
let currentCashOutType='qris';

function isCashOut(t){return t&&t.type==='expense'&&String(t.description||'').startsWith(CASHOUT_PREFIX)}
function getCashOutType(t){
  const m=String(t.description||'').match(/^\[CASHOUT:(\w+)\]/);
  return m?m[1]:'lainnya';
}
function cleanCashOutDesc(desc){return String(desc||'').replace(/^\[CASHOUT:\w+\]\s*/,'').replace(/^\[AUTO-QRIS:[^\]]+\]\s*/,'')}

function setCashOutType(type){
  currentCashOutType=type;
  ['qris','tabungan'].forEach(t=>{
    const el=$('cashout-type-'+t);
    if(el)el.classList.toggle('active',t===type);
  });
}
function handleCashOutPreview(input){$('cashOutAmountPreview').innerText=input.value?formatRupiah(getActualAmount(input.value)):''}
function openCashOutModal(){
  $('cashOutDesc').value='';$('cashOutAmount').value='';$('cashOutAmountPreview').innerText='';
  setCashOutType('qris');
  renderCashOutTodayList();
  renderCashFisik();
  $('cashOutModal').classList.remove('hidden');
  setTimeout(()=>$('cashOutAmount').focus(),80);
}
function closeCashOutModal(){$('cashOutModal').classList.add('hidden')}

function renderCashOutTodayList(){
  const today=getLocalDateString();
  const rows=(transactions||[]).filter(t=>isCashOut(t)&&t.date===today);
  rows.sort((a,b)=>b.id-a.id);
  const total=rows.reduce((s,t)=>s+Number(t.amount||0),0);
  const te=$('cashOutTodayTotal');if(te)te.innerText=formatRupiah(total);
  const list=$('cashOutTodayList');if(!list)return;
  if(!rows.length){list.innerHTML='<div class="empty" style="font-size:12px;padding:14px;text-align:center;color:#758071">Belum ada QRIS/Tabungan hari ini</div>';return;}
  const typeLabel={qris:'QRIS',tabungan:'Tabungan',lainnya:'Lainnya'};
  list.innerHTML=rows.map(t=>{
    const tp=getCashOutType(t);
    const desc=cleanCashOutDesc(t.description)||typeLabel[tp]||tp;
    const locked=isAutoQrisCashOut(t);
    const action=locked
      ? `<span class="cashout-badge qris" style="background:#eef2ff;color:#1d4ed8;border:1px solid #bfdbfe;font-size:9px;white-space:nowrap">🔒 Staff</span>`
      : `<button class="x" style="color:var(--red);font-size:18px;padding:4px 8px" onclick="deleteCashOutWithPin(${t.id})">×</button>`;
    const sub=locked?'QRIS otomatis · hapus dari aplikasi staff':t.date;
    return `<div class="cashout-list-item"><div style="min-width:0;flex:1;display:flex;align-items:center;gap:7px"><span class="cashout-badge ${tp}">${typeLabel[tp]||tp}</span><div style="min-width:0"><b style="font-size:13px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(desc)}</b><span style="font-size:10px;color:var(--muted)">${escapeHtml(sub)}</span></div></div><b class="num" style="font-size:14px;color:#2563eb;white-space:nowrap">-${formatRupiah(t.amount).replace('Rp','')}</b>${action}</div>`;
  }).join('');
}


function deleteCashOutWithPin(id){
  const t=(transactions||[]).find(x=>Number(x.id)===Number(id));
  if(t&&isAutoQrisCashOut(t)){
    showToast('QRIS otomatis tidak bisa dihapus di sini. Hapus transaksi aslinya dari aplikasi staff.');
    return;
  }
  closeCashOutModal();
  setTimeout(()=>{
    openPasswordModal(async()=>{
      try{
        await deleteTransactionFromDB(id);
        await loadTransactions();
        render();
        renderCashFisik();
        showToast('QRIS/Tabungan dihapus');
      }catch(e){showToast('Gagal hapus: '+e.message)}
      setTimeout(()=>{openCashOutModal();},200);
    });
  },200);
}
async function addCashOut(){
  const type=currentCashOutType||'qris';
  let desc=$('cashOutDesc').value.trim();
  const amount=getActualAmount($('cashOutAmount').value);
  if(!amount||amount<=0){showToast('Nominal tidak valid');return}
  const today=getLocalDateString();
  const fullDesc=`${CASHOUT_PREFIX}${type}] ${desc}`;
  try{
    await saveTransaction({id:Date.now(),date:today,description:fullDesc,amount,type:'expense'});
    await loadTransactions();
    render();
    renderCashOutTodayList();
    $('cashOutDesc').value='';$('cashOutAmount').value='';$('cashOutAmountPreview').innerText='';
    showToast(`${type==='qris'?'QRIS':'Tabungan'} tersimpan`);
  }catch(e){showToast('Gagal simpan: '+e.message)}
}

function getTodayCashOutTotals(){
  const today=getLocalDateString();
  const rows=(transactions||[]).filter(t=>isCashOut(t)&&t.date===today);
  const qris=rows.filter(t=>getCashOutType(t)==='qris').reduce((s,t)=>s+Number(t.amount||0),0);
  const tabungan=rows.filter(t=>getCashOutType(t)==='tabungan').reduce((s,t)=>s+Number(t.amount||0),0);
  const lainnya=rows.filter(t=>getCashOutType(t)==='lainnya').reduce((s,t)=>s+Number(t.amount||0),0);
  return {qris,tabungan,lainnya,total:qris+tabungan+lainnya};
}

// =====================================================
// CEK CASH FISIK HARI INI
// Audit khusus untuk membandingkan cash fisik aplikasi dengan cash fisik hari ini.
// Selisih aktif disimpan sebagai transaksi khusus agar cash fisik, riwayat, laporan,
// dan laba tetap ikut benar tanpa masuk Ops Toko / Omset Staff biasa.
// =====================================================
function isCashDrawerAdjustmentTx(t={}){
  const desc=String(t&&t.description||'');
  const cat=String(t&&t.category_name||'').toLowerCase();
  return !!(t&&desc.startsWith(CASH_DRAWER_ADJ_PREFIX))
    || cat===CASH_DRAWER_MINUS_CATEGORY_NAME.toLowerCase()
    || cat===CASH_DRAWER_PLUS_CATEGORY_NAME.toLowerCase();
}
function getCashDrawerAdjustmentTxAuditId(t={}){
  const m=String(t&&t.description||'').match(/^\[SELISIH_LACI:([^\]]+)\]/);
  return m?String(m[1]):'';
}
function isCashDrawerAdjustmentTxForAudit(t={},auditId){
  return isCashDrawerAdjustmentTx(t)&&String(getCashDrawerAdjustmentTxAuditId(t))===String(auditId);
}
function isCashDrawerMinusTx(t={}){return isCashDrawerAdjustmentTx(t)&&t.type==='expense'}
function isCashDrawerPlusTx(t={}){return isCashDrawerAdjustmentTx(t)&&t.type==='income'}
function cleanCashDrawerAdjustmentDesc(desc){
  return String(desc||'').replace(/^\[SELISIH_LACI:[^\]]+\]\s*/,'').trim();
}
function getCashDrawerAdjustmentTxAmountForDate(date){
  const d=String(date||getLocalDateString()).slice(0,10);
  const latest=getLatestCashDrawerAudit(d);
  if(!latest)return 0;
  return roundRp((transactions||[])
    .filter(t=>String(t&&t.date||'').slice(0,10)===d&&isCashDrawerAdjustmentTxForAudit(t,latest.id))
    .reduce((sum,t)=>sum+(t.type==='income'?Number(t.amount||0):-Number(t.amount||0)),0));
}
function getCashDrawerLegacyAdjustmentForDate(date){
  const d=String(date||getLocalDateString()).slice(0,10);
  const latest=getLatestCashDrawerAudit(d);
  if(!latest||latest.status==='pas'||roundRp(latest.adjustmentAmount)===0)return 0;
  const hasTx=(transactions||[]).some(t=>String(t&&t.date||'').slice(0,10)===d&&isCashDrawerAdjustmentTxForAudit(t,latest.id));
  // Backup/data lama belum punya transaksi Selisih Kas. Fallback ini menjaga angka cash lama tetap aman.
  return hasTx?0:roundRp(latest.adjustmentAmount);
}
function getCashDrawerAppliedAdjustmentForDate(date){
  const d=String(date||getLocalDateString()).slice(0,10);
  return roundRp(getCashDrawerAdjustmentTxAmountForDate(d)+getCashDrawerLegacyAdjustmentForDate(d));
}
async function getCashDrawerMinusCategory(){
  try{
    await loadExpenseCategories();
    let cat=getCategoryByName(CASH_DRAWER_MINUS_CATEGORY_NAME);
    if(!cat){
      try{await insertExpenseCategory(CASH_DRAWER_MINUS_CATEGORY_NAME,6)}catch(e){console.warn('Auto kategori Selisih Kas Minus gagal:',e)}
      await loadExpenseCategories();
      cat=getCategoryByName(CASH_DRAWER_MINUS_CATEGORY_NAME);
    }
    return cat||{id:null,name:CASH_DRAWER_MINUS_CATEGORY_NAME};
  }catch(e){
    console.warn('Kategori Selisih Kas Minus tidak siap, pakai category_name saja:',e);
    return {id:null,name:CASH_DRAWER_MINUS_CATEGORY_NAME};
  }
}
function buildCashDrawerAdjustmentTransaction(audit){
  const r=normalizeCashDrawerAudit(audit);
  const amount=Math.abs(roundRp(r.differenceAmount));
  if(!amount||r.status==='pas')return null;
  const statusLabel=r.status==='minus'?CASH_DRAWER_MINUS_CATEGORY_NAME:CASH_DRAWER_PLUS_CATEGORY_NAME;
  const word=r.status==='minus'?'kurang':'lebih';
  const note=r.note?` · ${r.note}`:'';
  return {
    id:Date.now()+Math.floor(Math.random()*999),
    date:r.dateKey,
    description:`${CASH_DRAWER_ADJ_PREFIX}${r.id}] ${statusLabel} - cash fisik ${word} ${formatRupiah(amount)} · patokan ${formatRupiah(r.baseAmount)} · real ${formatRupiah(r.actualAmount)}${note}`,
    amount,
    type:r.status==='minus'?'expense':'income',
    category_id:null,
    category_name:statusLabel
  };
}
async function deleteCashDrawerAdjustmentTransactionsForDate(date){
  if(!supabaseClient)return 0;
  const d=String(date||getLocalDateString()).slice(0,10);
  const {data,error}=await supabaseClient
    .from('transactions')
    .select('id')
    .eq('owner_id',OWNER_ID)
    .eq('date',d)
    .like('description',CASH_DRAWER_ADJ_PREFIX+'%');
  if(error)throw error;
  const ids=(data||[]).map(x=>Number(x.id)).filter(Boolean);
  if(ids.length){
    const del=await supabaseClient.from('transactions').delete().eq('owner_id',OWNER_ID).in('id',ids);
    if(del.error)throw del.error;
  }
  transactions=(transactions||[]).filter(t=>!(ids.includes(Number(t.id))));
  return ids.length;
}
async function syncCashDrawerAdjustmentTransactionForDate(date){
  if(!supabaseClient)return null;
  const d=String(date||getLocalDateString()).slice(0,10);
  await deleteCashDrawerAdjustmentTransactionsForDate(d);
  const latest=getLatestCashDrawerAudit(d);
  if(!latest||latest.status==='pas'||roundRp(latest.differenceAmount)===0)return null;
  const tx=buildCashDrawerAdjustmentTransaction(latest);
  if(!tx)return null;
  if(tx.type==='expense'){
    const cat=await getCashDrawerMinusCategory();
    tx.category_id=cat&&cat.id?Number(cat.id):null;
    tx.category_name=CASH_DRAWER_MINUS_CATEGORY_NAME;
  }
  await saveTransaction(tx);
  return tx;
}
function getCashDrawerStatus(diff){
  const n=roundRp(diff);
  if(n<0)return 'minus';
  if(n>0)return 'lebih';
  return 'pas';
}
function cashDrawerStatusLabel(status){
  return status==='minus'?'MINUS':(status==='lebih'?'LEBIH':'PAS');
}
function cashDrawerStatusClass(status){
  return status==='minus'?'minus':(status==='lebih'?'lebih':'pas');
}
function formatSignedRupiah(n){
  const x=roundRp(n);
  if(x>0)return '+'+formatRupiah(x);
  if(x<0)return '-'+formatRupiah(Math.abs(x));
  return formatRupiah(0);
}
function normalizeCashDrawerAudit(r={}){
  const diff=roundRp(r.differenceAmount??r.difference_amount??0);
  const status=String(r.status||getCashDrawerStatus(diff)).toLowerCase();
  const dateKey=String(r.dateKey||r.date_key||r.date||getLocalDateString()).slice(0,10);
  return {
    id:Number(r.id)||Date.now(),
    owner_id:r.owner_id||OWNER_ID,
    dateKey,
    baseAmount:roundRp(r.baseAmount??r.base_amount??0),
    expectedAmount:roundRp(r.expectedAmount??r.expected_amount??0),
    actualAmount:roundRp(r.actualAmount??r.actual_amount??0),
    differenceAmount:diff,
    previousAdjustmentAmount:roundRp(r.previousAdjustmentAmount??r.previous_adjustment_amount??0),
    adjustmentAmount:roundRp(r.adjustmentAmount??r.adjustment_amount??0),
    status:['minus','pas','lebih'].includes(status)?status:getCashDrawerStatus(diff),
    note:String(r.note||'').trim(),
    notifyStatus:String(r.notifyStatus||r.notify_status||'pending'),
    notifyResponse:r.notifyResponse||r.notify_response||null,
    createdAt:r.createdAt||r.created_at||new Date().toISOString(),
    updatedAt:r.updatedAt||r.updated_at||r.createdAt||r.created_at||new Date().toISOString()
  };
}
function cashDrawerAuditDbRow(row={}){
  const r=normalizeCashDrawerAudit(row);
  return {
    id:r.id,
    owner_id:OWNER_ID,
    date_key:r.dateKey,
    base_amount:r.baseAmount,
    expected_amount:r.expectedAmount,
    actual_amount:r.actualAmount,
    difference_amount:r.differenceAmount,
    previous_adjustment_amount:r.previousAdjustmentAmount,
    adjustment_amount:r.adjustmentAmount,
    status:r.status,
    note:r.note,
    notify_status:r.notifyStatus,
    notify_response:r.notifyResponse
  };
}
async function loadCashDrawerAudits(){
  if(!supabaseClient){cashDrawerAudits=[];cashDrawerTableReady=false;return cashDrawerAudits}
  const {data,error}=await supabaseClient.from(CASH_DRAWER_TABLE).select('*').eq('owner_id',OWNER_ID).order('date_key',{ascending:false}).order('created_at',{ascending:false}).limit(300);
  if(error){cashDrawerAudits=[];cashDrawerTableReady=false;throw error}
  cashDrawerTableReady=true;
  cashDrawerAudits=(data||[]).map(normalizeCashDrawerAudit);
  return cashDrawerAudits;
}
async function insertCashDrawerAudit(row){
  if(!supabaseClient)throw new Error('Supabase belum aktif');
  const {data,error}=await supabaseClient.from(CASH_DRAWER_TABLE).insert(cashDrawerAuditDbRow(row)).select('*').single();
  if(error){cashDrawerTableReady=false;throw error}
  cashDrawerTableReady=true;
  const saved=normalizeCashDrawerAudit(data||row);
  cashDrawerAudits=[saved,...(cashDrawerAudits||[]).filter(x=>Number(x.id)!==Number(saved.id))];
  return saved;
}
async function updateCashDrawerAuditRecord(id,row){
  if(!supabaseClient)throw new Error('Supabase belum aktif');
  const payload=cashDrawerAuditDbRow({...row,id:Number(id)});
  const {data,error}=await supabaseClient.from(CASH_DRAWER_TABLE).update(payload).eq('owner_id',OWNER_ID).eq('id',Number(id)).select('*').single();
  if(error)throw error;
  const saved=normalizeCashDrawerAudit(data||{...row,id:Number(id)});
  cashDrawerAudits=(cashDrawerAudits||[]).map(x=>Number(x.id)===Number(saved.id)?saved:x);
  return saved;
}
async function updateCashDrawerAuditNotify(audit,notifyStatus,notifyResponse){
  const row=normalizeCashDrawerAudit({...audit,notifyStatus,notifyResponse});
  cashDrawerAudits=(cashDrawerAudits||[]).map(x=>Number(x.id)===Number(row.id)?row:x);
  if(!supabaseClient||!cashDrawerTableReady)return row;
  const {error}=await supabaseClient.from(CASH_DRAWER_TABLE).update({
    notify_status:row.notifyStatus,
    notify_response:row.notifyResponse,
    updated_at:new Date().toISOString()
  }).eq('owner_id',OWNER_ID).eq('id',row.id);
  if(error)console.warn('Update status notifikasi audit cash fisik gagal:',error);
  return row;
}
function getCashDrawerAuditsForDate(date=getLocalDateString()){
  const d=String(date||getLocalDateString()).slice(0,10);
  return (cashDrawerAudits||[]).filter(r=>String(r.dateKey||'').slice(0,10)===d).sort((a,b)=>{
    const ta=Date.parse(a.createdAt||'')||Number(a.id)||0;
    const tb=Date.parse(b.createdAt||'')||Number(b.id)||0;
    return tb-ta;
  });
}
function getLatestCashDrawerAudit(date=getLocalDateString()){
  return getCashDrawerAuditsForDate(date)[0]||null;
}
function findCashDrawerAudit(id){
  return (cashDrawerAudits||[]).find(r=>Number(r.id)===Number(id))||null;
}
function getTodayCashFisikData(){
  const today=getLocalDateString();
  const manualIncome=(transactions||[]).filter(t=>t.type==='income'&&t.date===today&&!isFirebaseUploaded(t)).reduce((s,t)=>s+Number(t.amount||0),0);
  const fbTotal=Number(todayFirebaseIncomeTotal||0);
  const opsTotal=(transactions||[]).filter(t=>isOpsExpense(t)&&t.date===today).reduce((s,t)=>s+Number(t.amount||0),0);
  const co=getTodayCashOutTotals();
  const rawBase=roundRp(fbTotal-opsTotal-co.total);
  const baseAmount=Math.max(0,rawBase);
  const latestAudit=getLatestCashDrawerAudit(today);
  const adjustmentAmount=getCashDrawerAppliedAdjustmentForDate(today);
  const cashFisik=Math.max(0,roundRp(baseAmount+adjustmentAmount));
  return {today,manualIncome,fbTotal,opsTotal,co,rawBase,baseAmount,adjustmentAmount,cashFisik,latestAudit};
}
function getCashDrawerModalBasis(){
  const edit=findCashDrawerAudit(cashDrawerEditingId);
  if(edit){
    const baseAmount=roundRp(edit.baseAmount);
    const previousAdjustmentAmount=roundRp(edit.previousAdjustmentAmount);
    return {
      today:edit.dateKey,
      baseAmount,
      adjustmentAmount:previousAdjustmentAmount,
      cashFisik:Math.max(0,roundRp(baseAmount+previousAdjustmentAmount)),
      latestAudit:getLatestCashDrawerAudit(edit.dateKey),
      edit
    };
  }
  return getTodayCashFisikData();
}
function cashDrawerAmountToInputValue(amount){
  const n=Number(amount||0)/1000;
  return Number.isInteger(n)?String(n):String(n.toFixed(3)).replace(/\.?0+$/,'');
}
function cashDrawerNotifyLabel(status,diff){
  const abs=Math.abs(roundRp(diff));
  if(status==='minus')return `Minus ${formatRupiah(abs)}`;
  if(status==='lebih')return `Lebih ${formatRupiah(abs)}`;
  return 'Pas';
}
function cashDrawerNotifyStatusText(status,context='line'){
  const s=String(status||'pending').toLowerCase();
  if(s==='sent')return context==='line'?'notif staff terkirim':'Terkirim';
  if(s==='failed')return context==='line'?'notif staff gagal':'Gagal';
  if(s==='saved_only'||s==='not_sent'||s==='skipped')return context==='line'?'tanpa kirim notif staff':'Tidak dikirim';
  return context==='line'?'notif staff pending':'Pending';
}
function renderCashDrawerHomeStatus(data=getTodayCashFisikData()){
  const latest=data.latestAudit;
  const statusEl=$('cashDrawerStatusLine');
  const adjEl=$('cashDrawerAdjustmentTotal');
  const noteEl=$('cashDrawerLatestNote');
  if(adjEl){
    adjEl.innerText=formatSignedRupiah(data.adjustmentAmount);
    adjEl.style.color=data.adjustmentAmount<0?'var(--red)':(data.adjustmentAmount>0?'var(--green)':'var(--muted)');
  }
  if(!latest){
    if(statusEl){statusEl.className='cash-drawer-status empty';statusEl.innerText='Belum dicek hari ini';}
    if(noteEl)noteEl.innerText='Input cash fisik hari ini untuk tahu minus, pas, atau lebih.';
    return;
  }
  const cls=cashDrawerStatusClass(latest.status);
  if(statusEl){
    statusEl.className='cash-drawer-status '+cls;
    statusEl.innerText=`Status Cash Fisik: ${cashDrawerNotifyLabel(latest.status,latest.differenceAmount)}`;
  }
  if(noteEl){
    let time='';
    try{time=new Date(latest.createdAt).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Jakarta'});}catch(e){}
    const notif=cashDrawerNotifyStatusText(latest.notifyStatus,'line');
    const note=latest.note?` - ${latest.note}`:'';
    noteEl.innerText=`${time||latest.dateKey} - Aplikasi ${formatRupiah(latest.expectedAmount)}, cash fisik ${formatRupiah(latest.actualAmount)} - ${notif}${note}`;
  }
}
function getCashDrawerActualInput(){
  const input=$('cashDrawerActualAmount');
  const raw=String(input&&input.value||'').trim();
  if(raw==='')return null;
  const actual=getActualAmount(raw);
  return Number.isFinite(actual)?roundRp(actual):null;
}
function renderCashDrawerPreview(){
  const data=getCashDrawerModalBasis();
  const expectedEl=$('cashDrawerExpectedAmount'),baseEl=$('cashDrawerBaseAmount'),adjEl=$('cashDrawerCurrentAdjustment');
  if(expectedEl)expectedEl.innerText=formatRupiah(data.baseAmount);
  if(baseEl)baseEl.innerText=formatRupiah(data.cashFisik);
  if(adjEl)adjEl.innerText=formatSignedRupiah(data.adjustmentAmount);
  const actual=getCashDrawerActualInput();
  const preview=$('cashDrawerStatusPreview');
  if(!preview)return;
  if(actual===null){
    preview.className='cash-drawer-preview empty';
    preview.innerText='Isi cash fisik hari ini.';
    return;
  }
  const diff=roundRp(actual-data.baseAmount);
  const status=getCashDrawerStatus(diff);
  preview.className='cash-drawer-preview '+cashDrawerStatusClass(status);
  const trx=status==='minus'?`Pengeluaran ${CASH_DRAWER_MINUS_CATEGORY_NAME}`:(status==='lebih'?`Pemasukan ${CASH_DRAWER_PLUS_CATEGORY_NAME}`:'tanpa transaksi selisih');
  preview.innerText=`${cashDrawerStatusLabel(status)} - Selisih ${formatSignedRupiah(diff)} dari patokan. Cash aplikasi akan menjadi ${formatRupiah(actual)} (${trx}).`;
}
function setCashDrawerFilter(filter){
  currentCashDrawerFilter=['today','month','all'].includes(filter)?filter:'today';
  ['today','month','all'].forEach(f=>{
    const el=$('drawer-filter-'+f);
    if(el)el.classList.toggle('active',f===currentCashDrawerFilter);
  });
  renderCashDrawerPage();
}
function getCashDrawerFilteredRows(){
  const today=getLocalDateString(),month=today.slice(0,7);
  return (cashDrawerAudits||[]).filter(r=>{
    const d=String(r.dateKey||'').slice(0,10);
    if(currentCashDrawerFilter==='today')return d===today;
    if(currentCashDrawerFilter==='month')return d.startsWith(month);
    return true;
  }).sort((a,b)=>{
    const ta=Date.parse(a.createdAt||'')||Number(a.id)||0;
    const tb=Date.parse(b.createdAt||'')||Number(b.id)||0;
    return tb-ta;
  });
}
function renderCashDrawerHistoryList(){
  const rows=getCashDrawerFilteredRows();
  const count=$('cashDrawerHistoryCount');if(count)count.innerText=`${rows.length} data`;
  const list=$('cashDrawerHistoryList');if(!list)return;
  if(!rows.length){list.innerHTML='<div class="empty">Belum ada riwayat cek cash fisik</div>';return;}
  list.innerHTML=rows.map(r=>{
    const cls=cashDrawerStatusClass(r.status);
    const notif=cashDrawerNotifyStatusText(r.notifyStatus,'list');
    let time='';
    try{time=new Date(r.createdAt).toLocaleString('id-ID',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Jakarta'});}catch(e){}
    const isActive=getLatestCashDrawerAudit(r.dateKey)?.id===r.id;
    return `<div class="cash-drawer-list-item ${cls}"><div style="min-width:0;flex:1"><div class="cash-drawer-list-head"><b>${cashDrawerNotifyLabel(r.status,r.differenceAmount)}</b>${isActive?'<span class="cash-drawer-active-badge">AKTIF</span>':''}</div><small>${escapeHtml(time||r.dateKey)} - Patokan ${formatRupiah(r.baseAmount)} - Cash fisik ${formatRupiah(r.actualAmount)} - Selisih ${formatSignedRupiah(r.adjustmentAmount)} - Notif ${escapeHtml(notif)}${r.note?' - '+escapeHtml(r.note):''}</small></div><div class="cash-drawer-row-actions"><b class="num">${formatSignedRupiah(r.differenceAmount)}</b><button class="mini-btn" type="button" onclick="openCashDrawerAuditModal(${Number(r.id)})">Edit</button><button class="x" type="button" onclick="deleteCashDrawerAuditWithPin(${Number(r.id)})" aria-label="Hapus audit cash fisik">×</button></div></div>`;
  }).join('');
}
function renderCashDrawerPage(){
  const data=getTodayCashFisikData();
  const status=data.latestAudit?cashDrawerNotifyLabel(data.latestAudit.status,data.latestAudit.differenceAmount):'Belum dicek';
  const latestClass=data.latestAudit?cashDrawerStatusClass(data.latestAudit.status):'empty';
  const set=(id,text)=>{const el=$(id);if(el)el.innerText=text};
  set('cashDrawerPageBase',formatRupiah(data.baseAmount));
  set('cashDrawerPageCurrent',formatRupiah(data.cashFisik));
  set('cashDrawerPageAdjustment',formatSignedRupiah(data.adjustmentAmount));
  const st=$('cashDrawerPageStatus');
  if(st){st.className='cash-drawer-status '+latestClass;st.innerText=status;}
  ['today','month','all'].forEach(f=>$('drawer-filter-'+f)?.classList.toggle('active',f===currentCashDrawerFilter));
  renderCashDrawerHistoryList();
}
async function deleteCashDrawerAuditWithPin(id){
  const row=findCashDrawerAudit(id);
  if(!row){showToast('Data cek cash fisik tidak ditemukan');return}
  openPasswordModal(async()=>{
    const ok=confirm(`Hapus data cek cash fisik ${cashDrawerNotifyLabel(row.status,row.differenceAmount)} tanggal ${row.dateKey}?\n\nKalau data aktif dihapus, cash fisik akan mengikuti data cek cash fisik sebelumnya.`);
    if(!ok)return;
    try{
      const {error}=await supabaseClient.from(CASH_DRAWER_TABLE).delete().eq('owner_id',OWNER_ID).eq('id',Number(id));
      if(error)throw error;
      cashDrawerAudits=(cashDrawerAudits||[]).filter(r=>Number(r.id)!==Number(id));
      await syncCashDrawerAdjustmentTransactionForDate(row.dateKey);
      await loadTransactions();
      render();renderCashFisik();renderCashDrawerPage();
      showToast('Data cek cash fisik dihapus dan transaksi Selisih Kas disesuaikan');
    }catch(e){showToast('Gagal hapus cek cash fisik: '+(e.message||e),6000)}
  });
}
function openCashDrawerAuditModal(editId=null){
  cashDrawerEditingId=editId?Number(editId):null;
  const edit=findCashDrawerAudit(cashDrawerEditingId);
  const input=$('cashDrawerActualAmount');if(input)input.value=edit?cashDrawerAmountToInputValue(edit.actualAmount):'';
  const prev=$('cashDrawerActualPreview');if(prev)prev.innerText=edit?formatRupiah(edit.actualAmount):'';
  const note=$('cashDrawerNote');if(note)note.value=edit?String(edit.note||''):'';
  const title=$('cashDrawerModalTitle');if(title)title.innerText=edit?'Edit Cek Cash Fisik':'Cek Cash Fisik Hari Ini';
  const btn=$('cashDrawerSaveBtn');if(btn)btn.innerText=edit?'Update':'Simpan';
  const notifyBtn=$('cashDrawerNotifyBtn');if(notifyBtn)notifyBtn.innerText=edit?'Update & Kirim Notif':'Kirim Notif';
  renderCashDrawerPreview();
  const modal=$('cashDrawerAuditModal');if(modal)modal.classList.remove('hidden');
  setTimeout(()=>$('cashDrawerActualAmount')?.focus(),80);
}
function closeCashDrawerAuditModal(){cashDrawerEditingId=null;$('cashDrawerAuditModal')?.classList.add('hidden')}
function handleCashDrawerActualPreview(input){
  const raw=String(input&&input.value||'').trim();
  const prev=$('cashDrawerActualPreview');
  if(prev)prev.innerText=raw===''?'':formatRupiah(getActualAmount(raw));
  renderCashDrawerPreview();
}
async function notifyCashDrawerStatus(audit){
  if(!ROCKY_STAFF_NOTIFY_CASH_DRAWER_URL||!ROCKY_STAFF_NOTIFY_SECRET)return {ok:false,skipped:true,error:'Worker notifikasi belum disetting'};
  const r=normalizeCashDrawerAudit(audit);
  let targetInfo=null;
  try{
    targetInfo=await resolveCashDrawerNotifyTargets(r.dateKey);
  }catch(e){
    return {
      ok:true,
      skipped:true,
      reason:'target_lookup_failed',
      message:'Gagal cek penerima notif cash fisik. Notifikasi tidak dikirim supaya tidak broadcast ke semua staff.',
      error:String(e?.message||e),
      sent:0,
      total:0,
      dateKey:r.dateKey
    };
  }
  if(!targetInfo.usernames.length){
    return {
      ok:true,
      skipped:true,
      reason:'no_eligible_cash_drawer_targets',
      message:'Tidak ada staf yang sudah absen atau harian yang transaksi hari ini.',
      sent:0,
      total:0,
      ...targetInfo
    };
  }
  const body={
    secret:ROCKY_STAFF_NOTIFY_SECRET,
    auditId:String(r.id),
    dateKey:r.dateKey,
    status:r.status,
    amount:Math.abs(r.differenceAmount),
    expectedAmount:r.expectedAmount,
    actualAmount:r.actualAmount,
    differenceAmount:r.differenceAmount,
    adjustmentAmount:r.adjustmentAmount,
    note:r.note,
    source:'kas_pribadi_cash_drawer',
    createdByName:'Kas Pribadi',
    targetRule:targetInfo.rule,
    targetUsernames:targetInfo.usernames,
    targetCount:targetInfo.usernames.length,
    staffAttendedUsernames:targetInfo.staffAttendedUsernames,
    dailyTransactionUsernames:targetInfo.dailyTransactionUsernames
  };
  const res=await fetch(ROCKY_STAFF_NOTIFY_CASH_DRAWER_URL,{
    method:'POST',
    headers:{'Content-Type':'application/json','X-Notify-Secret':ROCKY_STAFF_NOTIFY_SECRET},
    body:JSON.stringify(body)
  });
  const data=await res.json().catch(()=>({ok:false,status:res.status}));
  if(!res.ok||data.ok===false)throw new Error(data.error||data.message||`HTTP ${res.status}`);
  return data;
}
async function saveCashDrawerAudit(shouldNotify=false){
  const actual=getCashDrawerActualInput();
  if(actual===null){showToast('Isi cash fisik hari ini');return}
  if(actual<0){showToast('Nominal cash fisik tidak valid');return}
  if(!supabaseClient){showToast('Supabase belum aktif');return}
  if(!cashDrawerTableReady){
    try{await loadCashDrawerAudits();}catch(e){
      showToast('Tabel audit cash fisik belum ada. Jalankan SQL cash_drawer_audits dulu.',5000);
      return;
    }
  }
  const edit=findCashDrawerAudit(cashDrawerEditingId);
  const data=getCashDrawerModalBasis();
  const diff=roundRp(actual-data.baseAmount);
  const status=getCashDrawerStatus(diff);
  const note=String($('cashDrawerNote')?.value||'').trim();
  const txInfo=status==='minus'
    ? `Akan dibuat Pengeluaran kategori ${CASH_DRAWER_MINUS_CATEGORY_NAME}.`
    : (status==='lebih'?`Akan dibuat Pemasukan kategori ${CASH_DRAWER_PLUS_CATEGORY_NAME}.`:'PAS, tidak membuat transaksi selisih kas.');
  const notifyInfo=shouldNotify?'Notifikasi akan dikirim ke aplikasi staff.':'Disimpan saja, notifikasi tidak dikirim ke staff.';
  const ok=confirm(`${edit?'Update':'Simpan'} cek cash fisik hari ini?\n\nPatokan aplikasi: ${formatRupiah(data.baseAmount)}\nCash tampil sekarang: ${formatRupiah(data.cashFisik)}\nCash fisik hari ini: ${formatRupiah(actual)}\nStatus: ${cashDrawerNotifyLabel(status,diff)}\n\n${txInfo}\nTransaksi selisih aktif tanggal ini akan mengikuti cek cash fisik terakhir.\n${notifyInfo}`);
  if(!ok)return;
  const now=new Date().toISOString();
  const row={
    id:edit?Number(edit.id):Date.now()+Math.floor(Math.random()*1000),
    owner_id:OWNER_ID,
    dateKey:data.today,
    baseAmount:data.baseAmount,
    expectedAmount:data.baseAmount,
    actualAmount:actual,
    differenceAmount:diff,
    previousAdjustmentAmount:data.adjustmentAmount,
    adjustmentAmount:diff,
    status,
    note,
    notifyStatus:shouldNotify?'pending':'saved_only',
    notifyResponse:shouldNotify?null:{savedOnly:true},
    createdAt:edit?edit.createdAt:now,
    updatedAt:now
  };
  let saved=null;
  try{
    saved=edit?await updateCashDrawerAuditRecord(edit.id,row):await insertCashDrawerAudit(row);
  }catch(e){
    showToast('Gagal simpan audit cash fisik: '+(e.message||e),6000);
    return;
  }
  try{
    await syncCashDrawerAdjustmentTransactionForDate(saved.dateKey);
    await loadTransactions();
  }catch(e){
    showToast('Cek cash fisik tersimpan, tapi transaksi Selisih Kas gagal dibuat: '+(e.message||e),7000);
    return;
  }
  if(shouldNotify){
    try{
      const notifyResult=await notifyCashDrawerStatus(saved);
      if(notifyResult&&notifyResult.skipped){
        saved=await updateCashDrawerAuditNotify(saved,'skipped',notifyResult);
        showToast(`Cek cash fisik ${edit?'diupdate':'tersimpan'}: ${cashDrawerNotifyLabel(status,diff)}. Notifikasi staff tidak dikirim: ${cashDrawerNotifySkipText(notifyResult)}.`,7000);
      }else{
        saved=await updateCashDrawerAuditNotify(saved,'sent',notifyResult);
        const targetCount=Number(notifyResult?.targetUsers||notifyResult?.targetCount||0);
        showToast(`Cek cash fisik ${edit?'diupdate':'tersimpan'}: ${cashDrawerNotifyLabel(status,diff)}. Notifikasi staff terkirim${targetCount?` ke ${targetCount} user`:''}.`);
      }
    }catch(e){
      saved=await updateCashDrawerAuditNotify(saved,'failed',{error:String(e.message||e)});
      showToast(`Cek cash fisik ${edit?'diupdate':'tersimpan'}, tapi notifikasi staff gagal: ${e.message||e}`,6000);
    }
  }else{
    showToast(`Cek cash fisik ${edit?'diupdate':'tersimpan'}: ${cashDrawerNotifyLabel(status,diff)}. Notifikasi staff tidak dikirim.`);
  }
  cashDrawerEditingId=null;
  closeCashDrawerAuditModal();
  render();
  renderCashFisik();
  renderCashDrawerPreview();
  renderCashDrawerPage();
}

function renderCashFisik(){
  const data=getTodayCashFisikData();
  const manualIncome=data.manualIncome,fbTotal=data.fbTotal,opsTotal=data.opsTotal,co=data.co,cashFisik=data.cashFisik;
  // Update home card gabungan
  const cfEl=$('cashFisikTotal');
  if(cfEl){cfEl.innerText=formatRupiah(cashFisik);cfEl.style.color=cashFisik<0?'var(--red)':'#2563eb';}
  // Update info text dengan breakdown sumber cash fisik
  const infoEl=$('todayFirebaseIncomeInfo');
  if(infoEl){
    const parts=[];
    if(fbTotal>0)parts.push(`Server Pusat ${formatRupiah(fbTotal)}`);
    if(opsTotal>0)parts.push(`Ops -${formatRupiah(opsTotal)}`);
    if(co.qris>0)parts.push(`QRIS -${formatRupiah(co.qris)}`);
    if(co.tabungan>0)parts.push(`Tabungan -${formatRupiah(co.tabungan)}`);
    if(data.adjustmentAmount!==0)parts.push(`Cash fisik ${formatSignedRupiah(data.adjustmentAmount)}`);
    if(manualIncome>0)parts.push(`Manual ${formatRupiah(manualIncome)} tidak masuk cash`);
    infoEl.innerText=parts.length?parts.join(' · '):'Server Pusat - Ops Toko - QRIS - Tabungan · Hutang masuk Saldo Bersih';
  }
  // Update ops total di breakdown
  const opsTodayHomeEl=$('opsTodayHomeTotal');if(opsTodayHomeEl)opsTodayHomeEl.innerText=formatRupiah(opsTotal);
  const qEl=$('cashOutQrisTotal');if(qEl)qEl.innerText=formatRupiah(co.qris);
  const tEl=$('cashOutTabunganTotal');if(tEl)tEl.innerText=formatRupiah(co.tabungan);
  renderCashDrawerHomeStatus(data);
  // Update modal ringkasan
  const mf=$('cashOutModalFisikTotal');if(mf){mf.innerText=formatRupiah(cashFisik);mf.style.color=cashFisik<0?'var(--red)':'#1d4ed8';}
  const mq=$('cashOutModalQris');if(mq)mq.innerText=formatRupiah(co.qris);
  const mt=$('cashOutModalTabungan');if(mt)mt.innerText=formatRupiah(co.tabungan);
  renderCashDrawerPreview();
}

// =====================================================
// RINGKASAN LABA BARU — filter harian/bulanan/tahunan/custom
// Angka utama menampilkan Sisa Operasional = Limit 20% - Terpakai.
// Limit 20% tetap dihitung dari pendapatan manual + Server Pusat sesuai periode.
// =====================================================
let currentProfitFilter='today';
function setProfitFilter(f){
  currentProfitFilter=f;
  ['today','month','year','custom'].forEach(x=>{
    const el=$('ps-tab-'+x);if(el)el.classList.toggle('active',x===f);
  });
  const rangeRow=$('psCustomRange');
  if(rangeRow)rangeRow.style.display=f==='custom'?'grid':'none';
  if(f==='custom'){
    const today=getLocalDateString();
    if($('psStartDate')&&!$('psStartDate').value)$('psStartDate').value=today;
    if($('psEndDate')&&!$('psEndDate').value)$('psEndDate').value=today;
  }
  renderProfitSummary();
}
function getProfitSummaryData(filter){
  const today=getLocalDateString();
  const thisMonth=today.slice(0,7);
  const thisYear=today.slice(0,4);
  const s=$('psStartDate')?$('psStartDate').value:'';
  const e=$('psEndDate')?$('psEndDate').value:'';
  // Pendapatan: dari Supabase (manual + Server Pusat lock) + todayFirebase kalau filter today/month/year/custom mencakup hari ini
  let incomeRows=[], expenseRows=[];
  const allTx=getDashboardTransactions();
  // Helper: expense bisnis = expense tapi BUKAN cashout (QRIS/Tabungan hanya kurangi cash fisik)
  const isRealExpense=t=>t.type==='expense'&&!isCashOut(t);
  if(filter==='today'){
    incomeRows=allTx.filter(t=>t.type==='income'&&t.date===today);
    expenseRows=allTx.filter(t=>isRealExpense(t)&&t.date===today);
  } else if(filter==='month'){
    incomeRows=allTx.filter(t=>t.type==='income'&&String(t.date||'').startsWith(thisMonth));
    expenseRows=allTx.filter(t=>isRealExpense(t)&&String(t.date||'').startsWith(thisMonth));
  } else if(filter==='year'){
    incomeRows=allTx.filter(t=>t.type==='income'&&String(t.date||'').startsWith(thisYear));
    expenseRows=allTx.filter(t=>isRealExpense(t)&&String(t.date||'').startsWith(thisYear));
  } else { // custom
    if(!s||!e)return null;
    incomeRows=allTx.filter(t=>t.type==='income'&&t.date>=s&&t.date<=e);
    expenseRows=allTx.filter(t=>isRealExpense(t)&&t.date>=s&&t.date<=e);
  }
  // Tambahkan Server Pusat hari ini jika mencakup hari ini dan belum ada di Supabase
  const fbToday=Number(todayFirebaseIncomeTotal||0);
  const uploadedTodayTx=getUploadedFirebaseTransaction(today);
  const todayCovered=(filter==='today')||(filter==='month'&&today.startsWith(thisMonth))||(filter==='year'&&today.startsWith(thisYear))||(filter==='custom'&&s&&e&&today>=s&&today<=e);
  let fbExtra=0;
  if(todayCovered&&fbToday>0&&!uploadedTodayTx)fbExtra=fbToday;
  const piutangPayments = incomeRows.filter(t=>String(t.description||'').startsWith('[PELUNASAN PIUTANG]'));
  const piutangPaymentTotal = piutangPayments.reduce((sum,t)=>sum+Number(t.amount||0),0);
  const realIncomeRows = incomeRows.filter(t=>!String(t.description||'').startsWith('[PELUNASAN PIUTANG]'));

  const totalIncome=realIncomeRows.reduce((sum,t)=>sum+Number(t.amount||0),0)+fbExtra;
  const manualIncome=realIncomeRows.filter(t=>!isFirebaseUploaded(t)&&!t.__firebasePreview&&!isCashDrawerAdjustmentTx(t)).reduce((sum,t)=>sum+Number(t.amount||0),0);
  const totalExpense=expenseRows.reduce((sum,t)=>sum+Number(t.amount||0),0) - piutangPaymentTotal;
  const laba=Math.round(totalIncome*.2);
  const sisaOperasional=Math.round(laba-totalExpense);
  return {totalIncome,manualIncome,totalExpense,laba,laba20:laba,sisaOperasional,labaBersih:Math.max(0,sisaOperasional)};
}
function renderProfitSummary(){
  const data=getProfitSummaryData(currentProfitFilter);
  const labaEl=$('psLaba'),descEl=$('psDesc'),pendEl=$('psPendapatan'),pengeEl=$('psPengeluaran'),bersihEl=$('psLabaBersih');
  if(!data){
    if(labaEl)labaEl.innerText='Pilih tanggal dulu';
    if(descEl)descEl.innerText='Pilih rentang tanggal custom';
    return;
  }
  const {totalIncome,totalExpense,laba,sisaOperasional}=data;
  const filterLabel={today:'Hari Ini',month:'Bulan Ini',year:'Tahun Ini',custom:'Custom'}[currentProfitFilter]||'';
  // Angka utama Ringkasan Laba sekarang menampilkan SISA OPERASIONAL,
  // supaya tidak rancu dengan limit laba 20%.
  // Rumus: sisa operasional = 20% pendapatan - pengeluaran operasional.
  if(labaEl){labaEl.innerText=formatRupiah(sisaOperasional);labaEl.style.color=sisaOperasional>=0?'#69f0ae':'#ff5252';}
  if(descEl)descEl.innerText=`Sisa operasional ${filterLabel}: limit 20% ${formatRupiah(laba)} - terpakai ${formatRupiah(totalExpense)}`;
  if(pendEl)pendEl.innerText=formatRupiah(totalIncome);
  if(pengeEl)pengeEl.innerText=formatRupiah(totalExpense);
  if(bersihEl){bersihEl.innerText=formatRupiah(laba);bersihEl.style.color=laba>=0?'#69f0ae':'#ff5252';}
}
function showExpenseListTodayModal(){
  const today=getLocalDateString();
  const expenses=getDashboardTransactions().filter(t=>t.type==='expense'&&!isCashOut(t)&&t.date===today);
  expenses.sort((a,b)=>b.id-a.id);
  const total=expenses.reduce((sum,t)=>sum+Number(t.amount||0),0);
  $('expenseListTotal').innerText=formatRupiah(total);
  $('expenseListSubtitle').innerText=`${expenses.length} transaksi · Pengeluaran hari ini (${today})`;
  const c=$('expenseListContent');
  if(!expenses.length){c.innerHTML='<div class="empty">Belum ada pengeluaran hari ini</div>';}
  else{c.innerHTML=expenses.slice(0,100).map(t=>{
    const amt=Math.abs(Number(t.amount||0));
    const sign=Number(t.amount)<0?'+':'-';
    const colorClass=Number(t.amount)<0?'green':'red';
    return `<div class="item"><div class="left"><div class="icon out">-</div><div class="desc"><b>${escapeHtml(cleanFirebaseDesc(t.description))}</b><small>${t.date}</small>${getExpenseCategoryChip(t)}</div></div><div class="right"><b class="num ${colorClass}">${sign}${formatRupiah(amt).replace('Rp','')}</b></div></div>`;
  }).join('')}
  $('expenseListModal').classList.remove('hidden');
}
function showManualIncomeListModalFiltered(){
  const today=getLocalDateString(), thisMonth=today.slice(0,7);
  let incomes=getDashboardTransactions().filter(t=>t.type==='income'&&!isFirebaseUploaded(t));
  let subtitle='';
  if(currentProfitFilter==='today'){
    incomes=incomes.filter(t=>t.date===today);
    subtitle='Pendapatan hari ini';
  } else if(currentProfitFilter==='month'){
    incomes=incomes.filter(t=>String(t.date||'').startsWith(thisMonth));
    subtitle='Pendapatan bulan ini';
  } else if(currentProfitFilter==='year'){
    incomes=incomes.filter(t=>String(t.date||'').startsWith(today.slice(0,4)));
    subtitle='Pendapatan tahun ini';
  } else if(currentProfitFilter==='custom'){
    const s=$('profitFilterStartDate')?$('profitFilterStartDate').value:'';
    const e=$('profitFilterEndDate')?$('profitFilterEndDate').value:'';
    if(s&&e){
      incomes=incomes.filter(t=>t.date>=s&&t.date<=e);
      subtitle=`${s} s/d ${e}`;
    }
  }
  incomes.sort((a,b)=>b.id-a.id);
  const total=incomes.reduce((sum,t)=>sum+Number(t.amount||0),0);
  $('manualIncomeListTotal').innerText=formatRupiah(total);
  $('manualIncomeListSubtitle').innerText=`${incomes.length} transaksi · ${subtitle}`;
  const c=$('manualIncomeListContent');
  if(!incomes.length){c.innerHTML='<div class="empty">Belum ada pendapatan luar server</div>';}
  else{c.innerHTML=incomes.slice(0,200).map(t=>`<div class="item"><div class="left"><div class="icon in">+</div><div class="desc"><b>${escapeHtml(cleanFirebaseDesc(t.description))}</b><small>${t.date}</small></div></div><div class="right"><b class="num green">+${formatRupiah(t.amount).replace('Rp','')}</b></div></div>`).join('');}
  $('manualIncomeListModal').classList.remove('hidden');
}
function closeManualIncomeListModal(){$('manualIncomeListModal').classList.add('hidden');}
function showExpenseListModalFiltered(){
  const today=getLocalDateString(), thisMonth=today.slice(0,7);
  const s=$('filterStartDate')?$('filterStartDate').value:'', e=$('filterEndDate')?$('filterEndDate').value:'';
  let expenses=getDashboardTransactions().filter(t=>t.type==='expense'&&!isCashOut(t));
  let subtitle='';
  if(currentFilter==='today'){
    expenses=expenses.filter(t=>t.date===today);
    subtitle='Pengeluaran hari ini';
  } else if(currentFilter==='month'){
    expenses=expenses.filter(t=>String(t.date||'').startsWith(thisMonth));
    subtitle='Pengeluaran bulan ini';
  } else if(currentFilter==='range'){
    expenses=expenses.filter(t=>t.date>=s&&t.date<=e);
    subtitle=s&&e?`Pengeluaran ${s} s.d ${e}`:'Pengeluaran custom';
  } else {
    subtitle='Semua pengeluaran';
  }
  expenses.sort((a,b)=>b.date.localeCompare(a.date)||(b.id-a.id));
  const total=expenses.reduce((sum,t)=>sum+Number(t.amount||0),0);
  $('expenseListTotal').innerText=formatRupiah(total);
  $('expenseListSubtitle').innerText=`${expenses.length} transaksi · ${subtitle}`;
  const c=$('expenseListContent');
  if(!expenses.length){c.innerHTML='<div class="empty">Belum ada pengeluaran</div>';}
  else{c.innerHTML=expenses.slice(0,100).map(t=>`<div class="item"><div class="left"><div class="icon out">-</div><div class="desc"><b>${escapeHtml(cleanFirebaseDesc(t.description))}${isFirebaseUploaded(t)?'<span class="lock-badge">SERVER LOCK</span>':''}</b><small>${t.date}</small>${getExpenseCategoryChip(t)}</div></div><div class="right"><b class="num red">-${formatRupiah(t.amount).replace('Rp','')}</b></div></div>`).join('')+(expenses.length>100?`<div class="empty">Ditampilkan 100 dari ${expenses.length} data</div>`:'')}
  $('expenseListModal').classList.remove('hidden');
}
function showExpenseListModal(){
  const expenses=getDashboardTransactions().filter(t=>t.type==='expense');
  expenses.sort((a,b)=>b.date.localeCompare(a.date)||(b.id-a.id));
  const total=expenses.reduce((s,t)=>s+Number(t.amount||0),0);
  $('expenseListTotal').innerText=formatRupiah(total);
  $('expenseListSubtitle').innerText=expenses.length+' transaksi pengeluaran (semua data)';
  const c=$('expenseListContent');
  if(!expenses.length){c.innerHTML='<div class="empty">Belum ada pengeluaran</div>';}
  else{c.innerHTML=expenses.slice(0,100).map(t=>`<div class="item"><div class="left"><div class="icon out">-</div><div class="desc"><b>${escapeHtml(cleanFirebaseDesc(t.description))}${isFirebaseUploaded(t)?'<span class="lock-badge">SERVER LOCK</span>':''}</b><small>${t.date}</small>${getExpenseCategoryChip(t)}</div></div><div class="right"><b class="num red">-${formatRupiah(t.amount).replace('Rp','')}</b></div></div>`).join('')+(expenses.length>100?`<div class="empty">Ditampilkan 100 dari ${expenses.length} data</div>`:'')}
  $('expenseListModal').classList.remove('hidden');
}
function closeExpenseListModal(){$('expenseListModal').classList.add('hidden');}


// =====================================================
// LAPORAN KEUANGAN RINCI DI APLIKASI
// =====================================================
function setFinanceReportFilter(f){
  currentFinanceReportFilter=f;
  ['today','month','range','all'].forEach(x=>{const el=$('report-filter-'+x);if(el)el.classList.toggle('active',x===f)});
  const box=$('reportRangeBox');if(box)box.classList.toggle('hidden',f!=='range');
  if(f==='range'){
    const today=getLocalDateString();
    if($('reportStartDate')&&!$('reportStartDate').value)$('reportStartDate').value=today;
    if($('reportEndDate')&&!$('reportEndDate').value)$('reportEndDate').value=today;
  }
  renderFinanceReport();
}
function getFinanceReportPeriod(){
  const today=getLocalDateString(),month=today.slice(0,7);
  if(currentFinanceReportFilter==='today')return {label:`Hari Ini (${today})`,start:today,end:today,mode:'today'};
  if(currentFinanceReportFilter==='month')return {label:`Bulan Ini (${month})`,start:`${month}-01`,end:getMonthEndDate(month),mode:'month'};
  if(currentFinanceReportFilter==='range')return {label:`Custom`,start:$('reportStartDate')?$('reportStartDate').value:'',end:$('reportEndDate')?$('reportEndDate').value:'',mode:'range'};
  const dates=(getDashboardTransactions()||[]).map(t=>String(t.date||'')).filter(Boolean).sort();
  return {label:'Semua Data',start:dates[0]||today,end:dates[dates.length-1]||today,mode:'all'};
}
function getFinanceReportRows(){
  const p=getFinanceReportPeriod();
  let rows=(getDashboardTransactions()||[]).filter(t=>p.mode==='all'?true:(t.date>=p.start&&t.date<=p.end));
  const today=getLocalDateString();
  const live=getTodayFirebasePreviewTransaction();
  if(live&&p.mode!=='all'&&today>=p.start&&today<=p.end&&!getUploadedFirebaseTransaction(today))rows=[...rows,live];
  if(live&&p.mode==='all'&&!getUploadedFirebaseTransaction(today))rows=[...rows,live];
  return rows.slice().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||((Number(b.id)||0)-(Number(a.id)||0)));
}
function getReportCategoryPalette(idx,name){
  const palettes=[
    {bg:'#fff7ed',bgSoft:'#ffedd5',border:'#fdba74',bar:'#f97316',ink:'#9a3412',muted:'#c2410c'},
    {bg:'#eff6ff',bgSoft:'#dbeafe',border:'#93c5fd',bar:'#2563eb',ink:'#1d4ed8',muted:'#2563eb'},
    {bg:'#f0fdf4',bgSoft:'#dcfce7',border:'#86efac',bar:'#16a34a',ink:'#15803d',muted:'#16a34a'},
    {bg:'#fdf2f8',bgSoft:'#fce7f3',border:'#f9a8d4',bar:'#db2777',ink:'#be185d',muted:'#db2777'},
    {bg:'#f5f3ff',bgSoft:'#ede9fe',border:'#c4b5fd',bar:'#7c3aed',ink:'#6d28d9',muted:'#7c3aed'},
    {bg:'#ecfeff',bgSoft:'#cffafe',border:'#67e8f9',bar:'#0891b2',ink:'#0e7490',muted:'#0891b2'},
    {bg:'#fffbeb',bgSoft:'#fef3c7',border:'#fcd34d',bar:'#d97706',ink:'#b45309',muted:'#d97706'},
    {bg:'#fef2f2',bgSoft:'#fee2e2',border:'#fca5a5',bar:'#dc2626',ink:'#b91c1c',muted:'#dc2626'}
  ];
  const safeIdx=Math.abs(Number(idx)||0)%palettes.length;
  return palettes[safeIdx];
}

function toggleReportCategoryDetail(idx){
  const el=$('report-cat-detail-'+idx);
  if(!el)return;
  el.classList.toggle('hidden');
}
function renderFinanceReport(){
  if(!$('reportCategoryList'))return;
  const p=getFinanceReportPeriod();
  const rows=getFinanceReportRows();
  const allIncomes = rows.filter(t=>t.type==='income');
  const piutangPayments = allIncomes.filter(t=>String(t.description||'').startsWith('[PELUNASAN PIUTANG]'));
  const piutangPaymentTotal = piutangPayments.reduce((s,t)=>s+Number(t.amount||0),0);
  const income = allIncomes.filter(t=>!String(t.description||'').startsWith('[PELUNASAN PIUTANG]')).reduce((s,t)=>s+Number(t.amount||0),0);
  const expenses=rows.filter(t=>t.type==='expense'&&!isCashOut(t));
  const expenseTotal=expenses.reduce((s,t)=>s+Number(t.amount||0),0) - piutangPaymentTotal;
  const cashOut=rows.filter(t=>isCashOut(t)).reduce((s,t)=>s+Number(t.amount||0),0);
  const net=income-expenseTotal;
  const profit20=Math.round(income*.2);
  const opsRemain=Math.round(profit20-expenseTotal);
  const set=(id,val,cls)=>{const el=$(id);if(el){el.innerText=formatRupiah(val);if(cls)el.className='num '+cls}};
  set('reportIncome',income,'green');set('reportExpense',expenseTotal,'red');set('reportNet',net,net>=0?'blue':'red');set('reportCashOut',cashOut,'gold');set('reportProfit20',profit20,'blue');set('reportOpsRemain',opsRemain,opsRemain>=0?'green':'red');
  if($('reportPeriodLabel'))$('reportPeriodLabel').innerText=p.mode==='range'?`${p.start||'-'} s.d ${p.end||'-'}`:p.label;
  if($('reportCount'))$('reportCount').innerText=`${rows.length} data`;
  const byCat={};expenses.forEach(t=>{const nm=getExpenseCategoryName(t);if(!byCat[nm])byCat[nm]={total:0,rows:[]};byCat[nm].total+=Number(t.amount||0);byCat[nm].rows.push(t)});
  if (piutangPaymentTotal > 0) {
    const nm = 'Piutang';
    if (!byCat[nm]) byCat[nm] = {total: 0, rows: []};
    byCat[nm].total -= piutangPaymentTotal;
    // ensure it doesn't go below 0 just in case
    if (byCat[nm].total < 0) byCat[nm].total = 0;
  }
  const catRows=Object.entries(byCat).sort((a,b)=>b[1].total-a[1].total);
  const catBox=$('reportCategoryList');
  if(!catRows.length){catBox.innerHTML='<div class="empty">Belum ada pengeluaran di periode ini</div>'}
  else catBox.innerHTML=catRows.map(([name,info],idx)=>{
    const total=info.total;const pct=expenseTotal?Math.round((total/expenseTotal)*100):0;
    const pal=getReportCategoryPalette(idx,name);
    const catStyle=`--cat-bg:${pal.bg};--cat-bg-soft:${pal.bgSoft};--cat-border:${pal.border};--cat-bar:${pal.bar};--cat-ink:${pal.ink};--cat-muted:${pal.muted};`;
    const sorted=(info.rows||[]).slice().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||((Number(b.id)||0)-(Number(a.id)||0)));
    const detailRows=sorted.map(t=>{
      const desc=cleanFirebaseDesc(t.description||'Pengeluaran');
      const isMemo = desc.startsWith('Memo ') && desc.includes('ambil bonus');
      const isHutang = desc.startsWith('[AUTO-HUTANG-STAFF:');
      if (isMemo) {
        return `<div class="category-detail-row memo-brutalist"><div style="min-width:0; grid-column: 1 / -1;"><b>${escapeHtml(desc)}</b><small>${escapeHtml(t.date||'-')}</small></div></div>`;
      }
      if (isHutang) {
        let cleanDesc = desc.replace(/\[AUTO-HUTANG-STAFF:[^\]]+\]\s*/, '');
        let parts = cleanDesc.split(': ');
        let mainTitle = parts[0];
        // Support both old format (', ') and new format (' | ')
        let splitChar = parts.length > 1 && parts[1].includes(' | ') ? ' | ' : ', ';
        let details = parts.length > 1 ? parts[1].split(splitChar).map(s => `<span style="display:block;margin-top:4px;">• ${escapeHtml(s)}</span>`).join('') : '';
        
        return `<div class="category-detail-row hutang-brutalist" style="display:flex; justify-content:space-between; align-items:flex-start;">
          <div style="min-width:0; display:flex; flex-direction:column; gap:2px;">
            <b style="font-size:15px; text-transform:uppercase; letter-spacing:1px; margin-bottom:4px;">⚠️ ${escapeHtml(mainTitle)}</b>
            <div style="font-size:13px; line-height:1.4; color:#fff; font-weight:600; font-family:monospace;">${details}</div>
            <small style="margin-top:6px;">${escapeHtml(t.date||'-')}</small>
          </div>
          <b class="num" style="margin-left:12px; font-size:18px; white-space:nowrap; flex-shrink:0;">${formatRupiah(t.amount)}</b>
        </div>`;
      }
      return `<div class="category-detail-row"><div style="min-width:0"><b>${escapeHtml(desc)}</b><small>${escapeHtml(t.date||'-')}</small></div><b class="num" style="font-size:12px;white-space:nowrap;color:${pal.ink}">${formatRupiah(t.amount)}</b></div>`;
    }).join('');
    return `<div class="category-accordion" style="${catStyle}"><div class="category-accordion-head"><div class="category-accordion-title"><b>${escapeHtml(name)}</b><div class="category-accordion-meta"><small>${sorted.length} transaksi</small><small>${pct}% dari total</small></div><div class="progressbar"><span style="width:${Math.min(100,pct)}%"></span></div></div><div class="category-accordion-amount"><b class="num" style="font-size:13px;color:${pal.ink}">${formatRupiah(total)}</b><button class="mini-btn" type="button" style="background:${pal.bgSoft};border-color:${pal.border};color:${pal.ink}" onclick="toggleReportCategoryDetail(${idx})">Detail</button></div></div><div id="report-cat-detail-${idx}" class="category-accordion-detail hidden">${detailRows}</div></div>`;
  }).join('');
  const list=$('reportDetailList');
  if(!rows.length){list.innerHTML='<div class="empty">Belum ada transaksi</div>';return;}
  list.innerHTML=rows.slice(0,120).map(t=>renderTransactionDetailCard(t)).join('')+(rows.length>120?`<div class="empty">Ditampilkan 120 dari ${rows.length} data</div>`:'');
}
function downloadCsvReportFromFinancePage(){
  const p=getFinanceReportPeriod();
  currentFilter=currentFinanceReportFilter;
  if($('filterStartDate')&&p.start)$('filterStartDate').value=p.start;
  if($('filterEndDate')&&p.end)$('filterEndDate').value=p.end;
  if($('filterStartDateHistory')&&p.start)$('filterStartDateHistory').value=p.start;
  if($('filterEndDateHistory')&&p.end)$('filterEndDateHistory').value=p.end;
  updateFilterUI();
  downloadCsvReport();
}

// =====================================================
// DOWNLOAD REKAP BULANAN XLS
// =====================================================
function downloadXlsMonth(){
  return downloadMonthlyFinanceReport();
}

// =====================================================
// DOWNLOAD LAPORAN KEUANGAN LENGKAP CSV
// =====================================================
function getCsvReportPeriod(){
  const today=getLocalDateString();
  const thisMonth=today.slice(0,7);
  const allDates=(getDashboardTransactions()||[]).map(t=>String(t.date||'')).filter(Boolean).sort();
  if(currentFilter==='today')return {mode:'today',label:`Hari Ini (${today})`,start:today,end:today};
  if(currentFilter==='month')return {mode:'month',label:`Bulan Ini (${thisMonth})`,start:`${thisMonth}-01`,end:getMonthEndDate(thisMonth)};
  if(currentFilter==='range'){
    const s=$('filterStartDate')?$('filterStartDate').value:'';
    const e=$('filterEndDate')?$('filterEndDate').value:'';
    return {mode:'range',label:`Custom (${s||'-'} s.d ${e||'-'})`,start:s,end:e};
  }
  return {mode:'all',label:'Semua Data',start:allDates[0]||today,end:allDates[allDates.length-1]||today};
}
function getMonthEndDate(monthKey){
  const parts=String(monthKey||'').split('-');
  const y=Number(parts[0]||0),m=Number(parts[1]||0);
  if(!y||!m)return getLocalDateString();
  const last=new Date(y,m,0).getDate();
  return `${monthKey}-${String(last).padStart(2,'0')}`;
}
function isDateInCsvPeriod(date,period){
  const d=String(date||'').slice(0,10);
  if(!d)return false;
  if(period.mode==='all')return true;
  if(!period.start||!period.end)return false;
  return d>=period.start&&d<=period.end;
}
function getCsvReportTransactions(period){
  let rows=(getDashboardTransactions()||[]).filter(t=>isDateInCsvPeriod(t.date,period));
  const today=getLocalDateString();
  const todayCovered=isDateInCsvPeriod(today,period);
  const liveToday=getTodayFirebasePreviewTransaction();
  if(todayCovered&&liveToday){
    // Untuk hari berjalan, pakai nilai live Server Pusat agar laporan paling baru dan tidak dobel dengan SERVER LOCK.
    rows=rows.filter(t=>!(t.date===today&&isFirebaseUploaded(t)));
    rows.push({...liveToday,description:'[SERVERPUSAT:'+today+'] Omset Server Pusat Hari Ini'});
  }
  return rows.slice().sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))||(Number(a.id)||0)-(Number(b.id)||0));
}
function getCsvTransactionCategory(t){
  if(isDebtIn(t))return 'Pinjam Uang';
  if(isDebtPay(t))return 'Bayar Pokok Hutang';
  if(isCashDrawerAdjustmentTx(t))return t.type==='income'?CASH_DRAWER_PLUS_CATEGORY_NAME:CASH_DRAWER_MINUS_CATEGORY_NAME;
  if(t.type==='income')return isFirebaseUploaded(t)?'Pendapatan Server Pusat':'Pendapatan Manual';
  if(isCashOut(t)){
    const type=getCashOutType(t);
    return type==='qris'?'Cash Out QRIS':type==='tabungan'?'Cash Out Tabungan':'Cash Out Lainnya';
  }
  if(t.type==='expense')return getExpenseCategoryName(t);
  return 'Pengeluaran Bisnis';
}
function getCsvTransactionDescription(t){
  if(isDebtTx(t))return cleanDebtDesc(t.description)||getCsvTransactionCategory(t);
  if(isCashDrawerAdjustmentTx(t))return cleanCashDrawerAdjustmentDesc(t.description)||getCsvTransactionCategory(t);
  if(isCashOut(t))return cleanCashOutDesc(t.description)||getCsvTransactionCategory(t);
  if(isOpsExpense(t))return String(t.description||'').replace(OPS_PREFIX,'');
  return cleanFirebaseDesc(t.description);
}
function getCsvSourceLabel(t){
  if(t&&t.__firebasePreview)return 'Server Pusat Hari Ini (Live)';
  if(isFirebaseUploaded(t))return 'SERVER LOCK';
  return 'Manual';
}
function buildDailyCsvRows(rows){
  const byDay={};
  rows.forEach(t=>{
    const d=String(t.date||'').slice(0,10)||'-';
    if(!byDay[d])byDay[d]={fbIncome:0,manualIncome:0,businessExpense:0,cashQris:0,cashTabungan:0,cashLainnya:0,opsExpense:0};
    const amount=Number(t.amount||0);
    if(t.type==='income'){
      if(isFirebaseUploaded(t))byDay[d].fbIncome+=amount;
      else byDay[d].manualIncome+=amount;
    }else if(isCashOut(t)){
      const tp=getCashOutType(t);
      if(tp==='qris')byDay[d].cashQris+=amount;
      else if(tp==='tabungan')byDay[d].cashTabungan+=amount;
      else byDay[d].cashLainnya+=amount;
    }else if(t.type==='expense'){
      byDay[d].businessExpense+=amount;
      if(isOpsExpense(t))byDay[d].opsExpense+=amount;
    }
  });
  return Object.keys(byDay).sort().map(d=>{
    const r=byDay[d];
    const totalIncome=r.fbIncome+r.manualIncome;
    const totalCashOut=r.cashQris+r.cashTabungan+r.cashLainnya;
    const saldoBersih=totalIncome-r.businessExpense;
    const laba20=totalIncome*.2;
    const labaBersih20=laba20-r.businessExpense;
    return [d,r.fbIncome,r.manualIncome,totalIncome,r.businessExpense,r.opsExpense,r.cashQris,r.cashTabungan,r.cashLainnya,totalCashOut,saldoBersih,laba20,labaBersih20];
  });
}
function csvCell(value){
  const s=value===null||value===undefined?'':String(value);
  return '"'+s.replace(/"/g,'""')+'"';
}
function csvFromRows(rows){return '\ufeff'+rows.map(r=>r.map(csvCell).join(',')).join('\r\n')}
function downloadCsvReport(){
  const period=getCsvReportPeriod();
  if((period.mode==='range')&&(!period.start||!period.end)){showToast('Pilih tanggal custom dulu');return;}
  const rows=getCsvReportTransactions(period);
  const totalIncome=rows.filter(t=>t.type==='income').reduce((s,t)=>s+Number(t.amount||0),0);
  const firebaseIncome=rows.filter(t=>t.type==='income'&&isFirebaseUploaded(t)).reduce((s,t)=>s+Number(t.amount||0),0);
  const manualIncome=rows.filter(t=>t.type==='income'&&!isFirebaseUploaded(t)).reduce((s,t)=>s+Number(t.amount||0),0);
  const businessExpense=rows.filter(t=>t.type==='expense'&&!isCashOut(t)).reduce((s,t)=>s+Number(t.amount||0),0);
  const opsExpense=rows.filter(t=>isOpsExpense(t)).reduce((s,t)=>s+Number(t.amount||0),0);
  const cashQris=rows.filter(t=>isCashOut(t)&&getCashOutType(t)==='qris').reduce((s,t)=>s+Number(t.amount||0),0);
  const cashTabungan=rows.filter(t=>isCashOut(t)&&getCashOutType(t)==='tabungan').reduce((s,t)=>s+Number(t.amount||0),0);
  const cashLainnya=rows.filter(t=>isCashOut(t)&&!['qris','tabungan'].includes(getCashOutType(t))).reduce((s,t)=>s+Number(t.amount||0),0);
  const totalCashOut=cashQris+cashTabungan+cashLainnya;
  const debtBorrow=rows.filter(isDebtIn).reduce((s,t)=>s+Number(t.amount||0),0);
  const debtPay=rows.filter(isDebtPay).reduce((s,t)=>s+Number(t.amount||0),0);
  const saldoBersih=totalIncome-businessExpense;
  const cashSetelahPindah=saldoBersih-totalCashOut;
  const laba20=totalIncome*.2;
  const labaBersih20=laba20-businessExpense;
  const zakatEstimasi=laba20*.025;
  const printedAt=new Date().toLocaleString('id-ID',{timeZone:'Asia/Jakarta'});
  const csvRows=[
    ['LAPORAN KEUANGAN LENGKAP alfajri'],
    ['Periode',period.label],
    ['Rentang Tanggal',period.mode==='all'?'Semua tanggal':`${period.start} s.d ${period.end}`],
    ['Tanggal Export',printedAt],
    ['Jumlah Transaksi',rows.length],
    [],
    ['RINGKASAN UTAMA'],
    ['Keterangan','Nominal (Rp)'],
    ['Total Pendapatan',Math.round(totalIncome)],
    ['Pendapatan Server Pusat',Math.round(firebaseIncome)],
    ['Pendapatan Manual',Math.round(manualIncome)],
    ['Pengeluaran Bisnis',Math.round(businessExpense)],
    ['Pengeluaran Operasional Toko',Math.round(opsExpense)],
    ['Saldo Bersih Usaha',Math.round(saldoBersih)],
    ['Laba 20% dari Pendapatan',Math.round(laba20)],
    ['Laba Bersih 20% Setelah Pengeluaran',Math.round(labaBersih20)],
    ['Zakat Estimasi 2.5% dari Laba 20%',Math.round(zakatEstimasi)],
    [],
    ['RINGKASAN CASH OUT / PINDAH CASH'],
    ['Keterangan','Nominal (Rp)'],
    ['Cash Out QRIS',Math.round(cashQris)],
    ['Cash Out Tabungan',Math.round(cashTabungan)],
    ['Cash Out Lainnya',Math.round(cashLainnya)],
    ['Total Cash Out',Math.round(totalCashOut)],
    ['Cash Setelah QRIS/Tabungan',Math.round(cashSetelahPindah)],
    [],
    ['RINGKASAN HUTANG / MUTASI CASH'],
    ['Keterangan','Nominal (Rp)'],
    ['Pinjaman Uang',Math.round(debtBorrow)],
    ['Bayar Pokok Hutang',Math.round(debtPay)],
    ['Sisa Hutang Aktif Semua Data',Math.round(getDebtSummary().active)],
    [],
    ['REKAP HARIAN'],
    ['Tanggal','Pendapatan Server Pusat (Rp)','Pendapatan Manual (Rp)','Total Pendapatan (Rp)','Pengeluaran Bisnis (Rp)','Ops Toko (Rp)','Cash Out QRIS (Rp)','Cash Out Tabungan (Rp)','Cash Out Lainnya (Rp)','Total Cash Out (Rp)','Saldo Bersih Usaha (Rp)','Laba 20% (Rp)','Laba Bersih 20% (Rp)'],
    ...buildDailyCsvRows(rows).map(r=>r.map(v=>typeof v==='number'?Math.round(v):v)),
    [],
    ['DETAIL TRANSAKSI'],
    ['No','Tanggal','Deskripsi','Jenis','Kategori','Nominal (Rp)','Sumber','Status'],
    ...rows.map((t,i)=>[
      i+1,
      t.date,
      getCsvTransactionDescription(t),
      t.type==='income'?'Pemasukan':(isCashOut(t)?'Cash Out / Pindah Cash':(isDebtTx(t)?'Hutang / Mutasi Cash':'Pengeluaran')),
      getCsvTransactionCategory(t),
      Math.round(Number(t.amount||0)),
      getCsvSourceLabel(t),
      t.__firebasePreview?'LIVE':(isFirebaseUploaded(t)?'LOCK':((isCashOut(t)||isDebtTx(t))?'TIDAK DIHITUNG PENGELUARAN':'MANUAL'))
    ]),
    [],
    ['RIWAYAT ZAKAT DALAM PERIODE'],
    ['Tanggal','Dari Laba (Rp)','Zakat Dibayar (Rp)','Status','Catatan'],
  ];
  const zakatRows=getZakatHistory().filter(z=>isDateInCsvPeriod(String(z.date||'').slice(0,10),period));
  if(zakatRows.length){
    zakatRows.forEach(z=>csvRows.push([z.date,Math.round(getPaidProfitFromZakatRow(z)),Math.round(Number(z.zakatPaid||0)),z.cancelled?'Batal':'Lunas',z.note||'']));
  }else{
    csvRows.push(['Belum ada riwayat zakat dalam periode','','','','']);
  }
  const safeLabel=(period.mode==='all'?'semua':`${period.start}_sd_${period.end}`).replace(/[^0-9A-Za-z_-]/g,'');
  const filename=`alfajri_laporan_keuangan_${safeLabel}.csv`;
  const blob=new Blob([csvFromRows(csvRows)],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url);
  showToast(`CSV ${filename} didownload`);
}


// =====================================================
// DOWNLOAD LAPORAN BULANAN XLS LENGKAP
// Isi: Ringkasan total, rekap harian, semua transaksi,
// pendapatan, pengeluaran, cash out, dan zakat bulan terkait.
// Cash Out QRIS/Tabungan tetap masuk data, tapi tidak dihitung
// sebagai pengeluaran bisnis sesuai logika aplikasi.
// =====================================================
function getMonthlyReportTargetMonth(){
  const today=getLocalDateString();
  let targetMonth=today.slice(0,7);
  if(currentFilter==='range'){
    const s=$('filterStartDate')?$('filterStartDate').value:'';
    if(s&&s.length>=7)targetMonth=s.slice(0,7);
  }
  return targetMonth;
}
function getMonthlyReportMonthLabel(monthKey){
  const parts=String(monthKey||'').split('-');
  const y=parts[0]||'';
  const m=Number(parts[1]||0);
  const names=['','Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  return `${names[m]||monthKey} ${y}`.trim();
}
function getMonthlyReportRows(monthKey){
  let rows=(getDashboardTransactions()||[]).filter(t=>String(t.date||'').startsWith(monthKey));
  const today=getLocalDateString();
  const liveToday=getTodayFirebasePreviewTransaction();
  if(liveToday&&String(liveToday.date||'').startsWith(monthKey)){
    rows=rows.filter(t=>!(t.date===today&&isFirebaseUploaded(t)));
    rows.push({...liveToday,description:'[SERVERPUSAT:'+today+'] Omset Server Pusat Hari Ini'});
  }
  return rows.slice().sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))||(Number(a.id)||0)-(Number(b.id)||0));
}
function getMonthlyReportCategory(t){
  if(isDebtIn(t))return 'Pinjam Uang';
  if(isDebtPay(t))return 'Bayar Pokok Hutang';
  if(isCashDrawerAdjustmentTx(t))return t.type==='income'?CASH_DRAWER_PLUS_CATEGORY_NAME:CASH_DRAWER_MINUS_CATEGORY_NAME;
  if(t.type==='income')return isFirebaseUploaded(t)?(t.__firebasePreview?'Pendapatan Server Pusat Live':'Pendapatan SERVER LOCK'):'Pendapatan Manual';
  if(isCashOut(t)){
    const type=getCashOutType(t);
    if(type==='qris')return 'Cash Out QRIS';
    if(type==='tabungan')return 'Cash Out Tabungan';
    return 'Cash Out Lainnya';
  }
  if(t.type==='expense')return getExpenseCategoryName(t);
  return 'Pengeluaran Bisnis';
}
function getMonthlyReportDesc(t){
  if(isDebtTx(t))return cleanDebtDesc(t.description)||getMonthlyReportCategory(t);
  if(isCashDrawerAdjustmentTx(t))return cleanCashDrawerAdjustmentDesc(t.description)||getMonthlyReportCategory(t);
  if(isCashOut(t))return cleanCashOutDesc(t.description)||getMonthlyReportCategory(t);
  if(isOpsExpense(t))return String(t.description||'').replace(OPS_PREFIX,'');
  return cleanFirebaseDesc(t.description);
}
function getMonthlyReportSource(t){
  if(t&&t.__firebasePreview)return 'Server Pusat Hari Ini (Live)';
  if(isFirebaseUploaded(t))return 'SERVER LOCK / Supabase';
  return 'Manual';
}
function makeSheetFromAoa(data,cols,currencyCols,autoFilterRef){
  const ws=XLSX.utils.aoa_to_sheet(data);
  if(cols)ws['!cols']=cols.map(w=>({wch:w}));
  if(autoFilterRef)ws['!autofilter']={ref:autoFilterRef};
  if(ws['!ref']){
    const range=XLSX.utils.decode_range(ws['!ref']);
    for(let R=range.s.r;R<=range.e.r;R++){
      for(let C=range.s.c;C<=range.e.c;C++){
        const addr=XLSX.utils.encode_cell({r:R,c:C});
        const cell=ws[addr];
        if(!cell)continue;
        if(typeof cell.v==='number'){
          if(currencyCols&&currencyCols.includes(C))cell.z='#,##0';
          else cell.z='0';
        }
      }
    }
  }
  return ws;
}
function sumAmount(rows){return rows.reduce((s,t)=>s+Number(t.amount||0),0)}
function buildMonthlyDailyRows(rows){
  const byDay={};
  rows.forEach(t=>{
    const d=String(t.date||'').slice(0,10)||'-';
    if(!byDay[d])byDay[d]={fbLock:0,fbLive:0,manualIncome:0,ops:0,expenseOther:0,cashQris:0,cashTabungan:0,cashLainnya:0,count:0};
    byDay[d].count++;
    const amount=Number(t.amount||0);
    if(t.type==='income'){
      if(t.__firebasePreview)byDay[d].fbLive+=amount;
      else if(isFirebaseUploaded(t))byDay[d].fbLock+=amount;
      else byDay[d].manualIncome+=amount;
    }else if(isCashOut(t)){
      const type=getCashOutType(t);
      if(type==='qris')byDay[d].cashQris+=amount;
      else if(type==='tabungan')byDay[d].cashTabungan+=amount;
      else byDay[d].cashLainnya+=amount;
    }else if(isOpsExpense(t)){
      byDay[d].ops+=amount;
    }else if(t.type==='expense'){
      byDay[d].expenseOther+=amount;
    }
  });
  return Object.keys(byDay).sort().map(d=>{
    const r=byDay[d];
    const totalIncome=r.fbLock+r.fbLive+r.manualIncome;
    const totalExpense=r.ops+r.expenseOther;
    const totalCashOut=r.cashQris+r.cashTabungan+r.cashLainnya;
    const saldoBersih=totalIncome-totalExpense;
    const cashSetelahPindah=saldoBersih-totalCashOut;
    const laba20=totalIncome*.2;
    const labaBersih20=laba20-totalExpense;
    return [d,r.fbLock,r.fbLive,r.manualIncome,totalIncome,r.ops,r.expenseOther,totalExpense,r.cashQris,r.cashTabungan,r.cashLainnya,totalCashOut,saldoBersih,cashSetelahPindah,laba20,labaBersih20,r.count];
  });
}
// DOWNLOAD DETAIL KATEGORI PENGELUARAN XLS
function downloadExpenseByCategoryDetailXls(){
  if(typeof XLSX==='undefined'){showToast('Library XLS belum siap, coba lagi');return;}
  const p=getFinanceReportPeriod();
  const rows=getFinanceReportRows();
  const expenses=rows.filter(t=>t.type==='expense'&&!isCashOut(t));
  if(expenses.length===0){
    showToast('Tidak ada pengeluaran pada periode ini');
    return;
  }
  
  const byCat={};
  expenses.forEach(t=>{
    const nm=getExpenseCategoryName(t);
    if(!byCat[nm])byCat[nm]=[];
    byCat[nm].push(t);
  });
  
  const data=[];
  data.push(['LAPORAN PENGELUARAN PER KATEGORI']);
  data.push(['Periode:', p.mode==='range'?`${p.start||'-'} s.d ${p.end||'-'}`:p.label]);
  data.push(['Waktu Download:', typeof getWibDateTimeString==='function'?getWibDateTimeString():new Date().toLocaleString()]);
  data.push([]);
  
  data.push(['Kategori', 'Detail', 'Nominal (Rp)']);
  
  let grandTotal=0;
  
  Object.keys(byCat).sort().forEach(cat=>{
    let catTotal=0;
    byCat[cat].sort((a,b)=>String(a.date).localeCompare(String(b.date))).forEach((t)=>{
      const amt=Math.round(Number(t.amount||0));
      catTotal+=amt;
      data.push([cat, getMonthlyReportDesc(t), amt]);
    });
    data.push(['SUBTOTAL '+cat.toUpperCase(), '', catTotal]);
    data.push(['','','']); // Baris kosong supaya rapih per kategori
    grandTotal+=catTotal;
  });
  
  data.push(['GRAND TOTAL', '', grandTotal]);
  
  const ws=makeSheetFromAoa(data,[25,55,20],[2],null);
  
  if(!ws['!merges']) ws['!merges']=[];
  ws['!merges'].push({s:{r:0,c:0},e:{r:0,c:2}});
  ws['!merges'].push({s:{r:1,c:1},e:{r:1,c:2}});
  ws['!merges'].push({s:{r:2,c:1},e:{r:2,c:2}});
  
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'Detail Kategori');
  
  const safeTitle=(p.mode==='range'?`${p.start||'x'}_sd_${p.end||'y'}`:p.label).replace(/[^0-9A-Za-z_-]/g,'_');
  const filename=`alfajri_detail_kategori_${safeTitle}.xlsx`;
  XLSX.writeFile(wb,filename,{bookType:'xlsx'});
  showToast(`Laporan Detail Kategori XLS didownload`);
}

function downloadMonthlyFinanceReport(){
  if(typeof XLSX==='undefined'){showToast('Library XLS belum siap, coba lagi');return;}

  const targetMonth=getMonthlyReportTargetMonth();
  const monthLabel=getMonthlyReportMonthLabel(targetMonth);
  const startDate=`${targetMonth}-01`;
  const endDate=getMonthEndDate(targetMonth);
  const rows=getMonthlyReportRows(targetMonth);

  const incomeRows=rows.filter(t=>t.type==='income');
  const firebaseLockIncomeRows=rows.filter(t=>t.type==='income'&&isFirebaseUploaded(t)&&!t.__firebasePreview);
  const firebaseLiveIncomeRows=rows.filter(t=>t.type==='income'&&t.__firebasePreview);
  const manualIncomeRows=rows.filter(t=>t.type==='income'&&!isFirebaseUploaded(t));
  const businessExpenseRows=rows.filter(t=>t.type==='expense'&&!isCashOut(t));
  const opsRows=rows.filter(t=>isOpsExpense(t));
  const otherExpenseRows=businessExpenseRows.filter(t=>!isOpsExpense(t));
  const cashOutRows=rows.filter(t=>isCashOut(t));
  const cashQrisRows=cashOutRows.filter(t=>getCashOutType(t)==='qris');
  const cashTabunganRows=cashOutRows.filter(t=>getCashOutType(t)==='tabungan');
  const cashLainnyaRows=cashOutRows.filter(t=>!['qris','tabungan'].includes(getCashOutType(t)));
  const debtRows=rows.filter(isDebtTx);
  const debtBorrowRows=debtRows.filter(isDebtIn);
  const debtPayRows=debtRows.filter(isDebtPay);
  const zakatRows=getZakatHistory().filter(z=>String(z.date||'').slice(0,7)===targetMonth);

  const totalIncome=sumAmount(incomeRows);
  const firebaseLockIncome=sumAmount(firebaseLockIncomeRows);
  const firebaseLiveIncome=sumAmount(firebaseLiveIncomeRows);
  const manualIncome=sumAmount(manualIncomeRows);
  const totalExpense=sumAmount(businessExpenseRows);
  const opsExpense=sumAmount(opsRows);
  const otherExpense=sumAmount(otherExpenseRows);
  const cashQris=sumAmount(cashQrisRows);
  const cashTabungan=sumAmount(cashTabunganRows);
  const cashLainnya=sumAmount(cashLainnyaRows);
  const totalCashOut=cashQris+cashTabungan+cashLainnya;
  const debtBorrow=sumAmount(debtBorrowRows);
  const debtPay=sumAmount(debtPayRows);
  const debtActive=getDebtSummary().active;
  const saldoBersih=totalIncome-totalExpense;
  const cashSetelahPindah=saldoBersih-totalCashOut;
  const laba20=totalIncome*.2;
  const labaBersih20=laba20-totalExpense;
  const zakatEstimasi=laba20*.025;
  const zakatDibayar=zakatRows.filter(z=>!z.cancelled).reduce((s,z)=>s+Number(z.zakatPaid||0),0);
  const printedAt=new Date().toLocaleString('id-ID',{timeZone:'Asia/Jakarta'});

  const wb=XLSX.utils.book_new();
  wb.Props={Title:`Laporan Bulanan alfajri ${monthLabel}`,Subject:'Laporan Keuangan Bulanan',Author:'alfajri Finance',CreatedDate:new Date()};

  const summaryData=[
    ['LAPORAN KEUANGAN BULANAN ALFAJRI'],
    ['Bulan',monthLabel],
    ['Periode',`${startDate} s.d ${endDate}`],
    ['Tanggal Download',printedAt],
    ['Total Baris Data',rows.length],
    [],
    ['RINGKASAN TOTAL BULANAN'],
    ['Keterangan','Nominal (Rp)','Catatan'],
    ['Pendapatan Bulanan',totalIncome,'Server Pusat + manual'],
    ['Pendapatan SERVER LOCK',firebaseLockIncome,'Data Server Pusat yang sudah sync ke Supabase'],
    ['Pendapatan Server Pusat Hari Ini Live',firebaseLiveIncome,'Masuk agar omset hari ini tidak kosong / tidak tertinggal'],
    ['Pendapatan Manual',manualIncome,'Input manual'],
    ['Pengeluaran Bulanan',totalExpense,'Tidak termasuk Cash Out QRIS/Tabungan'],
    ['Operasional Toko',opsExpense,'Termasuk di Pengeluaran Bulanan'],
    ['Pengeluaran Lainnya',otherExpense,'Pengeluaran manual selain operasional'],
    ['Saldo Bersih Bulanan',saldoBersih,'Pendapatan - Pengeluaran'],
    ['Laba 20% dari Pendapatan',laba20,'20% × Pendapatan Bulanan'],
    ['Laba Bersih 20% Setelah Pengeluaran',labaBersih20,'Laba 20% - Pengeluaran Bulanan'],
    ['Zakat Estimasi',zakatEstimasi,'2.5% × Laba 20%'],
    ['Zakat Dibayar Bulan Ini',zakatDibayar,'Hanya riwayat zakat yang tidak batal'],
    [],
    ['RINGKASAN CASH OUT / PINDAH CASH'],
    ['Keterangan','Nominal (Rp)','Catatan'],
    ['Cash Out QRIS',cashQris,'Tidak dihitung sebagai pengeluaran bisnis'],
    ['Cash Out Tabungan',cashTabungan,'Tidak dihitung sebagai pengeluaran bisnis'],
    ['Cash Out Lainnya',cashLainnya,'Tidak dihitung sebagai pengeluaran bisnis'],
    ['Total Cash Out',totalCashOut,'QRIS + Tabungan + Lainnya'],
    ['Cash Setelah Pindah QRIS/Tabungan',cashSetelahPindah,'Saldo Bersih - Total Cash Out'],
    [],
    ['RINGKASAN HUTANG / MUTASI CASH'],
    ['Keterangan','Nominal (Rp)','Catatan'],
    ['Pinjaman Uang Bulan Ini',debtBorrow,'Menambah cash, tidak masuk pendapatan'],
    ['Bayar Pokok Hutang Bulan Ini',debtPay,'Mengurangi cash, tidak masuk pengeluaran'],
    ['Sisa Hutang Aktif Saat Export',debtActive,'Total pinjam semua data - bayar pokok semua data'],
    [],
    ['JUMLAH DATA'],
    ['Jenis Data','Jumlah Baris','Total (Rp)'],
    ['Pendapatan',incomeRows.length,totalIncome],
    ['Pengeluaran Bisnis',businessExpenseRows.length,totalExpense],
    ['Cash Out',cashOutRows.length,totalCashOut],
    ['Hutang / Mutasi Cash',debtRows.length,debtBorrow-debtPay],
    ['Zakat',zakatRows.length,zakatDibayar],
    ['Semua Transaksi',rows.length,'']
  ];
  const wsSummary=makeSheetFromAoa(summaryData,[38,22,48],[1,2],null);
  wsSummary['!merges']=[{s:{r:0,c:0},e:{r:0,c:2}}];
  XLSX.utils.book_append_sheet(wb,wsSummary,'Ringkasan');

  const dailyRows=buildMonthlyDailyRows(rows);
  const dailyHeader=[['Tanggal','SERVER LOCK (Rp)','Server Pusat Live (Rp)','Manual (Rp)','Total Pendapatan (Rp)','Ops Toko (Rp)','Pengeluaran Lainnya (Rp)','Total Pengeluaran (Rp)','QRIS (Rp)','Tabungan (Rp)','Cash Out Lainnya (Rp)','Total Cash Out (Rp)','Saldo Bersih (Rp)','Cash Setelah Pindah (Rp)','Laba 20% (Rp)','Laba Bersih 20% (Rp)','Jumlah Data']];
  const dailyTotals=['TOTAL'];
  for(let c=1;c<17;c++)dailyTotals[c]=dailyRows.reduce((ss,r)=>ss+Number(r[c]||0),0);
  const dailyData=[...dailyHeader,...dailyRows,[],dailyTotals];
  const wsDaily=makeSheetFromAoa(dailyData,[13,18,18,16,21,16,23,22,14,16,22,19,18,23,17,22,12],[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15],'A1:Q1');
  XLSX.utils.book_append_sheet(wb,wsDaily,'Rekap Harian');

  const detailData=[
    ['No','Tanggal','Deskripsi','Jenis','Kategori','Sumber','Nominal (Rp)','Status / Catatan'],
    ...(rows.length?rows.map((t,i)=>[
      i+1,
      t.date,
      getMonthlyReportDesc(t),
      t.type==='income'?'Pemasukan':(isCashOut(t)?'Cash Out / Pindah Cash':(isDebtTx(t)?'Hutang / Mutasi Cash':'Pengeluaran')),
      getMonthlyReportCategory(t),
      getMonthlyReportSource(t),
      Math.round(Number(t.amount||0)),
      t.__firebasePreview?'LIVE SERVER HARI INI':(isFirebaseUploaded(t)?'SERVER LOCK':((isCashOut(t)||isDebtTx(t))?'TIDAK DIHITUNG PENGELUARAN BISNIS':'MANUAL'))
    ]):[['Belum ada data bulan ini','','','','','','','']]),
    [],
    ['','','','','','TOTAL PENDAPATAN',totalIncome,''],
    ['','','','','','TOTAL PENGELUARAN',totalExpense,''],
    ['','','','','','TOTAL CASH OUT',totalCashOut,''],
    ['','','','','','SALDO BERSIH',saldoBersih,'']
  ];
  const wsDetail=makeSheetFromAoa(detailData,[6,13,42,22,24,24,18,34],[6],'A1:H1');
  XLSX.utils.book_append_sheet(wb,wsDetail,'Semua Transaksi');

  const pendapatanData=[
    ['No','Tanggal','Deskripsi','Kategori','Sumber','Nominal (Rp)'],
    ...(incomeRows.length?incomeRows.map((t,i)=>[i+1,t.date,getMonthlyReportDesc(t),getMonthlyReportCategory(t),getMonthlyReportSource(t),Math.round(Number(t.amount||0))]):[['Belum ada pendapatan bulan ini','','','','','']]),
    [],
    ['','','','TOTAL SERVER LOCK','',firebaseLockIncome],
    ['','','','TOTAL SERVER LIVE','',firebaseLiveIncome],
    ['','','','TOTAL MANUAL','',manualIncome],
    ['','','','TOTAL PENDAPATAN','',totalIncome]
  ];
  const wsIncome=makeSheetFromAoa(pendapatanData,[6,13,42,26,24,18],[5],'A1:F1');
  XLSX.utils.book_append_sheet(wb,wsIncome,'Pendapatan');

  const pengeluaranData=[
    ['No','Tanggal','Deskripsi','Kategori','Sumber','Nominal (Rp)'],
    ...(businessExpenseRows.length?businessExpenseRows.map((t,i)=>[i+1,t.date,getMonthlyReportDesc(t),getMonthlyReportCategory(t),getMonthlyReportSource(t),Math.round(Number(t.amount||0))]):[['Belum ada pengeluaran bulan ini','','','','','']]),
    [],
    ['','','','TOTAL OPERASIONAL TOKO','',opsExpense],
    ['','','','TOTAL PENGELUARAN LAINNYA','',otherExpense],
    ['','','','TOTAL PENGELUARAN BULANAN','',totalExpense]
  ];
  const wsExpense=makeSheetFromAoa(pengeluaranData,[6,13,42,28,24,18],[5],'A1:F1');
  XLSX.utils.book_append_sheet(wb,wsExpense,'Pengeluaran');


  const expenseByCategory={};
  businessExpenseRows.forEach(t=>{const nm=getExpenseCategoryName(t);expenseByCategory[nm]=(expenseByCategory[nm]||0)+Number(t.amount||0)});
  const categoryData=[
    ['No','Kategori','Total (Rp)','Persentase dari Pengeluaran'],
    ...Object.entries(expenseByCategory).sort((a,b)=>b[1]-a[1]).map(([name,total],i)=>[i+1,name,Math.round(total),totalExpense?Math.round((total/totalExpense)*100)+'%':'0%']),
    [],
    ['','','TOTAL',Math.round(totalExpense)]
  ];
  const wsCategory=makeSheetFromAoa(categoryData,[6,30,18,26],[2,3],'A1:D1');
  XLSX.utils.book_append_sheet(wb,wsCategory,'Kategori Pengeluaran');

  const cashOutData=[
    ['No','Tanggal','Keterangan','Jenis Cash Out','Sumber','Nominal (Rp)','Catatan'],
    ...(cashOutRows.length?cashOutRows.map((t,i)=>[i+1,t.date,getMonthlyReportDesc(t),getMonthlyReportCategory(t),getMonthlyReportSource(t),Math.round(Number(t.amount||0)),'Tidak dihitung pengeluaran bisnis']):[['Belum ada cash out bulan ini','','','','','','']]),
    [],
    ['','','','TOTAL QRIS','',cashQris,''],
    ['','','','TOTAL TABUNGAN','',cashTabungan,''],
    ['','','','TOTAL LAINNYA','',cashLainnya,''],
    ['','','','TOTAL CASH OUT','',totalCashOut,'']
  ];
  const wsCash=makeSheetFromAoa(cashOutData,[6,13,38,24,24,18,34],[5],'A1:G1');
  XLSX.utils.book_append_sheet(wb,wsCash,'Cash Out');

  const debtData=[
    ['No','Tanggal','Keterangan','Jenis','Nominal (Rp)','Catatan'],
    ...(debtRows.length?debtRows.map((t,i)=>[i+1,t.date,getMonthlyReportDesc(t),isDebtIn(t)?'Pinjam Uang':'Bayar Pokok Hutang',Math.round(Number(t.amount||0)),'Tidak dihitung pendapatan / pengeluaran / laba / zakat']):[['Belum ada hutang bulan ini','','','','','']]),
    [],
    ['','','TOTAL PINJAM','',debtBorrow,''],
    ['','','TOTAL BAYAR POKOK','',debtPay,''],
    ['','','SISA HUTANG AKTIF','',debtActive,'']
  ];
  const wsDebt=makeSheetFromAoa(debtData,[6,13,40,24,18,44],[4],'A1:F1');
  XLSX.utils.book_append_sheet(wb,wsDebt,'Hutang');

  const zakatData=[
    ['No','Tanggal','Dari Laba (Rp)','Zakat Dibayar (Rp)','Status','Catatan'],
    ...(zakatRows.length?zakatRows.map((z,i)=>[i+1,z.date,Math.round(getPaidProfitFromZakatRow(z)),Math.round(Number(z.zakatPaid||0)),z.cancelled?'Batal':'Lunas',z.note||'']):[['Belum ada riwayat zakat bulan ini','','','','','']]),
    [],
    ['','','TOTAL ZAKAT DIBAYAR',zakatDibayar,'',''],
    ['','','ZAKAT ESTIMASI BULAN INI',zakatEstimasi,'','']
  ];
  const wsZakat=makeSheetFromAoa(zakatData,[6,22,20,20,14,48],[2,3],'A1:F1');
  XLSX.utils.book_append_sheet(wb,wsZakat,'Zakat');

  const safeMonth=targetMonth.replace(/[^0-9A-Za-z_-]/g,'');
  const filename=`alfajri_laporan_bulanan_${safeMonth}.xlsx`;
  XLSX.writeFile(wb,filename,{bookType:'xlsx'});
  showToast(`Laporan XLS ${monthLabel} didownload`);
}

let financeRealtimeRefreshTimer=0;
function scheduleFinanceRealtimeRefresh(){
  clearTimeout(financeRealtimeRefreshTimer);
  financeRealtimeRefreshTimer=setTimeout(async()=>{
    try{
      await loadTransactions();
      try{await loadCashDrawerAudits();}catch(e){}
      try{await loadExpenseCategories();}catch(e){}
      render();
      renderCashFisik();
      renderGoldSection();
    }catch(e){console.warn('Refresh finance realtime gagal:',e)}
  },650);
}

/* ===== Fitur Ganti Font Aplikasi ===== */
const FONT_MODES = [
  { key: 'custom',   label: 'Aa Kids',    toastName: 'Kids Word' },
  { key: 'opensans', label: 'Aa OpenSans',toastName: 'Open Sans' },
  { key: 'misans',   label: 'Aa MiSans',  toastName: 'MI Sans' },
  { key: 'system',   label: 'Aa HP',      toastName: 'Font HP' }
];
function applyFontMode(){
  const mode = localStorage.getItem('appFontMode') || 'custom';
  document.body.classList.remove('font-mode-system','font-mode-opensans','font-mode-misans');
  if(mode === 'system') document.body.classList.add('font-mode-system');
  if(mode === 'opensans') document.body.classList.add('font-mode-opensans');
  if(mode === 'misans') document.body.classList.add('font-mode-misans');
  const btn = document.getElementById('fontSwitchBtn');
  const found = FONT_MODES.find(m => m.key === mode) || FONT_MODES[0];
  if(btn) btn.textContent = found.label;
}
function toggleAppFont(){
  const current = localStorage.getItem('appFontMode') || 'custom';
  const idx = FONT_MODES.findIndex(m => m.key === current);
  const next = FONT_MODES[(idx + 1) % FONT_MODES.length];
  localStorage.setItem('appFontMode', next.key);
  applyFontMode();
  showToast('Font diganti ke ' + next.toastName);
}
applyFontMode();

async function initApp(){try{if(!initSupabase())return;
  // Tampilkan loading saat fetch Supabase
  const nb=$('netBalance');if(nb){nb.innerText='Memuat...';nb.style.opacity='0.5';}
  const st=$('statusText'),sb=$('statusBadge');
  if(st)st.innerText='Koneksi...';
  if(sb){sb.style.background='#e0f2fe';sb.style.color='#0369a1';}
  initFirebase();
  // Tunggu Supabase + Server Pusat keduanya siap sebelum render pertama
  const SERVER_TIMEOUT=4000; // max tunggu 4 detik
  await loadTransactions();
  try{await loadCashDrawerAudits();}catch(e){console.warn('Tabel audit cash fisik belum siap:',e)}
  restoreGoldPriceCache();
  try{await loadExpenseCategories();await ensureDefaultExpenseCategories();await migrateLegacyExpenseCategories();}catch(e){console.warn('Kategori belum siap:',e)}
  try{await loadSalaryTargets();}catch(e){console.warn('Salary targets gagal diload',e)}
  await loadZakatHistory();
  await loadReceivables();
  if(firebaseDb){
    // Tunggu snapshot pertama Server Pusat hari ini. Panel tanggal lain baru dibaca saat halaman Server dibuka.
    await Promise.race([
      startTodayFirebaseWatch(),
      new Promise(r=>setTimeout(r,SERVER_TIMEOUT))
    ]);
    if(currentPage==='firebase')startFirebaseWatch(firebaseUploadDate||getLocalDateString());
    else{
      firebaseIncomeRows=[...(todayFirebaseIncomeRows||[])];
      firebaseIncomeTotal=Number(todayFirebaseIncomeTotal||0);
    }
  }
  try{await runDailyAutoDebit();await loadTransactions();}catch(e){console.warn('Auto Debet Harian gagal jalan:',e)}
  // Semua data siap — render sekali, langsung akurat
  if(nb)nb.style.opacity='1';
  if(st)st.innerText='Aman';
  if(sb){sb.style.background='';sb.style.color='';}
  render();renderCashFisik();renderGoldSection();
  refreshGoldPrice(false);
  // Supabase Realtime: auto-refresh saat ada perubahan transaksi
  try{
    supabaseClient.channel('rh-tx-realtime')
      .on('postgres_changes',{event:'*',schema:'public',table:'transactions',filter:`owner_id=eq.${OWNER_ID}`},async()=>{
        scheduleFinanceRealtimeRefresh();
      }).subscribe();
    supabaseClient.channel('rh-cash-drawer-realtime')
      .on('postgres_changes',{event:'*',schema:'public',table:CASH_DRAWER_TABLE,filter:`owner_id=eq.${OWNER_ID}`},async()=>{
        try{await loadCashDrawerAudits();render();renderCashFisik();renderCashDrawerPage();}catch(e){console.warn('Realtime audit cash fisik gagal:',e)}
      }).subscribe();
  }catch(e){console.warn('Realtime tidak aktif:',e);}
  showToast('Supabase tersambung')}catch(e){console.error(e);showToast('Gagal konek: '+e.message,6000)}}initApp();

// ============================================================
// GLOBAL MODAL KEYBOARD FIX (addition, tidak mengubah logic lama)
// Tujuan: semua popup/modal (bukan cuma transactionModal) ikut
// menyesuaikan posisi & tinggi saat keyboard Android muncul,
// supaya input yang sedang difokus tidak ketutup keyboard.
// ============================================================
let globalKeyboardFixReady=false,globalKeyboardTimer=null;
// State anti-goyang: nyimpen nilai terakhir yang benar-benar dipakai supaya
// getaran kecil (mis. bar prediksi angka Gboard naik-turun beberapa px saat
// mengetik) tidak memicu reposisi + scroll ulang tiap event.
let globalKbLastModal=null,globalKbLastVisibleH=null,globalKbLastOffsetTop=null,globalKbLifted=false,globalKbScrolledEl=null;
function getOpenModalEl(){
  const modals=document.querySelectorAll('.modal');
  for(const m of modals){ if(!m.classList.contains('hidden')) return m; }
  return null;
}
function resetGlobalKeyboardState(){
  globalKbLastModal=null;globalKbLastVisibleH=null;globalKbLastOffsetTop=null;
  globalKbLifted=false;globalKbScrolledEl=null;
}
function adjustAnyModalForKeyboard(){
  const modal=getOpenModalEl();
  if(!modal){ resetGlobalKeyboardState(); return; }
  // Modal transactionModal sudah punya handler khusus sendiri.
  if(modal.id==='transactionModal') return;
  if(modal!==globalKbLastModal) resetGlobalKeyboardState();
  const vv=window.visualViewport;
  const layoutH=window.innerHeight||document.documentElement.clientHeight||screen.height||0;
  const visibleH=Math.max(280,Math.floor(vv&&vv.height?vv.height:layoutH));
  const offsetTop=Math.max(0,Math.floor(vv&&typeof vv.offsetTop==='number'?vv.offsetTop:0));
  const hiddenByKeyboard=Math.max(0,Math.floor(layoutH-visibleH-offsetTop));
  const activeInModal=modal.contains(document.activeElement);
  const mustLift=activeInModal&&hiddenByKeyboard>70;
  // Toleransi getaran: kalau statusnya sama (masih terangkat/masih normal)
  // dan perubahan tinggi/posisi kecil (<24px), abaikan — ini cuma noise
  // dari keyboard, bukan perubahan beneran, jadi jangan reposisi lagi.
  const SHAKE_TOLERANCE=24;
  if(mustLift===globalKbLifted&&globalKbLastVisibleH!=null){
    const dH=Math.abs(visibleH-globalKbLastVisibleH);
    const dO=Math.abs(offsetTop-globalKbLastOffsetTop);
    if(dH<SHAKE_TOLERANCE&&dO<SHAKE_TOLERANCE) return;
  }
  globalKbLastModal=modal;globalKbLastVisibleH=visibleH;globalKbLastOffsetTop=offsetTop;globalKbLifted=mustLift;
  if(mustLift){
    modal.style.height=visibleH+'px';
    modal.style.top=offsetTop+'px';
    modal.style.bottom='auto';
    modal.style.alignItems='flex-start';
    const box=modal.querySelector('.box');
    // Sisakan jarak di atas & bawah (bukan cuma atas) supaya box tidak
    // mepet ke tepi container — kalau mepet, sudut rounded di bawah
    // kelihatan lancip/kepotong walau border-radius CSS-nya tetap ada.
    if(box){ box.style.maxHeight=(visibleH-32)+'px'; box.style.marginTop='8px'; box.style.marginBottom='8px'; }
    const active=document.activeElement;
    // Scroll ke posisi input cuma sekali per fokus (bukan tiap event resize),
    // supaya tidak ada "loncatan" berulang saat user sedang mengetik.
    if(active&&modal.contains(active)&&globalKbScrolledEl!==active){
      globalKbScrolledEl=active;
      setTimeout(()=>{try{active.scrollIntoView({block:'center',inline:'nearest'});}catch(e){}},60);
    }
  }else{
    globalKbScrolledEl=null;
    modal.style.removeProperty('height');
    modal.style.removeProperty('top');
    modal.style.removeProperty('bottom');
    modal.style.removeProperty('align-items');
    const box=modal.querySelector('.box');
    if(box){ box.style.removeProperty('max-height'); box.style.removeProperty('margin-top'); box.style.removeProperty('margin-bottom'); }
  }
}
function bindGlobalKeyboardFix(){
  if(globalKeyboardFixReady) return;
  globalKeyboardFixReady=true;
  const schedule=()=>{
    if(globalKeyboardTimer) clearTimeout(globalKeyboardTimer);
    if(window.requestAnimationFrame) requestAnimationFrame(adjustAnyModalForKeyboard);
    globalKeyboardTimer=setTimeout(adjustAnyModalForKeyboard,60);
  };
  try{window.addEventListener('resize',schedule,{passive:true});}catch(e){window.addEventListener('resize',schedule);}
  try{window.addEventListener('orientationchange',schedule,{passive:true});}catch(e){window.addEventListener('orientationchange',schedule);}
  if(window.visualViewport){
    try{window.visualViewport.addEventListener('resize',schedule,{passive:true});}catch(e){window.visualViewport.addEventListener('resize',schedule);}
    try{window.visualViewport.addEventListener('scroll',schedule,{passive:true});}catch(e){window.visualViewport.addEventListener('scroll',schedule);}
  }
  document.addEventListener('focusin',e=>{ if(e.target.closest&&e.target.closest('.modal')) schedule(); },true);
  document.addEventListener('focusout',e=>{ if(e.target.closest&&e.target.closest('.modal')) setTimeout(adjustAnyModalForKeyboard,180); },true);
}
bindGlobalKeyboardFix();

// === PIUTANG LOGIC ===
function renderPiutangPage() {
  const unpaid = receivables.filter(r => r.status !== 'paid');
  const total = unpaid.reduce((s, r) => s + (Number(r.amount) - Number(r.paid_amount)), 0);
  if ($('piutangTotalAmount')) $('piutangTotalAmount').innerText = formatRupiah(total);
  if ($('piutangListCount')) $('piutangListCount').innerText = `${unpaid.length} data aktif`;
  const list = $('piutangList');
  if (!list) return;
  if (!receivables.length) {
    list.innerHTML = '<div class="empty">Belum ada data piutang tersimpan</div>';
    return;
  }
  list.innerHTML = receivables.map(r => {
    const isPaid = r.status === 'paid';
    const sisa = Number(r.amount) - Number(r.paid_amount);
    const pct = Math.min(100, Math.round((Number(r.paid_amount) / Number(r.amount)) * 100)) || 0;
    return `
      <div class="card" style="margin-bottom:8px; opacity:${isPaid ? 0.6 : 1}">
        <div style="display:flex; justify-content:space-between; align-items:flex-start">
          <div>
            <b style="font-size:15px; color:var(--ink); text-transform:capitalize">${escapeHtml(r.name)}</b>
            ${r.description ? `<div class="small" style="margin-top:2px; font-weight:700">${escapeHtml(r.description)}</div>` : ''}
          </div>
          <div style="text-align:right">
            <div style="font-size:10px; color:var(--ink2); font-weight:800; text-transform:uppercase">Total Pinjaman</div>
            <b class="num" style="font-size:15px; color:#e11d48">${formatRupiah(r.amount)}</b>
          </div>
        </div>
        <div style="margin-top:12px; background:#f1f5f9; border-radius:4px; padding:8px 10px">
          <div style="display:flex; justify-content:space-between; margin-bottom:4px; font-size:11px; font-weight:800">
            <span style="color:var(--green)">Terbayar: ${formatRupiah(r.paid_amount)}</span>
            <span style="color:#e11d48">Sisa: ${formatRupiah(sisa)}</span>
          </div>
          <div class="progressbar" style="height:6px; background:#cbd5e1"><span style="width:${pct}%; background:var(--green)"></span></div>
        </div>
        ${!isPaid ? `
        <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:10px">
          <button class="btn secondary" style="font-size:12px; padding:6px 12px" onclick="deletePiutang(${r.id})">Hapus</button>
          <button class="btn" style="background:var(--green); font-size:12px; padding:6px 12px" onclick="openPiutangPaymentModal(${r.id})">Catat Bayar</button>
        </div>` : ''}
        ${isPaid ? `<div class="small" style="margin-top:8px; text-align:right; color:var(--green); font-weight:800">LUNAS ✅</div>` : ''}
      </div>
    `;
  }).join('');
}

function openPiutangModal() {
  $('piutangName').value = '';
  $('piutangDesc').value = '';
  $('piutangAmount').value = '';
  $('piutangAmountPreview').innerText = '';
  $('piutangModal').classList.remove('hidden');
}
function closePiutangModal() { $('piutangModal').classList.add('hidden'); }
function handlePiutangPreview(input) {
  const val = Number(input.value) || 0;
  $('piutangAmountPreview').innerText = val > 0 ? formatRupiah(val) : '';
}
async function savePiutang() {
  const name = $('piutangName').value.trim();
  const desc = $('piutangDesc').value.trim();
  const amount = Number($('piutangAmount').value) || 0;
  if (!name || amount <= 0) { showToast('Nama dan nominal wajib diisi'); return; }
  
  const payload = { owner_id: OWNER_ID, name, description: desc, amount, paid_amount: 0, status: 'unpaid', is_auto: false };
  const { data, error } = await supabaseClient.from('receivables').insert(payload).select('id').single();
  if (error) { showToast('Gagal simpan piutang'); return; }
  
  // Create expense transaction
  const txDesc = `[PIUTANG] ${name}${desc ? ' - ' + desc : ''}`;
  const cat = getCategoryByName('Piutang') || getCategoryByName('Lainnya') || expenseCategories[0];
  const txPayload = { id: Date.now(), owner_id: OWNER_ID, date: getLocalDateString(), description: txDesc, amount, type: 'expense', category_id: cat ? Number(cat.id) : 0, category_name: cat ? cat.name : 'Piutang' };
  await saveTransaction(txPayload);
  
  showToast('Piutang dicatat & saldo berkurang');
  closePiutangModal();
  await Promise.all([loadReceivables(), loadTransactions()]);
  render();
  renderPiutangPage();
}
async function deletePiutang(id) {
  const r = receivables.find(x => x.id === id);
  if (!r) return;
  if (!confirm(`Hapus data piutang ${r.name}? Seluruh riwayat transaksi (pinjam & lunas) untuk piutang ini juga akan ikut dihapus agar Saldo Bersih kembali normal.`)) return;
  
  const { error } = await supabaseClient.from('receivables').delete().eq('owner_id', OWNER_ID).eq('id', id);
  if (error) { showToast('Gagal hapus piutang'); return; }

  const txName = r.name;
  const toDelete = transactions.filter(t => {
    const desc = String(t.description || '');
    if (desc === `[PIUTANG] ${txName}` || desc.startsWith(`[PIUTANG] ${txName} - `)) return true;
    if (desc === `[PELUNASAN PIUTANG] ${txName}`) return true;
    return false;
  });

  if (toDelete.length > 0) {
    const ids = toDelete.map(t => t.id);
    await supabaseClient.from('transactions').delete().eq('owner_id', OWNER_ID).in('id', ids);
  }

  showToast('Piutang dihapus');
  await Promise.all([loadReceivables(), loadTransactions()]);
  render();
  renderPiutangPage();
}

let activePaymentPiutang = null;
function openPiutangPaymentModal(id) {
  const r = receivables.find(x => x.id === id);
  if (!r) return;
  activePaymentPiutang = r;
  const sisa = Number(r.amount) - Number(r.paid_amount);
  $('piutangPaymentId').value = id;
  $('piutangPaymentName').innerText = r.name;
  $('piutangPaymentRemain').innerText = formatRupiah(sisa);
  $('piutangPaymentAmount').value = '';
  $('piutangPaymentPreview').innerText = '';
  $('piutangPaymentModal').classList.remove('hidden');
}
function closePiutangPaymentModal() { $('piutangPaymentModal').classList.add('hidden'); activePaymentPiutang = null; }
function handlePiutangPaymentPreview(input) {
  const val = Number(input.value) || 0;
  $('piutangPaymentPreview').innerText = val > 0 ? formatRupiah(val) : '';
}
async function savePiutangPayment() {
  if (!activePaymentPiutang) return;
  const pay = Number($('piutangPaymentAmount').value) || 0;
  if (pay <= 0) { showToast('Nominal tidak valid'); return; }
  const sisa = Number(activePaymentPiutang.amount) - Number(activePaymentPiutang.paid_amount);
  if (pay > sisa) { showToast('Pembayaran melebihi sisa hutang'); return; }
  
  const newPaid = Number(activePaymentPiutang.paid_amount) + pay;
  const status = newPaid >= Number(activePaymentPiutang.amount) ? 'paid' : 'partial';
  
  const { error } = await supabaseClient.from('receivables').update({ paid_amount: newPaid, status }).eq('owner_id', OWNER_ID).eq('id', activePaymentPiutang.id);
  if (error) { showToast('Gagal catat pembayaran'); return; }
  
  // Create income transaction
  const txDesc = `[PELUNASAN PIUTANG] ${activePaymentPiutang.name}`;
  const txPayload = { id: Date.now(), owner_id: OWNER_ID, date: getLocalDateString(), description: txDesc, amount: pay, type: 'income', category_id: 0, category_name: 'Pemasukan' };
  await saveTransaction(txPayload);
  
  showToast('Pembayaran dicatat & saldo bertambah');
  closePiutangPaymentModal();
  await Promise.all([loadReceivables(), loadTransactions()]);
  render();
  renderPiutangPage();
}
