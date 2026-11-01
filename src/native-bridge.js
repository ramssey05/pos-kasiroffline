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
let initialized=false, device=null, serviceUuid=null, characteristicUuid=null, connecting=false, supportsWNR=false;

function publish(connected,name='Printer BLE') {
  window.__nativeSetBTConnection?.(
    connected ? {id:device?.deviceId,name} : null,
    connected ? {properties:{write:true,writeWithoutResponse:supportsWNR}} : null,
    connected
  );
}
async function init() {
  if(initialized) return;
  await BleClient.initialize({androidNeverForLocation:true});
  initialized=true;
}
async function discoverWritable(id) {
  const services=await BleClient.getServices(id);
  for(const svc of services||[]) {
    const chars=svc.characteristics||[];
    const ch=chars.find(c=>c.properties?.write || c.properties?.writeWithoutResponse);
    if(ch) return {service:svc.uuid,characteristic:ch.uuid,wnr:!!ch.properties?.writeWithoutResponse};
  }
  throw new Error('Printer tersambung tetapi karakteristik BLE WRITE tidak ditemukan.');
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
async function choose() {
  if(connecting) return;
  connecting=true; put('posBtAutoReconnect','0'); window.setBTState?.('pairing');
  try {
    await init();
    const selected=await BleClient.requestDevice({services:[],optionalServices:SERVICES});
    await connect(selected.deviceId,selected.name||'Printer BLE');
    window.toast?.('Bluetooth terhubung: '+(selected.name||'Printer BLE'));
  } catch(e) {
    publish(false); window.setBTState?.('disconnected');
    if(e?.message) window.toast?.('Gagal menghubungkan Bluetooth: '+e.message);
    throw e;
  } finally { connecting=false; }
}
async function disconnect() {
  put('posBtAutoReconnect','0');
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
window.PosNativeBle={isNative,toggleConnection,autoReconnect,writeBytes,disconnect};
if(isNative()) {
  init().then(()=>setTimeout(autoReconnect,800)).catch(e=>console.warn('Native BLE init',e));
}
