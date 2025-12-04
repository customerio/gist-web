export default class EventEmitter {
  on(name, callback) {
      var callbacks = this[name];
      if (!callbacks) this[name] = [callback];
      else callbacks.push(callback);
  }

  off(name, callback) {
      var callbacks = this[name];
      if (!callbacks) return;

      if (!callback) {
          delete this[name];
          return;
      }

      var index = callbacks.indexOf(callback);
      if (index !== -1) {
          callbacks.splice(index, 1);
      }

      if (callbacks.length === 0) {
          delete this[name];
      }
  }

  dispatch(name, event) {
      var callbacks = this[name];
      if (callbacks) callbacks.forEach(callback => callback(event));
  }
}