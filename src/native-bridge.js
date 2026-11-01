import { Capacitor } from '@capacitor/core';
import { BluetoothClassic } from '@nosslabs/bluetooth-classic';

const isNative = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
let connected = false;
let currentDevice = null;
let connecting = false;

function status(message) {
  const el = document.getElementById('btNativeStatus');
  if (el) el.textContent = 'Status: ' + message;
}
function publish(isConnected, device = null) {
  connected = !!isConnected;
  currentDevice = connected ? device : null;
  window.__nativeSetBTConnection?.(
    connected ? { id: device?.address, name: device?.name || 'RPP02N' } : null,
    connected ? { properties: { write: true, writeWithoutResponse: false }, nativeClassic: true } : null,
    connected
  );
  status(connected ? 'TERHUBUNG — ' + (device?.name || 'Printer Bluetooth') + ' (SPP)' : 'belum terhubung');
}
async function ensurePermission() {
  const result = await BluetoothClassic.checkPermissions();
  if (result?.status !== 'granted') {
    const requested = await BluetoothClassic.requestPermissions();
    if (requested?.status !== 'granted') throw new Error('Izin Bluetooth tidak diberikan.');
  }
}
function renderDevices(devices) {
  const list = document.getElementById('btDeviceResults');
  if (!list) return;
  if (!devices.length) {
    list.innerHTML = '<div class="mini">Printer belum ditemukan. Pair RPP02N melalui pengaturan Bluetooth Android terlebih dahulu.</div>';
    return;
  }
  list.innerHTML = devices.map((d, i) => `
    <button type="button" class="bt-device-option" data-device-index="${i}">
      <span><b>${String(d.name || 'Perangkat Bluetooth').replace(/[&<>"']/g, '')}</b><small>${String(d.address || '').replace(/[&<>"']/g, '')}</small></span>
      <span class="mini">Hubungkan SPP</span>
    </button>`).join('');
  list.querySelectorAll('[data-device-index]').forEach(btn => btn.addEventListener('click', async () => {
    const d = devices[Number(btn.dataset.deviceIndex)];
    try { await connect(d); }
    catch (e) { status('GAGAL — ' + (e?.message || String(e))); window.toast?.('Koneksi SPP gagal: ' + (e?.message || String(e))); }
  }));
}
async function scanForPrinter() {
  if (connecting) return;
  await ensurePermission();
  const scanButton = document.getElementById('btScanBtn');
  if (scanButton) { scanButton.disabled = true; scanButton.textContent = 'Memindai…'; }
  status('mencari perangkat Bluetooth Classic…');
  try {
    // Prefer paired devices because RPP02N should already be paired in Android settings.
    const result = await BluetoothClassic.scan({ duration: 10000 });
    const devices = result?.devices || [];
    renderDevices(devices);
    if (!devices.length) status('printer belum ditemukan — pair dahulu di pengaturan Android');
  } finally {
    if (scanButton) { scanButton.disabled = false; scanButton.textContent = 'Cari Printer Ter-pair'; }
  }
}
async function connect(device) {
  if (connecting) return;
  connecting = true;
  status('menghubungkan SPP ke ' + (device.name || device.address) + '…');
  try {
    await BluetoothClassic.connect({ address: device.address });
    const check = await BluetoothClassic.isConnected?.();
    if (check && check.isConnected === false) throw new Error('Koneksi SPP belum aktif.');
    publish(true, device);
    window.toast?.('Printer Bluetooth SPP terhubung: ' + (device.name || 'RPP02N'));
  } catch (e) {
    publish(false);
    throw e;
  } finally { connecting = false; }
}
async function disconnect() {
  await BluetoothClassic.disconnect();
  publish(false);
  window.toast?.('Bluetooth printer diputuskan.');
}
async function toggleConnection() {
  if (connected) return disconnect();
  return scanForPrinter();
}
async function writeBytes(input) {
  if (!connected) throw new Error('Printer Bluetooth SPP belum terhubung.');
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  // Native plugin sends a byte array over RFCOMM SPP, preserving ESC/POS control bytes.
  for (let i = 0; i < bytes.length; i += 512) {
    await BluetoothClassic.write({ data: Array.from(bytes.slice(i, i + 512)) });
  }
  const check = await BluetoothClassic.isConnected?.();
  if (check && !check.isConnected) {
    publish(false);
    throw new Error('Koneksi printer terputus saat mengirim data.');
  }
  return true;
}
window.PosNativeBle = {
  isNative,
  toggleConnection,
  autoReconnect: async () => {},
  writeBytes,
  disconnect,
  scanForPrinter
};
if (isNative()) {
  BluetoothClassic.addListener?.('bluetoothState', event => {
    if (event?.value === 'off') publish(false);
  }).catch?.(() => {});
}
