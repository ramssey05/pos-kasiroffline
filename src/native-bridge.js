import { Capacitor } from '@capacitor/core';
import { BluetoothClassic } from '@nossdev/bluetooth-classic';

const isNative = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
const get = key => { try { return localStorage.getItem(key) || ''; } catch { return ''; } };
const put = (key,value) => { try { localStorage.setItem(key,String(value)); } catch {} };

let device=null, connecting=false, scanning=false;

function publish(connected, selected=device) {
  window.__nativeSetBTConnection?.(
    connected && selected ? {id:selected.address,name:selected.name||'Printer Bluetooth Classic'} : null,
    connected ? {classic:true,write:true} : null,
    connected
  );
}

async function ensurePermissions() {
  const status=await BluetoothClassic.checkPermissions();
  if(status?.status!=='granted') {
    const requested=await BluetoothClassic.requestPermissions();
    if(requested?.status!=='granted') throw new Error('Izin Bluetooth belum diberikan. Izinkan perangkat di dialog Android.');
  }
}

function escapeHtml(v) {
  return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function renderScanResults(items) {
  const list=document.getElementById('btDeviceResults');
  if(!list) return;
  if(!items.length) {
    list.innerHTML='<div class="mini">Belum ada perangkat Bluetooth Classic ditemukan. Pastikan printer menyala dan mode Bluetooth aktif.</div>';
    return;
  }
  list.innerHTML=items.map(d=>`
    <button type="button" class="bt-device-option" data-device-address="${escapeHtml(d.address)}">
      <span><b>${escapeHtml(d.name||'Printer tanpa nama')}</b><small>${escapeHtml(d.address)} · ${escapeHtml(d.state||'perangkat')}</small></span>
      <span class="mini">Hubungkan</span>
    </button>`).join('');
  list.querySelectorAll('[data-device-address]').forEach(btn=>btn.addEventListener('click',()=>{
    const selected=items.find(x=>x.address===btn.dataset.deviceAddress);
    if(selected) connectSelected(selected).catch(e=>window.toast?.('Koneksi gagal: '+(e?.message||String(e))));
  }));
}

async function scanForPrinter() {
  if(scanning || connecting) return;
  scanning=true;
  const scanButton=document.getElementById('btScanBtn');
  const list=document.getElementById('btDeviceResults');
  if(scanButton) { scanButton.disabled=true; scanButton.textContent='Memindai…'; }
  if(list) list.innerHTML='<div class="mini">Memindai Bluetooth Classic selama sekitar 12 detik…</div>';
  try {
    await ensurePermissions();
    const enabled=await BluetoothClassic.isEnabled();
    if(!enabled.enabled) {
      const result=await BluetoothClassic.enable();
      if(!result.enabled) throw new Error('Bluetooth Android belum aktif.');
    }
    const result=await BluetoothClassic.scan({duration:12000});
    const devices=result?.devices||[];
    renderScanResults(devices);
    if(scanButton) scanButton.textContent='Pindai Ulang';
  } catch(e) {
    if(list) list.innerHTML='<div class="mini">Scan gagal: '+escapeHtml(e?.message||String(e))+'</div>';
    if(scanButton) scanButton.textContent='Coba Pindai Lagi';
    throw e;
  } finally {
    scanning=false;
    if(scanButton) scanButton.disabled=false;
  }
}

async function connectSelected(selected) {
  if(connecting) return;
  connecting=true;
  put('posBtAutoReconnect','0');
  window.setBTState?.('pairing');
  try {
    await ensurePermissions();
    await BluetoothClassic.connect({address:selected.address});
    device={address:selected.address,name:selected.name||'Printer Bluetooth Classic'};
    put('posBtDeviceId',selected.address);
    put('posBtDeviceName',device.name);
    put('posBtAutoReconnect','1');
    publish(true);
    window.setBTState?.('connected');
    window.toast?.('Bluetooth Classic terhubung: '+device.name);
  } catch(e) {
    device=null;
    publish(false);
    window.setBTState?.('disconnected');
    throw e;
  } finally {
    connecting=false;
  }
}

async function disconnect() {
  put('posBtAutoReconnect','0');
  try { await BluetoothClassic.disconnect(); } catch {}
  device=null;
  publish(false);
  window.setBTState?.('disconnected');
  window.toast?.('Bluetooth diputuskan.');
}

async function toggleConnection() {
  if(device) return disconnect();
  return scanForPrinter();
}

async function autoReconnect() {
  if(!isNative()||connecting||device||get('posBtAutoReconnect')!=='1') return;
  const address=get('posBtDeviceId');
  if(!address) return;
  connecting=true;
  window.setBTState?.('pairing');
  try {
    await ensurePermissions();
    await BluetoothClassic.connect({address});
    device={address,name:get('posBtDeviceName')||'Printer Bluetooth Classic'};
    publish(true);
    window.setBTState?.('connected');
  } catch(e) {
    device=null;
    publish(false);
    window.setBTState?.('disconnected');
    console.warn('Classic auto reconnect:',e);
  } finally {
    connecting=false;
  }
}

async function writeBytes(input) {
  if(!device) throw new Error('Printer Bluetooth Classic belum terhubung.');
  const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
  // Plugin menerima array byte mentah; tidak mengubah ESC/POS menjadi teks UTF-8.
  for(let i=0;i<bytes.length;i+=512) {
    if(!device) throw new Error('Koneksi printer terputus saat mencetak.');
    await BluetoothClassic.write({data:Array.from(bytes.slice(i,i+512))});
    if(i+512<bytes.length) await new Promise(r=>setTimeout(r,25));
  }
  return true;
}

window.PosNativeBle={isNative,toggleConnection,autoReconnect,writeBytes,disconnect,scanForPrinter};
if(isNative()) setTimeout(autoReconnect,1000);
