import { describe, expect, it } from 'vitest';
import { DEFAULT_STATE, decodeState, encodeState } from '../src/url';

describe('URL state', () => {
  it('round-trips', () => {
    const s = { plan: 'low', region: 'us', view: 'weekly', people: [{ sex: 'F', age: 40 }, { sex: 'M', age: 8 }] } as const;
    expect(decodeState(encodeState(s as never))).toEqual(s);
  });
  it('falls back to defaults on garbage', () => {
    const s = decodeState('?plan=zzz&loc=mars&view=x&h=Q9,F0,F999,M30');
    expect(s).toEqual({ ...DEFAULT_STATE, people: [{ sex: 'M', age: 30 }] });
  });
  it('uses default household when no h param', () => {
    expect(decodeState('').people).toEqual(DEFAULT_STATE.people);
  });
});
