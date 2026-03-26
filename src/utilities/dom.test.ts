import { describe, it, expect, beforeEach } from 'vitest';
import { findElement } from './dom';

describe('findElement', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('returns element by bare id string via getElementById', () => {
    const div = document.createElement('div');
    div.id = 'my-element';
    document.body.appendChild(div);

    expect(findElement('my-element')).toBe(div);
  });

  it('returns element by CSS selector with # prefix', () => {
    const div = document.createElement('div');
    div.id = 'my-element';
    document.body.appendChild(div);

    expect(findElement('#my-element')).toBe(div);
  });

  it('returns element by class selector', () => {
    const div = document.createElement('div');
    div.className = 'target-class';
    document.body.appendChild(div);

    expect(findElement('.target-class')).toBe(div);
  });

  it('returns element by complex CSS selector', () => {
    document.body.innerHTML = '<div class="parent"><span data-role="child">hello</span></div>';
    const span = document.querySelector('.parent span')!;

    expect(findElement('.parent span')).toBe(span);
  });

  it('prefers getElementById over querySelector when both would match', () => {
    const div = document.createElement('div');
    div.id = 'shared-id';
    document.body.appendChild(div);

    const result = findElement('shared-id');
    expect(result).toBe(div);
  });

  it('returns null when element is not found', () => {
    expect(findElement('nonexistent')).toBeNull();
  });

  it('returns null when selector is empty string', () => {
    expect(findElement('')).toBeNull();
  });

  it('returns null for invalid CSS selector instead of throwing', () => {
    expect(() => findElement('[invalid!')).not.toThrow();
    expect(findElement('[invalid!')).toBeNull();
  });

  it('returns null for another malformed selector', () => {
    expect(findElement('div:nth-child(')).toBeNull();
  });
});
