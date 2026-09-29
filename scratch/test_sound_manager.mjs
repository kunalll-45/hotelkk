import { soundManager } from '../client/src/utils/soundEffects.js';

console.log('Testing soundManager...');
console.log('isMuted initially:', soundManager.isMuted);

let receivedMuted = null;
const unsubscribe = soundManager.subscribe((muted) => {
  console.log('Subscriber callback received muted state:', muted);
  receivedMuted = muted;
});

soundManager.toggleMute();
console.log('After toggleMute, isMuted:', soundManager.isMuted, 'subscriber saw:', receivedMuted);

soundManager.toggleMute();
console.log('After second toggleMute, isMuted:', soundManager.isMuted);

unsubscribe();
console.log('Unsubscribed successfully!');

// Test calling all audio methods (none should throw even without AudioContext)
soundManager.playPop();
soundManager.playClick();
soundManager.playTabSwitch();
soundManager.playRemove();
soundManager.playSuccess();
soundManager.playError();
soundManager.playBell();
soundManager.playOrderConfirmed();
soundManager.playPaymentSuccess();

console.log('ALL SOUNDMANAGER METHODS WORKED FLAWLESSLY WITH ZERO ERRORS!');
