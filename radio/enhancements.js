(() => {
  const bitrate = document.getElementById('bitrate');
  const label = document.getElementById('bitrate-label');
  const updateBitrateLabel = () => {
    if (!label || !bitrate) return;
    label.textContent = Number(bitrate.value) ? `${bitrate.value} kbps+` : 'Any';
  };
  bitrate?.addEventListener('input', updateBitrateLabel);
  updateBitrateLabel();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
  }
})();
