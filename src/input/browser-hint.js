const OTHER_BROWSER = 'Use Chrome or Edge instead.';

export function browserName(userAgent) {
  if (/iPhone|iPad|iPod|CriOS\/|FxiOS\/|EdgiOS\//.test(userAgent)) return 'iOS';
  if (/Firefox\//.test(userAgent)) return 'Firefox';
  if (/Edg\/|Chrome\/|Chromium\//.test(userAgent)) return 'Chromium';
  if (/Safari\//.test(userAgent)) return 'Safari';
  return 'other';
}

export function controllerHint(userAgent, supported) {
  const browser = browserName(userAgent);
  if (browser === 'iOS') {
    return 'Controller plugged in but not found? Every browser on iPhone and iPad uses the Safari engine, which does not read every controller. Use a computer with Chrome or Edge instead.';
  }
  if (!supported) return `This browser cannot read controllers. ${OTHER_BROWSER}`;
  if (browser === 'Chromium') {
    return 'Controller plugged in but not found? Move a stick or press a button. Still nothing: replug it, or set the radio to USB joystick mode.';
  }
  if (browser === 'other') {
    return `Controller plugged in but not found? Move a stick or press a button. Still nothing: this browser cannot read it. ${OTHER_BROWSER}`;
  }
  return `Controller plugged in but not found? ${browser} does not read every controller or RC transmitter. ${OTHER_BROWSER}`;
}
