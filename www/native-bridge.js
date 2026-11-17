import { Capacitor, registerPlugin } from '@capacitor/core';
import * as XLSX from 'xlsx';

window.Capacitor = Capacitor;
const PosNative = registerPlugin('PosNative');
const PosNativeStorage = registerPlugin('PosNativeStorage');
const native = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
const bytesToBase64 = (bytes) => {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
};
window.XLSX = XLSX;

window.PosNativeStorage = {
  isNative: native,
  saveSnapshot: (json) => PosNativeStorage.saveSnapshot({ json }),
  loadSnapshot: () => PosNativeStorage.loadSnapshot(),
  clearSnapshot: () => PosNativeStorage.clearSnapshot()
};

window.PosNativeFiles = {
  isNative: native,
  async saveText(filename, text, mimeType = 'text/plain') {
    if (!native()) throw new Error('Penyimpanan file native hanya tersedia di APK.');
    const result = await PosNative.saveFile({ filename, data: text, encoding: 'text', mimeType });
    if (result.cancelled) throw new Error('Penyimpanan dibatalkan.');
    return result;
  },
  async saveBase64(filename, base64, mimeType = 'application/octet-stream') {
    if (!native()) throw new Error('Penyimpanan file native hanya tersedia di APK.');
    const result = await PosNative.saveFile({ filename, data: base64, encoding: 'base64', mimeType });
    if (result.cancelled) throw new Error('Penyimpanan dibatalkan.');
    return result;
  },
  async pickText(mimeTypes = ['application/json']) {
    if (!native()) throw new Error('Pemilih file native hanya tersedia di APK.');
    const result = await PosNative.pickText({ mimeTypes });
    return result.cancelled ? null : result.text;
  },
  async pickBase64(mimeTypes = ['*/*']) {
    if (!native()) throw new Error('Pemilih file native hanya tersedia di APK.');
    const result = await PosNative.pickText({ mimeTypes });
    return result.cancelled ? null : { data: result.data, name: result.name, mimeType: result.mimeType };
  }
};

window.PosNativePrinter = {
  isNative: native,
  connected: false,
  device: null,
  async refreshStatus() {
    if (!native()) return false;
    const status = await PosNative.printerStatus();
    this.connected = !!status.connected;
    this.device = status.connected ? status : null;
    window.__nativeSetBTConnection?.(
      status.connected ? { id: status.address, address: status.address, name: status.name || 'Printer SPP' } : null,
      status.connected ? { properties: { write: true, writeWithoutResponse: false }, nativeClassic: true } : null,
      !!status.connected
    );
    return this.connected;
  },
  async pairedPrinters() {
    if (!native()) return [];
    const result = await PosNative.listPairedPrinters();
    return result.devices || [];
  },
  async toggle() {
    if (!native()) return;
    await this.refreshStatus();
    if (this.connected) {
      await PosNative.disconnectPrinter();
      this.connected = false;
      this.device = null;
      window.__nativeSetBTConnection?.(null, null, false);
      window.__nativeSetBTPairing?.(false);
      window.toast?.('Printer Bluetooth diputuskan.');
      return;
    }
    const devices = await this.pairedPrinters();
    if (!devices.length) {
      window.toast?.('Belum ada printer yang dipasangkan. Pair printer melalui Pengaturan Bluetooth Android terlebih dahulu.', 'info');
      try { await PosNative.openBluetoothSettings(); } catch (_) {}
      return;
    }
    const selected = await this.pickPairedPrinter(devices);
    if (!selected) return;
    window.__nativeSetBTPairing?.(true);
    try {
      const connected = await PosNative.connectPrinter({ address: selected.address });
      this.connected = true;
      this.device = connected;
      window.__nativeSetBTConnection?.(
        { id: connected.address, address: connected.address, name: connected.name || selected.name },
        { properties: { write: true, writeWithoutResponse: false }, nativeClassic: true },
        true
      );
      window.__nativeSetBTPairing?.(false);
      window.toast?.('Printer Bluetooth terhubung: ' + (connected.name || selected.name));
    } catch (e) {
      this.connected = false;
      this.device = null;
      window.__nativeSetBTConnection?.(null, null, false);
      window.__nativeSetBTPairing?.(false);
      throw e;
    }
  },
  pickPairedPrinter(devices) {
    return new Promise(resolve => {
      document.getElementById('nativePrinterPicker')?.remove();
      const overlay = document.createElement('div');
      overlay.id = 'nativePrinterPicker';
      overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:#071827bb;display:flex;align-items:center;justify-content:center;padding:16px;font:14px system-ui';
      const panel = document.createElement('div');
      panel.style.cssText = 'width:min(440px,100%);max-height:85dvh;overflow:auto;background:#fff;color:#183047;border-radius:16px;padding:16px;box-shadow:0 20px 70px #0005';
      const title = document.createElement('h3'); title.textContent = 'Pilih Printer Bluetooth';
      const info = document.createElement('p'); info.textContent = 'Pilih printer yang sudah dipasangkan di Android (contoh: Smartcon RPP02N).';
      info.style.cssText = 'font-size:12px;color:#64748b';
      panel.append(title, info);
      devices.forEach(device => {
        const button = document.createElement('button');
        button.type = 'button';
        button.style.cssText = 'width:100%;display:flex;justify-content:space-between;align-items:center;padding:12px;margin:6px 0;border:1px solid #dbe7ef;border-radius:10px;background:#f8fbfd;color:#183047;text-align:left';
        const label = document.createElement('span');
        const strong = document.createElement('b'); strong.textContent = device.name || 'Printer Bluetooth';
        const small = document.createElement('small'); small.textContent = device.address; small.style.cssText = 'display:block;color:#64748b;margin-top:3px';
        label.append(strong, small);
        const action = document.createElement('span'); action.textContent = 'Pilih'; action.style.color = '#0b2a4a';
        button.append(label, action);
        button.onclick = () => { overlay.remove(); resolve(device); };
        panel.appendChild(button);
      });
      const close = document.createElement('button'); close.textContent = 'Batal';
      close.style.cssText = 'width:100%;padding:10px;border:0;border-radius:9px;background:#eef4f8;color:#0b2a4a;margin-top:8px';
      close.onclick = () => { overlay.remove(); resolve(null); };
      panel.appendChild(close); overlay.appendChild(panel); document.body.appendChild(overlay);
    });
  },
  async printBytes(bytes) {
    if (!native()) throw new Error('Cetak native hanya tersedia di APK.');
    await this.refreshStatus();
    if (!this.connected) throw new Error('Printer Bluetooth belum terhubung. Tekan Connect BT terlebih dahulu.');
    await PosNative.printBytes({ base64: bytesToBase64(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)) });
    return true;
  },
  async printReceipt(bytes) { return this.printBytes(bytes); },
  async printText(text) {
    const encoder = new TextEncoder();
    const prefix = new Uint8Array([0x1b, 0x40]);
    const body = encoder.encode(String(text) + '\n\n');
    const bytes = new Uint8Array(prefix.length + body.length);
    bytes.set(prefix); bytes.set(body, prefix.length);
    return this.printBytes(bytes);
  }
};

if (native()) {
  PosNative.addListener('printerState', event => {
    window.PosNativePrinter.connected = !!event.connected;
    window.PosNativePrinter.device = event.connected ? event : null;
    window.__nativeSetBTConnection?.(
      event.connected ? { id: event.address, address: event.address, name: event.name || 'Printer SPP' } : null,
      event.connected ? { properties: { write: true, writeWithoutResponse: false }, nativeClassic: true } : null,
      !!event.connected
    );
    if (!event.connected) window.toast?.('Printer Bluetooth terputus. Silakan Connect BT kembali.', 'error');
  });
  window.addEventListener('load', () => {
    window.PosNativePrinter.refreshStatus().catch(() => {});
  });
}
