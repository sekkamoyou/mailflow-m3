import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { isInteractiveSwipeTarget } from './useSwipeRow.js';

describe('isInteractiveSwipeTarget', () => {
  it('suppresses row taps that start on an interactive descendant', () => {
    const buttonChild = { closest: selector => selector.includes('button') ? {} : null };
    assert.equal(isInteractiveSwipeTarget(buttonChild), true);
  });

  it('allows row taps that start on ordinary row content', () => {
    const rowText = { closest: () => null };
    assert.equal(isInteractiveSwipeTarget(rowText), false);
  });

  it('preserves swipes from the native row-open button, but not from an action button', () => {
    const { document } = new JSDOM('<button data-message-open="1">Subject</button><button>Star</button>').window;
    const [open, star] = document.querySelectorAll('button');
    assert.equal(isInteractiveSwipeTarget(open), false);
    assert.equal(isInteractiveSwipeTarget(star), true);
  });

  it('handles non-element targets defensively', () => {
    assert.equal(isInteractiveSwipeTarget(null), false);
  });
});
