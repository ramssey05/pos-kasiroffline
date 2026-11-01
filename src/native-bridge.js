import { Capacitor } from '@capacitor/core';
import { BluetoothClassic } from '@nosslabs/bluetooth-classic';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { AppLauncher } from '@capacitor/app-launcher';

const isNative = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
let connected = false;
let connecting = false;
let lastDevice = null;
let manualDisconnect = false;

function publish(isConnected, device = null) {
  connected = !!isConnected;
  if (connected && device) { lastDevice = device; try { localStorage.setItem('posNativePrinter', JSON.stringify({ address: device.address, name: device.name || 'Printer SPP' })); } catch (_) {} }
  if (!connected) { window.__nativeSetBTConnection?.(null, null, false); }
  window.__nativeSetBTConnection?.(
    connected ? { id: device?.address, address: device?.address, name: device?.name || 'Printer SPP' } : null,
    connected ? { properties: { write: true, writeWithoutResponse: false }, nativeClassic: true } : null,
    connected
  );
}
async function ensurePermission() {
  const result = await BluetoothClassic.checkPermissions();
  if (result?.status !== 'granted') {
    const requested = await BluetoothClassic.requestPermissions();
    if (requested?.status !== 'granted') throw new Error('Izin Bluetooth tidak diberikan. Aktifkan izin Nearby devices.');
  }
}
function closePicker() { document.getElementById('nativeBtPicker')?.remove(); }
let pendingPrintResolve = null;
function finishPrintConnect(value) { if (pendingPrintResolve) { const done=pendingPrintResolve; pendingPrintResolve=null; done(!!value); } }
function loadLastDevice() {
  try { const saved = JSON.parse(localStorage.getItem('posNativePrinter') || 'null'); if (saved?.address) lastDevice = saved; } catch (_) {}
}
function showPicker(devices, scanning = false) {
  closePicker();
  const wrap = document.createElement('div');
  wrap.id = 'nativeBtPicker';
  wrap.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#061827aa;display:flex;align-items:center;justify-content:center;padding:16px;font:14px system-ui';
  const panel = document.createElement('div');
  panel.style.cssText = 'width:min(460px,100%);max-height:85dvh;overflow:auto;background:#fff;color:#183047;border-radius:16px;padding:16px;box-shadow:0 20px 60px #0005';
  const title = document.createElement('div');
  title.style.cssText = 'display:flex;justify-content:space-between;align-items:center;font-weight:700;font-size:16px;margin-bottom:8px';
  title.innerHTML = '<span>Hubungkan Printer Bluetooth</span>';
  const close = document.createElement('button'); close.textContent = '×';
  close.style.cssText = 'font-size:24px;background:#eef2f6;border-radius:50%;width:34px;height:34px;color:#183047';
  close.onclick = () => { closePicker(); finishPrintConnect(false); }; title.appendChild(close); panel.appendChild(title);
  const info = document.createElement('p');
  info.textContent = scanning ? 'Sedang mencari printer Bluetooth…' : (devices.length ? 'Pilih printer RPP02N yang sudah dipasangkan di pengaturan Bluetooth Android.' : 'Printer belum ditemukan. Pair printer dari Pengaturan Bluetooth Android, lalu tekan Cari Ulang.');
  info.style.cssText = 'font-size:12px;color:#64748b;line-height:1.5'; panel.appendChild(info);
  const list = document.createElement('div'); list.style.cssText = 'display:grid;gap:8px;margin:12px 0';
  devices.forEach(device => {
    const btn = document.createElement('button'); btn.type = 'button';
    btn.style.cssText = 'display:flex;justify-content:space-between;gap:12px;align-items:center;text-align:left;padding:12px;border:1px solid #d9e5ef;border-radius:10px;background:#f8fbfd;color:#183047';
    const name = document.createElement('span'); name.style.cssText = 'min-width:0;overflow-wrap:anywhere';
    const strong = document.createElement('b'); strong.textContent = device.name || 'Perangkat Bluetooth';
    const small = document.createElement('small'); small.textContent = device.address || ''; small.style.cssText = 'display:block;color:#64748b;margin-top:3px';
    name.append(strong, small); const action = document.createElement('span'); action.textContent = 'Hubungkan'; action.style.cssText = 'white-space:nowrap;color:#0b2a4a;font-weight:600';
    btn.append(name, action);
    btn.onclick = async () => { try { btn.disabled = true; action.textContent = 'Menghubungkan…'; await connect(device); closePicker(); finishPrintConnect(true); } catch (e) { btn.disabled = false; action.textContent = 'Coba lagi'; window.toast?.('Koneksi SPP gagal: ' + (e?.message || String(e)), 'error'); } };
    list.appendChild(btn);
  });
  if (scanning) { const loading = document.createElement('div'); loading.textContent = '⏳ Memindai perangkat…'; loading.style.cssText = 'padding:14px;text-align:center;color:#64748b'; list.appendChild(loading); }
  panel.appendChild(list);
  const bottom = document.createElement('div'); bottom.style.cssText = 'display:flex;gap:8px';
  const rescan = document.createElement('button'); rescan.textContent = 'Cari Ulang'; rescan.style.cssText = 'flex:1;padding:10px;border-radius:9px;background:#35a9e8;color:white'; rescan.onclick = () => scanForPrinter();
  const cancel = document.createElement('button'); cancel.textContent = 'Tutup'; cancel.style.cssText = 'padding:10px 14px;border-radius:9px;background:#eef4f8;color:#0b2a4a'; cancel.onclick = () => { closePicker(); finishPrintConnect(false); };
  bottom.append(rescan, cancel); panel.appendChild(bottom); wrap.appendChild(panel); document.body.appendChild(wrap);
}
async function scanForPrinter() {
  if (connecting) return;
  manualDisconnect = false;
  window.__nativeSetBTPairing?.(true);
  showPicker([], true);
  try {
    await ensurePermission();
    const result = await BluetoothClassic.scan({ duration: 3500 });
    const devices = [...new Map((result?.devices || []).filter(d => d?.address).map(d => [d.address, d])).values()];
    window.__nativeSetBTPairing?.(false);
    showPicker(devices);
  } catch (e) { window.__nativeSetBTPairing?.(false); showPicker([]); window.toast?.('Pencarian Bluetooth gagal: ' + (e?.message || String(e)), 'error'); }
}
async function connect(device, options = {}) {
  if (connecting) return;
  connecting = true;
  window.__nativeSetBTPairing?.(true);
  try {
    await BluetoothClassic.connect({ address: device.address });
    publish(true, device);
    manualDisconnect = false; window.__nativeSetBTPairing?.(false); window.toast?.('Printer Bluetooth SPP terhubung: ' + (device.name || 'Printer'));
  } catch (e) { window.__nativeSetBTPairing?.(false); publish(false); throw e; }
  finally { connecting = false; }
}
async function disconnect() {
  manualDisconnect = true;
  try { await BluetoothClassic.disconnect(); }
  finally { publish(false); window.toast?.('Bluetooth printer diputuskan.'); }
}
async function toggleConnection() { if (connected) return disconnect(); manualDisconnect = false; return scanForPrinter(); }
async function connectForPrint() {
  if (connected) return true;
  if (pendingPrintResolve) return false;
  return new Promise(resolve => { pendingPrintResolve=resolve; scanForPrinter().catch(() => finishPrintConnect(false)); });
}
async function openRawBT(base64) {
  if (!isNative()) throw new Error('Pemanggil RawBT native hanya tersedia di APK.');
  const result = await AppLauncher.openUrl({ url: 'rawbt:base64,' + base64 });
  if (result?.completed === false) throw new Error('Android tidak berhasil membuka RawBT.');
  return true;
}
async function writeBytes(input) {
  if (!connected) throw new Error('Printer Bluetooth SPP belum terhubung.');
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  try {
    for (let i = 0; i < bytes.length; i += 256) {
      await BluetoothClassic.write({ data: Array.from(bytes.slice(i, i + 256)) });
      if (i + 256 < bytes.length) await new Promise(resolve => setTimeout(resolve, 12));
    }
    return true;
  } catch (e) { publish(false); throw e; }
}
async function saveBackup(content, filename) {
  if (!isNative()) throw new Error('Penyimpanan file native hanya tersedia di APK.');
  await Filesystem.mkdir({ path: 'POS-Kasir', directory: Directory.External, recursive: true });
  const result = await Filesystem.writeFile({ path: 'POS-Kasir/' + filename, data: content, directory: Directory.External, encoding: Encoding.UTF8, recursive: true });
  return result;
}
window.PosNativeBle = { isNative, toggleConnection, writeBytes, disconnect, scanForPrinter, connectForPrint, openRawBT, saveBackup };
if (isNative()) {
  loadLastDevice();
  // Tidak menyambungkan printer otomatis saat aplikasi dibuka.
}
