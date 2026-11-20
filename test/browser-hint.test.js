import { describe, expect, it } from 'vitest';
import { browserName, controllerHint } from '../src/input/browser-hint.js';

const FIREFOX = 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:160.0) Gecko/20100101 Firefox/160.0';
const CHROME = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36';
const EDGE = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0';
const CHROME_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/150.0.0.0 Mobile/15E148 Safari/604.1';
const FIREFOX_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/150.0 Mobile/15E148 Safari/605.1.15';
const SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Safari/605.1.15';

describe('controllerHint', () => {
  it('recognises the browser family', () => {
    expect(browserName(FIREFOX)).toBe('Firefox');
    expect(browserName(CHROME)).toBe('Chromium');
    expect(browserName(EDGE)).toBe('Chromium');
    expect(browserName(SAFARI)).toBe('Safari');
    expect(browserName(CHROME_IOS)).toBe('iOS');
    expect(browserName(FIREFOX_IOS)).toBe('iOS');
    expect(browserName('')).toBe('other');
  });

  it('sends Firefox and Safari users to Chrome or Edge', () => {
    expect(controllerHint(FIREFOX, true)).toMatch(/Firefox does not read.*Chrome or Edge/);
    expect(controllerHint(SAFARI, true)).toMatch(/Safari does not read.*Chrome or Edge/);
  });

  it('does not send Chrome or Edge users to another browser', () => {
    expect(controllerHint(CHROME, true)).not.toMatch(/Chrome or Edge/);
    expect(controllerHint(EDGE, true)).not.toMatch(/Chrome or Edge/);
  });

  it('sends iOS users to a computer, not to Chrome on the same device', () => {
    expect(controllerHint(CHROME_IOS, true)).toMatch(/Safari engine.*a computer with Chrome or Edge/);
  });

  it('names another browser when the Gamepad API is missing, also in Chrome', () => {
    expect(controllerHint(CHROME, false)).toMatch(/cannot read controllers.*Chrome or Edge/);
  });
});
