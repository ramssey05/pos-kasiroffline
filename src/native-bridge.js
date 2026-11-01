import { Capacitor } from '@capacitor/core';
import { BleClient } from '@capacitor-community/bluetooth-le';

const isNative = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
const get = key => { try { return localStorage.getItem(key) || ''; } catch { return ''; } };
const put = (key,value) => { try { localStorage.setItem(key,String(value)); } catch {} };

let initialized=false, device=null, serviceUuid=null, characteristicUuid=null;
let connecting=false, scanning=false, supportsWNR=false, scanTimer=null;

function escapeHtml(v) {
  return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function publish(connected,name='Printer BLE') {
  window.__nativeSetBTConnection?.(
    connected && device ? {id:device.deviceId,name:device.name||name} : null,
    connected ? {properties:{write:true,writeWithoutResponse:supportsWNR}} : null,
    connected
  );
}
async function init() {
  if(initialized) return;
  await BleClient.initialize({androidNeverForLocation:false});
  initialized=true;
}
async function stopScan() {
  if(scanTimer) { clearTimeout(scanTimer); scanTimer=null; }
  if(!scanning) return;
  try { await BleClient.stopLEScan(); } catch(e) { console.warn('Stop BLE scan',e); }
  scanning=false;
}
function renderScanResults(items) {
  const list=document.getElementById('btDeviceResults');
  if(!list) return;
  if(!items.length) { list.innerHTML='<div class="mini">Belum ada perangkat BLE ditemukan. Pastikan printer menyala dan Bluetooth aktif.</div>'; return; }
  list.innerHTML=items.map(d=>`
    <button type="button" class="bt-device-option" data-device-id="${escapeHtml(d.deviceId)}">
      <span><b>${escapeHtml(d.name)}</b><small>${escapeHtml(d.deviceId)}</small></span>
      <span class="mini">${d.rssi===null?'':d.rssi+' dBm'}　Hubungkan</span>
    </button>`).join('');
  list.querySelectorAll('[data-device-id]').forEach(btn=>btn.addEventListener('click',()=>{
    const selected=items.find(x=>x.deviceId===btn.dataset.deviceId);
    if(selected) connectSelected(selected).catch(e=>window.toast?.('Koneksi gagal: '+(e?.message||String(e))));
  }));
}
async function scanForPrinter() {
  if(scanning) await stopScan();
  if(connecting) return;
  await init();
  const found=new Map();
  const scanButton=document.getElementById('btScanBtn');
  const list=document.getElementById('btDeviceResults');
  if(list) list.innerHTML='<div class="mini">Memindai perangkat printer BLE selama sekitar 12 detik…</div>';
  if(scanButton) { scanButton.disabled=true; scanButton.textContent='Memindai…'; }
  try {
    const enabled=await BleClient.isEnabled();
    if(!enabled) await BleClient.requestEnable();
    scanning=true;
    await BleClient.requestLEScan({allowDuplicates:false},result=>{
      const d=result?.device;
      if(!d?.deviceId) return;
      const item={deviceId:d.deviceId,name:(d.name||result.localName||'').trim()||'Perangkat BLE tanpa nama',rssi:Number.isFinite(result.rssi)?result.rssi:null};
      found.set(item.deviceId,item);
      renderScanResults([...found.values()]);
    });
    scanTimer=setTimeout(async()=>{
      await stopScan();
      if(scanButton) { scanButton.disabled=false; scanButton.textContent='Pindai Ulang'; }
      if(!found.size && list) list.innerHTML='<div class="mini">Printer BLE belum ditemukan. Pastikan printer menyala dan tidak sedang tersambung ke perangkat lain.</div>';
    },12000);
  } catch(e) {
    await stopScan();
    if(scanButton) { scanButton.disabled=false; scanButton.textContent='Coba Pindai Lagi'; }
    if(list) list.innerHTML='<div class="mini">Scan gagal: '+escapeHtml(e?.message||String(e))+'</div>';
    throw e;
  }
}
async function discoverWritable(id) {
  const services=await BleClient.getServices(id);
  for(const svc of services||[]) {
    for(const ch of svc.characteristics||[]) {
      if(ch.properties?.write || ch.properties?.writeWithoutResponse) {
        return {service:svc.uuid,characteristic:ch.uuid,wnr:!!ch.properties?.writeWithoutResponse};
      }
    }
  }
  throw new Error('Karakteristik BLE WRITE tidak ditemukan pada printer. Pastikan printer mendukung BLE/GATT.');
}
async function connect(id,name='Printer BLE') {
  await init();
  try { await BleClient.disconnect(id); } catch {}
  await BleClient.connect(id,disconnectedId=>{
    if(device?.deviceId!==disconnectedId) return;
    device=null; serviceUuid=null; characteristicUuid=null; supportsWNR=false;
    publish(false); window.setBTState?.('disconnected');
    if(get('posBtAutoReconnect')==='1') setTimeout(autoReconnect,3000);
  });
  const writable=await discoverWritable(id);
  device={deviceId:id,name};
  serviceUuid=writable.service; characteristicUuid=writable.characteristic; supportsWNR=writable.wnr;
  put('posBtDeviceId',id); put('posBtDeviceName',name); put('posBtAutoReconnect','1');
  publish(true,name); window.setBTState?.('connected');
}
async function connectSelected(selected) {
  if(connecting) return;
  connecting=true; put('posBtAutoReconnect','0'); window.setBTState?.('pairing');
  await stopScan();
  try {
    await connect(selected.deviceId,selected.name||'Printer BLE');
    window.toast?.('Printer BLE terhubung: '+(selected.name||'Printer BLE'));
  } catch(e) {
    try { await BleClient.disconnect(selected.deviceId); } catch {}
    device=null; publish(false); window.setBTState?.('disconnected');
    throw e;
  } finally {
    connecting=false;
    const scanButton=document.getElementById('btScanBtn');
    if(scanButton) { scanButton.disabled=false; scanButton.textContent='Pindai Ulang'; }
  }
}
async function disconnect() {
  put('posBtAutoReconnect','0'); await stopScan();
  const id=device?.deviceId||get('posBtDeviceId');
  try { if(id) await BleClient.disconnect(id); } catch {}
  device=null; serviceUuid=null; characteristicUuid=null; supportsWNR=false;
  publish(false); window.setBTState?.('disconnected'); window.toast?.('Bluetooth diputuskan.');
}
async function toggleConnection() {
  if(device) return disconnect();
  return scanForPrinter();
}
async function autoReconnect() {
  if(!isNative()||connecting||device||get('posBtAutoReconnect')!=='1') return;
  const id=get('posBtDeviceId'); if(!id) return;
  connecting=true; window.setBTState?.('pairing');
  try {
    await connect(id,get('posBtDeviceName')||'Printer BLE');
    window.toast?.('Printer tersambung otomatis.');
  } catch(e) {
    device=null; publish(false); window.setBTState?.('disconnected');
    console.warn('Native BLE auto reconnect:',e);
  } finally { connecting=false; }
}
async function writeBytes(input) {
  if(!device||!serviceUuid||!characteristicUuid) throw new Error('Printer BLE belum terhubung.');
  const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
  for(let i=0;i<bytes.length;i+=180) {
    if(!device) throw new Error('Koneksi printer terputus saat mencetak.');
    const chunk=bytes.slice(i,i+180);
    const view=new DataView(chunk.buffer,chunk.byteOffset,chunk.byteLength);
    if(supportsWNR) await BleClient.writeWithoutResponse(device.deviceId,serviceUuid,characteristicUuid,view);
    else await BleClient.write(device.deviceId,serviceUuid,characteristicUuid,view);
    if(i+180<bytes.length) await new Promise(resolve=>setTimeout(resolve,15));
  }
  return true;
}
window.PosNativeBle={isNative,toggleConnection,autoReconnect,writeBytes,disconnect,scanForPrinter};
if(isNative()) init().then(()=>setTimeout(autoReconnect,1000)).catch(e=>console.warn('Native BLE init:',e));
