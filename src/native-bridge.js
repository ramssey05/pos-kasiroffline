import { Capacitor } from '@capacitor/core';
import { BleClient } from '@capacitor-community/bluetooth-le';

const isNative = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
const get = key => { try { return localStorage.getItem(key) || ''; } catch { return ''; } };
const put = (key,value) => { try { localStorage.setItem(key,String(value)); } catch {} };
const SERVICES = [
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  '000018f0-0000-1000-8000-00805f9b34fb',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
  '0000ffe0-0000-1000-8000-00805f9b34fb',
  '0000ff00-0000-1000-8000-00805f9b34fb'
];
let initialized=false, device=null, serviceUuid=null, characteristicUuid=null, connecting=false, scanning=false, supportsWNR=false;
let scanStopTimer=null;

function publish(connected,name='Printer BLE') {
  window.__nativeSetBTConnection?.(
    connected ? {id:device?.deviceId,name} : null,
    connected ? {properties:{write:true,writeWithoutResponse:supportsWNR}} : null,
    connected
  );
}
async function init() {
  if(initialized) return;
  await BleClient.initialize({ androidNeverForLocation: true });
  initialized=true;
}
async function stopScan() {
  if(scanStopTimer) { clearTimeout(scanStopTimer); scanStopTimer=null; }
  if(!scanning) return;
  try { await BleClient.stopLEScan(); } catch(e) { console.warn('Stop BLE scan',e); }
  scanning=false;
}
async function scanForPrinter() {
  if(scanning) await stopScan();
  await init();
  const found=new Map();
  const scanButton=document.getElementById('btScanBtn');
  const list=document.getElementById('btDeviceResults');
  if(list) list.innerHTML='<div class="mini">Memindai perangkat BLE di sekitar…</div>';
  if(scanButton) { scanButton.disabled=true; scanButton.textContent='Memindai…'; }
  try {
    // Scan BLE langsung tanpa filter service agar printer dengan UUID vendor/custom tetap terlihat.
    await BleClient.requestLEScan({ allowDuplicates: false }, result => {
      const d=result.device;
      if(!d?.deviceId) return;
      const item={
        deviceId:d.deviceId,
        name:(d.name||'').trim() || 'Perangkat BLE tanpa nama',
        rssi:Number.isFinite(result.rssi)?result.rssi:null
      };
      found.set(item.deviceId,item);
      renderScanResults([...found.values()]);
    });
    scanning=true;
    scanStopTimer=setTimeout(()=>stopScan().finally(()=>{
      if(scanButton) { scanButton.disabled=false; scanButton.textContent='Pindai Ulang'; }
      if(!found.size && list) list.innerHTML='<div class="mini">Belum ada perangkat BLE ditemukan. Pastikan printer menyala dan tidak sedang tersambung ke perangkat lain.</div>';
    }),12000);
  } catch(e) {
    if(scanButton) { scanButton.disabled=false; scanButton.textContent='Pindai Bluetooth'; }
    if(list) list.innerHTML='<div class="mini">Scan gagal: '+escapeHtml(e?.message||String(e))+'</div>';
    throw e;
  }
}
function escapeHtml(v) {
  return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function renderScanResults(items) {
  const list=document.getElementById('btDeviceResults');
  if(!list) return;
  if(!items.length) { list.innerHTML='<div class="mini">Belum ada perangkat BLE ditemukan.</div>'; return; }
  list.innerHTML=items.map(d=>`
    <button type="button" class="bt-device-option" data-device-id="${escapeHtml(d.deviceId)}">
      <span><b>${escapeHtml(d.name)}</b><small>${escapeHtml(d.deviceId)}</small></span>
      <span class="mini">${d.rssi===null?'':d.rssi+' dBm'}　Hubungkan</span>
    </button>`).join('');
  list.querySelectorAll('[data-device-id]').forEach(btn=>btn.addEventListener('click',()=>{
    const item=items.find(x=>x.deviceId===btn.dataset.deviceId);
    if(item) connectSelected(item).catch(e=>window.toast?.('Koneksi gagal: '+(e?.message||String(e))));
  }));
}
async function discoverWritable(id) {
  const services=await BleClient.getServices(id);
  for(const svc of services||[]) {
    const chars=svc.characteristics||[];
    const ch=chars.find(c=>c.properties?.write || c.properties?.writeWithoutResponse);
    if(ch) return {service:svc.uuid,characteristic:ch.uuid,wnr:!!ch.properties?.writeWithoutResponse};
  }
  throw new Error('Perangkat ditemukan, tetapi tidak memiliki karakteristik BLE WRITE. Pastikan printer menggunakan mode BLE/GATT, bukan Bluetooth Classic SPP.');
}
async function connect(id,name='Printer BLE') {
  await init();
  try { await BleClient.disconnect(id); } catch {}
  await BleClient.connect(id, disconnectedId => {
    if(device?.deviceId!==disconnectedId) return;
    device=null; serviceUuid=null; characteristicUuid=null; supportsWNR=false;
    publish(false);
    window.setBTState?.('disconnected');
    if(get('posBtAutoReconnect')==='1') setTimeout(autoReconnect,3000);
  });
  const found=await discoverWritable(id);
  device={deviceId:id,name};
  serviceUuid=found.service; characteristicUuid=found.characteristic; supportsWNR=found.wnr;
  put('posBtDeviceId',id); put('posBtAutoReconnect','1');
  publish(true,name); window.setBTState?.('connected');
}
async function connectSelected(selected) {
  if(connecting) return;
  connecting=true; put('posBtAutoReconnect','0'); window.setBTState?.('pairing');
  await stopScan();
  try {
    await connect(selected.deviceId,selected.name||'Printer BLE');
    window.toast?.('Bluetooth terhubung: '+(selected.name||'Printer BLE'));
  } catch(e) {
    try { await BleClient.disconnect(selected.deviceId); } catch {}
    publish(false); window.setBTState?.('disconnected');
    throw e;
  } finally { connecting=false; }
}
async function choose() {
  if(connecting) return;
  try {
    await scanForPrinter();
    window.toast?.('Pemindaian BLE dimulai. Pilih printer dari daftar hasil scan.');
  } catch(e) {
    window.setBTState?.('disconnected');
    window.toast?.('Gagal scan Bluetooth: '+(e?.message||String(e)));
    throw e;
  }
}
async function disconnect() {
  put('posBtAutoReconnect','0');
  await stopScan();
  const id=device?.deviceId||get('posBtDeviceId');
  try { if(id) await BleClient.disconnect(id); } catch {}
  device=null; serviceUuid=null; characteristicUuid=null; supportsWNR=false;
  publish(false); window.setBTState?.('disconnected'); window.toast?.('Bluetooth diputuskan.');
}
async function toggleConnection() { if(device) return disconnect(); return choose(); }
async function autoReconnect() {
  if(!isNative()||connecting||device||get('posBtAutoReconnect')!=='1') return;
  const id=get('posBtDeviceId'); if(!id) return;
  connecting=true; window.setBTState?.('pairing');
  try { await connect(id); window.toast?.('Printer tersambung otomatis.'); }
  catch(e) {
    publish(false); window.setBTState?.('disconnected');
    setTimeout(autoReconnect,8000);
  } finally { connecting=false; }
}
async function writeBytes(input) {
  if(!device||!serviceUuid||!characteristicUuid) throw new Error('Printer Native belum terhubung.');
  const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
  for(let i=0;i<bytes.length;i+=120) {
    if(!device) throw new Error('Koneksi printer terputus saat mencetak.');
    const chunk=bytes.slice(i,i+120);
    const view=new DataView(chunk.buffer,chunk.byteOffset,chunk.byteLength);
    if(supportsWNR) await BleClient.writeWithoutResponse(device.deviceId,serviceUuid,characteristicUuid,view);
    else await BleClient.write(device.deviceId,serviceUuid,characteristicUuid,view);
    if(i+120<bytes.length) await new Promise(r=>setTimeout(r,20));
  }
  return true;
}
window.PosNativeBle={isNative,toggleConnection,autoReconnect,writeBytes,disconnect,scanForPrinter};
if(isNative()) {
  init().then(()=>setTimeout(autoReconnect,800)).catch(e=>console.warn('Native BLE init',e));
}
