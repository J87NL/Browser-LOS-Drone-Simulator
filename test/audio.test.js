import { describe, it, expect, vi } from 'vitest';
import { MotorSound } from '../src/audio.js';

const fakeContext = () => ({ suspend: vi.fn(), resume: vi.fn(), state: 'running' });

describe('motor sound in a hidden tab', () => {
  it('suspends while the tab is hidden and resumes when it is visible again', () => {
    const sound = new MotorSound();
    sound.volume = 0.5;
    sound.ctx = fakeContext();
    sound.setHidden(true);
    expect(sound.ctx.suspend).toHaveBeenCalledTimes(1);
    sound.setHidden(false);
    expect(sound.ctx.resume).toHaveBeenCalledTimes(1);
  });

  it('stays silent on return when the sound is muted', () => {
    const sound = new MotorSound();
    sound.ctx = fakeContext();
    sound.setHidden(false);
    expect(sound.ctx.resume).not.toHaveBeenCalled();
  });

  it('does nothing before the sound was ever started', () => {
    const sound = new MotorSound();
    expect(() => sound.setHidden(true)).not.toThrow();
  });
});
