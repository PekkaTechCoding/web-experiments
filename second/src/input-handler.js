export class InputHandler {
  constructor({ element = window, onTapped = () => {}, onSwiped = () => {} } = {}) {
    this.element = element;
    this.onTapped = onTapped;
    this.onSwiped = onSwiped;

    this.touchStart = null;
    this.touchId = null;
    this.ignoreTouch = false;
    this.swipeThreshold = 30;

    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handleTouchStart = this.handleTouchStart.bind(this);
    this.handleTouchEnd = this.handleTouchEnd.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);

    this.element.addEventListener('pointerdown', this.handlePointerDown);
    this.element.addEventListener('touchstart', this.handleTouchStart, { passive: false });
    this.element.addEventListener('touchend', this.handleTouchEnd, { passive: false });
    this.element.addEventListener('keydown', this.handleKeyDown);
  }

  handlePointerDown(event) {
    if (event?.button && event.button !== 0) return;
    if (event?.target?.closest?.('#debugMenu')) return;
    this.onTapped(event);
  }

  handleTouchStart(event) {
    if (!event.changedTouches?.length) return;
    if (event?.target?.closest?.('#debugMenu')) {
      this.ignoreTouch = true;
      return;
    }
    event.preventDefault();
    const touch = event.changedTouches[0];
    this.touchId = touch.identifier;
    this.touchStart = { x: touch.clientX, y: touch.clientY };
  }

  handleTouchEnd(event) {
    if (this.ignoreTouch) {
      this.ignoreTouch = false;
      return;
    }
    if (!this.touchStart || !event.changedTouches?.length) return;
    event.preventDefault();
    const touch = [...event.changedTouches].find((t) => t.identifier === this.touchId) || event.changedTouches[0];
    const dx = touch.clientX - this.touchStart.x;
    const dy = touch.clientY - this.touchStart.y;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    if (absX < this.swipeThreshold && absY < this.swipeThreshold) {
      this.onTapped(event);
    } else {
      const direction = absX > absY
        ? (dx > 0 ? 'right' : 'left')
        : (dy > 0 ? 'down' : 'up');
      this.onSwiped(direction, { dx, dy });
    }

    this.touchStart = null;
    this.touchId = null;
    this.ignoreTouch = false;
  }

  handleKeyDown(event) {
    const keyToDirection = {
      ArrowUp: 'up',
      ArrowDown: 'down',
      ArrowLeft: 'left',
      ArrowRight: 'right',
    };
    const direction = keyToDirection[event.key];
    if (direction) {
      this.onSwiped(direction, { key: event.key });
    }
  }

  destroy() {
    this.element.removeEventListener('pointerdown', this.handlePointerDown);
    this.element.removeEventListener('touchstart', this.handleTouchStart);
    this.element.removeEventListener('touchend', this.handleTouchEnd);
    this.element.removeEventListener('keydown', this.handleKeyDown);
  }
}
