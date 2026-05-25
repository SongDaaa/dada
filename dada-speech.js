// dada-speech.js — Speech synthesis (depends on: rate from dada-data.js)
// Dependencies: dada-data.js

function speak(text) {
  if (!window.speechSynthesis) return;
  speechSynthesis.cancel();
  var u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  u.rate = rate;
  speechSynthesis.speak(u);
}
